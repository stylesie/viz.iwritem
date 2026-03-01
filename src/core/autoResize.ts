import type { Shape, ShapeType, IconAlign } from './model'
import { MIN_SHAPE_SIZE, DEFAULT_SHAPE_SIZE } from './model'

const PADDING_X = 24
const PADDING_Y = 16
const ZONE_GAP = 4
const HEADER_FONT = 'bold 14px Inter, system-ui, sans-serif'
const BODY_FONT = '13px Inter, system-ui, sans-serif'
const FOOTER_FONT = 'italic 11px Inter, system-ui, sans-serif'

export const ICON_SIZE = 16
export const ICON_GAP = 4

export interface TextZoneLayout {
  text: string
  icon: string
  iconAlign: IconAlign
  font: string
  lines: string[]
  lineHeight: number
  totalHeight: number
  y: number // relative to shape top
}

export interface ShapeTextLayout {
  header: TextZoneLayout | null
  body: TextZoneLayout | null
  footer: TextZoneLayout | null
  contentWidth: number
  contentHeight: number
}

let measureCtx: CanvasRenderingContext2D | null = null

function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    measureCtx = canvas.getContext('2d')!
  }
  return measureCtx
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string): string[] {
  if (!text) return []
  ctx.font = font

  const lines: string[] = []
  // Split on explicit newlines first
  const paragraphs = text.split('\n')

  for (const para of paragraphs) {
    if (!para) {
      lines.push('')
      continue
    }

    const words = para.split(' ')
    let currentLine = words[0]

    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i]
      const metrics = ctx.measureText(testLine)
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = words[i]
      } else {
        currentLine = testLine
      }
    }
    lines.push(currentLine)
  }

  return lines
}

function measureZone(
  text: string,
  font: string,
  lineHeight: number,
  maxWrapWidth: number,
): { lines: string[]; width: number; height: number } {
  if (!text) return { lines: [], width: 0, height: 0 }

  const ctx = getMeasureCtx()
  ctx.font = font

  const lines = wrapText(ctx, text, maxWrapWidth, font)
  let maxLineWidth = 0
  for (const line of lines) {
    const w = ctx.measureText(line).width
    if (w > maxLineWidth) maxLineWidth = w
  }

  return {
    lines,
    width: maxLineWidth,
    height: lines.length * lineHeight,
  }
}

/**
 * Compute the text layout and required dimensions for a shape.
 * Does NOT mutate the shape — returns layout info and suggested size.
 */
export function computeTextLayout(shape: Shape, maxWrapWidth = 200): ShapeTextLayout {
  const iconExtra = ICON_SIZE + ICON_GAP // extra width when icon present
  const headerHasIcon = !!shape.headerIcon
  const bodyHasIcon = !!shape.bodyIcon
  const footerHasIcon = !!shape.footerIcon

  const headerAlign = shape.headerIconAlign || 'left'
  const bodyAlign = shape.bodyIconAlign || 'left'
  const footerAlign = shape.footerIconAlign || 'left'

  // Only reduce wrap width for left/right (side-by-side); center stacks vertically
  const headerWrapW = (headerHasIcon && headerAlign !== 'center') ? maxWrapWidth - iconExtra : maxWrapWidth
  const bodyWrapW = (bodyHasIcon && bodyAlign !== 'center') ? maxWrapWidth - iconExtra : maxWrapWidth
  const footerWrapW = (footerHasIcon && footerAlign !== 'center') ? maxWrapWidth - iconExtra : maxWrapWidth

  const headerMeasure = measureZone(shape.header, HEADER_FONT, 18, headerWrapW)
  const bodyMeasure = measureZone(shape.body, BODY_FONT, 17, bodyWrapW)
  const footerMeasure = measureZone(shape.footer, FOOTER_FONT, 15, footerWrapW)

  // Account for icon-only zones (icon but no text)
  if (headerHasIcon && !headerMeasure.lines.length) {
    headerMeasure.lines = [' ']
    headerMeasure.height = 18
    headerMeasure.width = 0
  }
  if (bodyHasIcon && !bodyMeasure.lines.length) {
    bodyMeasure.lines = [' ']
    bodyMeasure.height = 17
    bodyMeasure.width = 0
  }
  if (footerHasIcon && !footerMeasure.lines.length) {
    footerMeasure.lines = [' ']
    footerMeasure.height = 15
    footerMeasure.width = 0
  }

  // For center alignment, add icon height above text
  if (headerHasIcon && headerAlign === 'center') {
    headerMeasure.height += ICON_SIZE + ICON_GAP
  }
  if (bodyHasIcon && bodyAlign === 'center') {
    bodyMeasure.height += ICON_SIZE + ICON_GAP
  }
  if (footerHasIcon && footerAlign === 'center') {
    footerMeasure.height += ICON_SIZE + ICON_GAP
  }

  const allMeasures = [
    { m: headerMeasure, hasIcon: headerHasIcon, align: headerAlign },
    { m: bodyMeasure, hasIcon: bodyHasIcon, align: bodyAlign },
    { m: footerMeasure, hasIcon: footerHasIcon, align: footerAlign },
  ].filter(z => z.m.lines.length > 0)

  const contentWidth = Math.max(
    ...allMeasures.map(z => {
      // For center alignment, icon doesn't add to width (it stacks above)
      if (z.align === 'center') return Math.max(z.m.width, z.hasIcon ? ICON_SIZE : 0)
      return z.m.width + (z.hasIcon ? iconExtra : 0)
    }),
    0,
  )
  const gapTotal = allMeasures.length > 1 ? (allMeasures.length - 1) * ZONE_GAP : 0
  const contentHeight = allMeasures.reduce((sum, z) => sum + z.m.height, 0) + gapTotal

  let currentY = 0
  const makeZoneLayout = (
    text: string,
    icon: string,
    iconAlign: IconAlign,
    font: string,
    m: { lines: string[]; width: number; height: number },
    lineHeight: number,
  ): TextZoneLayout | null => {
    if (!m.lines.length) return null
    const layout: TextZoneLayout = {
      text,
      icon,
      iconAlign,
      font,
      lines: m.lines,
      lineHeight,
      totalHeight: m.height,
      y: currentY,
    }
    currentY += m.height + ZONE_GAP
    return layout
  }

  const header = makeZoneLayout(shape.header, shape.headerIcon, headerAlign, HEADER_FONT, headerMeasure, 18)
  const body = makeZoneLayout(shape.body, shape.bodyIcon, bodyAlign, BODY_FONT, bodyMeasure, 17)
  const footer = makeZoneLayout(shape.footer, shape.footerIcon, footerAlign, FOOTER_FONT, footerMeasure, 15)

  return { header, body, footer, contentWidth, contentHeight }
}

/**
 * Given a shape with text, compute the new dimensions and possibly morphed type.
 * Returns a partial shape update (width, height, type, x adjusted to keep center).
 */
export function autoResizeShape(shape: Shape): Partial<Shape> {
  const layout = computeTextLayout(shape)
  const hasText = shape.header || shape.body || shape.footer ||
    shape.headerIcon || shape.bodyIcon || shape.footerIcon

  if (!hasText) {
    // No text — return to default square/circle size
    const size = DEFAULT_SHAPE_SIZE
    const cx = shape.x + shape.width / 2
    const cy = shape.y + shape.height / 2
    const baseType = morphType(shape.type, size, size)
    return {
      width: size,
      height: size,
      type: baseType,
      x: cx - size / 2,
      y: cy - size / 2,
    }
  }

  // Extra padding for diamonds and triangles (text area is smaller than bounding box)
  const shapePaddingMultiplier = (shape.type === 'diamond' || shape.type === 'triangle') ? 1.6 : 1

  const requiredW = Math.max(
    MIN_SHAPE_SIZE,
    (layout.contentWidth + PADDING_X * 2) * shapePaddingMultiplier
  )
  const requiredH = Math.max(
    MIN_SHAPE_SIZE,
    (layout.contentHeight + PADDING_Y * 2) * shapePaddingMultiplier
  )

  // Keep center position stable
  const cx = shape.x + shape.width / 2
  const cy = shape.y + shape.height / 2

  const newType = morphType(shape.type, requiredW, requiredH)

  return {
    width: requiredW,
    height: requiredH,
    type: newType,
    x: cx - requiredW / 2,
    y: cy - requiredH / 2,
  }
}

/**
 * Morph shape type based on aspect ratio:
 * - circle ↔ oval (when width ≠ height)
 * - square ↔ rectangle (when width ≠ height)
 * Diamond and triangle stay as they are.
 */
function morphType(currentType: ShapeType, w: number, h: number): ShapeType {
  const isSquarish = Math.abs(w - h) < 8 // tolerance

  switch (currentType) {
    case 'circle':
    case 'oval':
      return isSquarish ? 'circle' : 'oval'
    case 'square':
    case 'rectangle':
      return isSquarish ? 'square' : 'rectangle'
    default:
      return currentType
  }
}

export { HEADER_FONT, BODY_FONT, FOOTER_FONT, PADDING_X, PADDING_Y }
