import type { Shape, Line } from '../core/model'
import { computeTextLayout, ICON_SIZE, ICON_GAP } from '../core/autoResize'
import { getShapeCenter, getShapeEdgePoint } from '../utils/geometry'

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

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function shapeToSvg(shape: Shape, ox: number, oy: number): string {
  const x = shape.x - ox
  const y = shape.y - oy
  const { width: w, height: h, type, fillColor, strokeColor } = shape
  const parts: string[] = []

  // Shape outline
  switch (type) {
    case 'rectangle':
    case 'square':
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" rx="2"/>`)
      break
    case 'circle':
    case 'oval':
      parts.push(`<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>`)
      break
    case 'diamond': {
      const pts = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`
      parts.push(`<polygon points="${pts}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>`)
      break
    }
    case 'triangle': {
      const pts = `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`
      parts.push(`<polygon points="${pts}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>`)
      break
    }
  }

  // Text content
  const hasContent = shape.header || shape.body || shape.footer ||
    shape.headerIcon || shape.bodyIcon || shape.footerIcon
  if (hasContent) {
    const layout = computeTextLayout(shape)
    const contentTop = y + (h - layout.contentHeight) / 2

    const zones = [layout.header, layout.body, layout.footer].filter(Boolean)
    for (const zone of zones) {
      if (!zone) continue
      const hasIcon = !!zone.icon
      const iconOffset = hasIcon ? (ICON_SIZE + ICON_GAP) / 2 : 0
      const textCenterX = x + w / 2 + iconOffset

      if (hasIcon) {
        const iconX = textCenterX - iconOffset - ICON_SIZE / 2
        parts.push(`<text x="${iconX}" y="${contentTop + zone.y + ICON_SIZE}" font-size="${ICON_SIZE}" text-anchor="middle" fill="${shape.textColor}">${escapeXml(zone.icon)}</text>`)
      }

      for (let i = 0; i < zone.lines.length; i++) {
        const lineText = zone.lines[i].trim()
        if (lineText) {
          const ly = contentTop + zone.y + i * zone.lineHeight + zone.lineHeight * 0.8
          parts.push(`<text x="${textCenterX}" y="${ly}" font="${escapeXml(zone.font)}" font-size="13" text-anchor="middle" fill="${shape.textColor}">${escapeXml(lineText)}</text>`)
        }
      }
    }
  }

  return parts.join('\n  ')
}

function lineToSvg(line: Line, shapes: Shape[], ox: number, oy: number): string {
  const fromShape = shapes.find(s => s.id === line.fromId)
  const toShape = shapes.find(s => s.id === line.toId)
  if (!fromShape || !toShape) return ''

  const fromCenter = getShapeCenter(fromShape)
  const toCenter = getShapeCenter(toShape)
  const fromPt = getShapeEdgePoint(fromShape, toCenter)
  const toPt = getShapeEdgePoint(toShape, fromCenter)

  const x1 = fromPt.x - ox, y1 = fromPt.y - oy
  const x2 = toPt.x - ox, y2 = toPt.y - oy

  const parts: string[] = []
  const markerId = `arrow-${line.id.replace(/[^a-zA-Z0-9]/g, '')}`

  if (line.directed) {
    parts.push(`<defs><marker id="${markerId}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${line.color}"/></marker></defs>`)
  }

  parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${line.color}" stroke-width="1.5"${line.directed ? ` marker-end="url(#${markerId})"` : ''}/>`)

  if (line.label) {
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    parts.push(`<rect x="${mx - 25}" y="${my - 14}" width="50" height="18" fill="white" rx="2"/>`)
    parts.push(`<text x="${mx}" y="${my}" font-size="12" text-anchor="middle" fill="${line.color}">${escapeXml(line.label)}</text>`)
  }

  return parts.join('\n  ')
}

export function exportToSvg(shapes: Shape[], lines: Line[]): string {
  if (shapes.length === 0) return ''

  const bounds = getBounds(shapes)
  const w = bounds.maxX - bounds.minX + EXPORT_PADDING * 2
  const h = bounds.maxY - bounds.minY + EXPORT_PADDING * 2
  const ox = bounds.minX - EXPORT_PADDING
  const oy = bounds.minY - EXPORT_PADDING

  const linesSvg = lines.map(l => lineToSvg(l, shapes, ox, oy)).filter(Boolean).join('\n  ')
  const shapesSvg = shapes.map(s => shapeToSvg(s, ox, oy)).join('\n  ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="white"/>
  ${linesSvg}
  ${shapesSvg}
</svg>`
}
