import { create } from 'zustand'
import type { Shape, ShapeType, Line, FreeLine, TextBox, IconAlign } from '../core/model'
import { createShape, generateId, snapToGrid, snapShapePosition, AUTO_COLOR, INK_LIGHT } from '../core/model'
import { autoResizeShape } from '../core/autoResize'
import { runLayout } from '../core/layout'
import { parseDiagram, DIAGRAM_VERSION } from '../core/validate'

export type { IconAlign }

export interface ShapeColorDefaults {
  fillColor: string
  strokeColor: string
  textColor: string
}

export type TextDefaults = Pick<TextBox, 'color' | 'scale' | 'bold'>

export interface DefaultPalette {
  shapes: Partial<Record<ShapeType, ShapeColorDefaults>>
  line: { color: string }
  text?: TextDefaults
  // DIAGRAM_VERSION when saved; absent in palettes saved before 'auto' existed
  version?: number
}

const DEFAULT_TEXT: TextDefaults = { color: AUTO_COLOR, scale: 2, bold: true }

// Before AUTO_COLOR existed, lines and text defaulted to the light-theme ink; treat it as auto.
// Only for unversioned data: from DIAGRAM_VERSION 2 on, that ink is an explicit swatch choice.
function migrateInk<T extends { color: string }>(item: T): T {
  return item.color === INK_LIGHT ? { ...item, color: AUTO_COLOR } : item
}

const DEFAULTS_KEY = 'idrawm-defaults'

function loadDefaultPalette(): DefaultPalette {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY)
    if (raw) {
      const palette = JSON.parse(raw) as DefaultPalette
      if (palette.version) return palette
      return { ...palette, line: migrateInk(palette.line), text: palette.text && migrateInk(palette.text) }
    }
  } catch { /* ignore */ }
  return { shapes: {}, line: { color: AUTO_COLOR } }
}

function saveDefaultPalette(palette: DefaultPalette) {
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ ...palette, version: DIAGRAM_VERSION }))
}

export type Tool = 'select' | 'connect' | 'freeLine' | 'text' | ShapeType

export type TextZone = 'header' | 'body' | 'footer'

interface EditingState {
  shapeId: string
  zone: TextZone
}

interface EditingLineState {
  lineId: string
}

interface EditingTextState {
  id: string
  // Text before editing, or null for a box created by this edit
  original: string | null
  // historyIndex right after this edit pushed its history entry
  historyIndex: number
  // Redo entries the push discarded, restored if the edit turns out to change nothing
  redoTail: HistoryEntry[]
}

/** In-progress connection drag */
interface ConnectingState {
  fromId: string
  currentX: number
  currentY: number
}

export type Theme = 'light' | 'dark'

/** How a click or selection box combines with the current selection */
export type SelectMode = 'replace' | 'add' | 'toggle'

/** Positions of the items being dragged at drag start; moves apply from here so snapping never drifts */
export interface MoveOrigins {
  shapes: Map<string, { x: number; y: number }>
  freeLines: Map<string, FreeLine>
  texts: Map<string, { x: number; y: number }>
}

interface HistoryEntry {
  shapes: Shape[]
  lines: Line[]
  freeLines: FreeLine[]
  texts: TextBox[]
}

const MAX_HISTORY = 50

interface DiagramState {
  shapes: Shape[]
  lines: Line[]
  freeLines: FreeLine[]
  texts: TextBox[]
  activeTool: Tool
  editing: EditingState | null
  editingLine: EditingLineState | null
  editingText: EditingTextState | null
  connecting: ConnectingState | null
  // Ids of the selected elements (ids are unique across shapes, connectors, lines and text boxes)
  selection: string[]
  layoutRunning: boolean
  // Why the last auto-save failed, or null once one succeeds
  saveError: string | null
  layoutLocked: boolean
  snapToGrid: boolean
  angleLock: boolean
  // Camera
  panX: number
  panY: number
  zoom: number
  // Theme
  theme: Theme
  // Default palette
  defaultPalette: DefaultPalette
  // History
  history: HistoryEntry[]
  historyIndex: number

  // Actions
  setTool: (tool: Tool) => void
  toggleTheme: () => void
  setShapeDefault: (type: ShapeType, colors: Partial<ShapeColorDefaults>) => void
  setLineDefault: (colors: { color: string }) => void
  addShape: (type: ShapeType, canvasX: number, canvasY: number) => void
  /** Select elements; picking any member of a group picks the whole group */
  select: (ids: string[], mode?: SelectMode) => void
  selectAll: () => void
  clearSelection: () => void
  moveItems: (origins: MoveOrigins, dx: number, dy: number) => void
  setShapePosition: (id: string, x: number, y: number) => void
  pushMoveHistory: () => void
  deleteSelected: () => void
  groupSelection: () => void
  ungroupSelection: () => void
  setPan: (x: number, y: number) => void
  /** Zoom to `zoom`, keeping the canvas point under screen point (sx, sy) still */
  zoomAt: (sx: number, sy: number, zoom: number) => void
  updateShapeText: (id: string, zone: TextZone, text: string) => void
  startEditing: (shapeId: string, zone: TextZone) => void
  stopEditing: () => void

  // Colour / icon actions
  updateShapeColors: (ids: string[], colors: { fillColor?: string; strokeColor?: string; textColor?: string }) => void
  changeShapeType: (ids: string[], type: ShapeType) => void
  updateShapeIcon: (ids: string[], zone: TextZone, icon: string) => void
  updateShapeIconAlign: (ids: string[], zone: TextZone, align: IconAlign) => void
  updateLineColor: (ids: string[], color: string) => void

  // Free line actions
  addFreeLine: (x1: number, y1: number, x2: number, y2: number) => void
  setFreeLinePoints: (id: string, x1: number, y1: number, x2: number, y2: number) => void

  // Text box actions
  addText: (canvasX: number, canvasY: number) => void
  setTextPosition: (id: string, x: number, y: number) => void
  updateTextContent: (id: string, text: string) => void
  updateTextStyle: (ids: string[], style: Partial<TextDefaults>) => void
  setTextDefault: (style: Partial<TextDefaults>) => void
  startEditingText: (id: string) => void
  stopEditingText: () => void

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
  toggleLayoutLock: () => void
  toggleSnapToGrid: () => void
  toggleAngleLock: () => void
  forceLayout: () => void
  triggerLayout: () => void

  // Undo / Redo
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // Persistence
  saveDiagram: () => string
  /** Returns an error message if the file is invalid, leaving the current diagram untouched */
  loadDiagram: (json: string) => string | null

  // Coordinate transform helpers
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number }
  canvasToScreen: (cx: number, cy: number) => { x: number; y: number }
}

/**
 * Push a snapshot of the current (pre-action) state onto the history stack.
 * history[historyIndex] is always the state undo restores next; the present state is
 * only recorded (as history[historyIndex + 1]) once undo is used, so redo can return to it.
 */
function pushHistory(get: () => DiagramState, set: (fn: (s: DiagramState) => Partial<DiagramState>) => void) {
  const { shapes, lines, freeLines, texts, history, historyIndex } = get()
  const entry: HistoryEntry = {
    shapes: shapes.map(s => ({ ...s })),
    lines: lines.map(l => ({ ...l })),
    freeLines: freeLines.map(f => ({ ...f })),
    texts: texts.map(t => ({ ...t })),
  }
  // Discard any redo entries beyond current index
  const newHistory = [...history.slice(0, historyIndex + 1), entry]
  // Cap history size
  if (newHistory.length > MAX_HISTORY) newHistory.shift()
  set(() => ({ history: newHistory, historyIndex: newHistory.length - 1 }))
}

/** The ids plus every other member of any group they belong to */
function withGroupMates(state: Pick<DiagramState, 'shapes' | 'freeLines' | 'texts'>, ids: string[]): string[] {
  const groupable = [...state.shapes, ...state.freeLines, ...state.texts]
  const picked = new Set(ids)
  const groups = new Set(groupable.filter(el => el.groupId && picked.has(el.id)).map(el => el.groupId))
  if (groups.size > 0) for (const el of groupable) if (el.groupId && groups.has(el.groupId)) picked.add(el.id)
  return [...picked]
}

function withoutGroup<E extends { groupId?: string }>(el: E): E {
  const copy = { ...el }
  delete copy.groupId
  return copy
}

/** Ungroup whatever is left of groups with fewer than two members (e.g. after a delete) */
function dissolveSmallGroups(els: { shapes: Shape[]; freeLines: FreeLine[]; texts: TextBox[] }) {
  const counts = new Map<string, number>()
  for (const el of [...els.shapes, ...els.freeLines, ...els.texts]) {
    if (el.groupId) counts.set(el.groupId, (counts.get(el.groupId) ?? 0) + 1)
  }
  const fix = <E extends { groupId?: string }>(list: E[]) =>
    list.map(el => (el.groupId && (counts.get(el.groupId) ?? 0) < 2 ? withoutGroup(el) : el))
  return { shapes: fix(els.shapes), freeLines: fix(els.freeLines), texts: fix(els.texts) }
}

/** Entries redo can still reach (pushHistory discards them) */
function redoEntries({ history, historyIndex }: DiagramState): HistoryEntry[] {
  return history.slice(historyIndex + 1)
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

async function autoSave() {
  const { shapes, lines, freeLines, texts, saveError } = useDiagramStore.getState()
  try {
    const db = await openDb()
    // A full disk or quota error aborts the transaction after put() returns, so wait for it to settle
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('save was aborted'))
      tx.objectStore(DB_STORE).put({ version: DIAGRAM_VERSION, shapes, lines, freeLines, texts }, AUTO_SAVE_KEY)
    }).finally(() => db.close())
    if (saveError) useDiagramStore.setState({ saveError: null })
  } catch (e) {
    useDiagramStore.setState({ saveError: e instanceof Error ? e.message : String(e) })
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
// Reads the store when the timer fires, so callers needn't pass the latest arrays
function debouncedAutoSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => autoSave(), 500)
}

export async function loadAutoSave(): Promise<{ shapes: Shape[]; lines: Line[]; freeLines?: FreeLine[]; texts?: TextBox[] } | null> {
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

// triggerLayout() was called while a layout was running; rerun once it finishes
let layoutPending = false

/**
 * Shapes a layout covers (those with a connector, plus every shape in a group that has one, since
 * a group is laid out as one cluster), and a key of everything its result depends on
 */
function layoutInput(shapes: Shape[], lines: Line[]) {
  const connectedIds = new Set<string>()
  for (const l of lines) {
    connectedIds.add(l.fromId)
    connectedIds.add(l.toId)
  }
  const groups = new Set(shapes.filter(s => s.groupId && connectedIds.has(s.id)).map(s => s.groupId))
  const connectedShapes = shapes.filter(s => connectedIds.has(s.id) || (s.groupId && groups.has(s.groupId)))
  const key = JSON.stringify([
    connectedShapes.map(s => [s.id, s.x, s.y, s.width, s.height, s.groupId ?? '']),
    lines.map(l => [l.fromId, l.toId]),
  ])
  return { connectedShapes, key }
}

/**
 * Run ELK on the connected shapes and apply the result, keeping their centre of mass in place.
 * The result is dropped if those shapes or the connectors changed meanwhile (drag, undo, load...),
 * since it would overwrite newer state.
 */
function startLayout(get: () => DiagramState, set: (partial: Partial<DiagramState>) => void) {
  const { shapes, lines } = get()
  const { connectedShapes, key } = layoutInput(shapes, lines)
  set({ layoutRunning: true })

  runLayout(connectedShapes, lines).then(({ positions }) => {
    const current = get()
    if (layoutInput(current.shapes, current.lines).key !== key) return

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

    // Lines and text boxes in a laid-out group move with the nearest member shape, so a label
    // stays with the shape it annotates even when the group's members are rearranged
    const moved = new Map<string, { cx: number; cy: number; dx: number; dy: number }[]>()
    const newShapes = current.shapes.map(s => {
      const pos = positions.get(s.id)
      if (!pos) return s
      let placed = { ...s, x: pos.x + offsetX, y: pos.y + offsetY }
      if (current.snapToGrid) placed = { ...placed, ...snapShapePosition(placed) }
      if (s.groupId) {
        const list = moved.get(s.groupId) ?? []
        list.push({ cx: s.x + s.width / 2, cy: s.y + s.height / 2, dx: placed.x - s.x, dy: placed.y - s.y })
        moved.set(s.groupId, list)
      }
      return placed
    })
    const shiftOf = (groupId: string | undefined, x: number, y: number) => {
      const list = groupId ? moved.get(groupId) : undefined
      if (!list) return undefined
      return list.reduce((best, m) => (Math.hypot(m.cx - x, m.cy - y) < Math.hypot(best.cx - x, best.cy - y) ? m : best))
    }
    set({
      shapes: newShapes,
      texts: moved.size === 0 ? current.texts : current.texts.map(t => {
        const d = shiftOf(t.groupId, t.x, t.y)
        return d ? { ...t, x: t.x + d.dx, y: t.y + d.dy } : t
      }),
      freeLines: moved.size === 0 ? current.freeLines : current.freeLines.map(f => {
        const d = shiftOf(f.groupId, (f.x1 + f.x2) / 2, (f.y1 + f.y2) / 2)
        return d ? { ...f, x1: f.x1 + d.dx, y1: f.y1 + d.dy, x2: f.x2 + d.dx, y2: f.y2 + d.dy } : f
      }),
    })
    debouncedAutoSave()
  }).catch(() => {
    // Layout failed; leave positions as they are
  }).finally(() => {
    set({ layoutRunning: false })
    if (layoutPending) {
      layoutPending = false
      get().triggerLayout()
    }
  })
}

export const useDiagramStore = create<DiagramState>((set, get) => ({
  shapes: [],
  lines: [],
  freeLines: [],
  texts: [],
  activeTool: 'select',
  editing: null,
  editingLine: null,
  editingText: null,
  connecting: null,
  selection: [],
  layoutRunning: false,
  saveError: null,
  layoutLocked: localStorage.getItem('idrawm-layout-locked') === 'true',
  snapToGrid: localStorage.getItem('idrawm-snap-grid') === 'true',
  angleLock: localStorage.getItem('idrawm-angle-lock') === 'true',
  panX: 0,
  panY: 0,
  zoom: 1,
  theme: (localStorage.getItem('idrawm-theme') as Theme) || 'light',
  defaultPalette: loadDefaultPalette(),
  history: [{ shapes: [], lines: [], freeLines: [], texts: [] }],
  historyIndex: 0,

  setTool: (tool) => set({ activeTool: tool }),

  toggleTheme: () => {
    set((state) => {
      const next: Theme = state.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem('idrawm-theme', next)
      return { theme: next }
    })
  },

  setShapeDefault: (type, colors) => {
    set((state) => {
      const prev = state.defaultPalette.shapes[type] ?? { fillColor: '#e8f4f8', strokeColor: '#2d3436', textColor: '#2d3436' }
      const updated: DefaultPalette = {
        ...state.defaultPalette,
        shapes: { ...state.defaultPalette.shapes, [type]: { ...prev, ...colors } },
      }
      saveDefaultPalette(updated)
      return { defaultPalette: updated }
    })
  },

  setLineDefault: (colors) => {
    set((state) => {
      const updated: DefaultPalette = { ...state.defaultPalette, line: { ...state.defaultPalette.line, ...colors } }
      saveDefaultPalette(updated)
      return { defaultPalette: updated }
    })
  },

  addShape: (type, canvasX, canvasY) => {
    pushHistory(get, set)
    const palette = get().defaultPalette.shapes[type]
    const snap = get().snapToGrid
    const shape = createShape(type, snap ? snapToGrid(canvasX) : canvasX, snap ? snapToGrid(canvasY) : canvasY, palette ? { fillColor: palette.fillColor, strokeColor: palette.strokeColor, textColor: palette.textColor } : undefined)
    set((state) => {
      const newShapes = [...state.shapes, shape]
      debouncedAutoSave()
      return {
        shapes: newShapes,
        activeTool: 'select',
        selection: [shape.id],
      }
    })
  },

  select: (ids, mode = 'replace') => {
    set((state) => {
      const picked = withGroupMates(state, ids)
      if (mode === 'replace') return { selection: picked }
      const current = new Set(state.selection)
      // Toggle removes the picked items only if they're all selected already (a group counts as one)
      const remove = mode === 'toggle' && picked.length > 0 && picked.every(id => current.has(id))
      for (const id of picked) {
        if (remove) current.delete(id)
        else current.add(id)
      }
      return { selection: [...current] }
    })
  },

  selectAll: () => {
    set((state) => ({ selection: [...state.shapes, ...state.lines, ...state.freeLines, ...state.texts].map(el => el.id) }))
  },

  clearSelection: () => set({ selection: [] }),

  moveItems: (origins, dx, dy) => {
    const move = <E extends { id: string; x: number; y: number }>(list: E[], from: Map<string, { x: number; y: number }>) =>
      from.size === 0 ? list : list.map(el => {
        const o = from.get(el.id)
        return o ? { ...el, x: o.x + dx, y: o.y + dy } : el
      })
    set((state) => ({
      shapes: move(state.shapes, origins.shapes),
      texts: move(state.texts, origins.texts),
      freeLines: origins.freeLines.size === 0 ? state.freeLines : state.freeLines.map(f => {
        const o = origins.freeLines.get(f.id)
        return o ? { ...f, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy } : f
      }),
    }))
    debouncedAutoSave()
  },

  setShapePosition: (id, x, y) => {
    set((state) => {
      const newShapes = state.shapes.map(s => (s.id === id ? { ...s, x, y } : s))
      debouncedAutoSave()
      return { shapes: newShapes }
    })
  },

  /** Push history for drag start (called once before dragging begins) */
  pushMoveHistory: () => {
    pushHistory(get, set)
  },

  deleteSelected: () => {
    const { selection, shapes, lines, freeLines, texts, editing, editingLine, editingText } = get()
    if (selection.length === 0) return
    const gone = new Set(selection)

    pushHistory(get, set)
    // Connectors go with either of their shapes
    const newLines = lines.filter(l => !gone.has(l.id) && !gone.has(l.fromId) && !gone.has(l.toId))
    const newShapes = shapes.filter(s => !gone.has(s.id))
    set({
      ...dissolveSmallGroups({
        shapes: newShapes,
        freeLines: freeLines.filter(f => !gone.has(f.id)),
        texts: texts.filter(t => !gone.has(t.id)),
      }),
      lines: newLines,
      selection: [],
      editing: editing && gone.has(editing.shapeId) ? null : editing,
      editingLine: editingLine && !newLines.some(l => l.id === editingLine.lineId) ? null : editingLine,
      editingText: editingText && gone.has(editingText.id) ? null : editingText,
    })
    debouncedAutoSave()
    if (newShapes.length !== shapes.length || newLines.length !== lines.length) get().triggerLayout()
  },

  groupSelection: () => {
    const { selection, shapes, freeLines, texts } = get()
    const sel = new Set(selection)
    if ([...shapes, ...freeLines, ...texts].filter(el => sel.has(el.id)).length < 2) return
    pushHistory(get, set)
    const groupId = generateId()
    // Selections always hold whole groups, so grouping members of existing groups merges them
    const join = <E extends { id: string; groupId?: string }>(list: E[]) => list.map(el => (sel.has(el.id) ? { ...el, groupId } : el))
    set((state) => ({ shapes: join(state.shapes), freeLines: join(state.freeLines), texts: join(state.texts) }))
    debouncedAutoSave()
    get().triggerLayout()
  },

  ungroupSelection: () => {
    const { selection, shapes, freeLines, texts } = get()
    const sel = new Set(selection)
    if (![...shapes, ...freeLines, ...texts].some(el => sel.has(el.id) && el.groupId)) return
    pushHistory(get, set)
    const leave = <E extends { id: string; groupId?: string }>(list: E[]) => list.map(el => (sel.has(el.id) && el.groupId ? withoutGroup(el) : el))
    set((state) => ({ shapes: leave(state.shapes), freeLines: leave(state.freeLines), texts: leave(state.texts) }))
    debouncedAutoSave()
    get().triggerLayout()
  },

  setPan: (x, y) => set({ panX: x, panY: y }),

  zoomAt: (sx, sy, zoom) => {
    const { panX, panY, zoom: old } = get()
    const z = Math.max(0.1, Math.min(5, zoom))
    set({ zoom: z, panX: sx - (sx - panX) * z / old, panY: sy - (sy - panY) * z / old })
  },

  updateShapeText: (id, zone, text) => {
    pushHistory(get, set)
    set((state) => {
      const newShapes = state.shapes.map(s => {
        if (s.id !== id) return s
        const updated = { ...s, [zone]: text }
        const resized = autoResizeShape(updated)
        return { ...updated, ...resized }
      })
      debouncedAutoSave()
      return { shapes: newShapes }
    })
    get().triggerLayout()
  },

  startEditing: (shapeId, zone) => {
    set({
      editing: { shapeId, zone },
      editingLine: null,
      selection: [shapeId],
    })
  },

  stopEditing: () => set({ editing: null }),

  // Colour / icon actions
  updateShapeColors: (ids, colors) => {
    pushHistory(get, set)
    set((state) => {
      const newShapes = state.shapes.map(s =>
        ids.includes(s.id) ? { ...s, ...colors } : s
      )
      debouncedAutoSave()
      return { shapes: newShapes }
    })
  },

  /** Turn a shape into another type, keeping its text, colours, icons and connectors */
  changeShapeType: (ids, type) => {
    if (!get().shapes.some(s => ids.includes(s.id) && s.type !== type)) return
    pushHistory(get, set)
    set((state) => {
      const newShapes = state.shapes.map(s => {
        if (!ids.includes(s.id) || s.type === type) return s
        // Re-fit around the same centre: some types need more room for the same text
        const updated = { ...s, type }
        return { ...updated, ...autoResizeShape(updated) }
      })
      debouncedAutoSave()
      return { shapes: newShapes }
    })
    get().triggerLayout()
  },

  updateShapeIcon: (ids, zone, icon) => {
    pushHistory(get, set)
    const iconKey = `${zone}Icon` as const
    set((state) => {
      const newShapes = state.shapes.map(s => {
        if (!ids.includes(s.id)) return s
        // An icon takes room beside or above the text, so re-fit like a text change
        const updated = { ...s, [iconKey]: icon }
        return { ...updated, ...autoResizeShape(updated) }
      })
      debouncedAutoSave()
      return { shapes: newShapes }
    })
    get().triggerLayout()
  },

  updateShapeIconAlign: (ids, zone, align) => {
    pushHistory(get, set)
    const alignKey = `${zone}IconAlign` as const
    set((state) => {
      const newShapes = state.shapes.map(s => {
        if (!ids.includes(s.id)) return s
        const updated = { ...s, [alignKey]: align }
        const resized = autoResizeShape(updated)
        return { ...updated, ...resized }
      })
      debouncedAutoSave()
      return { shapes: newShapes }
    })
    get().triggerLayout()
  },

  updateLineColor: (ids, color) => {
    pushHistory(get, set)
    set((state) => {
      const newLines = state.lines.map(l =>
        ids.includes(l.id) ? { ...l, color } : l
      )
      const newFreeLines = state.freeLines.map(f => (ids.includes(f.id) ? { ...f, color } : f))
      debouncedAutoSave()
      return { lines: newLines, freeLines: newFreeLines }
    })
  },

  // Free line actions
  addFreeLine: (x1, y1, x2, y2) => {
    pushHistory(get, set)
    const freeLine: FreeLine = { id: generateId(), x1, y1, x2, y2, color: get().defaultPalette.line.color }
    set((state) => ({
      freeLines: [...state.freeLines, freeLine],
      activeTool: 'select',
      selection: [freeLine.id],
    }))
    debouncedAutoSave()
  },

  setFreeLinePoints: (id, x1, y1, x2, y2) => {
    set((state) => ({
      freeLines: state.freeLines.map(f => (f.id === id ? { ...f, x1, y1, x2, y2 } : f)),
    }))
    debouncedAutoSave()
  },

  // Text box actions
  addText: (canvasX, canvasY) => {
    const redoTail = redoEntries(get())
    pushHistory(get, set)
    const { defaultPalette, snapToGrid: snap } = get()
    const text: TextBox = {
      id: generateId(),
      x: snap ? snapToGrid(canvasX) : canvasX,
      y: snap ? snapToGrid(canvasY) : canvasY,
      text: '',
      ...DEFAULT_TEXT,
      ...defaultPalette.text,
    }
    set((state) => ({
      texts: [...state.texts, text],
      activeTool: 'select',
      selection: [text.id],
      editing: null,
      editingLine: null,
      editingText: { id: text.id, original: null, historyIndex: get().historyIndex, redoTail },
    }))
  },

  setTextPosition: (id, x, y) => {
    set((state) => ({ texts: state.texts.map(t => (t.id === id ? { ...t, x, y } : t)) }))
    debouncedAutoSave()
  },

  // History is pushed once per editing session (addText / startEditingText), not per keystroke
  updateTextContent: (id, text) => {
    set((state) => ({ texts: state.texts.map(t => (t.id === id ? { ...t, text } : t)) }))
    debouncedAutoSave()
  },

  updateTextStyle: (ids, style) => {
    pushHistory(get, set)
    set((state) => ({ texts: state.texts.map(t => (ids.includes(t.id) ? { ...t, ...style } : t)) }))
    debouncedAutoSave()
  },

  setTextDefault: (style) => {
    set((state) => {
      const updated: DefaultPalette = {
        ...state.defaultPalette,
        text: { ...DEFAULT_TEXT, ...state.defaultPalette.text, ...style },
      }
      saveDefaultPalette(updated)
      return { defaultPalette: updated }
    })
  },

  startEditingText: (id) => {
    const t = get().texts.find(x => x.id === id)
    if (!t) return
    const redoTail = redoEntries(get())
    pushHistory(get, set)
    set({
      editingText: { id, original: t.text, historyIndex: get().historyIndex, redoTail },
      activeTool: 'select',
      editing: null,
      editingLine: null,
      selection: [id],
    })
  },

  stopEditingText: () => {
    const { editingText, texts, history, historyIndex, selection } = get()
    if (!editingText) return
    const t = texts.find(x => x.id === editingText.id)
    const empty = !!t && !t.text.trim()
    // An edit that changed nothing (including a new box left empty) gives back its history entry
    const noop = !t || (editingText.original === null ? empty : t.text === editingText.original)
    const canRollback = historyIndex === editingText.historyIndex && historyIndex === history.length - 1
    set({
      editingText: null,
      // Empty text boxes are removed rather than left as invisible placeholders
      texts: empty ? texts.filter(x => x.id !== editingText.id) : texts,
      selection: empty ? selection.filter(id => id !== editingText.id) : selection,
      ...(noop && canRollback
        ? { history: [...history.slice(0, -1), ...editingText.redoTail], historyIndex: historyIndex - 1 }
        : {}),
    })
    debouncedAutoSave()
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
      color: get().defaultPalette.line.color,
      directed: true,
    }
    set((state) => {
      const newLines = [...state.lines, line]
      debouncedAutoSave()
      return {
        lines: newLines,
        activeTool: 'select',
        selection: [line.id],
      }
    })
    get().triggerLayout()
  },

  updateLineLabel: (id, label) => {
    pushHistory(get, set)
    set((state) => {
      const newLines = state.lines.map(l => l.id === id ? { ...l, label } : l)
      debouncedAutoSave()
      return { lines: newLines }
    })
  },

  startEditingLine: (lineId) => {
    set({
      editingLine: { lineId },
      editing: null,
      selection: [lineId],
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
  toggleLayoutLock: () => {
    set((state) => {
      const next = !state.layoutLocked
      localStorage.setItem('idrawm-layout-locked', String(next))
      return { layoutLocked: next }
    })
  },

  toggleSnapToGrid: () => {
    const next = !get().snapToGrid
    localStorage.setItem('idrawm-snap-grid', String(next))
    if (!next) {
      set({ snapToGrid: false })
      return
    }
    // Turning snap on aligns everything already on the canvas
    pushHistory(get, set)
    set((state) => {
      const newShapes = state.shapes.map(s => ({ ...s, ...snapShapePosition(s) }))
      const newTexts = state.texts.map(t => ({ ...t, x: snapToGrid(t.x), y: snapToGrid(t.y) }))
      debouncedAutoSave()
      return { shapes: newShapes, texts: newTexts, snapToGrid: true }
    })
  },

  /** Sticky equivalent of holding Shift while dragging — for touch devices */
  toggleAngleLock: () => {
    set((state) => {
      const next = !state.angleLock
      localStorage.setItem('idrawm-angle-lock', String(next))
      return { angleLock: next }
    })
  },

  forceLayout: () => {
    const state = get()
    if (state.layoutRunning) return
    if (state.lines.length === 0) return

    pushHistory(get, set)
    startLayout(get, set)
  },

  triggerLayout: () => {
    const state = get()
    if (state.layoutLocked) return
    if (state.lines.length === 0) return
    if (state.layoutRunning) {
      layoutPending = true
      return
    }
    startLayout(get, set)
  },

  // Undo / Redo
  undo: () => {
    const { historyIndex, shapes, lines, freeLines, texts } = get()
    let { history } = get()
    if (historyIndex <= 0) return
    if (historyIndex === history.length - 1) {
      // Record the present so redo can come back to it
      history = [...history, {
        shapes: shapes.map(s => ({ ...s })),
        lines: lines.map(l => ({ ...l })),
        freeLines: freeLines.map(f => ({ ...f })),
        texts: texts.map(t => ({ ...t })),
      }]
    }
    const entry = history[historyIndex]
    const newIndex = historyIndex - 1
    set({
      history,
      shapes: entry.shapes.map(s => ({ ...s })),
      lines: entry.lines.map(l => ({ ...l })),
      freeLines: entry.freeLines.map(f => ({ ...f })),
      texts: entry.texts.map(t => ({ ...t })),
      historyIndex: newIndex,
      selection: [],
      editing: null,
      editingLine: null,
      editingText: null,
    })
    debouncedAutoSave()
  },

  redo: () => {
    const { historyIndex, history } = get()
    if (historyIndex >= history.length - 2) return
    const newIndex = historyIndex + 1
    const entry = history[newIndex + 1]
    set({
      shapes: entry.shapes.map(s => ({ ...s })),
      lines: entry.lines.map(l => ({ ...l })),
      freeLines: entry.freeLines.map(f => ({ ...f })),
      texts: entry.texts.map(t => ({ ...t })),
      historyIndex: newIndex,
      selection: [],
      editing: null,
      editingLine: null,
      editingText: null,
    })
    debouncedAutoSave()
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 2,

  // Persistence
  saveDiagram: () => {
    const { shapes, lines, freeLines, texts } = get()
    return JSON.stringify({ version: DIAGRAM_VERSION, shapes, lines, freeLines, texts }, null, 2)
  },

  loadDiagram: (json) => {
    let parsed
    try {
      parsed = parseDiagram(json)
    } catch (e) {
      return (e as Error).message
    }
    const { diagram, version } = parsed
    const ink = version < 2 ? migrateInk : <T,>(item: T) => item
    pushHistory(get, set)
    set({
      shapes: diagram.shapes,
      lines: diagram.lines.map(ink),
      freeLines: diagram.freeLines.map(ink),
      texts: diagram.texts.map(ink),
      selection: [],
      editing: null,
      editingLine: null,
      editingText: null,
    })
    debouncedAutoSave()
    return null
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
