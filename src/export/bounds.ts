import type { Shape, Line, FreeLine, TextBox } from '../core/model'
import { layoutTextBox } from '../core/textBox'
import { routeLine, polylineMidpoint } from '../core/routing'

export const EXPORT_PADDING = 40
export const LABEL_FONT = '12px Inter, system-ui, sans-serif'

let measureCtx: CanvasRenderingContext2D | null = null

/**
 * White background box behind a connector label, centred on the route's midpoint with the text
 * baseline 2px above its bottom edge. Shared by the exporters and their bounds.
 */
export function labelBox(label: string, mid: { x: number; y: number }): { x: number; y: number; width: number; height: number } {
  measureCtx ??= document.createElement('canvas').getContext('2d')!
  measureCtx.font = LABEL_FONT
  const width = measureCtx.measureText(label).width + 6
  return { x: mid.x - width / 2, y: mid.y - 17, width, height: 19 }
}

/** Extent of everything an export draws: shapes, connector routes and labels, free lines and text boxes */
export function exportBounds(shapes: Shape[], lines: Line[], freeLines: FreeLine[], texts: TextBox[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const add = (x1: number, y1: number, x2 = x1, y2 = y1) => {
    minX = Math.min(minX, x1, x2)
    minY = Math.min(minY, y1, y2)
    maxX = Math.max(maxX, x1, x2)
    maxY = Math.max(maxY, y1, y2)
  }
  for (const s of shapes) add(s.x, s.y, s.x + s.width, s.y + s.height)
  for (const l of lines) {
    const pts = routeLine(l, shapes)
    if (!pts) continue
    for (const p of pts) add(p.x, p.y)
    if (l.label) {
      const b = labelBox(l.label, polylineMidpoint(pts))
      add(b.x, b.y, b.x + b.width, b.y + b.height)
    }
  }
  for (const f of freeLines) add(f.x1, f.y1, f.x2, f.y2)
  for (const t of texts) {
    const { width, height } = layoutTextBox(t)
    add(t.x, t.y, t.x + width, t.y + height)
  }
  return { minX, minY, maxX, maxY }
}
