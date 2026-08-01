import type {
  CreateFlowRequest,
  FlowApprovalMode,
  FlowGraph,
  FlowNodeCategory,
  FlowResponse,
  FlowStatus
} from "@elevenhouse/contracts";

export const flowStatusLabelRu = {
  draft: "Черновик",
  published: "Опубликована",
  active: "Активна",
  paused: "Пауза",
  archived: "Архив"
} satisfies Record<FlowStatus, string>;

export const flowApprovalModeLabelRu = {
  draft_only: "Только черновики",
  manual_approve: "С подтверждением",
  auto_internal: "Авто внутри CRM",
  auto_send: "Полный автомат"
} satisfies Record<FlowApprovalMode, string>;

export const flowCategoryLabelRu = {
  trigger: "Триггер",
  action: "Действие",
  ai: "AI",
  condition: "Условие",
  delay: "Пауза",
  handoff: "Хендофф",
  terminal: "Финал"
} satisfies Record<FlowNodeCategory, string>;

export type FlowGraphSummary = {
  readonly nodes: number;
  readonly edges: number;
  readonly aiNodes: number;
  readonly actionNodes: number;
  readonly triggerTitle: string | null;
  readonly pathPreview: readonly string[];
};

export type FlowGallerySummary = Record<FlowStatus | "total", number>;

export function summarizeFlowGraph(graph: FlowGraph): FlowGraphSummary {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const trigger = graph.nodes.find((node) => node.category === "trigger") ?? graph.nodes[0] ?? null;
  const pathPreview: string[] = [];
  const seen = new Set<string>();
  let cursor = trigger?.id ?? null;

  while (cursor && pathPreview.length < 5 && !seen.has(cursor)) {
    seen.add(cursor);
    const node = nodesById.get(cursor);
    if (!node) break;

    pathPreview.push(node.title);
    cursor = graph.edges.find((edge) => edge.fromNodeId === node.id)?.toNodeId ?? null;
  }

  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    aiNodes: graph.nodes.filter((node) => node.category === "ai").length,
    actionNodes: graph.nodes.filter((node) => node.category === "action").length,
    triggerTitle: trigger?.title ?? null,
    pathPreview
  };
}

export function summarizeFlows(flows: readonly FlowResponse[]): FlowGallerySummary {
  const summary: FlowGallerySummary = {
    total: flows.length,
    draft: 0,
    published: 0,
    active: 0,
    paused: 0,
    archived: 0
  };

  for (const flow of flows) {
    summary[flow.status] += 1;
  }

  return summary;
}

export function createFlowFromTemplateRequest(input: {
  readonly name: string;
  readonly approvalMode: FlowApprovalMode;
  readonly graph: FlowGraph;
}): CreateFlowRequest {
  return {
    name: input.name.trim(),
    approvalMode: input.approvalMode,
    graph: input.graph
  };
}
