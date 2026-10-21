import type { TextBox } from './model'

/** Font size of a text box at scale 1; a box's size is `scale` × this */
export const TEXT_BASE_SIZE = 16
export const TEXT_LINE_HEIGHT = 1.25
export const TEXT_PLACEHOLDER = 'Text'

export const TEXT_SIZES: { label: string; scale: number }[] = [
  { label: 'S', scale: 1 },
  { label: 'M', scale: 1.5 },
  { label: 'L', scale: 2 },
  { label: 'XL', scale: 3 },
  { label: 'XXL', scale: 4 },
]

export interface TextBoxLayout {
  lines: string[]
  fontSize: number
  lineHeight: number
  width: number
  height: number
}

let measureCtx: CanvasRenderingContext2D | null = null

function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!
  return measureCtx
}

export function textBoxFont(t: Pick<TextBox, 'scale' | 'bold'>): string {
  return `${t.bold ? 'bold ' : ''}${TEXT_BASE_SIZE * t.scale}px Inter, system-ui, sans-serif`
}

/** Lines and size of a text box. Empty text is measured as the placeholder so it stays clickable. */
export function layoutTextBox(t: Pick<TextBox, 'text' | 'scale' | 'bold'>): TextBoxLayout {
  const ctx = getMeasureCtx()
  ctx.font = textBoxFont(t)
  const fontSize = TEXT_BASE_SIZE * t.scale
  const lineHeight = fontSize * TEXT_LINE_HEIGHT
  const lines = (t.text || TEXT_PLACEHOLDER).split('\n')
  const width = Math.max(...lines.map(l => ctx.measureText(l).width), fontSize / 2)
  return { lines, fontSize, lineHeight, width, height: lines.length * lineHeight }
}
