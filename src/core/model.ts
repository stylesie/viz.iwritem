export type ShapeType = 'rectangle' | 'ellipse' | 'diamond' | 'triangle' | 'parallelogram' | 'rounded-rectangle' | 'hexagon' | 'cylinder' | 'cloud'

export type IconAlign = 'left' | 'center' | 'right'

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
  headerIconAlign: IconAlign
  bodyIconAlign: IconAlign
  footerIconAlign: IconAlign
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
export const GRID_SIZE = 20

export function snapToGrid(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE
}

/** Top-left position that puts the shape's centre on the nearest grid point. */
export function snapShapePosition(shape: Pick<Shape, 'x' | 'y' | 'width' | 'height'>): { x: number; y: number } {
  return {
    x: snapToGrid(shape.x + shape.width / 2) - shape.width / 2,
    y: snapToGrid(shape.y + shape.height / 2) - shape.height / 2,
  }
}

export function createShape(type: ShapeType, x: number, y: number, colors?: { fillColor?: string; strokeColor?: string; textColor?: string }): Shape {
  const size = DEFAULT_SHAPE_SIZE
  return {
    id: generateId(),
    type,
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
    fillColor: colors?.fillColor ?? '#e8f4f8',
    strokeColor: colors?.strokeColor ?? '#2d3436',
    textColor: colors?.textColor ?? '#2d3436',
    header: '',
    body: '',
    footer: '',
    headerIcon: '',
    bodyIcon: '',
    footerIcon: '',
    headerIconAlign: 'left',
    bodyIconAlign: 'left',
    footerIconAlign: 'left',
    selected: false,
  }
}
