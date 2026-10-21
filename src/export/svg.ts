import type { Shape, Line, FreeLine, TextBox } from '../core/model'
import { withResolvedColors } from '../core/model'
import { layoutTextBox } from '../core/textBox'
import { computeTextLayout, PADDING_X, ICON_SIZE, ICON_GAP } from '../core/autoResize'
import { getPolygonVertices } from '../utils/geometry'
import { routeLine, polylineMidpoint } from '../core/routing'
import { exportBounds, labelBox, EXPORT_PADDING, LABEL_FONT } from './bounds'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A canvas font shorthand ('bold 14px Inter, ...') as SVG attributes; SVG has no `font` attribute */
function fontAttrs(font: string): string {
  const m = /^((?:[a-z]+ )*)(\d+(?:\.\d+)?)px (.+)$/.exec(font)
  if (!m) return `font-family="${escapeXml(font)}"`
  const words = m[1].split(' ')
  return `font-family="${escapeXml(m[3])}" font-size="${m[2]}"` +
    (words.includes('bold') ? ' font-weight="bold"' : '') +
    (words.includes('italic') ? ' font-style="italic"' : '')
}

function shapeToSvg(shape: Shape, ox: number, oy: number): string {
  const x = shape.x - ox
  const y = shape.y - oy
  const { width: w, height: h, type, fillColor, strokeColor } = shape
  const parts: string[] = []

  // Shape outline
  const svgAttrs = `fill="${escapeXml(fillColor)}" stroke="${escapeXml(strokeColor)}" stroke-width="1.5"`
  switch (type) {
    case 'rectangle':
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${svgAttrs} rx="2"/>`)
      break
    case 'ellipse':
      parts.push(`<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${svgAttrs}/>`)
      break
    case 'diamond':
    case 'triangle':
    case 'parallelogram':
    case 'hexagon': {
      const verts = getPolygonVertices({ ...shape, x, y })
      if (verts) {
        const pts = verts.map(v => `${v.x},${v.y}`).join(' ')
        parts.push(`<polygon points="${pts}" ${svgAttrs}/>`)
      }
      break
    }
    case 'rounded-rectangle': {
      const r = Math.min(w, h) * 0.2
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${svgAttrs} rx="${r}" ry="${r}"/>`)
      break
    }
    case 'cylinder': {
      const ry = h * 0.12
      parts.push(`<ellipse cx="${x + w / 2}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" ${svgAttrs}/>`)
      parts.push(`<rect x="${x}" y="${y + ry}" width="${w}" height="${h - ry * 2}" fill="${escapeXml(fillColor)}" stroke="none"/>`)
      parts.push(`<line x1="${x}" y1="${y + ry}" x2="${x}" y2="${y + h - ry}" stroke="${escapeXml(strokeColor)}" stroke-width="1.5"/>`)
      parts.push(`<line x1="${x + w}" y1="${y + ry}" x2="${x + w}" y2="${y + h - ry}" stroke="${escapeXml(strokeColor)}" stroke-width="1.5"/>`)
      parts.push(`<path d="M ${x} ${y + h - ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry}" fill="none" stroke="${escapeXml(strokeColor)}" stroke-width="1.5"/>`)
      break
    }
    case 'cloud': {
      const cx = x + w / 2, cy = y + h / 2
      const rx = w / 2, ry = h / 2
      const d =
        `M ${cx - rx * 0.4} ${cy + ry * 0.6}` +
        ` C ${cx - rx * 0.9} ${cy + ry * 0.6}, ${cx - rx} ${cy - ry * 0.1}, ${cx - rx * 0.5} ${cy - ry * 0.4}` +
        ` C ${cx - rx * 0.6} ${cy - ry}, ${cx - rx * 0.1} ${cy - ry * 1.05}, ${cx + rx * 0.15} ${cy - ry * 0.6}` +
        ` C ${cx + rx * 0.3} ${cy - ry * 1.05}, ${cx + rx * 0.8} ${cy - ry * 0.8}, ${cx + rx * 0.7} ${cy - ry * 0.2}` +
        ` C ${cx + rx * 1.05} ${cy - ry * 0.2}, ${cx + rx * 1.0} ${cy + ry * 0.5}, ${cx + rx * 0.5} ${cy + ry * 0.6}` +
        ` C ${cx + rx * 0.3} ${cy + ry * 0.95}, ${cx - rx * 0.2} ${cy + ry * 0.95}, ${cx - rx * 0.4} ${cy + ry * 0.6}` +
        ` Z`
      parts.push(`<path d="${d}" ${svgAttrs}/>`)
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
      const align = zone.iconAlign

      if (hasIcon && align === 'center') {
        const iconX = x + w / 2
        parts.push(`<text x="${iconX}" y="${contentTop + zone.y + ICON_SIZE}" font-size="${ICON_SIZE}" text-anchor="middle" fill="${escapeXml(shape.textColor)}">${escapeXml(zone.icon)}</text>`)
        const textStartY = contentTop + zone.y + ICON_SIZE + ICON_GAP
        for (let i = 0; i < zone.lines.length; i++) {
          const lineText = zone.lines[i].trim()
          if (lineText) {
            const ly = textStartY + i * zone.lineHeight + zone.lineHeight * 0.8
            parts.push(`<text x="${x + w / 2}" y="${ly}" ${fontAttrs(zone.font)} text-anchor="middle" fill="${escapeXml(shape.textColor)}">${escapeXml(lineText)}</text>`)
          }
        }
      } else if (hasIcon && align === 'right') {
        const iconX = x + w - PADDING_X
        parts.push(`<text x="${iconX}" y="${contentTop + zone.y + ICON_SIZE}" font-size="${ICON_SIZE}" text-anchor="middle" fill="${escapeXml(shape.textColor)}">${escapeXml(zone.icon)}</text>`)
        const textRightEdge = iconX - ICON_SIZE / 2 - ICON_GAP
        for (let i = 0; i < zone.lines.length; i++) {
          const lineText = zone.lines[i].trim()
          if (lineText) {
            const ly = contentTop + zone.y + i * zone.lineHeight + zone.lineHeight * 0.8
            parts.push(`<text x="${textRightEdge}" y="${ly}" ${fontAttrs(zone.font)} text-anchor="end" fill="${escapeXml(shape.textColor)}">${escapeXml(lineText)}</text>`)
          }
        }
      } else if (hasIcon) {
        const iconX = x + PADDING_X
        parts.push(`<text x="${iconX}" y="${contentTop + zone.y + ICON_SIZE}" font-size="${ICON_SIZE}" text-anchor="middle" fill="${escapeXml(shape.textColor)}">${escapeXml(zone.icon)}</text>`)
        const textLeftEdge = iconX + ICON_SIZE / 2 + ICON_GAP
        for (let i = 0; i < zone.lines.length; i++) {
          const lineText = zone.lines[i].trim()
          if (lineText) {
            const ly = contentTop + zone.y + i * zone.lineHeight + zone.lineHeight * 0.8
            parts.push(`<text x="${textLeftEdge}" y="${ly}" ${fontAttrs(zone.font)} text-anchor="start" fill="${escapeXml(shape.textColor)}">${escapeXml(lineText)}</text>`)
          }
        }
      } else {
        for (let i = 0; i < zone.lines.length; i++) {
          const lineText = zone.lines[i].trim()
          if (lineText) {
            const ly = contentTop + zone.y + i * zone.lineHeight + zone.lineHeight * 0.8
            parts.push(`<text x="${x + w / 2}" y="${ly}" ${fontAttrs(zone.font)} text-anchor="middle" fill="${escapeXml(shape.textColor)}">${escapeXml(lineText)}</text>`)
          }
        }
      }
    }
  }

  return parts.join('\n  ')
}

function lineToSvg(line: Line, shapes: Shape[], ox: number, oy: number): string {
  const route = routeLine(line, shapes)
  if (!route) return ''
  const pts = route.map(p => ({ x: p.x - ox, y: p.y - oy }))

  const parts: string[] = []
  const markerId = `arrow-${line.id.replace(/[^a-zA-Z0-9]/g, '')}`

  if (line.directed) {
    parts.push(`<defs><marker id="${markerId}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${escapeXml(line.color)}"/></marker></defs>`)
  }

  parts.push(`<polyline points="${pts.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${escapeXml(line.color)}" stroke-width="1.5" stroke-linejoin="round"${line.directed ? ` marker-end="url(#${markerId})"` : ''}/>`)

  if (line.label) {
    const mid = polylineMidpoint(pts)
    const box = labelBox(line.label, mid)
    parts.push(`<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="white" rx="2"/>`)
    // Alphabetic baseline a little above the box bottom, matching the PNG's bottom-aligned text
    parts.push(`<text x="${mid.x}" y="${box.y + box.height - 5}" ${fontAttrs(LABEL_FONT)} text-anchor="middle" fill="${escapeXml(line.color)}">${escapeXml(line.label)}</text>`)
  }

  return parts.join('\n  ')
}

function textBoxToSvg(t: TextBox, ox: number, oy: number): string {
  const { lines, fontSize, lineHeight } = layoutTextBox(t)
  const weight = t.bold ? ' font-weight="bold"' : ''
  return lines.map((l, i) =>
    `<text x="${t.x - ox}" y="${t.y - oy + (i + 0.5) * lineHeight}" font-family="Inter, system-ui, sans-serif" font-size="${fontSize}"${weight} dominant-baseline="central" fill="${escapeXml(t.color)}" xml:space="preserve">${escapeXml(l)}</text>`,
  ).join('\n  ')
}

export function exportToSvg(shapes: Shape[], lines: Line[], freeLines: FreeLine[] = [], texts: TextBox[] = []): string {
  lines = withResolvedColors(lines)
  freeLines = withResolvedColors(freeLines)
  texts = withResolvedColors(texts)
  if (shapes.length === 0 && freeLines.length === 0 && texts.length === 0) return ''

  const bounds = exportBounds(shapes, lines, freeLines, texts)
  const w = bounds.maxX - bounds.minX + EXPORT_PADDING * 2
  const h = bounds.maxY - bounds.minY + EXPORT_PADDING * 2
  const ox = bounds.minX - EXPORT_PADDING
  const oy = bounds.minY - EXPORT_PADDING

  const linesSvg = lines.map(l => lineToSvg(l, shapes, ox, oy)).filter(Boolean).join('\n  ')
  const freeLinesSvg = freeLines.map(f =>
    `<line x1="${f.x1 - ox}" y1="${f.y1 - oy}" x2="${f.x2 - ox}" y2="${f.y2 - oy}" stroke="${escapeXml(f.color)}" stroke-width="2" stroke-linecap="round"/>`,
  ).join('\n  ')
  const shapesSvg = shapes.map(s => shapeToSvg(s, ox, oy)).join('\n  ')
  const textsSvg = texts.map(t => textBoxToSvg(t, ox, oy)).join('\n  ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="white"/>
  ${linesSvg}
  ${freeLinesSvg}
  ${shapesSvg}
  ${textsSvg}
</svg>`
}
