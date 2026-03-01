import { create } from 'zustand'
import type { Shape, ShapeType, Line, IconAlign } from '../core/model'
import { createShape, generateId } from '../core/model'
import { autoResizeShape } from '../core/autoResize'
import { runLayout } from '../core/layout'

export type { IconAlign }

export type Tool = 'select' | 'connect' | ShapeType

export type TextZone = 'header' | 'body' | 'footer'

interface EditingState {
  shapeId: string
  zone: TextZone
}

interface EditingLineState {
  lineId: string
}

/** In-progress connection drag */
interface ConnectingState {
  fromId: string
  currentX: number
  currentY: number
}

export type Theme = 'light' | 'dark'

type SelectionKind = { type: 'shape'; id: string } | { type: 'line'; id: string } | null

interface HistoryEntry {
  shapes: Shape[]
  lines: Line[]
}

const MAX_HISTORY = 50

interface DiagramState {
  shapes: Shape[]
  lines: Line[]
  activeTool: Tool
  editing: EditingState | null
  editingLine: EditingLineState | null
  connecting: ConnectingState | null
  selection: SelectionKind
  layoutRunning: boolean
  // Camera
  panX: number
  panY: number
  zoom: number
  // Theme
  theme: Theme
  // History
  history: HistoryEntry[]
  historyIndex: number

  // Actions
  setTool: (tool: Tool) => void
  toggleTheme: () => void
  addShape: (type: ShapeType, canvasX: number, canvasY: number) => void
  selectShape: (id: string | null) => void
  selectLine: (id: string | null) => void
  clearSelection: () => void
  moveShape: (id: string, dx: number, dy: number) => void
  pushMoveHistory: () => void
  deleteSelected: () => void
  setPan: (x: number, y: number) => void
  setZoom: (zoom: number) => void
  updateShapeText: (id: string, zone: TextZone, text: string) => void
  startEditing: (shapeId: string, zone: TextZone) => void
  stopEditing: () => void

  // Colour / icon actions
  updateShapeColors: (id: string, colors: { fillColor?: string; strokeColor?: string; textColor?: string }) => void
  updateShapeIcon: (id: string, zone: TextZone, icon: string) => void
  updateShapeIconAlign: (id: string, zone: TextZone, align: IconAlign) => void
  updateLineColor: (id: string, color: string) => void

  // Line actions
  addLine: (fromId: string, toId: string) => void
  updateLineLabel: (id: string, label: string) => void
  startEditingLine: (lineId: string) => void
  stopEditingLine: () => void

  // Connecting (drag-to-connect)
  startConnecting: (fromId: string) => void
  updateConnecting: (x: number, y: number) => void
  finishConnecting: (toId: string | null) => void
  cancelConnecting: () => void

  // Layout
  triggerLayout: () => void

  // Undo / Redo
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // Persistence
  saveDiagram: () => string
  loadDiagram: (json: string) => void

  // Coordinate transform helpers
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number }
  canvasToScreen: (cx: number, cy: number) => { x: number; y: number }
}

/** Push a snapshot of shapes+lines onto the history stack */
function pushHistory(get: () => DiagramState, set: (fn: (s: DiagramState) => Partial<DiagramState>) => void) {
  const { shapes, lines, history, historyIndex } = get()
  const entry: HistoryEntry = {
    shapes: shapes.map(s => ({ ...s })),
    lines: lines.map(l => ({ ...l })),
  }
  // Discard any redo entries beyond current index
  const newHistory = [...history.slice(0, historyIndex + 1), entry]
  // Cap history size
  if (newHistory.length > MAX_HISTORY) newHistory.shift()
  set(() => ({ history: newHistory, historyIndex: newHistory.length - 1 }))
}

// Auto-save to IndexedDB
const DB_NAME = 'idrawm'
const DB_STORE = 'diagrams'
const AUTO_SAVE_KEY = 'autosave'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function autoSave(shapes: Shape[], lines: Line[]) {
  try {
    const db = await openDb()
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put({ shapes, lines }, AUTO_SAVE_KEY)
    db.close()
  } catch {
    // Silently fail auto-save
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function debouncedAutoSave(shapes: Shape[], lines: Line[]) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => autoSave(shapes, lines), 500)
}

export async function loadAutoSave(): Promise<{ shapes: Shape[]; lines: Line[] } | null> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly')
      const req = tx.objectStore(DB_STORE).get(AUTO_SAVE_KEY)
      req.onsuccess = () => {
        db.close()
        resolve(req.result || null)
      }
      req.onerror = () => {
        db.close()
        resolve(null)
      }
    })
  } catch {
    return null
  }
}

export const useDiagramStore = create<DiagramState>((set, get) => ({
  shapes: [],
  lines: [],
  activeTool: 'select',
  editing: null,
  editingLine: null,
  connecting: null,
  selection: null,
  layoutRunning: false,
  panX: 0,
  panY: 0,
  zoom: 1,
  theme: (localStorage.getItem('idrawm-theme') as Theme) || 'light',
  history: [{ shapes: [], lines: [] }],
  historyIndex: 0,

  setTool: (tool) => set({ activeTool: tool }),

  toggleTheme: () => {
    set((state) => {
      const next: Theme = state.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem('idrawm-theme', next)
      return { theme: next }
    })
  },

  addShape: (type, canvasX, canvasY) => {
    pushHistory(get, set)
    const shape = createShape(type, canvasX, canvasY)
    set((state) => {
      const newShapes = [...state.shapes.map(s => ({ ...s, selected: false })), { ...shape, selected: true }]
      debouncedAutoSave(newShapes, state.lines)
      return {
        shapes: newShapes,
        activeTool: 'select',
        selection: { type: 'shape', id: shape.id },
      }
    })
  },

  selectShape: (id) => {
    set((state) => ({
      shapes: state.shapes.map(s => ({ ...s, selected: s.id === id })),
      selection: id ? { type: 'shape', id } : null,
    }))
  },

  selectLine: (id) => {
    set((state) => ({
      shapes: state.shapes.map(s => ({ ...s, selected: false })),
      selection: id ? { type: 'line', id } : null,
    }))
  },

  clearSelection: () => {
    set((state) => ({
      shapes: state.shapes.map(s => ({ ...s, selected: false })),
      selection: null,
    }))
  },

  moveShape: (id, dx, dy) => {
    set((state) => {
      const newShapes = state.shapes.map(s =>
        s.id === id ? { ...s, x: s.x + dx, y: s.y + dy } : s
      )
      debouncedAutoSave(newShapes, state.lines)
      return { shapes: newShapes }
    })
  },

  /** Push history for drag start (called once before dragging begins) */
  pushMoveHistory: () => {
    pushHistory(get, set)
  },

  deleteSelected: () => {
    const { selection, shapes, lines, editing, editingLine } = get()
    if (!selection) return

    pushHistory(get, set)

    if (selection.type === 'shape') {
      const deletedId = selection.id
      const newShapes = shapes.filter(s => s.id !== deletedId).map(s => ({ ...s, selected: false }))
      const newLines = lines.filter(l => l.fromId !== deletedId && l.toId !== deletedId)
      set({
        shapes: newShapes,
        lines: newLines,
        selection: null,
        editing: editing?.shapeId === deletedId ? null : editing,
      })
      debouncedAutoSave(newShapes, newLines)
      get().triggerLayout()
    } else if (selection.type === 'line') {
      const deletedId = selection.id
      const newLines = lines.filter(l => l.id !== deletedId)
      set({
        lines: newLines,
        selection: null,
        editingLine: editingLine?.lineId === deletedId ? null : editingLine,
      })
      debouncedAutoSave(shapes, newLines)
      get().triggerLayout()
    }
  },

  setPan: (x, y) => set({ panX: x, panY: y }),

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),

  updateShapeText: (id, zone, text) => {
    pushHistory(get, set)
    set((state) => {
      const newShapes = state.shapes.map(s => {
        if (s.id !== id) return s
        const updated = { ...s, [zone]: text }
        const resized = autoResizeShape(updated)
        return { ...updated, ...resized }
      })
      debouncedAutoSave(newShapes, state.lines)
      return { shapes: newShapes }
    })
    get().triggerLayout()
  },

  startEditing: (shapeId, zone) => {
    set((state) => ({
      editing: { shapeId, zone },
      editingLine: null,
      shapes: state.shapes.map(s => ({ ...s, selected: s.id === shapeId })),
      selection: { type: 'shape', id: shapeId },
    }))
  },

  stopEditing: () => set({ editing: null }),

  // Colour / icon actions
  updateShapeColors: (id, colors) => {
    pushHistory(get, set)
    set((state) => {
      const newShapes = state.shapes.map(s =>
        s.id === id ? { ...s, ...colors } : s
      )
      debouncedAutoSave(newShapes, state.lines)
      return { shapes: newShapes }
    })
  },

  updateShapeIcon: (id, zone, icon) => {
    pushHistory(get, set)
    const iconKey = `${zone}Icon` as const
    set((state) => {
      const newShapes = state.shapes.map(s =>
        s.id === id ? { ...s, [iconKey]: icon } : s
      )
      debouncedAutoSave(newShapes, state.lines)
      return { shapes: newShapes }
    })
  },

  updateShapeIconAlign: (id, zone, align) => {
    pushHistory(get, set)
    const alignKey = `${zone}IconAlign` as const
    set((state) => {
      const newShapes = state.shapes.map(s => {
        if (s.id !== id) return s
        const updated = { ...s, [alignKey]: align }
        const resized = autoResizeShape(updated)
        return { ...updated, ...resized }
      })
      debouncedAutoSave(newShapes, state.lines)
      return { shapes: newShapes }
    })
  },

  updateLineColor: (id, color) => {
    pushHistory(get, set)
    set((state) => {
      const newLines = state.lines.map(l =>
        l.id === id ? { ...l, color } : l
      )
      debouncedAutoSave(state.shapes, newLines)
      return { lines: newLines }
    })
  },

  // Line actions
  addLine: (fromId, toId) => {
    if (fromId === toId) return
    const existing = get().lines.find(
      l => (l.fromId === fromId && l.toId === toId) || (l.fromId === toId && l.toId === fromId)
    )
    if (existing) return

    pushHistory(get, set)
    const line: Line = {
      id: generateId(),
      fromId,
      toId,
      label: '',
      color: '#2d3436',
      directed: true,
    }
    set((state) => {
      const newLines = [...state.lines, line]
      debouncedAutoSave(state.shapes, newLines)
      return {
        lines: newLines,
        activeTool: 'select',
        selection: { type: 'line', id: line.id },
      }
    })
    get().triggerLayout()
  },

  updateLineLabel: (id, label) => {
    pushHistory(get, set)
    set((state) => {
      const newLines = state.lines.map(l => l.id === id ? { ...l, label } : l)
      debouncedAutoSave(state.shapes, newLines)
      return { lines: newLines }
    })
  },

  startEditingLine: (lineId) => {
    set({
      editingLine: { lineId },
      editing: null,
      selection: { type: 'line', id: lineId },
    })
  },

  stopEditingLine: () => set({ editingLine: null }),

  // Connecting (drag-to-connect)
  startConnecting: (fromId) => {
    const shape = get().shapes.find(s => s.id === fromId)
    if (!shape) return
    set({
      connecting: {
        fromId,
        currentX: shape.x + shape.width / 2,
        currentY: shape.y + shape.height / 2,
      },
    })
  },

  updateConnecting: (x, y) => {
    set((state) => {
      if (!state.connecting) return state
      return { connecting: { ...state.connecting, currentX: x, currentY: y } }
    })
  },

  finishConnecting: (toId) => {
    const { connecting } = get()
    if (!connecting) return
    if (toId && toId !== connecting.fromId) {
      get().addLine(connecting.fromId, toId)
    }
    set({ connecting: null })
  },

  cancelConnecting: () => set({ connecting: null }),

  // Layout
  triggerLayout: () => {
    const state = get()
    if (state.layoutRunning) return
    if (state.lines.length === 0) return

    set({ layoutRunning: true })

    // Only layout shapes that are connected
    const connectedIds = new Set<string>()
    for (const l of state.lines) {
      connectedIds.add(l.fromId)
      connectedIds.add(l.toId)
    }
    const connectedShapes = state.shapes.filter(s => connectedIds.has(s.id))

    runLayout(connectedShapes, state.lines).then(result => {
      set((current) => {
        // Animate: compute offset from layout origin to current center of mass
        const positions = result.positions

        // Find center of mass of current positions and layout positions
        let curCx = 0, curCy = 0, layCx = 0, layCy = 0
        let count = 0
        for (const s of connectedShapes) {
          const pos = positions.get(s.id)
          if (pos) {
            curCx += s.x + s.width / 2
            curCy += s.y + s.height / 2
            layCx += pos.x + s.width / 2
            layCy += pos.y + s.height / 2
            count++
          }
        }
        if (count > 0) {
          curCx /= count; curCy /= count
          layCx /= count; layCy /= count
        }
        const offsetX = curCx - layCx
        const offsetY = curCy - layCy

        const newShapes = current.shapes.map(s => {
          const pos = positions.get(s.id)
          if (pos) {
            return { ...s, x: pos.x + offsetX, y: pos.y + offsetY }
          }
          return s
        })

        return { shapes: newShapes, layoutRunning: false }
      })
    }).catch(() => {
      set({ layoutRunning: false })
    })
  },

  // Undo / Redo
  undo: () => {
    const { historyIndex, history } = get()
    if (historyIndex <= 0) return
    const newIndex = historyIndex - 1
    const entry = history[newIndex]
    set({
      shapes: entry.shapes.map(s => ({ ...s })),
      lines: entry.lines.map(l => ({ ...l })),
      historyIndex: newIndex,
      selection: null,
      editing: null,
      editingLine: null,
    })
    debouncedAutoSave(entry.shapes, entry.lines)
  },

  redo: () => {
    const { historyIndex, history } = get()
    if (historyIndex >= history.length - 1) return
    const newIndex = historyIndex + 1
    const entry = history[newIndex]
    set({
      shapes: entry.shapes.map(s => ({ ...s })),
      lines: entry.lines.map(l => ({ ...l })),
      historyIndex: newIndex,
      selection: null,
      editing: null,
      editingLine: null,
    })
    debouncedAutoSave(entry.shapes, entry.lines)
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  // Persistence
  saveDiagram: () => {
    const { shapes, lines } = get()
    return JSON.stringify({ shapes, lines }, null, 2)
  },

  loadDiagram: (json) => {
    try {
      const data = JSON.parse(json)
      if (data.shapes && Array.isArray(data.shapes)) {
        // Migrate old shape types
        const migratedShapes = data.shapes.map((s: Shape) => {
          const migrated = { ...s }
          const oldType = migrated.type as string
          if (oldType === 'square') migrated.type = 'rectangle'
          else if (oldType === 'circle' || oldType === 'oval') migrated.type = 'ellipse'
          // Backfill missing IconAlign fields
          if (!migrated.headerIconAlign) migrated.headerIconAlign = 'left'
          if (!migrated.bodyIconAlign) migrated.bodyIconAlign = 'left'
          if (!migrated.footerIconAlign) migrated.footerIconAlign = 'left'
          return migrated
        })
        pushHistory(get, set)
        set({
          shapes: migratedShapes,
          lines: data.lines || [],
          selection: null,
          editing: null,
          editingLine: null,
        })
        debouncedAutoSave(migratedShapes, data.lines || [])
      }
    } catch {
      console.error('Failed to load diagram: invalid JSON')
    }
  },

  screenToCanvas: (sx, sy) => {
    const { panX, panY, zoom } = get()
    return {
      x: (sx - panX) / zoom,
      y: (sy - panY) / zoom,
    }
  },

  canvasToScreen: (cx, cy) => {
    const { panX, panY, zoom } = get()
    return {
      x: cx * zoom + panX,
      y: cy * zoom + panY,
    }
  },
}))
