import { useState, useRef, useEffect, useCallback } from 'react'
import { useDiagramStore } from '../../store/diagramStore'
import type { Tool } from '../../store/diagramStore'
import { exportToExcalidraw } from '../../export/excalidraw'
import { exportToPng } from '../../export/png'
import { exportToSvg } from '../../export/svg'
import { downloadText, downloadBlob } from '../../export/download'
import { SHAPE_TOOLS } from '../shapeTypes'
import './Toolbar.css'

function ExportMenu() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const shapes = useDiagramStore(s => s.shapes)
  const lines = useDiagramStore(s => s.lines)
  const freeLines = useDiagramStore(s => s.freeLines)
  const texts = useDiagramStore(s => s.texts)

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

  const hasContent = shapes.length > 0 || freeLines.length > 0 || texts.length > 0

  const handleExcalidraw = () => {
    const json = exportToExcalidraw(shapes, lines, freeLines, texts)
    downloadText(json, 'diagram.excalidraw', 'application/json')
    setOpen(false)
  }

  const handlePng = async () => {
    try {
      const blob = await exportToPng(shapes, lines, freeLines, texts)
      downloadBlob(blob, 'diagram.png')
    } catch (err) {
      console.error('PNG export failed:', err)
    }
    setOpen(false)
  }

  const handleSvg = () => {
    const svg = exportToSvg(shapes, lines, freeLines, texts)
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
      const error = loadDiagram(reader.result as string)
      if (error) window.alert(`Couldn't open ${file.name}: ${error}`)
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
  const saveError = useDiagramStore(s => s.saveError)
  const toggleTheme = useDiagramStore(s => s.toggleTheme)
  const layoutLocked = useDiagramStore(s => s.layoutLocked)
  const toggleLayoutLock = useDiagramStore(s => s.toggleLayoutLock)
  const forceLayout = useDiagramStore(s => s.forceLayout)
  const snapToGrid = useDiagramStore(s => s.snapToGrid)
  const toggleSnapToGrid = useDiagramStore(s => s.toggleSnapToGrid)
  const angleLock = useDiagramStore(s => s.angleLock)
  const toggleAngleLock = useDiagramStore(s => s.toggleAngleLock)
  const lines = useDiagramStore(s => s.lines)
  const hasSelection = selection.length > 0
  const groupSelection = useDiagramStore(s => s.groupSelection)
  const ungroupSelection = useDiagramStore(s => s.ungroupSelection)
  // Shapes, lines and text boxes can be grouped (connectors follow their shapes). One button:
  // Ungroup when the selection is exactly one group, otherwise Group (which merges any groups in it)
  const groupState = useDiagramStore(s => {
    const sel = new Set(s.selection)
    const picked = [...s.shapes, ...s.freeLines, ...s.texts].filter(el => sel.has(el.id))
    if (picked.length > 0 && picked[0].groupId && picked.every(el => el.groupId === picked[0].groupId)) return 'ungroup'
    return picked.length >= 2 ? 'group' : 'none'
  })

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
          disabled={historyIndex >= historyLength - 2}
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
        <button
          className={`tool-btn ${activeTool === 'freeLine' ? 'active' : ''}`}
          onClick={() => handleToolClick('freeLine')}
          title="Line: drag to draw (hold Shift for 45° steps)"
        >
          <span className="tool-icon">{'\u2215'}</span>
          <span className="tool-label">Line</span>
        </button>
        <button
          className={`tool-btn ${activeTool === 'text' ? 'active' : ''}`}
          onClick={() => handleToolClick('text')}
          title="Text: click to add a heading"
        >
          <span className="tool-icon" style={{ fontWeight: 700 }}>T</span>
          <span className="tool-label">Text</span>
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
        <button
          className="tool-btn"
          onClick={groupState === 'ungroup' ? ungroupSelection : groupSelection}
          disabled={groupState === 'none'}
          title={groupState === 'ungroup' ? 'Ungroup (Ctrl+Shift+G)' : 'Group: select, move and lay out together (Ctrl+G)'}
        >
          <span className="tool-icon">{'\u29C9'}</span>
          <span className="tool-label">{groupState === 'ungroup' ? 'Ungroup' : 'Group'}</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className={`tool-btn ${layoutLocked ? 'active' : ''}`}
          onClick={toggleLayoutLock}
          title={layoutLocked ? 'Auto-layout disabled (click to enable)' : 'Auto-layout enabled (click to lock positions)'}
        >
          <span className="tool-icon">{layoutLocked ? '\u{1F512}' : '\u{1F513}'}</span>
          <span className="tool-label">{layoutLocked ? 'Locked' : 'Auto'}</span>
        </button>
        <button
          className="tool-btn"
          onClick={() => {
            if (layoutLocked && !window.confirm('This will auto-arrange all connected shapes, overwriting any manual positioning. Continue?')) return
            forceLayout()
          }}
          disabled={lines.length === 0}
          title="Re-arrange layout now"
        >
          <span className="tool-icon">{'\u2B82'}</span>
          <span className="tool-label">Arrange</span>
        </button>
        <button
          className={`tool-btn ${snapToGrid ? 'active' : ''}`}
          onClick={toggleSnapToGrid}
          title={snapToGrid ? 'Snap to grid on (click to turn off)' : 'Snap to grid off (click to align shapes to the grid)'}
        >
          <span className="tool-icon">#</span>
          <span className="tool-label">Grid</span>
        </button>
        <button
          className={`tool-btn ${angleLock ? 'active' : ''}`}
          onClick={toggleAngleLock}
          title={angleLock ? 'Angle lock on: dragged shapes keep connectors at 45° steps (click to turn off)' : 'Angle lock off (hold Shift while dragging, or click to keep it on)'}
        >
          <span className="tool-icon">{'∠'}</span>
          <span className="tool-label">Angle</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <FileMenu />
        {saveError && (
          <span
            className="save-warning"
            role="status"
            title={`Auto-save failed (${saveError}). Changes since then won't be restored after a reload; use File > Save to keep a copy. Auto-save retries on your next change.`}
          >
            {'⚠'} Not saved
          </span>
        )}
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
