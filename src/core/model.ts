export type ShapeType = 'circle' | 'oval' | 'square' | 'rectangle' | 'diamond' | 'triangle'

export interface Shape {
  id: string
  type: ShapeType
  x: number
  y: number
  width: number
  height: number
  fillColor: string
  strokeColor: string
  textColor: string
  header: string
  body: string
  footer: string
  headerIcon: string
  bodyIcon: string
  footerIcon: string
  selected: boolean
}

export interface Line {
  id: string
  fromId: string
  toId: string
  label: string
  color: string
  directed: boolean
}

export interface Diagram {
  shapes: Shape[]
  lines: Line[]
}

let nextId = 1

export function generateId(): string {
  return `el_${nextId++}_${Date.now().toString(36)}`
}

export const DEFAULT_SHAPE_SIZE = 100
export const MIN_SHAPE_SIZE = 40

export function createShape(type: ShapeType, x: number, y: number): Shape {
  const size = DEFAULT_SHAPE_SIZE
  return {
    id: generateId(),
    type,
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
    fillColor: '#e8f4f8',
    strokeColor: '#2d3436',
    textColor: '#2d3436',
    header: '',
    body: '',
    footer: '',
    headerIcon: '',
    bodyIcon: '',
    footerIcon: '',
    selected: false,
  }
}
