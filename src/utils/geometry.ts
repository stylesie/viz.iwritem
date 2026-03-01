import type { Shape } from '../core/model'

export interface Point {
  x: number
  y: number
}

export function pointInRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h
}

export function pointInEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const dx = (px - cx) / rx
  const dy = (py - cy) / ry
  return dx * dx + dy * dy <= 1
}

export function pointInDiamond(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  const cx = x + w / 2
  const cy = y + h / 2
  const dx = Math.abs(px - cx) / (w / 2)
  const dy = Math.abs(py - cy) / (h / 2)
  return dx + dy <= 1
}

export function pointInTriangle(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  // Triangle with top vertex at center-top, base at bottom
  const x1 = x + w / 2, y1 = y        // top
  const x2 = x,         y2 = y + h     // bottom-left
  const x3 = x + w,     y3 = y + h     // bottom-right

  const area = 0.5 * (-y2 * x3 + y1 * (-x2 + x3) + x1 * (y2 - y3) + x2 * y3)
  const s = (1 / (2 * area)) * (y1 * x3 - x1 * y3 + (y3 - y1) * px + (x1 - x3) * py)
  const t = (1 / (2 * area)) * (x1 * y2 - y1 * x2 + (y1 - y2) * px + (x2 - x1) * py)
  return s >= 0 && t >= 0 && (1 - s - t) >= 0
}

export function hitTestShape(shape: Shape, px: number, py: number): boolean {
  const { x, y, width: w, height: h, type } = shape
  switch (type) {
    case 'rectangle':
    case 'square':
      return pointInRect(px, py, x, y, w, h)
    case 'circle':
    case 'oval':
      return pointInEllipse(px, py, x + w / 2, y + h / 2, w / 2, h / 2)
    case 'diamond':
      return pointInDiamond(px, py, x, y, w, h)
    case 'triangle':
      return pointInTriangle(px, py, x, y, w, h)
    default:
      return pointInRect(px, py, x, y, w, h)
  }
}

export function getShapeCenter(shape: Shape): Point {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
}

/**
 * Find the point where a line from the shape center to a target point
 * intersects the shape boundary.
 */
export function getShapeEdgePoint(shape: Shape, target: Point): Point {
  const cx = shape.x + shape.width / 2
  const cy = shape.y + shape.height / 2
  const dx = target.x - cx
  const dy = target.y - cy

  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  const { type, x, y, width: w, height: h } = shape

  switch (type) {
    case 'circle':
    case 'oval': {
      const rx = w / 2
      const ry = h / 2
      const angle = Math.atan2(dy, dx)
      return {
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
      }
    }
    case 'diamond': {
      // Diamond edges: find intersection with diamond boundary
      const hw = w / 2
      const hh = h / 2
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      const scale = hw * hh / (absDy * hw + absDx * hh)
      return {
        x: cx + dx * scale,
        y: cy + dy * scale,
      }
    }
    case 'triangle': {
      // Triangle vertices: top-center, bottom-left, bottom-right
      const verts: Point[] = [
        { x: x + w / 2, y },           // top
        { x: x + w,     y: y + h },    // bottom-right
        { x,             y: y + h },    // bottom-left
      ]
      return polygonEdgeIntersect(cx, cy, dx, dy, verts)
    }
    default: {
      // Rectangle/square
      return rectEdgeIntersect(cx, cy, x, y, w, h, dx, dy)
    }
  }
}

/**
 * Find where a ray from (cx,cy) in direction (dx,dy) intersects a convex polygon.
 */
function polygonEdgeIntersect(
  cx: number, cy: number,
  dx: number, dy: number,
  verts: Point[],
): Point {
  let bestT = Infinity

  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % verts.length]

    // Edge vector
    const ex = b.x - a.x
    const ey = b.y - a.y

    // Solve: (cx + t*dx, cy + t*dy) = (a.x + s*ex, a.y + s*ey)
    const denom = dx * ey - dy * ex
    if (Math.abs(denom) < 1e-10) continue // parallel

    const t = ((a.x - cx) * ey - (a.y - cy) * ex) / denom
    const s = ((a.x - cx) * dy - (a.y - cy) * dx) / denom

    if (t > 0 && s >= 0 && s <= 1 && t < bestT) {
      bestT = t
    }
  }

  if (bestT === Infinity) {
    return { x: cx, y: cy }
  }

  return { x: cx + dx * bestT, y: cy + dy * bestT }
}

function rectEdgeIntersect(
  cx: number, cy: number,
  _x: number, _y: number, w: number, h: number,
  dx: number, dy: number,
): Point {
  const hw = w / 2
  const hh = h / 2

  // Scale factor to hit edge
  let sx = Infinity
  let sy = Infinity
  if (dx !== 0) sx = hw / Math.abs(dx)
  if (dy !== 0) sy = hh / Math.abs(dy)
  const s = Math.min(sx, sy)

  return {
    x: cx + dx * s,
    y: cy + dy * s,
  }
}

/**
 * Distance from a point to a line segment (for line hit testing).
 */
export function pointToSegmentDist(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  const projX = x1 + t * dx
  const projY = y1 + t * dy
  return Math.hypot(px - projX, py - projY)
}
