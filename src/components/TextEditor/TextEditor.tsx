import { useRef, useEffect, useState } from 'react'
import { useDiagramStore } from '../../store/diagramStore'
import type { TextZone } from '../../store/diagramStore'
import { HEADER_FONT, BODY_FONT, FOOTER_FONT } from '../../core/autoResize'
import './TextEditor.css'

const ZONE_CONFIG: Record<TextZone, { label: string; font: string; placeholder: string }> = {
  header: { label: 'Header', font: HEADER_FONT, placeholder: 'Header...' },
  body: { label: 'Body', font: BODY_FONT, placeholder: 'Body text...' },
  footer: { label: 'Footer', font: FOOTER_FONT, placeholder: 'Footer...' },
}

const ZONES: TextZone[] = ['header', 'body', 'footer']

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

  const [localText, setLocalText] = useState<Record<TextZone, string>>({
    header: '',
    body: '',
    footer: '',
  })

  const shape = editing ? shapes.find(s => s.id === editing.shapeId) : null

  useEffect(() => {
    if (shape && editing) {
      setLocalText({
        header: shape.header,
        body: shape.body,
        footer: shape.footer,
      })
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

  const screenX = shape.x * zoom + panX
  const screenY = shape.y * zoom + panY
  const screenW = shape.width * zoom
  const panelLeft = screenX + screenW + 12
  const panelTop = screenY

  const handleChange = (zone: TextZone, value: string) => {
    setLocalText(prev => ({ ...prev, [zone]: value }))
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
      style={{ left: panelLeft, top: panelTop }}
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
              value={localText[zone]}
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
  const [localLabel, setLocalLabel] = useState('')

  const line = editingLine ? lines.find(l => l.id === editingLine.lineId) : null
  const fromShape = line ? shapes.find(s => s.id === line.fromId) : null
  const toShape = line ? shapes.find(s => s.id === line.toId) : null

  useEffect(() => {
    if (line) {
      setLocalLabel(line.label)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [editingLine?.lineId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editingLine || !line || !fromShape || !toShape) return null

  // Position at midpoint of the line
  const midX = ((fromShape.x + fromShape.width / 2) + (toShape.x + toShape.width / 2)) / 2
  const midY = ((fromShape.y + fromShape.height / 2) + (toShape.y + toShape.height / 2)) / 2
  const screenMidX = midX * zoom + panX
  const screenMidY = midY * zoom + panY

  const handleChange = (value: string) => {
    setLocalLabel(value)
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
      style={{ left: screenMidX + 12, top: screenMidY - 20 }}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <div className="text-editor-title">Edit Line</div>
      <div className="text-editor-zone">
        <label className="text-editor-label">Label</label>
        <input
          ref={inputRef}
          className="text-editor-input"
          value={localLabel}
          placeholder="Line label..."
          onChange={e => handleChange(e.target.value)}
        />
      </div>
      <div className="text-editor-hint">Enter or Esc to close</div>
    </div>
  )
}

export default function TextEditor() {
  return (
    <>
      <ShapeTextEditor />
      <LineTextEditor />
    </>
  )
}
