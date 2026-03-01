import { useRef, useEffect, useCallback } from 'react'
import { useGesture } from '@use-gesture/react'
import rough from 'roughjs'
import { useDiagramStore } from '../../store/diagramStore'
import type { Theme } from '../../store/diagramStore'
import { hitTestShape, getShapeCenter, getShapeEdgePoint, pointToSegmentDist, getPolygonVertices } from '../../utils/geometry'
import { computeTextLayout, PADDING_X, ICON_SIZE, ICON_GAP } from '../../core/autoResize'
import type { Shape, Line } from '../../core/model'
import type { TextZoneLayout } from '../../core/autoResize'

// ── Theme-aware colors ─────────────────────────────────────────

interface ThemeColors {
  grid: string
  selection: string
  placeholderText: string
  canvasBg: string
}

const LIGHT_COLORS: ThemeColors = {
  grid: '#e0e0e0',
  selection: '#0984e3',
  placeholderText: '#bbb',
  canvasBg: '#fafafa',
}

const DARK_COLORS: ThemeColors = {
  grid: '#2e2d39',
  selection: '#a8a5ff',
  placeholderText: '#666',
  canvasBg: '#121212',
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
      // Body sides
      rc.line(x, y + ry, x, y + h - ry, options)
      rc.line(x + w, y + ry, x + w, y + h - ry, options)
      // Top ellipse (full)
      rc.ellipse(x + w / 2, y + ry, w, ry * 2, options)
      // Bottom arc (half ellipse, bottom half)
      rc.arc(x + w / 2, y + h - ry, w, ry * 2, 0, Math.PI, false, options)
      // Connect bottom sides with straight lines to close the body
      rc.line(x, y + h - ry, x, y + h - ry, { ...options, stroke: 'transparent' }) // noop anchor
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
  const fromShape = shapes.find(s => s.id === line.fromId)
  const toShape = shapes.find(s => s.id === line.toId)
  if (!fromShape || !toShape) return

  const fromCenter = getShapeCenter(fromShape)
  const toCenter = getShapeCenter(toShape)
  const fromPt = getShapeEdgePoint(fromShape, toCenter)
  const toPt = getShapeEdgePoint(toShape, fromCenter)

  ctx.save()
  ctx.strokeStyle = selected ? tc.selection : line.color
  ctx.lineWidth = selected ? 2.5 : 1.5
  ctx.lineJoin = 'round'

  // Draw line
  ctx.beginPath()
  ctx.moveTo(fromPt.x, fromPt.y)
  ctx.lineTo(toPt.x, toPt.y)
  ctx.stroke()

  // Draw arrowhead if directed
  if (line.directed) {
    drawArrowhead(ctx, fromPt.x, fromPt.y, toPt.x, toPt.y, selected ? tc.selection : line.color)
  }

  // Draw label
  if (line.label) {
    const midX = (fromPt.x + toPt.x) / 2
    const midY = (fromPt.y + toPt.y) / 2

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

    ctx.fillStyle = selected ? tc.selection : line.color
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
    const fromShape = shapes.find(s => s.id === line.fromId)
    const toShape = shapes.find(s => s.id === line.toId)
    if (!fromShape || !toShape) continue

    const fromCenter = getShapeCenter(fromShape)
    const toCenter = getShapeCenter(toShape)
    const fromPt = getShapeEdgePoint(fromShape, toCenter)
    const toPt = getShapeEdgePoint(toShape, fromCenter)

    const dist = pointToSegmentDist(canvasX, canvasY, fromPt.x, fromPt.y, toPt.x, toPt.y)
    if (dist < LINE_HIT_TOLERANCE) return line
  }
  return null
}

// ── Canvas component ──────────────────────────────────────────

export default function DiagramCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const shapes = useDiagramStore(s => s.shapes)
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
  const moveShape = useDiagramStore(s => s.moveShape)
  const setPan = useDiagramStore(s => s.setPan)
  const setZoom = useDiagramStore(s => s.setZoom)
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
  const isPanningRef = useRef(false)
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

    ctx.restore()
  }, [shapes, lines, panX, panY, zoom, selection, connecting, theme])

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
    if (editing) return

    const canvasEl = canvasRef.current
    if (!canvasEl) return
    const rect = canvasEl.getBoundingClientRect()
    const cp = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)

    // Shape placement tools
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

    // Select tool — check shapes first, then lines
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

    clearSelection()
  }, [activeTool, shapes, lines, editing, screenToCanvas, addShape, selectShape, selectLine, clearSelection, startConnecting])

  // ── Double-click to edit ──

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (editing) return

    const canvasEl = canvasRef.current
    if (!canvasEl) return
    const rect = canvasEl.getBoundingClientRect()
    const cp = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top)

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
  }, [shapes, lines, editing, screenToCanvas, startEditing, startEditingLine])

  // ── Gesture handling ──

  useGesture(
    {
      onDrag: ({ event, delta: [dx, dy], first, xy: [sx, sy], movement: [mx, my] }) => {
        event.preventDefault()

        if (editing) {
          stopEditing()
          return
        }

        const canvasEl = canvasRef.current
        if (!canvasEl) return
        const rect = canvasEl.getBoundingClientRect()

        if (first) {
          didDragRef.current = false
          const cp = screenToCanvas(sx - rect.left, sy - rect.top)

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

          const hit = findHitShape(shapes, cp.x, cp.y)
          if (hit) {
            selectShape(hit.id)
            dragTargetRef.current = hit.id
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

        // Update connecting position
        if (connecting) {
          const curCp = screenToCanvas(
            sx - rect.left + mx,
            sy - rect.top + my,
          )
          updateConnecting(curCp.x, curCp.y)
          return
        }

        if (dragTargetRef.current) {
          moveShape(dragTargetRef.current, dx / zoom, dy / zoom)
        } else if (isPanningRef.current) {
          setPan(panX + dx, panY + dy)
        }
      },
      onDragEnd: ({ xy: [sx, sy] }) => {
        // Reset drag flag so subsequent clicks aren't blocked
        didDragRef.current = false

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
      onPinch: ({ offset: [scale] }) => {
        setZoom(scale)
      },
      onWheel: ({ delta: [, dy] }) => {
        const newZoom = zoom * (1 - dy * 0.001)
        setZoom(newZoom)
      },
    },
    {
      target: canvasRef,
      drag: { filterTaps: true },
      pinch: { scaleBounds: { min: 0.1, max: 5 } },
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
    return 'crosshair'
  })()

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: 'hidden',
        touchAction: 'none',
        cursor,
        position: 'relative',
      }}
    >
      <canvas
        ref={canvasRef}
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
  const gridSize = 20
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
