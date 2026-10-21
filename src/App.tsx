import { useEffect, useState } from 'react'
import DiagramCanvas from './components/Canvas/DiagramCanvas'
import Toolbar from './components/Toolbar/Toolbar'
import TextEditor from './components/TextEditor/TextEditor'
import PropertyPanel from './components/PropertyPanel/PropertyPanel'
import { useDiagramStore, loadAutoSave } from './store/diagramStore'
import type { ShapeType } from './core/model'
import './App.css'

const KEY_TO_TOOL: Record<string, ShapeType | 'select' | 'connect'> = {
  v: 'select',
  r: 'rectangle',
  e: 'ellipse',
  d: 'diamond',
  t: 'triangle',
  p: 'parallelogram',
  u: 'rounded-rectangle',
  h: 'hexagon',
  y: 'cylinder',
  k: 'cloud',
  l: 'connect',
}

export default function App() {
  const setTool = useDiagramStore(s => s.setTool)
  const editing = useDiagramStore(s => s.editing)
  const editingLine = useDiagramStore(s => s.editingLine)
  const editingText = useDiagramStore(s => s.editingText)
  const theme = useDiagramStore(s => s.theme)
  const undo = useDiagramStore(s => s.undo)
  const redo = useDiagramStore(s => s.redo)
  const deleteSelected = useDiagramStore(s => s.deleteSelected)
  const selectAll = useDiagramStore(s => s.selectShape)

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Restore the auto-saved diagram before showing the editor, so nothing made in the meantime gets
  // replaced by it (and then auto-saved over it)
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    loadAutoSave().then(data => {
      if (data && (data.shapes.length > 0 || (data.freeLines?.length ?? 0) > 0 || (data.texts?.length ?? 0) > 0)) {
        const { loadDiagram, history } = useDiagramStore.getState()
        const error = loadDiagram(JSON.stringify(data))
        if (error) console.error('Ignoring invalid auto-save:', error)
        // The restored diagram is the starting point, not an undoable change from an empty canvas
        else useDiagramStore.setState({ history: history.slice(0, 1), historyIndex: 0 })
      }
      setRestored(true)
    })
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const active = document.activeElement
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')

      // Undo/redo work even during editing (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }

      if (editing || editingLine || editingText) return
      if (isInput) return

      // Ctrl+A: select all (prevent default browser select)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        // Select first shape as a basic "select all" indicator
        const shapes = useDiagramStore.getState().shapes
        if (shapes.length > 0) selectAll(shapes[0].id)
        return
      }

      // Delete/Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
        return
      }

      const tool = KEY_TO_TOOL[e.key.toLowerCase()]
      if (tool) {
        e.preventDefault()
        setTool(tool)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setTool, editing, editingLine, editingText, undo, redo, deleteSelected, selectAll])

  if (!restored) return <div className="app" />

  return (
    <div className="app">
      <Toolbar />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DiagramCanvas />
        <TextEditor />
        <PropertyPanel />
      </div>
    </div>
  )
}
