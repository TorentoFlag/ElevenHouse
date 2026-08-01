import type { FlowGraph, FlowNodePosition } from "@elevenhouse/contracts";

export function renameFlowNode(graph: FlowGraph, nodeId: string, title: string): FlowGraph {
  return updateFlowNode(graph, nodeId, (node) => ({ ...node, title }));
}

export function updateFlowNodeConfig(
  graph: FlowGraph,
  nodeId: string,
  config: Record<string, unknown>
): FlowGraph {
  return updateFlowNode(graph, nodeId, (node) => ({ ...node, config }));
}

export function moveFlowNode(
  graph: FlowGraph,
  nodeId: string,
  position: FlowNodePosition
): FlowGraph {
  return updateFlowNode(graph, nodeId, (node) => ({ ...node, position }));
}

function updateFlowNode(
  graph: FlowGraph,
  nodeId: string,
  update: (node: FlowGraph["nodes"][number]) => FlowGraph["nodes"][number]
): FlowGraph {
  let found = false;
  const nodes = graph.nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }

    found = true;
    return update(node);
  });

  if (!found) {
    throw new Error("FLOW_NODE_NOT_FOUND");
  }

  return { ...graph, nodes };
}
