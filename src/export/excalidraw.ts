import type { Shape, Line, FreeLine, TextBox } from '../core/model'
import { withResolvedColors } from '../core/model'
import { layoutTextBox, TEXT_LINE_HEIGHT } from '../core/textBox'
import { routeLine, polylineMidpoint } from '../core/routing'

// Excalidraw element base
interface ExBase {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  angle: number
  strokeColor: string
  backgroundColor: string
  fillStyle: string
  strokeWidth: number
  strokeStyle: string
  roughness: number
  opacity: number
  groupIds: string[]
  frameId: null
  index: string
  roundness: { type: number } | null
  seed: number
  version: number
  versionNonce: number
  isDeleted: boolean
  boundElements: { id: string; type: string }[] | null
  updated: number
  link: null
  locked: boolean
}

interface ExRect extends ExBase {
  type: 'rectangle' | 'ellipse' | 'diamond'
}

interface ExText extends ExBase {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: number
  textAlign: string
  verticalAlign: string
  containerId: string | null
  originalText: string
  autoResize: boolean
  lineHeight: number
}

interface ExArrow extends ExBase {
  type: 'arrow' | 'line'
  points: [number, number][]
  lastCommittedPoint: null
  startBinding: { elementId: string; focus: number; gap: number; fixedPoint: null } | null
  endBinding: { elementId: string; focus: number; gap: number; fixedPoint: null } | null
  startArrowhead: null
  endArrowhead: string | null
  elbowed: boolean
}

let seed = 1

function nextSeed(): number {
  return seed++
}

function makeId(): string {
  return Math.random().toString(36).substring(2, 12)
}

function baseElement(overrides: Partial<ExBase> & { id: string; type: string; x: number; y: number; width: number; height: number }): ExBase {
  return {
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: `a${String(seed).padStart(5, '0')}`,
    roundness: { type: 3 },
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    ...overrides,
  }
}

function shapeToExcalidrawType(type: Shape['type']): 'rectangle' | 'ellipse' | 'diamond' {
  switch (type) {
    case 'rectangle':
    case 'rounded-rectangle':
    case 'parallelogram':
      return 'rectangle'
    case 'ellipse':
    case 'cylinder':
    case 'cloud':
      return 'ellipse'
    case 'diamond':
    case 'hexagon':
      return 'diamond'
    case 'triangle':
      return 'diamond'
    default:
      return 'rectangle'
  }
}

function buildFullText(shape: Shape): string {
  const parts: string[] = []
  if (shape.headerIcon) parts.push(shape.headerIcon + (shape.header ? ' ' : ''))
  if (shape.header) parts.push(shape.header)
  if (parts.length > 0 && (shape.body || shape.bodyIcon)) parts.push('\n')
  if (shape.bodyIcon) parts.push(shape.bodyIcon + (shape.body ? ' ' : ''))
  if (shape.body) parts.push(shape.body)
  if ((parts.length > 0) && (shape.footer || shape.footerIcon)) parts.push('\n')
  if (shape.footerIcon) parts.push(shape.footerIcon + (shape.footer ? ' ' : ''))
  if (shape.footer) parts.push(shape.footer)
  return parts.join('')
}

export function exportToExcalidraw(shapes: Shape[], lines: Line[], freeLines: FreeLine[] = [], texts: TextBox[] = []): string {
  // Excalidraw adapts its own dark mode, so 'auto' becomes the light-theme ink
  lines = withResolvedColors(lines)
  freeLines = withResolvedColors(freeLines)
  texts = withResolvedColors(texts)
  seed = 1
  const elements: (ExBase | ExText | ExArrow)[] = []

  // Map shape IDs to excalidraw element IDs
  const shapeIdMap = new Map<string, string>()

  // Create shape elements
  for (const shape of shapes) {
    const exId = makeId()
    shapeIdMap.set(shape.id, exId)

    const fullText = buildFullText(shape)
    const textId = fullText ? makeId() : null

    const shapeEl = baseElement({
      id: exId,
      type: shapeToExcalidrawType(shape.type),
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      strokeColor: shape.strokeColor,
      backgroundColor: shape.fillColor,
      fillStyle: 'solid',
      boundElements: textId
        ? [{ id: textId, type: 'text' }]
        : null,
    }) as ExRect

    elements.push(shapeEl)

    // Create bound text element
    if (fullText && textId) {
      const textEl: ExText = {
        ...baseElement({
          id: textId,
          type: 'text',
          x: shape.x + 10,
          y: shape.y + 10,
          width: shape.width - 20,
          height: shape.height - 20,
          strokeColor: shape.textColor,
          backgroundColor: 'transparent',
        }),
        type: 'text',
        text: fullText,
        fontSize: 16,
        fontFamily: 1,
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: exId,
        originalText: fullText,
        autoResize: true,
        lineHeight: 1.25,
        roundness: null,
      }
      elements.push(textEl)
    }
  }

  // Create arrow elements for lines
  for (const line of lines) {
    const fromExId = shapeIdMap.get(line.fromId)
    const toExId = shapeIdMap.get(line.toId)
    if (!fromExId || !toExId) continue

    const pts = routeLine(line, shapes)
    if (!pts) continue
    const fromPt = pts[0]

    const arrowId = makeId()

    // Also add arrow as boundElement on the shapes
    const fromEl = elements.find(e => e.id === fromExId)
    const toEl = elements.find(e => e.id === toExId)
    if (fromEl) {
      fromEl.boundElements = fromEl.boundElements || []
      fromEl.boundElements.push({ id: arrowId, type: 'arrow' })
    }
    if (toEl) {
      toEl.boundElements = toEl.boundElements || []
      toEl.boundElements.push({ id: arrowId, type: 'arrow' })
    }

    const relPts = pts.map((p): [number, number] => [p.x - fromPt.x, p.y - fromPt.y])
    const xsRel = relPts.map(p => p[0])
    const ysRel = relPts.map(p => p[1])

    const arrowEl: ExArrow = {
      ...baseElement({
        id: arrowId,
        type: 'arrow',
        x: fromPt.x,
        y: fromPt.y,
        width: Math.max(...xsRel) - Math.min(...xsRel),
        height: Math.max(...ysRel) - Math.min(...ysRel),
        strokeColor: line.color,
        backgroundColor: 'transparent',
      }),
      type: 'arrow',
      points: relPts,
      lastCommittedPoint: null,
      startBinding: {
        elementId: fromExId,
        focus: 0,
        gap: 4,
        fixedPoint: null,
      },
      endBinding: {
        elementId: toExId,
        focus: 0,
        gap: 4,
        fixedPoint: null,
      },
      startArrowhead: null,
      endArrowhead: line.directed ? 'arrow' : null,
      roundness: null,
      elbowed: false,
    }
    elements.push(arrowEl)

    // Label as separate text near midpoint
    if (line.label) {
      const { x: midX, y: midY } = polylineMidpoint(pts)
      const labelId = makeId()
      const labelEl: ExText = {
        ...baseElement({
          id: labelId,
          type: 'text',
          x: midX - 30,
          y: midY - 12,
          width: 60,
          height: 24,
          strokeColor: line.color,
          backgroundColor: 'transparent',
        }),
        type: 'text',
        text: line.label,
        fontSize: 14,
        fontFamily: 1,
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: null,
        originalText: line.label,
        autoResize: true,
        lineHeight: 1.25,
        roundness: null,
      }
      elements.push(labelEl)
    }
  }

  // Free lines become plain, unbound Excalidraw line elements
  for (const f of freeLines) {
    const dx = f.x2 - f.x1
    const dy = f.y2 - f.y1
    const lineEl: ExArrow = {
      ...baseElement({
        id: makeId(),
        type: 'line',
        x: f.x1,
        y: f.y1,
        width: Math.abs(dx),
        height: Math.abs(dy),
        strokeColor: f.color,
        backgroundColor: 'transparent',
      }),
      type: 'line',
      points: [[0, 0], [dx, dy]],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: null,
      roundness: null,
      elbowed: false,
    }
    elements.push(lineEl)
  }

  // Text boxes become standalone text elements (Excalidraw has no bold, so weight is dropped)
  for (const t of texts) {
    const { width, height, fontSize } = layoutTextBox(t)
    const textEl: ExText = {
      ...baseElement({
        id: makeId(),
        type: 'text',
        x: t.x,
        y: t.y,
        width,
        height,
        strokeColor: t.color,
        backgroundColor: 'transparent',
      }),
      type: 'text',
      text: t.text,
      fontSize,
      fontFamily: 2,
      textAlign: 'left',
      verticalAlign: 'top',
      containerId: null,
      originalText: t.text,
      autoResize: true,
      lineHeight: TEXT_LINE_HEIGHT,
      roundness: null,
    }
    elements.push(textEl)
  }

  const doc = {
    type: 'excalidraw',
    version: 2,
    source: 'https://idrawm.app',
    elements,
    appState: {
      gridSize: 20,
      gridStep: 5,
      gridModeEnabled: false,
      viewBackgroundColor: '#ffffff',
    },
    files: {},
  }

  return JSON.stringify(doc, null, 2)
}
