import { useState, useRef, useEffect, useCallback } from 'react'
import { useDiagramStore } from '../../store/diagramStore'
import type { Tool } from '../../store/diagramStore'
import type { ShapeType } from '../../core/model'
import { exportToExcalidraw } from '../../export/excalidraw'
import { exportToPng } from '../../export/png'
import { exportToSvg } from '../../export/svg'
import { downloadText, downloadBlob } from '../../export/download'
import './Toolbar.css'

const SHAPE_TOOLS: { type: ShapeType; label: string; icon: string }[] = [
  { type: 'rectangle', label: 'Rectangle', icon: '□' },
  { type: 'ellipse', label: 'Ellipse', icon: '○' },
  { type: 'diamond', label: 'Diamond', icon: '◇' },
  { type: 'triangle', label: 'Triangle', icon: '△' },
  { type: 'parallelogram', label: 'Parallel', icon: '▱' },
  { type: 'rounded-rectangle', label: 'Rounded', icon: '▢' },
  { type: 'hexagon', label: 'Hexagon', icon: '⬡' },
  { type: 'cylinder', label: 'Cylinder', icon: '⌓' },
  { type: 'cloud', label: 'Cloud', icon: '☁' },
]

function ExportMenu() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const shapes = useDiagramStore(s => s.shapes)
  const lines = useDiagramStore(s => s.lines)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const hasContent = shapes.length > 0

  const handleExcalidraw = () => {
    const json = exportToExcalidraw(shapes, lines)
    downloadText(json, 'diagram.excalidraw', 'application/json')
    setOpen(false)
  }

  const handlePng = async () => {
    try {
      const blob = await exportToPng(shapes, lines)
      downloadBlob(blob, 'diagram.png')
    } catch (err) {
      console.error('PNG export failed:', err)
    }
    setOpen(false)
  }

  const handleSvg = () => {
    const svg = exportToSvg(shapes, lines)
    downloadText(svg, 'diagram.svg', 'image/svg+xml')
    setOpen(false)
  }

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        className="tool-btn"
        onClick={() => setOpen(!open)}
        disabled={!hasContent}
        title="Export diagram"
      >
        <span className="tool-icon">{'\u21E9'}</span>
        <span className="tool-label">Export</span>
      </button>
      {open && (
        <div className="export-menu">
          <button className="export-menu-item" onClick={handleExcalidraw}>
            <span className="export-ext">.excalidraw</span>
            <span className="export-desc">Excalidraw format</span>
          </button>
          <button className="export-menu-item" onClick={handlePng}>
            <span className="export-ext">.png</span>
            <span className="export-desc">PNG image (2x)</span>
          </button>
          <button className="export-menu-item" onClick={handleSvg}>
            <span className="export-ext">.svg</span>
            <span className="export-desc">SVG vector</span>
          </button>
        </div>
      )}
    </div>
  )
}

function FileMenu() {
  const saveDiagram = useDiagramStore(s => s.saveDiagram)
  const loadDiagram = useDiagramStore(s => s.loadDiagram)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSave = useCallback(() => {
    const json = saveDiagram()
    downloadText(json, 'diagram.idrawm.json', 'application/json')
  }, [saveDiagram])

  const handleLoad = useCallback(() => {
    fileRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      loadDiagram(reader.result as string)
    }
    reader.readAsText(file)
    // Reset so the same file can be loaded again
    e.target.value = ''
  }, [loadDiagram])

  return (
    <>
      <button className="tool-btn" onClick={handleSave} title="Save file">
        <span className="tool-icon">{'\u{1F4BE}'}</span>
        <span className="tool-label">Save</span>
      </button>
      <button className="tool-btn" onClick={handleLoad} title="Load file">
        <span className="tool-icon">{'\u{1F4C2}'}</span>
        <span className="tool-label">Load</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.idrawm.json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </>
  )
}

export default function Toolbar() {
  const activeTool = useDiagramStore(s => s.activeTool)
  const setTool = useDiagramStore(s => s.setTool)
  const deleteSelected = useDiagramStore(s => s.deleteSelected)
  const selection = useDiagramStore(s => s.selection)
  const undo = useDiagramStore(s => s.undo)
  const redo = useDiagramStore(s => s.redo)
  const historyIndex = useDiagramStore(s => s.historyIndex)
  const historyLength = useDiagramStore(s => s.history.length)
  const theme = useDiagramStore(s => s.theme)
  const toggleTheme = useDiagramStore(s => s.toggleTheme)
  const hasSelection = selection !== null

  const handleToolClick = (tool: Tool) => {
    setTool(tool === activeTool ? 'select' : tool)
  }

  return (
    <div className="toolbar">
      {/* Undo / Redo */}
      <div className="toolbar-group">
        <button
          className="tool-btn"
          onClick={undo}
          disabled={historyIndex <= 0}
          title="Undo (Ctrl+Z)"
        >
          <span className="tool-icon">{'\u21A9'}</span>
          <span className="tool-label">Undo</span>
        </button>
        <button
          className="tool-btn"
          onClick={redo}
          disabled={historyIndex >= historyLength - 1}
          title="Redo (Ctrl+Shift+Z)"
        >
          <span className="tool-icon">{'\u21AA'}</span>
          <span className="tool-label">Redo</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`}
          onClick={() => handleToolClick('select')}
          title="Select (V)"
        >
          <span className="tool-icon">{'\u2196'}</span>
          <span className="tool-label">Select</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        {SHAPE_TOOLS.map(({ type, label, icon }) => (
          <button
            key={type}
            className={`tool-btn ${activeTool === type ? 'active' : ''}`}
            onClick={() => handleToolClick(type)}
            title={label}
          >
            <span className="tool-icon">{icon}</span>
            <span className="tool-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className={`tool-btn ${activeTool === 'connect' ? 'active' : ''}`}
          onClick={() => handleToolClick('connect')}
          title="Connect (L)"
        >
          <span className="tool-icon">{'\u2197'}</span>
          <span className="tool-label">Connect</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="tool-btn danger"
          onClick={deleteSelected}
          disabled={!hasSelection}
          title="Delete (Del)"
        >
          <span className="tool-icon">{'\u2715'}</span>
          <span className="tool-label">Delete</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <FileMenu />
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <ExportMenu />
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="tool-btn"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Dark mode' : 'Light mode'}
        >
          <span className="tool-icon">{theme === 'light' ? '\u263E' : '\u2600'}</span>
          <span className="tool-label">{theme === 'light' ? 'Dark' : 'Light'}</span>
        </button>
      </div>
    </div>
  )
}
