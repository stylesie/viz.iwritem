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
  // Groups are compound nodes; lay them out together with the edges that cross into them
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
}

// Room between a group's members and the edge of its cluster
const GROUP_OPTIONS = {
  'elk.padding': '[top=24,left=24,bottom=24,right=24]',
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

const GROUP_NODE_PREFIX = 'group:'

interface ElkNodeInput {
  id: string
  width?: number
  height?: number
  layoutOptions?: Record<string, string>
  children?: ElkNodeInput[]
  edges?: unknown[]
}

interface ElkNodeOutput {
  id: string
  x?: number
  y?: number
  children?: ElkNodeOutput[]
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

  // Build ELK graph: grouped shapes become children of a compound node per group, placed in the
  // flow where the group's first member falls
  const edgeOf = (l: Line) => ({
    id: l.id,
    sources: [l.fromId],
    targets: [l.toId],
    labels: l.label
      ? [{ text: l.label, width: l.label.length * LABEL_FONT_PX * 0.6 + 8, height: LABEL_FONT_PX + 8 }]
      : [],
  })
  const groupOf = new Map(shapes.map(s => [s.id, s.groupId]))
  const children: ElkNodeInput[] = []
  const groupNodes = new Map<string, ElkNodeInput>()
  for (const s of flowOrder(shapes, lines)) {
    const node = { id: s.id, width: s.width, height: s.height }
    if (!s.groupId) {
      children.push(node)
      continue
    }
    let group = groupNodes.get(s.groupId)
    if (!group) {
      group = { id: GROUP_NODE_PREFIX + s.groupId, layoutOptions: GROUP_OPTIONS, children: [], edges: [] }
      groupNodes.set(s.groupId, group)
      children.push(group)
    }
    group.children!.push(node)
  }
  // An edge lives in the group both its ends belong to, otherwise at the root
  const rootEdges = []
  for (const l of lines) {
    const g = groupOf.get(l.fromId)
    if (g && g === groupOf.get(l.toId)) groupNodes.get(g)!.edges!.push(edgeOf(l))
    else rootEdges.push(edgeOf(l))
  }
  const graph = { id: 'root', layoutOptions: LAYOUT_OPTIONS, children, edges: rootEdges }

  const elk = await getElk()
  const layouted = await elk.layout(graph)

  // Children of a group are positioned relative to it
  const positions = new Map<string, { x: number; y: number }>()
  const collect = (nodes: ElkNodeOutput[] | undefined, ox: number, oy: number) => {
    for (const n of nodes ?? []) {
      const x = ox + (n.x ?? 0), y = oy + (n.y ?? 0)
      if (n.id.startsWith(GROUP_NODE_PREFIX)) collect(n.children, x, y)
      else positions.set(n.id, { x, y })
    }
  }
  collect(layouted.children, 0, 0)

  return { positions }
}
