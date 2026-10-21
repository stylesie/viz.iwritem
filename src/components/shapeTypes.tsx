import type { ShapeType } from '../core/model'

const cylinderIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="8" cy="4" rx="6" ry="2.5" />
    <line x1="2" y1="4" x2="2" y2="12" />
    <line x1="14" y1="4" x2="14" y2="12" />
    <path d="M 2 12 A 6 2.5 0 0 0 14 12" />
  </svg>
)

const cloudIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12 C1.5 12 1 9.5 2.5 8.5 C1.5 6.5 3 4.5 5 5 C6 3 9 2.5 10.5 4.5 C12 3.5 14.5 4.5 14 7 C15.5 7.5 15.5 10 14 11 C14 12 12.5 12.5 11 12 Z" />
  </svg>
)

export const SHAPE_TOOLS: { type: ShapeType; label: string; icon: React.ReactNode }[] = [
  { type: 'rectangle', label: 'Rectangle', icon: '□' },
  { type: 'ellipse', label: 'Ellipse', icon: '○' },
  { type: 'diamond', label: 'Diamond', icon: '◇' },
  { type: 'triangle', label: 'Triangle', icon: '△' },
  { type: 'parallelogram', label: 'Parallel', icon: '▱' },
  { type: 'rounded-rectangle', label: 'Rounded', icon: '▢' },
  { type: 'hexagon', label: 'Hexagon', icon: '⬡' },
  { type: 'cylinder', label: 'Cylinder', icon: cylinderIcon },
  { type: 'cloud', label: 'Cloud', icon: cloudIcon },
]
