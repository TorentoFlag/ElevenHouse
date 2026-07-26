import type { FlowGraph, FlowNode } from "@elevenhouse/contracts";

export type FlowValidationIssueCode =
  | "duplicate_node_id"
  | "invalid_trigger_count"
  | "missing_edge_endpoint"
  | "unreachable_node"
  | "auto_send_disabled";

export type FlowValidationIssue = {
  code: FlowValidationIssueCode;
  severity: "error" | "warning";
  blocking: boolean;
  path: string;
  message: string;
};

export type FlowValidationResult = {
  publishable: boolean;
  issues: FlowValidationIssue[];
};

export class FlowGraphValidationError extends Error {
  readonly issues: FlowValidationIssue[];

  constructor(issues: FlowValidationIssue[]) {
    super("Flow graph is not publishable.");
    this.name = "FlowGraphValidationError";
    this.issues = issues;
  }
}

export function validateFlowGraph(graph: FlowGraph): FlowValidationResult {
  const issues: FlowValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      duplicateIds.add(node.id);
      continue;
    }
    nodeIds.add(node.id);
  }

  if (duplicateIds.size > 0) {
    issues.push({
      code: "duplicate_node_id",
      severity: "error",
      blocking: true,
      path: "nodes",
      message: "Flow graph node ids must be unique."
    });
  }

  const triggerNodes = graph.nodes.filter((node) => node.category === "trigger");
  if (triggerNodes.length !== 1) {
    issues.push({
      code: "invalid_trigger_count",
      severity: "error",
      blocking: true,
      path: "nodes",
      message: "Flow graph requires exactly one trigger node."
    });
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      issues.push({
        code: "missing_edge_endpoint",
        severity: "error",
        blocking: true,
        path: `edges.${edge.id}`,
        message: "Flow edge references a node that does not exist."
      });
    }
  }

  if (triggerNodes.length === 1 && duplicateIds.size === 0) {
    for (const node of findUnreachableNonterminalNodes(graph, triggerNodes[0]!.id, nodeIds)) {
      issues.push({
        code: "unreachable_node",
        severity: "error",
        blocking: true,
        path: `nodes.${node.id}`,
        message: "Flow node is not reachable from the trigger."
      });
    }
  }

  for (const node of graph.nodes) {
    if (
      (node.category === "action" || node.category === "ai" || node.category === "handoff") &&
      node.kind === "send_message" &&
      node.approvalMode === "auto_send"
    ) {
      issues.push({
        code: "auto_send_disabled",
        severity: "error",
        blocking: true,
        path: `nodes.${node.id}`,
        message: "Auto-send message actions are disabled until delivery gates exist."
      });
    }
  }

  return {
    publishable: !issues.some((issue) => issue.blocking),
    issues
  };
}

export function assertFlowGraphPublishable(graph: FlowGraph): FlowGraph {
  const result = validateFlowGraph(graph);
  if (!result.publishable) {
    throw new FlowGraphValidationError(result.issues);
  }
  return graph;
}

function findUnreachableNonterminalNodes(
  graph: FlowGraph,
  triggerNodeId: string,
  nodeIds: Set<string>
): FlowNode[] {
  const outgoingEdges = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      continue;
    }

    const existing = outgoingEdges.get(edge.fromNodeId) ?? [];
    existing.push(edge.toNodeId);
    outgoingEdges.set(edge.fromNodeId, existing);
  }

  const reachable = new Set<string>();
  const pending = [triggerNodeId];
  while (pending.length > 0) {
    const nodeId = pending.pop();
    if (nodeId === undefined || reachable.has(nodeId)) {
      continue;
    }

    reachable.add(nodeId);
    for (const nextNodeId of outgoingEdges.get(nodeId) ?? []) {
      pending.push(nextNodeId);
    }
  }

  return graph.nodes.filter((node) => node.category !== "terminal" && !reachable.has(node.id));
}
