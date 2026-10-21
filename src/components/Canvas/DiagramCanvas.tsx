import { useRef, useEffect, useCallback, useState } from 'react'
import { useGesture } from '@use-gesture/react'
import rough from 'roughjs'
import { useDiagramStore } from '../../store/diagramStore'
import type { Theme } from '../../store/diagramStore'
import { hitTestShape, getShapeEdgePoint, pointToSegmentDist, getPolygonVertices } from '../../utils/geometry'
import { routeLine, polylineMidpoint } from '../../core/routing'
import { computeTextLayout, PADDING_X, ICON_SIZE, ICON_GAP } from '../../core/autoResize'
import type { Shape, Line, FreeLine, TextBox } from '../../core/model'
import { GRID_SIZE, snapShapePosition, snapToGrid as snapValue, resolveColor, INK_LIGHT, INK_DARK } from '../../core/model'
import { lockToAngles } from '../../core/angleLock'
import { layoutTextBox, textBoxFont } from '../../core/textBox'
import type { Point } from '../../utils/geometry'
import type { TextZoneLayout } from '../../core/autoResize'

// ── Theme-aware colors ─────────────────────────────────────────

interface ThemeColors {
  grid: string
  selection: string
  placeholderText: string
  canvasBg: string
  // What AUTO_COLOR lines and text draw in
  ink: string
}

const LIGHT_COLORS: ThemeColors = {
  grid: '#e0e0e0',
  selection: '#0984e3',
  placeholderText: '#bbb',
  canvasBg: '#fafafa',
  ink: INK_LIGHT,
}

const DARK_COLORS: ThemeColors = {
  grid: '#2e2d39',
  selection: '#a8a5ff',
  placeholderText: '#666',
  canvasBg: '#121212',
  ink: INK_DARK,
}

function getThemeColors(theme: Theme): ThemeColors {
  return theme === 'dark' ? DARK_COLORS : LIGHT_COLORS
}

// ── Shape drawing ──────────────────────────────────────────────

function drawShape(rc: ReturnType<typeof rough.canvas>, ctx: CanvasRenderingContext2D, shape: Shape, tc: ThemeColors) {
  const { x, y, width: w, height: h, type, fillColor, strokeColor, selected } = shape

  const options = {
    fill: fillColor,
    fillStyle: 'solid' as const,
    stroke: selected ? tc.selection : strokeColor,
    strokeWidth: selected ? 2.5 : 1.5,
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
        // Body rectangle
        ctx.fillRect(x, y + ry, w, h - ry * 2)
        // Bottom ellipse fill
        ctx.beginPath()
        ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, 0, Math.PI)
        ctx.fill()
        ctx.restore()
      }
      // Body sides
      rc.line(x, y + ry, x, y + h - ry, options)
      rc.line(x + w, y + ry, x + w, y + h - ry, options)
      // Top ellipse (full)
      rc.ellipse(x + w / 2, y + ry, w, ry * 2, options)
      // Bottom arc (half ellipse, bottom half)
      rc.arc(x + w / 2, y + h - ry, w, ry * 2, 0, Math.PI, false, options)
      break
    }
    case 'cloud': {
      // Cloud shape using bezier curves
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

  const hasContent = shape.header || shape.body || shape.footer ||
    shape.headerIcon || shape.bodyIcon || shape.footerIcon
  if (hasContent) {
    drawTextZones(ctx, shape)
  } else {
    ctx.save()
    ctx.font = '13px Inter, system-ui, sans-serif'
    ctx.fillStyle = tc.placeholderText
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(shape.type, x + w / 2, y + h / 2, w - 10)
    ctx.restore()
  }

  if (selected) {
    ctx.save()
    ctx.strokeStyle = tc.selection
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8)
    ctx.setLineDash([])
    ctx.restore()
  }
}

function drawTextZones(ctx: CanvasRenderingContext2D, shape: Shape) {
  const layout = computeTextLayout(shape)
  const { x, y, width: w, height: h } = shape
  const contentTop = y + (h - layout.contentHeight) / 2

  ctx.save()
  ctx.fillStyle = shape.textColor

  const drawZone = (zone: TextZoneLayout | null) => {
    if (!zone) return
    const hasIcon = !!zone.icon
    const align = zone.iconAlign

    if (hasIcon && align === 'center') {
      // Center: icon centered above text
      const iconX = x + w / 2
      const iconY = contentTop + zone.y
      ctx.font = `${ICON_SIZE}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(zone.icon, iconX, iconY)

      // Text centered below icon
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
      // Right: icon at right edge, text right-aligned before icon
      const iconX = x + w - PADDING_X
      const iconY = contentTop + zone.y + (zone.lineHeight - ICON_SIZE) / 2
      ctx.font = `${ICON_SIZE}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(zone.icon, iconX, iconY)

      // Text right-aligned, ending before icon
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
      // Left (default): icon at left edge, text left-aligned after icon
      const iconX = x + PADDING_X
      const iconY = contentTop + zone.y + (zone.lineHeight - ICON_SIZE) / 2
      ctx.font = `${ICON_SIZE}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(zone.icon, iconX, iconY)

      // Text left-aligned, starting after icon
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
      // No icon: text center-aligned as before
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

// ── Line drawing ──────────────────────────────────────────────

function drawLine(
  ctx: CanvasRenderingContext2D,
  line: Line,
  shapes: Shape[],
  selected: boolean,
  tc: ThemeColors,
) {
  const pts = routeLine(line, shapes)
  if (!pts) return
  const prevPt = pts[pts.length - 2]
  const toPt = pts[pts.length - 1]
  const color = selected ? tc.selection : resolveColor(line.color, tc.ink)

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = selected ? 2.5 : 1.5
  ctx.lineJoin = 'round'

  // Draw line
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke()

  // Draw arrowhead if directed
  if (line.directed) {
    drawArrowhead(ctx, prevPt.x, prevPt.y, toPt.x, toPt.y, color)
  }

  // Draw label
  if (line.label) {
    const { x: midX, y: midY } = polylineMidpoint(pts)

    ctx.font = '12px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    const metrics = ctx.measureText(line.label)
    const pad = 3
    ctx.fillStyle = tc.canvasBg
    ctx.fillRect(
      midX - metrics.width / 2 - pad,
      midY - 14 - pad,
      metrics.width + pad * 2,
      16 + pad,
    )

    ctx.fillStyle = color
    ctx.fillText(line.label, midX, midY - 2)
  }

  ctx.restore()
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  color: string,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const headLen = 12

  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6),
  )
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6),
  )
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// Draw the in-progress connection line
function drawConnecting(
  ctx: CanvasRenderingContext2D,
  fromShape: Shape,
  toX: number, toY: number,
  tc: ThemeColors,
) {
  const fromPt = getShapeEdgePoint(fromShape, { x: toX, y: toY })

  ctx.save()
  ctx.strokeStyle = tc.selection
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(fromPt.x, fromPt.y)
  ctx.lineTo(toX, toY)
  ctx.stroke()

  // Arrowhead on connecting line
  drawArrowhead(ctx, fromPt.x, fromPt.y, toX, toY, tc.selection)
  ctx.restore()
}

// ── Free lines ───────────────────────────────────────────────

const HANDLE_RADIUS = 5
const MIN_FREE_LINE_LENGTH = 4

function drawFreeLine(
  ctx: CanvasRenderingContext2D,
  f: Pick<FreeLine, 'x1' | 'y1' | 'x2' | 'y2' | 'color'>,
  selected: boolean,
  tc: ThemeColors,
  zoom: number,
) {
  ctx.save()
  ctx.strokeStyle = selected ? tc.selection : resolveColor(f.color, tc.ink)
  ctx.lineWidth = selected ? 2.5 : 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(f.x1, f.y1)
  ctx.lineTo(f.x2, f.y2)
  ctx.stroke()

  if (selected) {
    // Endpoint handles stay the same size on screen at any zoom
    ctx.fillStyle = tc.canvasBg
    ctx.lineWidth = 1.5 / zoom
    for (const [x, y] of [[f.x1, f.y1], [f.x2, f.y2]]) {
      ctx.beginPath()
      ctx.arc(x, y, HANDLE_RADIUS / zoom, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }
  ctx.restore()
}

/**
 * Constrain a dragged point relative to a fixed anchor: 45° steps when locking,
 * otherwise grid snap when enabled.
 */
function constrainPoint(p: Point, anchor: Point, lock: boolean, grid: boolean): Point {
  if (lock) return lockToAngles(p, [anchor], grid ? GRID_SIZE : null)
  if (grid) return { x: snapValue(p.x), y: snapValue(p.y) }
  return p
}

// ── Text boxes ───────────────────────────────────────────────

// Gap between a text box and its selection outline; also widens its hit area
const TEXT_SELECT_PAD = 4

function drawTextBox(ctx: CanvasRenderingContext2D, t: TextBox, selected: boolean, tc: ThemeColors, zoom: number) {
  const layout = layoutTextBox(t)
  ctx.save()
  ctx.font = textBoxFont(t)
  ctx.textBaseline = 'middle'
  // Only the box being edited can be empty; it shows the placeholder
  ctx.fillStyle = t.text ? resolveColor(t.color, tc.ink) : tc.placeholderText
  layout.lines.forEach((line, i) => ctx.fillText(line, t.x, t.y + (i + 0.5) * layout.lineHeight))

  if (selected) {
    const pad = TEXT_SELECT_PAD / zoom
    ctx.strokeStyle = tc.selection
    ctx.lineWidth = 1 / zoom
    ctx.setLineDash([4 / zoom, 3 / zoom])
    ctx.strokeRect(t.x - pad, t.y - pad, layout.width + pad * 2, layout.height + pad * 2)
  }
  ctx.restore()
}

// ── Hit testing ──────────────────────────────────────────────

const LINE_HIT_TOLERANCE = 8

function findHitShape(shapes: Shape[], canvasX: number, canvasY: number): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitTestShape(shapes[i], canvasX, canvasY)) {
      return shapes[i]
    }
  }
  return null
}

function findHitLine(lines: Line[], shapes: Shape[], canvasX: number, canvasY: number): Line | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    const pts = routeLine(line, shapes)
    if (!pts) continue

    let dist = Infinity
    for (let j = 1; j < pts.length; j++) {
      dist = Math.min(dist, pointToSegmentDist(canvasX, canvasY, pts[j - 1].x, pts[j - 1].y, pts[j].x, pts[j].y))
    }
    if (dist < LINE_HIT_TOLERANCE) return line
  }
  return null
}

function findHitFreeLine(freeLines: FreeLine[], canvasX: number, canvasY: number): FreeLine | null {
  for (let i = freeLines.length - 1; i >= 0; i--) {
    const f = freeLines[i]
    if (pointToSegmentDist(canvasX, canvasY, f.x1, f.y1, f.x2, f.y2) < LINE_HIT_TOLERANCE) return f
  }
  return null
}

function findHitText(texts: TextBox[], canvasX: number, canvasY: number): TextBox | null {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i]
    const { width, height } = layoutTextBox(t)
    if (canvasX >= t.x - TEXT_SELECT_PAD && canvasX <= t.x + width + TEXT_SELECT_PAD &&
        canvasY >= t.y - TEXT_SELECT_PAD && canvasY <= t.y + height + TEXT_SELECT_PAD) return t
  }
  return null
}

// ── Canvas component ──────────────────────────────────────────

export default function DiagramCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const shapes = useDiagramStore(s => s.shapes)
  const freeLines = useDiagramStore(s => s.freeLines)
  const addFreeLine = useDiagramStore(s => s.addFreeLine)
  const selectFreeLine = useDiagramStore(s => s.selectFreeLine)
  const setFreeLinePoints = useDiagramStore(s => s.setFreeLinePoints)
  const texts = useDiagramStore(s => s.texts)
  const editingText = useDiagramStore(s => s.editingText)
  const addText = useDiagramStore(s => s.addText)
  const selectText = useDiagramStore(s => s.selectText)
  const setTextPosition = useDiagramStore(s => s.setTextPosition)
  const startEditingText = useDiagramStore(s => s.startEditingText)
  const stopEditingText = useDiagramStore(s => s.stopEditingText)
  const lines = useDiagramStore(s => s.lines)
  const activeTool = useDiagramStore(s => s.activeTool)
  const editing = useDiagramStore(s => s.editing)
  const connecting = useDiagramStore(s => s.connecting)
  const selection = useDiagramStore(s => s.selection)
  const theme = useDiagramStore(s => s.theme)
  const panX = useDiagramStore(s => s.panX)
  const panY = useDiagramStore(s => s.panY)
  const zoom = useDiagramStore(s => s.zoom)
  const addShape = useDiagramStore(s => s.addShape)
  const selectShape = useDiagramStore(s => s.selectShape)
  const selectLine = useDiagramStore(s => s.selectLine)
  const clearSelection = useDiagramStore(s => s.clearSelection)
  const setShapePosition = useDiagramStore(s => s.setShapePosition)
  const snapToGrid = useDiagramStore(s => s.snapToGrid)
  const angleLock = useDiagramStore(s => s.angleLock)
  const setPan = useDiagramStore(s => s.setPan)
  const zoomAt = useDiagramStore(s => s.zoomAt)
  const screenToCanvas = useDiagramStore(s => s.screenToCanvas)
  const startEditing = useDiagramStore(s => s.startEditing)
  const stopEditing = useDiagramStore(s => s.stopEditing)
  const startConnecting = useDiagramStore(s => s.startConnecting)
  const updateConnecting = useDiagramStore(s => s.updateConnecting)
  const finishConnecting = useDiagramStore(s => s.finishConnecting)
  const cancelConnecting = useDiagramStore(s => s.cancelConnecting)
  const startEditingLine = useDiagramStore(s => s.startEditingLine)
  const pushMoveHistory = useDiagramStore(s => s.pushMoveHistory)

  const dragTargetRef = useRef<string | null>(null)
  // Shape position at drag start — snapped drags are computed from here, not accumulated
  const dragOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  // Centres a Shift-drag locks to: connected shapes, or the drag start if unconnected
  const dragAnchorsRef = useRef<Point[]>([])
  const isPanningRef = useRef(false)
  // Canvas point where the pointer went down. The first drag event only fires after the
  // drag threshold, so drags are measured from here rather than from that event.
  const pointerStartRef = useRef<Point>({ x: 0, y: 0 })
  // Line tool: start of the line being drawn (grid-snapped)
  const drawStartRef = useRef<Point | null>(null)
  const [draft, setDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  // Mirrors draft for onDragEnd, which can run before the last setDraft has re-rendered
  const draftRef = useRef(draft)
  const updateDraft = (d: typeof draft) => {
    draftRef.current = d
    setDraft(d)
  }
  // Free line being moved (whole line) or reshaped (one endpoint)
  const freeLineDragRef = useRef<{ id: string; mode: 'move' | 'p1' | 'p2'; orig: FreeLine } | null>(null)
  // Text box being dragged, and its position at drag start
  const textDragRef = useRef<{ id: string; origin: Point } | null>(null)
  // Swallows the click that follows drawing or dragging a free line
  const suppressClickRef = useRef(false)
  const didDragRef = useRef(false)

  // ── Render ──

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tc = getThemeColors(theme)

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, rect.width, rect.height)

    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)

    drawGrid(ctx, rect.width, rect.height, panX, panY, zoom, tc)

    // Draw lines first (behind shapes)
    for (const line of lines) {
      const isSelected = selection?.type === 'line' && selection.id === line.id
      drawLine(ctx, line, shapes, isSelected, tc)
    }

    // Free lines sit with connectors, behind shapes
    for (const f of freeLines) {
      const isSelected = selection?.type === 'freeLine' && selection.id === f.id
      drawFreeLine(ctx, f, isSelected, tc, zoom)
    }
    if (draft) {
      drawFreeLine(ctx, { ...draft, color: tc.selection }, false, tc, zoom)
    }

    // Draw in-progress connection
    if (connecting) {
      const fromShape = shapes.find(s => s.id === connecting.fromId)
      if (fromShape) {
        drawConnecting(ctx, fromShape, connecting.currentX, connecting.currentY, tc)
      }
    }

    // Draw shapes
    const rc = rough.canvas(canvas)
    for (const shape of shapes) {
      drawShape(rc, ctx, shape, tc)
    }

    // Text boxes are drawn on top so headers stay readable over shapes
    for (const t of texts) {
      drawTextBox(ctx, t, selection?.type === 'text' && selection.id === t.id, tc, zoom)
    }

    ctx.restore()
  }, [shapes, lines, freeLines, texts, draft, panX, panY, zoom, selection, connecting, theme])

  useEffect(() => {
    const frameId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frameId)
  }, [render])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => render())
    observer.observe(container)
    return () => observer.disconnect()
  }, [render])

  // ── Click to select ──

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (didDragRef.current) return
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (editing) return

    const canvasEl = canvasRef.current
    if (!canvasEl) return
    const rect = canvasEl.getBoundingClientRect()
    const cp = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)

    // Shape placement tools
    // Line tool draws by dragging; a tap does nothing
    if (activeTool === 'freeLine') return

    // Text tool — edit the text box under the pointer, or start a new one there
    if (activeTool === 'text') {
      const hitText = findHitText(texts, cp.x, cp.y)
      if (hitText) startEditingText(hitText.id)
      else addText(cp.x, cp.y)
      return
    }

    if (activeTool !== 'select' && activeTool !== 'connect') {
      addShape(activeTool, cp.x, cp.y)
      return
    }

    // Connect tool — single click on shape starts connecting
    if (activeTool === 'connect') {
      const hit = findHitShape(shapes, cp.x, cp.y)
      if (hit) {
        startConnecting(hit.id)
      }
      return
    }

    // Select tool — text boxes (drawn on top) first, then shapes, then lines
    const hitText = findHitText(texts, cp.x, cp.y)
    if (hitText) {
      selectText(hitText.id)
      return
    }

    const hitShape = findHitShape(shapes, cp.x, cp.y)
    if (hitShape) {
      selectShape(hitShape.id)
      return
    }

    const hitLine = findHitLine(lines, shapes, cp.x, cp.y)
    if (hitLine) {
      selectLine(hitLine.id)
      return
    }

    const hitFreeLine = findHitFreeLine(freeLines, cp.x, cp.y)
    if (hitFreeLine) {
      selectFreeLine(hitFreeLine.id)
      return
    }

    clearSelection()
  }, [activeTool, shapes, lines, freeLines, texts, editing, screenToCanvas, addShape, addText, selectShape, selectLine, selectFreeLine, selectText, startEditingText, clearSelection, startConnecting])

  // ── Double-click to edit ──

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (editing) return

    const canvasEl = canvasRef.current
    if (!canvasEl) return
    const rect = canvasEl.getBoundingClientRect()
    const cp = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)

    const hitText = findHitText(texts, cp.x, cp.y)
    if (hitText) {
      startEditingText(hitText.id)
      return
    }

    const hitShape = findHitShape(shapes, cp.x, cp.y)
    if (hitShape) {
      startEditing(hitShape.id, 'body')
      return
    }

    const hitLine = findHitLine(lines, shapes, cp.x, cp.y)
    if (hitLine) {
      startEditingLine(hitLine.id)
      return
    }
  }, [shapes, lines, texts, editing, screenToCanvas, startEditing, startEditingLine, startEditingText])

  // ── Gesture handling ──

  useGesture(
    {
      onDrag: ({ event, delta: [dx, dy], first, xy: [sx, sy], initial: [ix, iy], movement: [mx, my] }) => {
        event.preventDefault()

        if (editing) {
          stopEditing()
          return
        }
        // Normally already closed by the editor losing focus
        if (editingText) stopEditingText()

        const canvasEl = canvasRef.current
        if (!canvasEl) return
        const rect = canvasEl.getBoundingClientRect()

        if (first) {
          didDragRef.current = false
          freeLineDragRef.current = null
          textDragRef.current = null
          drawStartRef.current = null
          const cp = screenToCanvas(ix - rect.left, iy - rect.top)
          pointerStartRef.current = cp

          // Line tool — start drawing at the pointer (snapped to grid if enabled)
          if (activeTool === 'freeLine') {
            const anchor = snapToGrid ? { x: snapValue(cp.x), y: snapValue(cp.y) } : cp
            drawStartRef.current = anchor
            updateDraft({ x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: anchor.y })
            dragTargetRef.current = null
            isPanningRef.current = false
            return
          }

          // Connect tool — drag from shape
          if (activeTool === 'connect') {
            const hit = findHitShape(shapes, cp.x, cp.y)
            if (hit) {
              startConnecting(hit.id)
            }
            dragTargetRef.current = null
            isPanningRef.current = !hit
            return
          }

          if (activeTool !== 'select') {
            dragTargetRef.current = null
            isPanningRef.current = false
            return
          }

          // Endpoint handles of the selected free line take priority over everything under them
          if (selection?.type === 'freeLine') {
            const f = freeLines.find(fl => fl.id === selection.id)
            const reach = (HANDLE_RADIUS + 5) / zoom
            const mode = !f ? null
              : Math.hypot(cp.x - f.x1, cp.y - f.y1) <= reach ? 'p1'
              : Math.hypot(cp.x - f.x2, cp.y - f.y2) <= reach ? 'p2'
              : null
            if (f && mode) {
              freeLineDragRef.current = { id: f.id, mode, orig: { ...f } }
              dragTargetRef.current = null
              isPanningRef.current = false
              pushMoveHistory()
              return
            }
          }

          const hitText = findHitText(texts, cp.x, cp.y)
          if (hitText) {
            selectText(hitText.id)
            textDragRef.current = { id: hitText.id, origin: { x: hitText.x, y: hitText.y } }
            dragTargetRef.current = null
            isPanningRef.current = false
            pushMoveHistory()
            return
          }

          const hit = findHitShape(shapes, cp.x, cp.y)
          if (!hit) {
            const hitFree = findHitFreeLine(freeLines, cp.x, cp.y)
            if (hitFree) {
              selectFreeLine(hitFree.id)
              freeLineDragRef.current = { id: hitFree.id, mode: 'move', orig: { ...hitFree } }
              dragTargetRef.current = null
              isPanningRef.current = false
              pushMoveHistory()
              return
            }
          }
          if (hit) {
            selectShape(hit.id)
            dragTargetRef.current = hit.id
            dragOriginRef.current = { x: hit.x, y: hit.y }
            const neighbourIds = new Set(lines.flatMap(l =>
              l.fromId === hit.id ? [l.toId] : l.toId === hit.id ? [l.fromId] : []))
            neighbourIds.delete(hit.id)
            const anchors = shapes.filter(s => neighbourIds.has(s.id))
              .map(s => ({ x: s.x + s.width / 2, y: s.y + s.height / 2 }))
            dragAnchorsRef.current = anchors.length > 0
              ? anchors
              : [{ x: hit.x + hit.width / 2, y: hit.y + hit.height / 2 }]
            isPanningRef.current = false
            pushMoveHistory()
          } else {
            dragTargetRef.current = null
            isPanningRef.current = true
          }
          return
        }

        if (Math.abs(mx) > 3 || Math.abs(my) > 3) {
          didDragRef.current = true
        }

        const cur = screenToCanvas(sx - rect.left, sy - rect.top)
        const moved = { x: cur.x - pointerStartRef.current.x, y: cur.y - pointerStartRef.current.y }

        // Update connecting position
        if (connecting) {
          updateConnecting(cur.x, cur.y)
          return
        }

        const lock = angleLock || (event as PointerEvent).shiftKey

        if (drawStartRef.current) {
          const anchor = drawStartRef.current
          const end = constrainPoint(cur, anchor, lock, snapToGrid)
          updateDraft({ x1: anchor.x, y1: anchor.y, x2: end.x, y2: end.y })
          return
        }

        if (textDragRef.current) {
          const { id, origin } = textDragRef.current
          const pos = constrainPoint({ x: origin.x + moved.x, y: origin.y + moved.y }, origin, lock, snapToGrid)
          setTextPosition(id, pos.x, pos.y)
          return
        }

        if (freeLineDragRef.current) {
          const { id, mode, orig } = freeLineDragRef.current
          const p1 = { x: orig.x1, y: orig.y1 }
          const p2 = { x: orig.x2, y: orig.y2 }
          const shift = moved
          if (mode === 'move') {
            // Move by the first endpoint so the whole line snaps/locks as a unit
            const moved = constrainPoint({ x: p1.x + shift.x, y: p1.y + shift.y }, p1, lock, snapToGrid)
            const ox = moved.x - p1.x, oy = moved.y - p1.y
            setFreeLinePoints(id, p1.x + ox, p1.y + oy, p2.x + ox, p2.y + oy)
          } else if (mode === 'p1') {
            const q = constrainPoint({ x: p1.x + shift.x, y: p1.y + shift.y }, p2, lock, snapToGrid)
            setFreeLinePoints(id, q.x, q.y, p2.x, p2.y)
          } else {
            const q = constrainPoint({ x: p2.x + shift.x, y: p2.y + shift.y }, p1, lock, snapToGrid)
            setFreeLinePoints(id, p1.x, p1.y, q.x, q.y)
          }
          return
        }

        if (dragTargetRef.current) {
          const shape = shapes.find(s => s.id === dragTargetRef.current)
          if (shape) {
            // Positions are derived from the drag start each frame so snapping never accumulates drift
            let pos = { x: dragOriginRef.current.x + moved.x, y: dragOriginRef.current.y + moved.y }
            if (lock) {
              const c = lockToAngles(
                { x: pos.x + shape.width / 2, y: pos.y + shape.height / 2 },
                dragAnchorsRef.current,
                snapToGrid ? GRID_SIZE : null,
              )
              pos = { x: c.x - shape.width / 2, y: c.y - shape.height / 2 }
            } else if (snapToGrid) {
              pos = snapShapePosition({ ...shape, ...pos })
            }
            if (pos.x !== shape.x || pos.y !== shape.y) setShapePosition(shape.id, pos.x, pos.y)
          }
        } else if (isPanningRef.current) {
          // Read the live camera: several pointer events can arrive before this closure is re-created
          const cam = useDiagramStore.getState()
          setPan(cam.panX + dx, cam.panY + dy)
        }
      },
      onDragEnd: ({ xy: [sx, sy] }) => {
        // Reset drag flag so subsequent clicks aren't blocked
        didDragRef.current = false

        if (drawStartRef.current) {
          drawStartRef.current = null
          suppressClickRef.current = true
          const d = draftRef.current
          if (d && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) >= MIN_FREE_LINE_LENGTH) {
            addFreeLine(d.x1, d.y1, d.x2, d.y2)
          }
          updateDraft(null)
          return
        }

        if (freeLineDragRef.current) {
          freeLineDragRef.current = null
          suppressClickRef.current = true
          return
        }

        if (textDragRef.current) {
          textDragRef.current = null
          return
        }

        if (connecting) {
          const canvasEl = canvasRef.current
          if (!canvasEl) {
            cancelConnecting()
            return
          }
          const rect = canvasEl.getBoundingClientRect()
          const cp = screenToCanvas(sx - rect.left, sy - rect.top)
          const hit = findHitShape(shapes, cp.x, cp.y)
          finishConnecting(hit?.id ?? null)
          return
        }
      },
      onPinch: ({ offset: [scale], origin: [ox, oy] }) => {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect) zoomAt(ox - rect.left, oy - rect.top, scale)
      },
      onWheel: ({ event, delta: [, dy] }) => {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect) zoomAt(event.clientX - rect.left, event.clientY - rect.top, useDiagramStore.getState().zoom * (1 - dy * 0.001))
      },
    },
    {
      target: canvasRef,
      drag: { filterTaps: true },
      // Start each pinch from the store's zoom, which the wheel also changes
      pinch: { scaleBounds: { min: 0.1, max: 5 }, from: () => [useDiagramStore.getState().zoom, 0] },
      eventOptions: { passive: false },
    }
  )

  // ── Keyboard ──

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (connecting) {
          cancelConnecting()
          return
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
        useDiagramStore.getState().deleteSelected()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [connecting, cancelConnecting])

  const cursor = (() => {
    if (connecting) return 'crosshair'
    if (activeTool === 'connect') return 'crosshair'
    if (activeTool === 'select') return 'default'
    if (activeTool === 'text') return 'text'
    return 'crosshair'
  })()

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        touchAction: 'none',
        cursor,
        position: 'relative',
      }}
    >
      <canvas
        ref={canvasRef}
        // A touch drag produces no click to consume the suppression flag, so a new press clears it
        onPointerDown={() => { suppressClickRef.current = false }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  )
}

// ── Grid ──

function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  panX: number,
  panY: number,
  zoom: number,
  tc: ThemeColors,
) {
  const gridSize = GRID_SIZE
  ctx.save()
  ctx.strokeStyle = tc.grid
  ctx.lineWidth = 0.5

  const startX = Math.floor(-panX / zoom / gridSize) * gridSize
  const startY = Math.floor(-panY / zoom / gridSize) * gridSize
  const endX = startX + viewW / zoom + gridSize * 2
  const endY = startY + viewH / zoom + gridSize * 2

  for (let x = startX; x < endX; x += gridSize) {
    ctx.beginPath()
    ctx.moveTo(x, startY)
    ctx.lineTo(x, endY)
    ctx.stroke()
  }
  for (let y = startY; y < endY; y += gridSize) {
    ctx.beginPath()
    ctx.moveTo(startX, y)
    ctx.lineTo(endX, y)
    ctx.stroke()
  }
  ctx.restore()
}
