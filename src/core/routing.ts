import type { Shape, Line } from './model'
import type { Point } from '../utils/geometry'
import { getShapeCenter, getShapeEdgePoint } from '../utils/geometry'

/**
 * Connector routing.
 *
 * A line is drawn straight (edge-to-edge, centre-aligned) when that segment
 * clears every other shape. Otherwise it is routed orthogonally around the
 * shapes with A* over a sparse grid built from padded obstacle edges, so
 * connectors bend instead of cutting through shapes. Routes are computed from
 * current geometry, so they stay valid after manual moves and auto-layout.
 */

const CLEARANCE = 16      // gap kept between a routed line and any shape
const STRAIGHT_PAD = 4    // how close a straight line may pass to another shape
const BEND_PENALTY = 60   // cost of a turn, in px — favours fewer bends

interface Rect { l: number; t: number; r: number; b: number }

type Dir = 0 | 1 | 2 | 3 // up, right, down, left
const DX = [0, 1, 0, -1]
const DY = [-1, 0, 1, 0]

function shapeRect(s: Shape, pad: number): Rect {
  return { l: s.x - pad, t: s.y - pad, r: s.x + s.width + pad, b: s.y + s.height + pad }
}

function pointInsideRect(x: number, y: number, r: Rect): boolean {
  return x > r.l && x < r.r && y > r.t && y < r.b
}

/** Liang–Barsky segment vs. axis-aligned rect (open interior). */
function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  let t0 = 0, t1 = 1
  const dx = b.x - a.x, dy = b.y - a.y
  const p = [-dx, dx, -dy, dy]
  const q = [a.x - r.l, r.r - a.x, a.y - r.t, r.b - a.y]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] <= 0) return false
    } else {
      const t = q[i] / p[i]
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t }
      else { if (t < t0) return false; if (t < t1) t1 = t }
    }
  }
  return t1 - t0 > 1e-6
}

function straightRoute(from: Shape, to: Shape): Point[] {
  const fromPt = getShapeEdgePoint(from, getShapeCenter(to))
  const toPt = getShapeEdgePoint(to, getShapeCenter(from))
  return [fromPt, toPt]
}

interface Port { boundary: Point; stub: Point; dir: Dir }

/** Ports at the top/right/bottom/left of a shape, each with a stub just outside its padded box. */
function shapePorts(s: Shape): Port[] {
  const c = getShapeCenter(s)
  const far = Math.max(s.width, s.height) * 4
  const box = shapeRect(s, CLEARANCE)
  return ([0, 1, 2, 3] as Dir[]).map(dir => {
    const boundary = getShapeEdgePoint(s, { x: c.x + DX[dir] * far, y: c.y + DY[dir] * far })
    const stub = dir === 0 ? { x: c.x, y: box.t }
      : dir === 1 ? { x: box.r, y: c.y }
      : dir === 2 ? { x: c.x, y: box.b }
      : { x: box.l, y: c.y }
    return { boundary, stub, dir }
  })
}

// Minimal binary heap keyed on f-score
class Heap {
  private items: { f: number; s: number }[] = []
  get size() { return this.items.length }
  push(f: number, s: number) {
    const a = this.items
    a.push({ f, s })
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].f <= a[i].f) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop(): { f: number; s: number } {
    const a = this.items
    const top = a[0]
    const last = a.pop()!
    if (a.length > 0) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < a.length && a[l].f < a[m].f) m = l
        if (r < a.length && a[r].f < a[m].f) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

function uniqSorted(vals: number[]): number[] {
  vals.sort((a, b) => a - b)
  const out: number[] = []
  for (const v of vals) if (out.length === 0 || Math.abs(v - out[out.length - 1]) > 0.5) out.push(v)
  return out
}

function indexOf(arr: number[], v: number): number {
  let best = 0
  for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[best] - v)) best = i
  return best
}

function orthogonalRoute(from: Shape, to: Shape, shapes: Shape[]): Point[] | null {
  // Every shape (including the endpoints) is an obstacle; ports sit on the padded boundary,
  // which is outside the open interior, so they remain reachable.
  const obstacles = shapes.map(s => shapeRect(s, CLEARANCE))
  const blocked = (x: number, y: number) => obstacles.some(r => pointInsideRect(x, y, r))

  const srcPorts = shapePorts(from).filter(p => !blocked(p.stub.x, p.stub.y))
  const dstPorts = shapePorts(to).filter(p => !blocked(p.stub.x, p.stub.y))
  if (srcPorts.length === 0 || dstPorts.length === 0) return null

  // Sparse grid: padded obstacle edges, port coordinates, and channel midlines between shapes
  const xVals: number[] = [], yVals: number[] = []
  for (const r of obstacles) { xVals.push(r.l, r.r); yVals.push(r.t, r.b) }
  for (const p of [...srcPorts, ...dstPorts]) { xVals.push(p.stub.x); yVals.push(p.stub.y) }
  for (const s of shapes) { const c = getShapeCenter(s); xVals.push(c.x); yVals.push(c.y) }
  const bounds = obstacles.reduce((acc, r) => ({
    l: Math.min(acc.l, r.l), t: Math.min(acc.t, r.t), r: Math.max(acc.r, r.r), b: Math.max(acc.b, r.b),
  }), { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity })
  xVals.push(bounds.l - CLEARANCE, bounds.r + CLEARANCE)
  yVals.push(bounds.t - CLEARANCE, bounds.b + CLEARANCE)
  const xs = uniqSorted(xVals)
  const ys = uniqSorted(yVals)
  const W = xs.length, H = ys.length

  const nodeBlocked = new Uint8Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) nodeBlocked[j * W + i] = blocked(xs[i], ys[j]) ? 1 : 0

  // A segment between adjacent grid nodes is either fully inside an obstacle or not,
  // because obstacle edges are grid lines — so testing its midpoint is enough.
  const edgeOpen = (i: number, j: number, dir: Dir): boolean => {
    const ni = i + DX[dir], nj = j + DY[dir]
    if (ni < 0 || nj < 0 || ni >= W || nj >= H) return false
    if (nodeBlocked[nj * W + ni]) return false
    return !blocked((xs[i] + xs[ni]) / 2, (ys[j] + ys[nj]) / 2)
  }

  // State = node * 4 + direction of travel on arrival
  const N = W * H * 4
  const g = new Float64Array(N).fill(Infinity)
  const prev = new Int32Array(N).fill(-1)
  const heap = new Heap()

  const targets = new Map<number, Port>()
  for (const p of dstPorts) targets.set(indexOf(ys, p.stub.y) * W + indexOf(xs, p.stub.x), p)
  const targetPts = dstPorts.map(p => p.stub)
  const h = (x: number, y: number) => Math.min(...targetPts.map(t => Math.abs(t.x - x) + Math.abs(t.y - y)))

  for (const p of srcPorts) {
    const node = indexOf(ys, p.stub.y) * W + indexOf(xs, p.stub.x)
    const s = node * 4 + p.dir
    const cost = Math.hypot(p.stub.x - p.boundary.x, p.stub.y - p.boundary.y)
    if (cost < g[s]) {
      g[s] = cost
      heap.push(cost + h(p.stub.x, p.stub.y), s)
    }
  }

  let bestCost = Infinity, bestState = -1
  while (heap.size > 0) {
    const { f, s } = heap.pop()
    if (f >= bestCost) break
    const node = s >> 2, dir = (s & 3) as Dir
    const gs = g[s]
    if (f > gs + h(xs[node % W], ys[(node / W) | 0]) + 1e-6) continue // stale entry

    const port = targets.get(node)
    if (port) {
      // Must arrive travelling into the shape (opposite of the port's outward direction)
      const inward = ((port.dir + 2) % 4) as Dir
      const total = gs + (dir === inward ? 0 : dir === port.dir ? BEND_PENALTY * 2 : BEND_PENALTY)
        + Math.hypot(port.stub.x - port.boundary.x, port.stub.y - port.boundary.y)
      if (total < bestCost) { bestCost = total; bestState = s }
    }

    const i = node % W, j = (node / W) | 0
    for (let nd = 0 as Dir; nd < 4; nd = (nd + 1) as Dir) {
      if (nd === (dir + 2) % 4) continue // no U-turns
      if (!edgeOpen(i, j, nd)) continue
      const ni = i + DX[nd], nj = j + DY[nd]
      const ns = (nj * W + ni) * 4 + nd
      const cost = gs + Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]) + (nd === dir ? 0 : BEND_PENALTY)
      if (cost < g[ns]) {
        g[ns] = cost
        prev[ns] = s
        heap.push(cost + h(xs[ni], ys[nj]), ns)
      }
    }
  }

  if (bestState < 0) return null

  const gridPts: Point[] = []
  for (let s = bestState; s >= 0; s = prev[s]) {
    const node = s >> 2
    gridPts.push({ x: xs[node % W], y: ys[(node / W) | 0] })
  }
  gridPts.reverse()

  const startNode = indexOf(ys, gridPts[0].y) * W + indexOf(xs, gridPts[0].x)
  const endNode = indexOf(ys, gridPts[gridPts.length - 1].y) * W + indexOf(xs, gridPts[gridPts.length - 1].x)
  const srcPort = srcPorts.find(p => indexOf(ys, p.stub.y) * W + indexOf(xs, p.stub.x) === startNode)!
  const dstPort = targets.get(endNode)!

  return simplify([srcPort.boundary, ...gridPts, dstPort.boundary])
}

/** Drop duplicate and collinear points. */
function simplify(pts: Point[]): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue
    if (out.length >= 2) {
      const a = out[out.length - 2], b = last
      const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x)
      if (Math.abs(cross) < 0.5) { out[out.length - 1] = p; continue }
    }
    out.push(p)
  }
  return out
}

/**
 * Polyline (≥ 2 points) from the source shape boundary to the target shape boundary,
 * or null if either endpoint shape is missing.
 */
export function routeLine(line: Line, shapes: Shape[]): Point[] | null {
  const from = shapes.find(s => s.id === line.fromId)
  const to = shapes.find(s => s.id === line.toId)
  if (!from || !to) return null
  if (from === to) return straightRoute(from, to)

  const straight = straightRoute(from, to)
  const others = shapes.filter(s => s !== from && s !== to)
  const clear = others.every(s => !segmentHitsRect(straight[0], straight[1], shapeRect(s, STRAIGHT_PAD)))
  if (clear) return straight

  return orthogonalRoute(from, to, shapes) ?? straight
}

/** Route every line once; key is line id. */
export function routeAllLines(lines: Line[], shapes: Shape[]): Map<string, Point[]> {
  const routes = new Map<string, Point[]>()
  for (const l of lines) {
    const r = routeLine(l, shapes)
    if (r) routes.set(l.id, r)
  }
  return routes
}

/** Point halfway along a polyline by length — used for label placement. */
export function polylineMidpoint(pts: Point[]): Point {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  let remaining = total / 2
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (seg >= remaining && seg > 0) {
      const t = remaining / seg
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }
    }
    remaining -= seg
  }
  return pts[pts.length - 1]
}
