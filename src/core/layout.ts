import type { Shape, Line } from './model'

// Lazy-load ELK to keep initial bundle small
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let elkInstance: any = null

async function getElk() {
  if (!elkInstance) {
    // elk-api runs ELK in a real Web Worker, keeping big layouts off the UI thread;
    // elk.bundled only fakes a worker and computes on the main thread
    const [{ default: ELK }, { default: workerUrl }] = await Promise.all([
      import('elkjs/lib/elk-api.js'),
      import('elkjs/lib/elk-worker.min.js?url'),
    ])
    elkInstance = new ELK({ workerUrl })
  }
  return elkInstance
}

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '60',
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.spacing.edgeNode': '30',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  // Children are passed in flow order (see flowOrder), so reverse edges that point
  // back to earlier nodes — loops become back-edges instead of reordering the flow
  'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.edgeLabels.placement': 'CENTER',
}

const LABEL_FONT_PX = 12

/**
 * Breadth-first order from root shapes (no incoming lines), ties broken by
 * current position top-to-bottom, left-to-right. Shapes only reachable via a
 * cycle are started from in the same positional order.
 */
function flowOrder(shapes: Shape[], lines: Line[]): Shape[] {
  const byPos = [...shapes].sort((a, b) => a.y - b.y || a.x - b.x)
  const out = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const s of shapes) { out.set(s.id, []); indeg.set(s.id, 0) }
  for (const l of lines) {
    if (!out.has(l.fromId) || !indeg.has(l.toId) || l.fromId === l.toId) continue
    out.get(l.fromId)!.push(l.toId)
    indeg.set(l.toId, indeg.get(l.toId)! + 1)
  }
  const rank = new Map(byPos.map((s, i) => [s.id, i]))
  for (const targets of out.values()) targets.sort((a, b) => rank.get(a)! - rank.get(b)!)

  const visited = new Set<string>()
  const order: string[] = []
  const bfs = (start: string) => {
    const queue = [start]
    visited.add(start)
    while (queue.length) {
      const id = queue.shift()!
      order.push(id)
      for (const next of out.get(id)!) {
        if (!visited.has(next)) { visited.add(next); queue.push(next) }
      }
    }
  }
  for (const s of byPos) if (indeg.get(s.id) === 0 && !visited.has(s.id)) bfs(s.id)
  for (const s of byPos) if (!visited.has(s.id)) bfs(s.id)

  const byId = new Map(shapes.map(s => [s.id, s]))
  return order.map(id => byId.get(id)!)
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
    children: flowOrder(shapes, lines).map(s => ({
      id: s.id,
      width: s.width,
      height: s.height,
    })),
    edges: lines.map(l => ({
      id: l.id,
      sources: [l.fromId],
      targets: [l.toId],
      labels: l.label
        ? [{ text: l.label, width: l.label.length * LABEL_FONT_PX * 0.6 + 8, height: LABEL_FONT_PX + 8 }]
        : [],
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
