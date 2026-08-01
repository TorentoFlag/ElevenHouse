import type { FlowGraph, FlowNode, FlowNodePosition } from "@elevenhouse/contracts";

export type FlowPaletteNodeId =
  | "request_birth_data"
  | "send_message"
  | "reply_draft"
  | "data_available"
  | "approval";

type FlowPaletteNodeTemplate =
  | Omit<Extract<FlowNode, { category: "action" }>, "id" | "position">
  | Omit<Extract<FlowNode, { category: "ai" }>, "id" | "position">
  | Omit<Extract<FlowNode, { category: "condition" }>, "id" | "position">
  | Omit<Extract<FlowNode, { category: "handoff" }>, "id" | "position">;

export type FlowPaletteNodeDefinition = {
  readonly id: FlowPaletteNodeId;
  readonly label: string;
  readonly description: string;
  readonly node: FlowPaletteNodeTemplate;
};

export const flowPaletteNodeGroups = [
  {
    id: "actions",
    label: "Действия",
    nodes: [
      {
        id: "request_birth_data",
        label: "Запросить данные",
        description: "Форма BirthData перед расчетом или консультацией",
        node: {
          category: "action",
          kind: "request_birth_data",
          approvalMode: "manual_approve",
          title: "Запросить данные",
          config: { form: "birth_data" }
        }
      },
      {
        id: "send_message",
        label: "Отправить сообщение",
        description: "Черновик сообщения в подключенный канал",
        node: {
          category: "action",
          kind: "send_message",
          approvalMode: "manual_approve",
          title: "Отправить сообщение",
          config: { channel: "preferred" }
        }
      }
    ]
  },
  {
    id: "ai",
    label: "AI-узлы",
    nodes: [
      {
        id: "reply_draft",
        label: "AI-черновик ответа",
        description: "Готовит текст, который астролог подтверждает вручную",
        node: {
          category: "ai",
          kind: "reply_draft",
          approvalMode: "manual_approve",
          title: "AI-черновик ответа",
          config: { task: "reply_draft" }
        }
      }
    ]
  },
  {
    id: "logic",
    label: "Логика",
    nodes: [
      {
        id: "data_available",
        label: "Данные получены?",
        description: "Ветвление по наличию данных клиента",
        node: {
          category: "condition",
          kind: "data_available",
          title: "Данные получены?",
          config: { data: "birth_data" }
        }
      }
    ]
  },
  {
    id: "handoff",
    label: "Человек",
    nodes: [
      {
        id: "approval",
        label: "Подтверждение астролога",
        description: "Остановить сценарий до ручного решения",
        node: {
          category: "handoff",
          kind: "approval",
          approvalMode: "manual_approve",
          title: "Подтверждение астролога",
          config: { queue: "default" }
        }
      }
    ]
  }
] satisfies ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly nodes: readonly FlowPaletteNodeDefinition[];
}>;

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

export function appendFlowNodeFromPalette(
  graph: FlowGraph,
  input: {
    readonly selectedNodeId: string | null;
    readonly paletteNodeId: FlowPaletteNodeId;
    readonly existingNodeIds?: ReadonlySet<string>;
  }
): FlowGraph {
  const definition = findPaletteNode(input.paletteNodeId);
  const selectedIndex = input.selectedNodeId
    ? graph.nodes.findIndex((node) => node.id === input.selectedNodeId)
    : -1;
  const insertAfterIndex = selectedIndex >= 0 ? selectedIndex : graph.nodes.length - 1;
  const previousNode = graph.nodes[insertAfterIndex] ?? null;
  const nextNode = graph.nodes[insertAfterIndex + 1] ?? null;
  const existingIds = input.existingNodeIds ?? new Set(graph.nodes.map((node) => node.id));
  const nodeId = uniqueNodeId(definition.id, existingIds);
  const position = {
    x: (previousNode?.position?.x ?? 80) + 240,
    y: previousNode?.position?.y ?? 120
  };
  const node = {
    ...definition.node,
    id: nodeId,
    position
  } as FlowNode;
  const nodes = [
    ...graph.nodes.slice(0, insertAfterIndex + 1),
    node,
    ...shiftNodesRight(graph.nodes.slice(insertAfterIndex + 1))
  ];
  const edgesWithoutDirectNext =
    previousNode && nextNode
      ? graph.edges.filter(
          (edge) => edge.fromNodeId !== previousNode.id || edge.toNodeId !== nextNode.id
        )
      : graph.edges;
  const insertedEdges = previousNode
    ? [
        { id: `${previousNode.id}-to-${node.id}`, fromNodeId: previousNode.id, toNodeId: node.id },
        ...(nextNode
          ? [{ id: `${node.id}-to-${nextNode.id}`, fromNodeId: node.id, toNodeId: nextNode.id }]
          : [])
      ]
    : [];

  return {
    ...graph,
    nodes,
    edges: [...edgesWithoutDirectNext, ...insertedEdges]
  };
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

function findPaletteNode(id: FlowPaletteNodeId): FlowPaletteNodeDefinition {
  for (const group of flowPaletteNodeGroups) {
    const node = group.nodes.find((candidate) => candidate.id === id);
    if (node) return node;
  }

  throw new Error("FLOW_PALETTE_NODE_NOT_FOUND");
}

function uniqueNodeId(baseId: string, existingIds: ReadonlySet<string>): string {
  if (!existingIds.has(baseId)) return baseId;

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${baseId}_${suffix}`;
    if (!existingIds.has(candidate)) return candidate;
  }

  throw new Error("FLOW_NODE_ID_EXHAUSTED");
}

function shiftNodesRight(nodes: readonly FlowNode[]): readonly FlowNode[] {
  return nodes.map((node) => ({
    ...node,
    position: node.position ? { x: node.position.x + 240, y: node.position.y } : undefined
  }));
}
