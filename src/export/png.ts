import type { Shape, Line } from '../core/model'
import rough from 'roughjs'
import { computeTextLayout, PADDING_Y, ICON_SIZE, ICON_GAP } from '../core/autoResize'
import { getShapeCenter, getShapeEdgePoint } from '../utils/geometry'
import type { TextZoneLayout } from '../core/autoResize'

const EXPORT_PADDING = 40

function getBounds(shapes: Shape[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const s of shapes) {
    minX = Math.min(minX, s.x)
    minY = Math.min(minY, s.y)
    maxX = Math.max(maxX, s.x + s.width)
    maxY = Math.max(maxY, s.y + s.height)
  }
  return { minX, minY, maxX, maxY }
}

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
    case 'square':
      rc.rectangle(x, y, w, h, options)
      break
    case 'circle':
    case 'oval':
      rc.ellipse(x + w / 2, y + h / 2, w, h, options)
      break
    case 'diamond':
      rc.polygon([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]], options)
      break
    case 'triangle':
      rc.polygon([[x + w / 2, y], [x + w, y + h], [x, y + h]], options)
      break
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
      const iconOffset = hasIcon ? (ICON_SIZE + ICON_GAP) / 2 : 0
      const textCenterX = x + w / 2 + iconOffset

      if (hasIcon) {
        ctx.font = `${ICON_SIZE}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(zone.icon, textCenterX - iconOffset - ICON_SIZE / 2, contentTop + zone.y)
      }

      ctx.font = zone.font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const maxTextW = w - PADDING_Y * 2 - (hasIcon ? ICON_SIZE + ICON_GAP : 0)
      for (let i = 0; i < zone.lines.length; i++) {
        const lineText = zone.lines[i].trim()
        if (lineText) {
          ctx.fillText(lineText, textCenterX, contentTop + zone.y + i * zone.lineHeight, maxTextW)
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
  const fromShape = shapes.find(s => s.id === line.fromId)
  const toShape = shapes.find(s => s.id === line.toId)
  if (!fromShape || !toShape) return

  const fromCenter = getShapeCenter(fromShape)
  const toCenter = getShapeCenter(toShape)
  const fromPt = getShapeEdgePoint(fromShape, toCenter)
  const toPt = getShapeEdgePoint(toShape, fromCenter)

  ctx.save()
  ctx.strokeStyle = line.color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(fromPt.x, fromPt.y)
  ctx.lineTo(toPt.x, toPt.y)
  ctx.stroke()

  if (line.directed) {
    const angle = Math.atan2(toPt.y - fromPt.y, toPt.x - fromPt.x)
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
    const midX = (fromPt.x + toPt.x) / 2
    const midY = (fromPt.y + toPt.y) / 2
    ctx.font = '12px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    const metrics = ctx.measureText(line.label)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(midX - metrics.width / 2 - 3, midY - 17, metrics.width + 6, 19)
    ctx.fillStyle = line.color
    ctx.fillText(line.label, midX, midY - 2)
  }

  ctx.restore()
}

export function exportToPng(shapes: Shape[], lines: Line[]): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (shapes.length === 0) {
      reject(new Error('Nothing to export'))
      return
    }

    const bounds = getBounds(shapes)
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

    // Draw shapes
    const rc = rough.canvas(canvas)
    for (const shape of shapes) {
      drawShapeToCtx(rc, ctx, shape)
    }

    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to create PNG blob'))
    }, 'image/png')
  })
}
