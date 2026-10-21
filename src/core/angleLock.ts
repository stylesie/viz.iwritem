import type { Point } from '../utils/geometry'

/** Unit directions at 45° steps: 0°, 45°, 90° … 315° (screen y points down). */
const DIRS: Point[] = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4
  return { x: Math.round(Math.cos(a) * 1e9) / 1e9, y: Math.round(Math.sin(a) * 1e9) / 1e9 }
})

// Satisfying two anchors at once is preferred when it costs at most this much extra distance
const INTERSECTION_BONUS = 24

interface Ray { origin: Point; dir: Point }

/**
 * Point on a ray from (origin, dir), quantised so that axis-aligned and diagonal
 * offsets stay on a grid of `step` (diagonal dirs move step in both x and y).
 */
function pointOnRay(ray: Ray, t: number, step: number | null): Point {
  // Per-axis distance along the ray; for diagonals |dir.x| = |dir.y| = √½
  const axisScale = Math.max(Math.abs(ray.dir.x), Math.abs(ray.dir.y))
  let k = t * axisScale
  if (step) k = Math.round(k / step) * step
  const sx = ray.dir.x === 0 ? 0 : Math.sign(ray.dir.x)
  const sy = ray.dir.y === 0 ? 0 : Math.sign(ray.dir.y)
  return { x: ray.origin.x + sx * k, y: ray.origin.y + sy * k }
}

function intersect(a: Ray, b: Ray): Point | null {
  const denom = a.dir.x * b.dir.y - a.dir.y * b.dir.x
  if (Math.abs(denom) < 1e-9) return null
  const t = ((b.origin.x - a.origin.x) * b.dir.y - (b.origin.y - a.origin.y) * b.dir.x) / denom
  const s = ((b.origin.x - a.origin.x) * a.dir.y - (b.origin.y - a.origin.y) * a.dir.x) / denom
  if (t <= 0 || s <= 0) return null
  return { x: a.origin.x + a.dir.x * t, y: a.origin.y + a.dir.y * t }
}

/**
 * Constrain `desired` so it lies at a multiple of 45° from one anchor — or from two
 * anchors at once, where two rays cross close enough to the desired point.
 * `gridStep` quantises distance along the ray so grid-aligned anchors give grid-aligned results.
 */
export function lockToAngles(desired: Point, anchors: Point[], gridStep: number | null = null): Point {
  if (anchors.length === 0) return desired

  const rays: Ray[] = []
  for (const origin of anchors) for (const dir of DIRS) rays.push({ origin, dir })

  let best = desired
  let bestScore = Infinity
  const consider = (p: Point, bonus: number) => {
    const score = Math.hypot(p.x - desired.x, p.y - desired.y) - bonus
    if (score < bestScore) { bestScore = score; best = p }
  }

  for (const ray of rays) {
    const t = (desired.x - ray.origin.x) * ray.dir.x + (desired.y - ray.origin.y) * ray.dir.y
    if (t <= 0) continue
    consider(pointOnRay(ray, t, gridStep), 0)
  }

  for (let i = 0; i < rays.length; i++) {
    for (let j = i + 1; j < rays.length; j++) {
      if (rays[i].origin === rays[j].origin) continue
      const p = intersect(rays[i], rays[j])
      if (p) consider(p, INTERSECTION_BONUS)
    }
  }

  return best
}
