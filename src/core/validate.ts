import type { Diagram, Shape, Line, FreeLine, TextBox, ShapeType, IconAlign } from './model'
import { AUTO_COLOR } from './model'

/**
 * Saved-document format version. Absent in files written before it existed (treated as 1).
 * 2: `'auto'` colour exists, so a stored `#2d3436` is an explicit choice, not the old default.
 */
export const DIAGRAM_VERSION = 2

const SHAPE_TYPES: readonly ShapeType[] = ['rectangle', 'ellipse', 'diamond', 'triangle', 'parallelogram', 'rounded-rectangle', 'hexagon', 'cylinder', 'cloud']
const LEGACY_SHAPE_TYPES: Record<string, ShapeType> = { square: 'rectangle', circle: 'ellipse', oval: 'ellipse' }
const ICON_ALIGNS: readonly IconAlign[] = ['left', 'center', 'right']
const MAX_COORD = 1e7

// Hex, keyword, or rgb()/hsl() with digits only — nothing that can break out of an SVG attribute
const COLOR_RE = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([\d\s.,%/]+\))$/i

export function isSafeColor(v: unknown): v is string {
  return typeof v === 'string' && (v === AUTO_COLOR || COLOR_RE.test(v))
}

type Obj = Record<string, unknown>

function fail(where: string, msg: string): never {
  throw new Error(`${where}: ${msg}`)
}

function obj(v: unknown, where: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(where, 'not an object')
  return v as Obj
}

function arr(v: unknown, where: string, optional: boolean): unknown[] {
  if (v === undefined && optional) return []
  if (!Array.isArray(v)) fail(where, 'not a list')
  return v
}

function num(o: Obj, key: string, where: string, positive = false): number {
  const v = o[key]
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > MAX_COORD) fail(where, `${key} is not a valid number`)
  if (positive && v <= 0) fail(where, `${key} must be positive`)
  return v
}

/** Optional string; missing becomes `fallback` */
function str(o: Obj, key: string, where: string, fallback = ''): string {
  const v = o[key]
  if (v === undefined) return fallback
  if (typeof v !== 'string') fail(where, `${key} is not a string`)
  return v
}

function bool(o: Obj, key: string, where: string, fallback: boolean): boolean {
  const v = o[key]
  if (v === undefined) return fallback
  if (typeof v !== 'boolean') fail(where, `${key} is not true/false`)
  return v
}

function color(o: Obj, key: string, where: string): string {
  const v = o[key]
  if (!isSafeColor(v)) fail(where, `${key} is not a valid colour`)
  return v
}

function iconAlign(o: Obj, key: string, where: string): IconAlign {
  const v = o[key] ?? 'left'
  if (!ICON_ALIGNS.includes(v as IconAlign)) fail(where, `${key} is not left/center/right`)
  return v as IconAlign
}

function parseShape(v: unknown, where: string): Shape {
  const o = obj(v, where)
  const rawType = o.type as string
  const type = LEGACY_SHAPE_TYPES[rawType] ?? rawType
  if (!SHAPE_TYPES.includes(type as ShapeType)) fail(where, `unknown shape type "${String(rawType)}"`)
  return {
    id: str(o, 'id', where),
    type: type as ShapeType,
    x: num(o, 'x', where),
    y: num(o, 'y', where),
    width: num(o, 'width', where, true),
    height: num(o, 'height', where, true),
    fillColor: color(o, 'fillColor', where),
    strokeColor: color(o, 'strokeColor', where),
    textColor: color(o, 'textColor', where),
    header: str(o, 'header', where),
    body: str(o, 'body', where),
    footer: str(o, 'footer', where),
    headerIcon: str(o, 'headerIcon', where),
    bodyIcon: str(o, 'bodyIcon', where),
    footerIcon: str(o, 'footerIcon', where),
    headerIconAlign: iconAlign(o, 'headerIconAlign', where),
    bodyIconAlign: iconAlign(o, 'bodyIconAlign', where),
    footerIconAlign: iconAlign(o, 'footerIconAlign', where),
    selected: false,
  }
}

function parseLine(v: unknown, where: string): Line {
  const o = obj(v, where)
  return {
    id: str(o, 'id', where),
    fromId: str(o, 'fromId', where),
    toId: str(o, 'toId', where),
    label: str(o, 'label', where),
    color: color(o, 'color', where),
    directed: bool(o, 'directed', where, true),
  }
}

function parseFreeLine(v: unknown, where: string): FreeLine {
  const o = obj(v, where)
  return {
    id: str(o, 'id', where),
    x1: num(o, 'x1', where),
    y1: num(o, 'y1', where),
    x2: num(o, 'x2', where),
    y2: num(o, 'y2', where),
    color: color(o, 'color', where),
  }
}

function parseTextBox(v: unknown, where: string): TextBox {
  const o = obj(v, where)
  return {
    id: str(o, 'id', where),
    x: num(o, 'x', where),
    y: num(o, 'y', where),
    text: str(o, 'text', where),
    scale: num(o, 'scale', where, true),
    bold: bool(o, 'bold', where, false),
    color: color(o, 'color', where),
  }
}

/**
 * Parse and validate a saved diagram (file or auto-save). Throws an Error describing the first
 * problem, so a bad file is rejected whole rather than loaded half-broken. Migrates legacy shape
 * types and backfills fields older files lack; colour migration is left to the caller via `version`.
 */
export function parseDiagram(json: string): { diagram: Diagram; version: number } {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('not a valid JSON file')
  }
  const root = obj(data, 'file')
  const version = root.version === undefined ? 1 : num(root, 'version', 'file')
  if (version > DIAGRAM_VERSION) fail('file', 'saved by a newer version of iDrawM')

  const diagram: Diagram = {
    shapes: arr(root.shapes, 'shapes', false).map((s, i) => parseShape(s, `shape ${i + 1}`)),
    lines: arr(root.lines, 'lines', true).map((l, i) => parseLine(l, `connector ${i + 1}`)),
    freeLines: arr(root.freeLines, 'freeLines', true).map((f, i) => parseFreeLine(f, `line ${i + 1}`)),
    texts: arr(root.texts, 'texts', true).map((t, i) => parseTextBox(t, `text ${i + 1}`)),
  }

  // Ids must be unique across all arrays (selection and colour updates look them up that way)
  const ids = new Set<string>()
  for (const el of [...diagram.shapes, ...diagram.lines, ...diagram.freeLines, ...diagram.texts]) {
    if (!el.id) fail('file', 'an element has no id')
    if (ids.has(el.id)) fail('file', `duplicate id "${el.id}"`)
    ids.add(el.id)
  }
  const shapeIds = new Set(diagram.shapes.map(s => s.id))
  for (const l of diagram.lines) {
    if (!shapeIds.has(l.fromId) || !shapeIds.has(l.toId)) fail('file', `connector "${l.id}" points to a missing shape`)
  }

  return { diagram, version }
}
