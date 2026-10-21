import type { Shape, Line, FreeLine, TextBox } from '../core/model'
import { withResolvedColors } from '../core/model'
import { layoutTextBox, textBoxFont } from '../core/textBox'
import rough from 'roughjs'
import { computeTextLayout, PADDING_X, ICON_SIZE, ICON_GAP } from '../core/autoResize'
import { getPolygonVertices } from '../utils/geometry'
import { routeLine, polylineMidpoint } from '../core/routing'
import type { TextZoneLayout } from '../core/autoResize'
import { exportBounds, labelBox, EXPORT_PADDING, LABEL_FONT } from './bounds'

function drawShapeToCtx(rc: ReturnType<typeof rough.canvas>, ctx: CanvasRenderingContext2D, shape: Shape) {
  const { x, y, width: w, height: h, type, fillColor, strokeColor } = shape

  const options = {
    fill: fillColor,
    fillStyle: 'solid' as const,
    stroke: strokeColor,
    strokeWidth: 1.5,
    roughness: 1,
  }

  switch (type) {
    case 'rectangle':
      rc.rectangle(x, y, w, h, options)
      break
    case 'ellipse':
      rc.ellipse(x + w / 2, y + h / 2, w, h, options)
      break
    case 'diamond':
    case 'triangle':
    case 'parallelogram':
    case 'hexagon': {
      const verts = getPolygonVertices(shape)
      if (verts) {
        rc.polygon(verts.map(v => [v.x, v.y] as [number, number]), options)
      }
      break
    }
    case 'rounded-rectangle': {
      const r = Math.min(w, h) * 0.2
      rc.path(`M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`, options)
      break
    }
    case 'cylinder': {
      const ry = h * 0.12
      // Fill body + bottom ellipse area (behind rough strokes)
      if (fillColor !== 'transparent') {
        ctx.save()
        ctx.fillStyle = fillColor
        ctx.fillRect(x, y + ry, w, h - ry * 2)
        ctx.beginPath()
        ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, 0, Math.PI)
        ctx.fill()
        ctx.restore()
      }
      rc.line(x, y + ry, x, y + h - ry, options)
      rc.line(x + w, y + ry, x + w, y + h - ry, options)
      rc.ellipse(x + w / 2, y + ry, w, ry * 2, options)
      rc.arc(x + w / 2, y + h - ry, w, ry * 2, 0, Math.PI, false, options)
      break
    }
    case 'cloud': {
      const cx = x + w / 2, cy = y + h / 2
      const rx = w / 2, ry = h / 2
      rc.path(
        `M ${cx - rx * 0.4} ${cy + ry * 0.6}` +
        ` C ${cx - rx * 0.9} ${cy + ry * 0.6}, ${cx - rx} ${cy - ry * 0.1}, ${cx - rx * 0.5} ${cy - ry * 0.4}` +
        ` C ${cx - rx * 0.6} ${cy - ry}, ${cx - rx * 0.1} ${cy - ry * 1.05}, ${cx + rx * 0.15} ${cy - ry * 0.6}` +
        ` C ${cx + rx * 0.3} ${cy - ry * 1.05}, ${cx + rx * 0.8} ${cy - ry * 0.8}, ${cx + rx * 0.7} ${cy - ry * 0.2}` +
        ` C ${cx + rx * 1.05} ${cy - ry * 0.2}, ${cx + rx * 1.0} ${cy + ry * 0.5}, ${cx + rx * 0.5} ${cy + ry * 0.6}` +
        ` C ${cx + rx * 0.3} ${cy + ry * 0.95}, ${cx - rx * 0.2} ${cy + ry * 0.95}, ${cx - rx * 0.4} ${cy + ry * 0.6}` +
        ` Z`,
        options,
      )
      break
    }
  }

  // Text
  const hasContent = shape.header || shape.body || shape.footer ||
    shape.headerIcon || shape.bodyIcon || shape.footerIcon
  if (hasContent) {
    const layout = computeTextLayout(shape)
    const contentTop = y + (h - layout.contentHeight) / 2

    ctx.save()
    ctx.fillStyle = shape.textColor

    const drawZone = (zone: TextZoneLayout | null) => {
      if (!zone) return
      const hasIcon = !!zone.icon
      const align = zone.iconAlign

      if (hasIcon && align === 'center') {
        const iconX = x + w / 2
        const iconY = contentTop + zone.y
        ctx.font = `${ICON_SIZE}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(zone.icon, iconX, iconY)

        ctx.font = zone.font
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const textStartY = iconY + ICON_SIZE + ICON_GAP
        const maxTextW = w - PADDING_X * 2
        for (let i = 0; i < zone.lines.length; i++) {
          const lineText = zone.lines[i].trim()
          if (lineText) {
            ctx.fillText(lineText, x + w / 2, textStartY + i * zone.lineHeight, maxTextW)
          }
        }
      } else if (hasIcon && align === 'right') {
        const iconX = x + w - PADDING_X
        const iconY = contentTop + zone.y + (zone.lineHeight - ICON_SIZE) / 2
        ctx.font = `${ICON_SIZE}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(zone.icon, iconX, iconY)

        ctx.font = zone.font
        ctx.textAlign = 'right'
        ctx.textBaseline = 'top'
        const textRightEdge = iconX - ICON_SIZE / 2 - ICON_GAP
        const maxTextW = w - PADDING_X * 2 - ICON_SIZE - ICON_GAP
        for (let i = 0; i < zone.lines.length; i++) {
          const lineText = zone.lines[i].trim()
          if (lineText) {
            ctx.fillText(lineText, textRightEdge, contentTop + zone.y + i * zone.lineHeight, maxTextW)
          }
        }
      } else if (hasIcon) {
        const iconX = x + PADDING_X
        const iconY = contentTop + zone.y + (zone.lineHeight - ICON_SIZE) / 2
        ctx.font = `${ICON_SIZE}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(zone.icon, iconX, iconY)

        ctx.font = zone.font
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        const textLeftEdge = iconX + ICON_SIZE / 2 + ICON_GAP
        const maxTextW = w - PADDING_X * 2 - ICON_SIZE - ICON_GAP
        for (let i = 0; i < zone.lines.length; i++) {
          const lineText = zone.lines[i].trim()
          if (lineText) {
            ctx.fillText(lineText, textLeftEdge, contentTop + zone.y + i * zone.lineHeight, maxTextW)
          }
        }
      } else {
        ctx.font = zone.font
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const maxTextW = w - PADDING_X * 2
        for (let i = 0; i < zone.lines.length; i++) {
          const lineText = zone.lines[i].trim()
          if (lineText) {
            ctx.fillText(lineText, x + w / 2, contentTop + zone.y + i * zone.lineHeight, maxTextW)
          }
        }
      }
    }

    drawZone(layout.header)
    drawZone(layout.body)
    drawZone(layout.footer)
    ctx.restore()
  }
}

function drawLineToCtx(ctx: CanvasRenderingContext2D, line: Line, shapes: Shape[]) {
  const pts = routeLine(line, shapes)
  if (!pts) return
  const prevPt = pts[pts.length - 2]
  const toPt = pts[pts.length - 1]

  ctx.save()
  ctx.strokeStyle = line.color
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke()

  if (line.directed) {
    const angle = Math.atan2(toPt.y - prevPt.y, toPt.x - prevPt.x)
    const headLen = 12
    ctx.fillStyle = line.color
    ctx.beginPath()
    ctx.moveTo(toPt.x, toPt.y)
    ctx.lineTo(toPt.x - headLen * Math.cos(angle - Math.PI / 6), toPt.y - headLen * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(toPt.x - headLen * Math.cos(angle + Math.PI / 6), toPt.y - headLen * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fill()
  }

  if (line.label) {
    const mid = polylineMidpoint(pts)
    const box = labelBox(line.label, mid)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(box.x, box.y, box.width, box.height)
    ctx.font = LABEL_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = line.color
    ctx.fillText(line.label, mid.x, box.y + box.height - 2)
  }

  ctx.restore()
}

export function exportToPng(shapes: Shape[], lines: Line[], freeLines: FreeLine[] = [], texts: TextBox[] = []): Promise<Blob> {
  lines = withResolvedColors(lines)
  freeLines = withResolvedColors(freeLines)
  texts = withResolvedColors(texts)
  return new Promise((resolve, reject) => {
    if (shapes.length === 0 && freeLines.length === 0 && texts.length === 0) {
      reject(new Error('Nothing to export'))
      return
    }

    const bounds = exportBounds(shapes, lines, freeLines, texts)
    const w = bounds.maxX - bounds.minX + EXPORT_PADDING * 2
    const h = bounds.maxY - bounds.minY + EXPORT_PADDING * 2

    const dpr = 2
    const canvas = document.createElement('canvas')
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)

    ctx.translate(-bounds.minX + EXPORT_PADDING, -bounds.minY + EXPORT_PADDING)

    // Draw lines first
    for (const line of lines) {
      drawLineToCtx(ctx, line, shapes)
    }
    for (const f of freeLines) {
      ctx.save()
      ctx.strokeStyle = f.color
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(f.x1, f.y1)
      ctx.lineTo(f.x2, f.y2)
      ctx.stroke()
      ctx.restore()
    }

    // Draw shapes
    const rc = rough.canvas(canvas)
    for (const shape of shapes) {
      drawShapeToCtx(rc, ctx, shape)
    }

    for (const t of texts) {
      const { lines: textLines, lineHeight } = layoutTextBox(t)
      ctx.save()
      ctx.font = textBoxFont(t)
      ctx.textBaseline = 'middle'
      ctx.fillStyle = t.color
      textLines.forEach((l, i) => ctx.fillText(l, t.x, t.y + (i + 0.5) * lineHeight))
      ctx.restore()
    }

    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to create PNG blob'))
    }, 'image/png')
  })
}
