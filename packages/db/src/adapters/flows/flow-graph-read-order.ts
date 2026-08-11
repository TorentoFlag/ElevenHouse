import { flowGraphV2Schema, type FlowNodeKindV2 } from "@elevenhouse/contracts";

/** Produces a stable gallery order without treating legitimate readiness loops as invalid. */
export function orderFlowGraphNodeKindsForRead(draftGraph: unknown): readonly FlowNodeKindV2[] {
  const graph = flowGraphV2Schema.parse(draftGraph);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const targetsBySourceId = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) continue;
    const targets = targetsBySourceId.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    targetsBySourceId.set(edge.sourceNodeId, targets);
  }

  for (const targets of targetsBySourceId.values()) targets.sort(compareNodeIdsByStoredOrder(graph.nodes));

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const triggerIds = graph.nodes
    .filter((node) => node.kind === "booking_confirmed" || node.kind === "manual_client")
    .map((node) => node.id);
  const firstNode = graph.nodes[0];
  if (!firstNode) return [];
  const pendingIds = triggerIds.length > 0 ? [...triggerIds] : [firstNode.id];
  const seenIds = new Set<string>();
  const orderedNodeKinds: FlowNodeKindV2[] = [];
  while (pendingIds.length > 0) {
    const nodeId = pendingIds.shift();
    if (!nodeId || seenIds.has(nodeId)) continue;
    const node = nodeById.get(nodeId);
    if (!node) continue;
    seenIds.add(nodeId);
    orderedNodeKinds.push(node.kind);
    pendingIds.push(...(targetsBySourceId.get(nodeId) ?? []));
  }

  for (const node of graph.nodes) if (!seenIds.has(node.id)) orderedNodeKinds.push(node.kind);
  return orderedNodeKinds;
}

function compareNodeIdsByStoredOrder(
  nodes: readonly { readonly id: string }[]
): (leftId: string, rightId: string) => number {
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  return (leftId, rightId) => (indexById.get(leftId) ?? 0) - (indexById.get(rightId) ?? 0);
}
