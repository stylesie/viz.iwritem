import { useRef, useEffect, useCallback, useState } from 'react'
import { useGesture } from '@use-gesture/react'
import rough from 'roughjs'
import { useDiagramStore } from '../../store/diagramStore'
import type { Theme, MoveOrigins, SelectMode } from '../../store/diagramStore'
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

function drawShape(rc: ReturnType<typeof rough.canvas>, ctx: CanvasRenderingContext2D, shape: Shape, tc: ThemeColors, selected: boolean) {
  const { x, y, width: w, height: h, type, fillColor, strokeColor } = shape

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

// Shape count from which connectors not attached to a dragged shape are frozen during the drag
const FREEZE_ROUTES_MIN_SHAPES = 40

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
  handles = selected,
) {
  ctx.save()
  ctx.strokeStyle = selected ? tc.selection : resolveColor(f.color, tc.ink)
  ctx.lineWidth = selected ? 2.5 : 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(f.x1, f.y1)
  ctx.lineTo(f.x2, f.y2)
  ctx.stroke()

  if (handles) {
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

interface Rect { l: number; t: number; r: number; b: number }

function normRect(a: Point, b: Point): Rect {
  return { l: Math.min(a.x, b.x), t: Math.min(a.y, b.y), r: Math.max(a.x, b.x), b: Math.max(a.y, b.y) }
}

/** Elements wholly inside a canvas-space rectangle; a connector counts when both its shapes do */
function idsInRect(r: Rect, shapes: Shape[], lines: Line[], freeLines: FreeLine[], texts: TextBox[]): string[] {
  const inside = (x: number, y: number) => x >= r.l && x <= r.r && y >= r.t && y <= r.b
  const ids: string[] = []
  const shapeIds = new Set<string>()
  for (const s of shapes) {
    if (inside(s.x, s.y) && inside(s.x + s.width, s.y + s.height)) { ids.push(s.id); shapeIds.add(s.id) }
  }
  for (const t of texts) {
    const { width, height } = layoutTextBox(t)
    if (inside(t.x, t.y) && inside(t.x + width, t.y + height)) ids.push(t.id)
  }
  for (const f of freeLines) if (inside(f.x1, f.y1) && inside(f.x2, f.y2)) ids.push(f.id)
  for (const l of lines) if (shapeIds.has(l.fromId) && shapeIds.has(l.toId)) ids.push(l.id)
  return ids
}

/** Bounding box of each group that has a selected member, for its outline */
function selectedGroupBounds(selected: Set<string>, shapes: Shape[], freeLines: FreeLine[], texts: TextBox[]): Rect[] {
  const boxes = new Map<string, Rect>()
  const add = (groupId: string | undefined, l: number, t: number, r: number, b: number) => {
    if (!groupId) return
    const box = boxes.get(groupId)
    boxes.set(groupId, box
      ? { l: Math.min(box.l, l), t: Math.min(box.t, t), r: Math.max(box.r, r), b: Math.max(box.b, b) }
      : { l, t, r, b })
  }
  const groups = new Set([...shapes, ...freeLines, ...texts].filter(el => el.groupId && selected.has(el.id)).map(el => el.groupId))
  if (groups.size === 0) return []
  for (const s of shapes) if (groups.has(s.groupId)) add(s.groupId, s.x, s.y, s.x + s.width, s.y + s.height)
  for (const f of freeLines) if (groups.has(f.groupId)) add(f.groupId, Math.min(f.x1, f.x2), Math.min(f.y1, f.y2), Math.max(f.x1, f.x2), Math.max(f.y1, f.y2))
  for (const t of texts) {
    if (!groups.has(t.groupId)) continue
    const { width, height } = layoutTextBox(t)
    add(t.groupId, t.x, t.y, t.x + width, t.y + height)
  }
  return [...boxes.values()]
}

const GROUP_OUTLINE_PAD = 12

type MoveGrab = { kind: 'shape'; shape: Shape; anchors: Point[] } | { kind: 'point'; origin: Point }

// ── Canvas component ──────────────────────────────────────────

export default function DiagramCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const shapes = useDiagramStore(s => s.shapes)
  const freeLines = useDiagramStore(s => s.freeLines)
  const addFreeLine = useDiagramStore(s => s.addFreeLine)
  const setFreeLinePoints = useDiagramStore(s => s.setFreeLinePoints)
  const texts = useDiagramStore(s => s.texts)
  const editingText = useDiagramStore(s => s.editingText)
  const addText = useDiagramStore(s => s.addText)
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
  const select = useDiagramStore(s => s.select)
  const moveItems = useDiagramStore(s => s.moveItems)
  const clearSelection = useDiagramStore(s => s.clearSelection)
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

  // Items being moved, their positions at drag start, and how the grabbed item constrains the move:
  // a shape locks/snaps its centre, a text box or free line its top-left / first endpoint
  const moveRef = useRef<{
    origins: MoveOrigins
    grab: MoveGrab
    last: Point
  } | null>(null)
  // Selection box: start and current corner in canvas space
  const marqueeRef = useRef<{ start: Point; end: Point; mode: SelectMode } | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  // Two fingers are down: they pan and zoom, so one-finger drag handling stands down
  const pinchingRef = useRef(false)
  const spaceHeldRef = useRef(false)
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
  // Free line being reshaped by one endpoint handle (moving it goes through moveRef)
  const freeLineDragRef = useRef<{ id: string; mode: 'p1' | 'p2'; orig: FreeLine } | null>(null)
  // Swallows the click that follows drawing or dragging a free line
  const suppressClickRef = useRef(false)
  const didDragRef = useRef(false)
  // Large diagrams only: while a shape is dragged, connectors not attached to it keep their routes
  // from the drag start (cached, so free each frame) and only its own connectors re-route live.
  // Everything re-routes once on drop.
  const [routeFreeze, setRouteFreeze] = useState<{ shapes: Shape[]; movingIds: Set<string> } | null>(null)

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
    const selected = new Set(selection)
    for (const line of lines) {
      const isSelected = selected.has(line.id)
      const frozen = routeFreeze && !routeFreeze.movingIds.has(line.fromId) && !routeFreeze.movingIds.has(line.toId)
      drawLine(ctx, line, frozen ? routeFreeze.shapes : shapes, isSelected, tc)
    }

    // Free lines sit with connectors, behind shapes
    for (const f of freeLines) {
      const isSelected = selected.has(f.id)
      // Endpoint handles only when the line is the whole selection, since only then can they be dragged
      drawFreeLine(ctx, f, isSelected, tc, zoom, isSelected && selection.length === 1)
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
      drawShape(rc, ctx, shape, tc, selected.has(shape.id))
    }

    // Text boxes are drawn on top so headers stay readable over shapes
    for (const t of texts) {
      drawTextBox(ctx, t, selected.has(t.id), tc, zoom)
    }

    // Dashed outline around each selected group
    ctx.save()
    ctx.strokeStyle = tc.selection
    ctx.lineWidth = 1 / zoom
    ctx.setLineDash([6 / zoom, 4 / zoom])
    for (const b of selectedGroupBounds(selected, shapes, freeLines, texts)) {
      const pad = GROUP_OUTLINE_PAD
      ctx.strokeRect(b.l - pad, b.t - pad, b.r - b.l + pad * 2, b.b - b.t + pad * 2)
    }
    ctx.restore()

    if (marquee) {
      ctx.save()
      ctx.fillStyle = tc.selection
      ctx.globalAlpha = 0.08
      ctx.fillRect(marquee.l, marquee.t, marquee.r - marquee.l, marquee.b - marquee.t)
      ctx.globalAlpha = 1
      ctx.strokeStyle = tc.selection
      ctx.lineWidth = 1 / zoom
      ctx.setLineDash([4 / zoom, 3 / zoom])
      ctx.strokeRect(marquee.l, marquee.t, marquee.r - marquee.l, marquee.b - marquee.t)
      ctx.restore()
    }

    ctx.restore()
  }, [shapes, lines, freeLines, texts, draft, panX, panY, zoom, selection, connecting, theme, routeFreeze, marquee])

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

    // Select tool — text boxes (drawn on top) first, then shapes, then lines.
    // Shift / Ctrl / Cmd adds or removes the item instead of replacing the selection.
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    const hitId = findHitText(texts, cp.x, cp.y)?.id
      ?? findHitShape(shapes, cp.x, cp.y)?.id
      ?? findHitLine(lines, shapes, cp.x, cp.y)?.id
      ?? findHitFreeLine(freeLines, cp.x, cp.y)?.id
    if (hitId) select([hitId], additive ? 'toggle' : 'replace')
    else if (!additive) clearSelection()
  }, [activeTool, shapes, lines, freeLines, texts, editing, screenToCanvas, addShape, addText, select, startEditingText, clearSelection, startConnecting])

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
        if (pinchingRef.current) return

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
          moveRef.current = null
          marqueeRef.current = null
          isPanningRef.current = false
          drawStartRef.current = null
          const cp = screenToCanvas(ix - rect.left, iy - rect.top)
          pointerStartRef.current = cp
          const pe = event as PointerEvent

          // Space+drag or the middle button pans; otherwise a drag on empty canvas draws a selection box
          if (spaceHeldRef.current || (pe.buttons & 4)) {
            isPanningRef.current = true
            return
          }

          // Line tool — start drawing at the pointer (snapped to grid if enabled)
          if (activeTool === 'freeLine') {
            const anchor = snapToGrid ? { x: snapValue(cp.x), y: snapValue(cp.y) } : cp
            drawStartRef.current = anchor
            updateDraft({ x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: anchor.y })
            return
          }

          // Connect tool — drag from shape
          if (activeTool === 'connect') {
            const hit = findHitShape(shapes, cp.x, cp.y)
            if (hit) {
              startConnecting(hit.id)
            }
            return
          }

          if (activeTool !== 'select') return

          // Endpoint handles of a lone selected free line take priority over everything under them
          if (selection.length === 1) {
            const f = freeLines.find(fl => fl.id === selection[0])
            const reach = (HANDLE_RADIUS + 5) / zoom
            const mode = !f ? null
              : Math.hypot(cp.x - f.x1, cp.y - f.y1) <= reach ? 'p1'
              : Math.hypot(cp.x - f.x2, cp.y - f.y2) <= reach ? 'p2'
              : null
            if (f && mode) {
              freeLineDragRef.current = { id: f.id, mode, orig: { ...f } }
              pushMoveHistory()
              return
            }
          }

          const hitId = findHitText(texts, cp.x, cp.y)?.id
            ?? findHitShape(shapes, cp.x, cp.y)?.id
            ?? findHitFreeLine(freeLines, cp.x, cp.y)?.id
          const additive = pe.shiftKey || pe.ctrlKey || pe.metaKey
          if (!hitId) {
            marqueeRef.current = { start: cp, end: cp, mode: additive ? 'add' : 'replace' }
            return
          }

          // Dragging an unselected item selects it (and its group); dragging a selected one moves the lot
          if (additive) select([hitId], 'add')
          else if (!selection.includes(hitId)) select([hitId])
          const st = useDiagramStore.getState()
          const sel = new Set(st.selection)
          const origins: MoveOrigins = {
            shapes: new Map(st.shapes.filter(s => sel.has(s.id)).map(s => [s.id, { x: s.x, y: s.y }])),
            freeLines: new Map(st.freeLines.filter(f => sel.has(f.id)).map(f => [f.id, { ...f }])),
            texts: new Map(st.texts.filter(t => sel.has(t.id)).map(t => [t.id, { x: t.x, y: t.y }])),
          }
          const centre = (s: Shape) => ({ x: s.x + s.width / 2, y: s.y + s.height / 2 })
          const grabbedShape = st.shapes.find(s => s.id === hitId)
          let grab: MoveGrab
          if (grabbedShape) {
            // Angle lock is relative to connected shapes that stay put, or to the drag start
            const neighbourIds = new Set(st.lines.flatMap(l =>
              l.fromId === hitId ? [l.toId] : l.toId === hitId ? [l.fromId] : []))
            const anchors = st.shapes.filter(s => neighbourIds.has(s.id) && !origins.shapes.has(s.id)).map(centre)
            grab = { kind: 'shape', shape: grabbedShape, anchors: anchors.length > 0 ? anchors : [centre(grabbedShape)] }
          } else {
            const t = st.texts.find(x => x.id === hitId)
            const f = st.freeLines.find(x => x.id === hitId)
            grab = { kind: 'point', origin: t ? { x: t.x, y: t.y } : { x: f?.x1 ?? 0, y: f?.y1 ?? 0 } }
          }
          moveRef.current = { origins, grab, last: { x: 0, y: 0 } }
          pushMoveHistory()
          if (st.shapes.length >= FREEZE_ROUTES_MIN_SHAPES && origins.shapes.size > 0) {
            setRouteFreeze({ shapes: st.shapes, movingIds: new Set(origins.shapes.keys()) })
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

        if (marqueeRef.current) {
          marqueeRef.current.end = cur
          setMarquee(normRect(marqueeRef.current.start, cur))
          return
        }

        if (freeLineDragRef.current) {
          const { id, mode, orig } = freeLineDragRef.current
          const p1 = { x: orig.x1, y: orig.y1 }
          const p2 = { x: orig.x2, y: orig.y2 }
          const shift = moved
          if (mode === 'p1') {
            const q = constrainPoint({ x: p1.x + shift.x, y: p1.y + shift.y }, p2, lock, snapToGrid)
            setFreeLinePoints(id, q.x, q.y, p2.x, p2.y)
          } else {
            const q = constrainPoint({ x: p2.x + shift.x, y: p2.y + shift.y }, p1, lock, snapToGrid)
            setFreeLinePoints(id, p1.x, p1.y, q.x, q.y)
          }
          return
        }

        if (moveRef.current) {
          const { origins, grab, last } = moveRef.current
          // The grabbed item's own snap / angle lock decides the offset; everything else follows it
          let d: Point
          if (grab.kind === 'shape') {
            const s = grab.shape
            let pos = { x: s.x + moved.x, y: s.y + moved.y }
            if (lock) {
              const c = lockToAngles(
                { x: pos.x + s.width / 2, y: pos.y + s.height / 2 },
                grab.anchors,
                snapToGrid ? GRID_SIZE : null,
              )
              pos = { x: c.x - s.width / 2, y: c.y - s.height / 2 }
            } else if (snapToGrid) {
              pos = snapShapePosition({ ...s, ...pos })
            }
            d = { x: pos.x - s.x, y: pos.y - s.y }
          } else {
            const p = constrainPoint({ x: grab.origin.x + moved.x, y: grab.origin.y + moved.y }, grab.origin, lock, snapToGrid)
            d = { x: p.x - grab.origin.x, y: p.y - grab.origin.y }
          }
          if (d.x !== last.x || d.y !== last.y) {
            moveRef.current.last = d
            moveItems(origins, d.x, d.y)
          }
        } else if (isPanningRef.current) {
          // Read the live camera: several pointer events can arrive before this closure is re-created
          const cam = useDiagramStore.getState()
          setPan(cam.panX + dx, cam.panY + dy)
        }
      },
      onDragEnd: ({ xy: [sx, sy] }) => {
        // Reset drag flag so subsequent clicks aren't blocked
        const dragged = didDragRef.current
        didDragRef.current = false
        setRouteFreeze(null)

        if (marqueeRef.current) {
          const { start, end, mode } = marqueeRef.current
          marqueeRef.current = null
          setMarquee(null)
          // The click a mouse drag ends with would otherwise hit empty canvas and clear the selection
          suppressClickRef.current = true
          select(idsInRect(normRect(start, end), shapes, lines, freeLines, texts), mode)
          return
        }

        if (moveRef.current) {
          moveRef.current = null
          // ...or re-select just the grabbed item
          if (dragged) suppressClickRef.current = true
          return
        }

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
      onPinchStart: () => {
        // A second finger turns a one-finger drag into pan/zoom: drop the selection box, stop moving
        pinchingRef.current = true
        marqueeRef.current = null
        setMarquee(null)
        moveRef.current = null
        setRouteFreeze(null)
      },
      onPinchEnd: () => {
        pinchingRef.current = false
      },
      onPinch: ({ offset: [scale], origin: [ox, oy], first, memo }) => {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return memo
        const sx = ox - rect.left, sy = oy - rect.top
        // Two fingers also pan: the canvas follows the point between them
        if (!first && memo) {
          const cam = useDiagramStore.getState()
          setPan(cam.panX + sx - memo[0], cam.panY + sy - memo[1])
        }
        zoomAt(sx, sy, scale)
        return [sx, sy]
      },
      onWheel: ({ event, delta: [, dy] }) => {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect) zoomAt(event.clientX - rect.left, event.clientY - rect.top, useDiagramStore.getState().zoom * (1 - dy * 0.001))
      },
    },
    {
      target: canvasRef,
      // Left button drags select/move; the middle button pans
      drag: { filterTaps: true, pointer: { buttons: [1, 4] } },
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
        useDiagramStore.getState().clearSelection()
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

  // Space held over the canvas turns drags into pans (desktop equivalent of two-finger panning)
  useEffect(() => {
    const onCanvas = () => document.activeElement === document.body || document.activeElement === canvasRef.current
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !onCanvas()) return
      spaceHeldRef.current = true
      e.preventDefault()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeldRef.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

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
        // Stop the middle button's autoscroll so it can pan
        onMouseDown={e => { if (e.button === 1) e.preventDefault() }}
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
