import { useRef, useEffect, useLayoutEffect } from 'react'
import type { RefObject } from 'react'
import { useDiagramStore } from '../../store/diagramStore'
import type { TextZone } from '../../store/diagramStore'
import { HEADER_FONT, BODY_FONT, FOOTER_FONT } from '../../core/autoResize'
import { layoutTextBox } from '../../core/textBox'
import './TextEditor.css'

const ZONE_CONFIG: Record<TextZone, { label: string; font: string; placeholder: string }> = {
  header: { label: 'Header', font: HEADER_FONT, placeholder: 'Header...' },
  body: { label: 'Body', font: BODY_FONT, placeholder: 'Body text...' },
  footer: { label: 'Footer', font: FOOTER_FONT, placeholder: 'Footer...' },
}

const ZONES: TextZone[] = ['header', 'body', 'footer']

const EDGE_MARGIN = 8
const ANCHOR_GAP = 12

type Placement = (width: number, height: number, areaWidth: number, areaHeight: number) => { left: number; top: number }

/**
 * Puts an editor panel where `place` wants it (which can flip sides once the panel's size is
 * known), clamped inside the canvas area so editors near the edge stay reachable. Runs after
 * every render, since pan, zoom and typing all move the anchor.
 */
function usePanelPlacement(ref: RefObject<HTMLDivElement | null>, place: Placement) {
  useLayoutEffect(() => {
    const el = ref.current
    const area = el?.offsetParent as HTMLElement | null
    if (!el || !area) return
    const { offsetWidth: w, offsetHeight: h } = el
    const { clientWidth: areaW, clientHeight: areaH } = area
    const { left, top } = place(w, h, areaW, areaH)
    el.style.left = `${Math.max(EDGE_MARGIN, Math.min(left, areaW - w - EDGE_MARGIN))}px`
    el.style.top = `${Math.max(EDGE_MARGIN, Math.min(top, areaH - h - EDGE_MARGIN))}px`
  })
}

/** Right of the anchor span [start, end], or left of it if the right side has no room */
function besideX(start: number, end: number, width: number, areaWidth: number): number {
  return end + ANCHOR_GAP + width <= areaWidth - EDGE_MARGIN ? end + ANCHOR_GAP : start - ANCHOR_GAP - width
}

function ShapeTextEditor() {
  const editing = useDiagramStore(s => s.editing)
  const shapes = useDiagramStore(s => s.shapes)
  const panX = useDiagramStore(s => s.panX)
  const panY = useDiagramStore(s => s.panY)
  const zoom = useDiagramStore(s => s.zoom)
  const updateShapeText = useDiagramStore(s => s.updateShapeText)
  const stopEditing = useDiagramStore(s => s.stopEditing)

  const panelRef = useRef<HTMLDivElement>(null)
  const inputRefs = useRef<Record<TextZone, HTMLTextAreaElement | null>>({
    header: null,
    body: null,
    footer: null,
  })

  const shape = editing ? shapes.find(s => s.id === editing.shapeId) : null

  usePanelPlacement(panelRef, (w, _h, areaW) => {
    const screenX = (shape?.x ?? 0) * zoom + panX
    return { left: besideX(screenX, screenX + (shape?.width ?? 0) * zoom, w, areaW), top: (shape?.y ?? 0) * zoom + panY }
  })

  useEffect(() => {
    if (shape && editing) {
      requestAnimationFrame(() => {
        const input = inputRefs.current[editing.zone]
        if (input) {
          input.focus()
          input.select()
        }
      })
    }
  }, [editing?.shapeId, editing?.zone]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editing || !shape) return null

  const handleChange = (zone: TextZone, value: string) => {
    updateShapeText(shape.id, zone, value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      stopEditing()
    }
    e.stopPropagation()
  }

  const handleBlur = (e: React.FocusEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.relatedTarget as Node)) {
      stopEditing()
    }
  }

  return (
    <div
      ref={panelRef}
      className="text-editor-panel"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <div className="text-editor-title">Edit Shape</div>
      {ZONES.map(zone => {
        const config = ZONE_CONFIG[zone]
        return (
          <div key={zone} className="text-editor-zone">
            <label className="text-editor-label">{config.label}</label>
            <textarea
              ref={el => { inputRefs.current[zone] = el }}
              className="text-editor-input"
              style={{ font: config.font }}
              value={shape[zone]}
              placeholder={config.placeholder}
              onChange={e => handleChange(zone, e.target.value)}
              rows={zone === 'body' ? 3 : 1}
            />
          </div>
        )
      })}
      <div className="text-editor-hint">Esc to close</div>
    </div>
  )
}

function LineTextEditor() {
  const editingLine = useDiagramStore(s => s.editingLine)
  const lines = useDiagramStore(s => s.lines)
  const shapes = useDiagramStore(s => s.shapes)
  const panX = useDiagramStore(s => s.panX)
  const panY = useDiagramStore(s => s.panY)
  const zoom = useDiagramStore(s => s.zoom)
  const updateLineLabel = useDiagramStore(s => s.updateLineLabel)
  const stopEditingLine = useDiagramStore(s => s.stopEditingLine)

  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const line = editingLine ? lines.find(l => l.id === editingLine.lineId) : null
  const fromShape = line ? shapes.find(s => s.id === line.fromId) : null
  const toShape = line ? shapes.find(s => s.id === line.toId) : null

  // Midpoint between the two shape centres
  const centre = (s: typeof fromShape) => ({ x: s ? s.x + s.width / 2 : 0, y: s ? s.y + s.height / 2 : 0 })
  const screenMidX = ((centre(fromShape).x + centre(toShape).x) / 2) * zoom + panX
  const screenMidY = ((centre(fromShape).y + centre(toShape).y) / 2) * zoom + panY
  usePanelPlacement(panelRef, (w, _h, areaW) => ({ left: besideX(screenMidX, screenMidX, w, areaW), top: screenMidY - 20 }))

  useEffect(() => {
    if (line) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [editingLine?.lineId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editingLine || !line || !fromShape || !toShape) return null

  const handleChange = (value: string) => {
    updateLineLabel(line.id, value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault()
      stopEditingLine()
    }
    e.stopPropagation()
  }

  const handleBlur = (e: React.FocusEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.relatedTarget as Node)) {
      stopEditingLine()
    }
  }

  return (
    <div
      ref={panelRef}
      className="text-editor-panel"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <div className="text-editor-title">Edit Line</div>
      <div className="text-editor-zone">
        <label className="text-editor-label">Label</label>
        <input
          ref={inputRef}
          className="text-editor-input"
          value={line.label}
          placeholder="Line label..."
          onChange={e => handleChange(e.target.value)}
        />
      </div>
      <div className="text-editor-hint">Enter or Esc to close</div>
    </div>
  )
}

function TextBoxEditor() {
  const editingText = useDiagramStore(s => s.editingText)
  const texts = useDiagramStore(s => s.texts)
  const panX = useDiagramStore(s => s.panX)
  const panY = useDiagramStore(s => s.panY)
  const zoom = useDiagramStore(s => s.zoom)
  const updateTextContent = useDiagramStore(s => s.updateTextContent)
  const stopEditingText = useDiagramStore(s => s.stopEditingText)

  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const textBox = editingText ? texts.find(t => t.id === editingText.id) : null

  // Just below the text so it stays visible while typing, or above it if there's no room
  usePanelPlacement(panelRef, (_w, h, _areaW, areaH) => {
    if (!textBox) return { left: 0, top: 0 }
    const textTop = textBox.y * zoom + panY
    const below = (textBox.y + layoutTextBox(textBox).height) * zoom + panY + ANCHOR_GAP
    return { left: textBox.x * zoom + panX, top: below + h <= areaH - EDGE_MARGIN ? below : textTop - ANCHOR_GAP - h }
  })

  useEffect(() => {
    if (!editingText) return
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [editingText?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editingText || !textBox) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter finishes; Shift+Enter adds a line
    if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault()
      stopEditingText()
    }
    e.stopPropagation()
  }

  return (
    <div
      ref={panelRef}
      className="text-editor-panel"
      onKeyDown={handleKeyDown}
    >
      <div className="text-editor-title">Edit Text</div>
      <textarea
        ref={inputRef}
        className="text-editor-input"
        value={textBox.text}
        placeholder="Heading..."
        rows={2}
        onChange={e => updateTextContent(textBox.id, e.target.value)}
        onBlur={stopEditingText}
      />
      <div className="text-editor-hint">Enter to finish, Shift+Enter for a new line</div>
    </div>
  )
}

export default function TextEditor() {
  return (
    <>
      <ShapeTextEditor />
      <LineTextEditor />
      <TextBoxEditor />
    </>
  )
}
