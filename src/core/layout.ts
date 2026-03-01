import type { Shape, Line } from './model'

// Lazy-load ELK to keep initial bundle small
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let elkInstance: any = null

async function getElk() {
  if (!elkInstance) {
    const mod = await import('elkjs/lib/elk.bundled.js')
    const ELK = mod.default || mod
    elkInstance = new ELK()
  }
  return elkInstance
}

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '50',
  'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  'elk.layered.spacing.edgeNodeBetweenLayers': '30',
  'elk.edgeRouting': 'POLYLINE',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
}

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>
}

/**
 * Run ELK auto-layout on the given shapes and lines.
 * Returns new positions for each shape (keeping their existing sizes).
 */
export async function runLayout(shapes: Shape[], lines: Line[]): Promise<LayoutResult> {
  if (shapes.length === 0) {
    return { positions: new Map() }
  }

  // If there are no lines, no layout to compute — keep positions as-is
  if (lines.length === 0) {
    const positions = new Map<string, { x: number; y: number }>()
    for (const s of shapes) {
      positions.set(s.id, { x: s.x, y: s.y })
    }
    return { positions }
  }

  // Build ELK graph
  const graph = {
    id: 'root',
    layoutOptions: LAYOUT_OPTIONS,
    children: shapes.map(s => ({
      id: s.id,
      width: s.width,
      height: s.height,
    })),
    edges: lines.map(l => ({
      id: l.id,
      sources: [l.fromId],
      targets: [l.toId],
    })),
  }

  const elk = await getElk()
  const layouted = await elk.layout(graph)

  const positions = new Map<string, { x: number; y: number }>()
  if (layouted.children) {
    for (const child of layouted.children) {
      positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
    }
  }

  return { positions }
}
