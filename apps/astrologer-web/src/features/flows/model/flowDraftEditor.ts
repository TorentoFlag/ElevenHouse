import { flowTriggerNodeKindV2Values } from "@elevenhouse/contracts";
import type {
  FlowGraphV2,
  FlowNodeKindV2,
  FlowNodeV2,
  FlowPresentationV1,
  FlowSourceHandleV2
} from "@elevenhouse/contracts";

export type FlowEditorLocale = "ru" | "en";

export type FlowPaletteNodeId = Exclude<
  FlowNodeKindV2,
  (typeof flowTriggerNodeKindV2Values)[number]
>;

export type FlowPaletteNodeDefinition = {
  readonly id: FlowPaletteNodeId;
  readonly label: Readonly<Record<FlowEditorLocale, string>>;
  readonly description: Readonly<Record<FlowEditorLocale, string>>;
};

export const flowPaletteNodeGroups = [
  {
    id: "messaging",
    label: { ru: "Коммуникации", en: "Messaging" },
    nodes: [
      {
        id: "send_message",
        label: { ru: "Отправить сообщение", en: "Send message" },
        description: {
          ru: "Отправить текст в единственный подходящий подключённый диалог клиента",
          en: "Send text to the client's single eligible connected conversation"
        }
      }
    ]
  },
  {
    id: "logic",
    label: { ru: "Логика", en: "Logic" },
    nodes: [
      {
        id: "birth_data_available",
        label: { ru: "Данные рождения заполнены?", en: "Birth data available?" },
        description: {
          ru: "Выбрать ветку по данным для подготовки услуги",
          en: "Choose a branch using service preparation data"
        }
      }
    ]
  },
  {
    id: "chart_ai",
    label: { ru: "Карта и AI", en: "Chart and AI" },
    nodes: [
      {
        id: "natal_chart_request",
        label: { ru: "Рассчитать натальную карту", en: "Calculate natal chart" },
        description: {
          ru: "Выполнить расчёт натальной карты для подготовки услуги",
          en: "Calculate a natal chart for service preparation"
        }
      },
      {
        id: "natal_chart_ai_draft",
        label: { ru: "AI-черновик трактовки", en: "AI interpretation draft" },
        description: {
          ru: "Создать черновик по натальной карте и запросить решение астролога",
          en: "Create a natal-chart draft and request an astrologer decision"
        }
      }
    ]
  },
  {
    id: "human",
    label: { ru: "Работа астролога", en: "Astrologer work" },
    nodes: [
      {
        id: "astrologer_work_item",
        label: { ru: "Задача астрологу", en: "Astrologer task" },
        description: {
          ru: "Остановить сценарий до выполнения внутренней задачи",
          en: "Wait until an internal task is completed"
        }
      },
      {
        id: "astrologer_approval",
        label: { ru: "Решение астролога", en: "Astrologer approval" },
        description: {
          ru: "Продолжить по ветке подтверждения или отклонения",
          en: "Continue through an approved or rejected branch"
        }
      }
    ]
  },
  {
    id: "outcomes",
    label: { ru: "Результаты", en: "Outcomes" },
    nodes: [
      {
        id: "completed",
        label: { ru: "Завершено", en: "Completed" },
        description: {
          ru: "Успешный измеримый итог сценария",
          en: "A successful measurable flow outcome"
        }
      },
      {
        id: "suppressed",
        label: { ru: "Подавлено", en: "Suppressed" },
        description: {
          ru: "Корректно остановить сценарий по бизнес-причине",
          en: "Stop the flow for an explicit business reason"
        }
      },
      {
        id: "failed",
        label: { ru: "Ошибка", en: "Failed" },
        description: {
          ru: "Завершить сценарий с типизированной ошибкой",
          en: "Finish the flow with a typed error"
        }
      }
    ]
  }
] satisfies ReadonlyArray<{
  readonly id: string;
  readonly label: Readonly<Record<FlowEditorLocale, string>>;
  readonly nodes: readonly FlowPaletteNodeDefinition[];
}>;

export function renameFlowNode(
  graph: FlowGraphV2,
  nodeId: string,
  displayTitle: string
): FlowGraphV2 {
  return updateFlowNode(graph, nodeId, (node) => ({ ...node, displayTitle }));
}

export function replaceFlowNode(graph: FlowGraphV2, replacement: FlowNodeV2): FlowGraphV2 {
  return updateFlowNode(graph, replacement.id, () => replacement);
}

type FlowNodeOfKind<TKind extends FlowNodeKindV2> = Extract<FlowNodeV2, { kind: TKind }>;

export function updateFlowNodeConfig<TKind extends FlowNodeKindV2>(
  graph: FlowGraphV2,
  nodeId: string,
  kind: TKind,
  config: FlowNodeOfKind<TKind>["config"]
): FlowGraphV2 {
  return updateFlowNode(graph, nodeId, (node) => {
    if (node.kind !== kind) throw new Error("FLOW_NODE_KIND_MISMATCH");

    return { ...node, config } as FlowNodeV2;
  });
}

export function moveFlowNodePresentation(
  presentation: FlowPresentationV1,
  nodeId: string,
  position: { readonly x: number; readonly y: number }
): FlowPresentationV1 {
  let found = false;
  const nodes = presentation.nodes.map((node) => {
    if (node.nodeId !== nodeId) return node;
    found = true;
    return { ...node, position };
  });

  if (!found) throw new Error("FLOW_PRESENTATION_NODE_NOT_FOUND");
  return { ...presentation, nodes };
}

export function getRequiredSourceHandles(node: FlowNodeV2): readonly FlowSourceHandleV2[] {
  if ((flowTriggerNodeKindV2Values as readonly FlowNodeKindV2[]).includes(node.kind)) {
    return ["next"];
  }
  if (node.kind === "birth_data_available") return ["true", "false"];
  if (node.kind === "natal_chart_request") return ["next"];
  if (node.kind === "send_message") return ["success", "error"];
  if (node.kind === "natal_chart_ai_draft") {
    return node.config.expiresAfterMinutes
      ? ["approved", "rejected", "timeout"]
      : ["approved", "rejected"];
  }
  if (node.kind === "astrologer_work_item") return ["success"];
  if (node.kind === "astrologer_approval") {
    return node.config.expiresAfterMinutes
      ? ["approved", "rejected", "timeout"]
      : ["approved", "rejected"];
  }
  return [];
}

export function getAvailableSourceHandles(
  graph: FlowGraphV2,
  nodeId: string
): readonly FlowSourceHandleV2[] {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error("FLOW_NODE_NOT_FOUND");

  const occupied = new Set(
    graph.edges.filter((edge) => edge.sourceNodeId === nodeId).map((edge) => edge.sourceHandle)
  );
  return getRequiredSourceHandles(node).filter((handle) => !occupied.has(handle));
}

export function appendFlowNodeFromPalette(
  graph: FlowGraphV2,
  presentation: FlowPresentationV1,
  input: {
    readonly sourceNodeId: string;
    readonly sourceHandle: FlowSourceHandleV2;
    readonly paletteNodeId: FlowPaletteNodeId;
    readonly locale: FlowEditorLocale;
    readonly existingNodeIds?: ReadonlySet<string>;
  }
): {
  readonly graph: FlowGraphV2;
  readonly presentation: FlowPresentationV1;
  readonly addedNodeId: string;
} {
  const sourceNode = graph.nodes.find((node) => node.id === input.sourceNodeId);
  if (!sourceNode) throw new Error("FLOW_NODE_NOT_FOUND");
  if (!getRequiredSourceHandles(sourceNode).includes(input.sourceHandle)) {
    throw new Error("FLOW_SOURCE_HANDLE_INVALID");
  }
  if (
    graph.edges.some(
      (edge) => edge.sourceNodeId === input.sourceNodeId && edge.sourceHandle === input.sourceHandle
    )
  ) {
    throw new Error("FLOW_SOURCE_HANDLE_OCCUPIED");
  }

  const existingNodeIds = input.existingNodeIds ?? new Set(graph.nodes.map((node) => node.id));
  const nodeId = uniqueNodeId(nodeIdBase[input.paletteNodeId], existingNodeIds);
  const node = createPaletteNode(input.paletteNodeId, nodeId, input.locale, sourceNode);
  const sourcePosition =
    presentation.nodes.find((item) => item.nodeId === input.sourceNodeId)?.position ??
    fallbackPosition(graph.nodes.findIndex((candidate) => candidate.id === input.sourceNodeId));
  const position = {
    x: sourcePosition.x + 320,
    y: sourcePosition.y + branchOffset(input.sourceHandle)
  };

  return {
    graph: {
      ...graph,
      nodes: [...graph.nodes, node],
      edges: [
        ...graph.edges,
        {
          id: uniqueEdgeId(
            `${input.sourceNodeId}-${input.sourceHandle}-to-${nodeId}`,
            new Set(graph.edges.map((edge) => edge.id))
          ),
          sourceNodeId: input.sourceNodeId,
          targetNodeId: nodeId,
          sourceHandle: input.sourceHandle
        }
      ]
    },
    presentation: {
      ...presentation,
      nodes: [...presentation.nodes, { nodeId, position }]
    },
    addedNodeId: nodeId
  };
}

function updateFlowNode(
  graph: FlowGraphV2,
  nodeId: string,
  update: (node: FlowNodeV2) => FlowNodeV2
): FlowGraphV2 {
  let found = false;
  const nodes = graph.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    found = true;
    return update(node);
  });

  if (!found) throw new Error("FLOW_NODE_NOT_FOUND");
  return { ...graph, nodes };
}

function createPaletteNode(
  kind: FlowPaletteNodeId,
  id: string,
  locale: FlowEditorLocale,
  sourceNode: FlowNodeV2
): FlowNodeV2 {
  const title = paletteText[kind][locale];
  const base = {
    id,
    displayTitle: title,
    configSchemaVersion: 1 as const,
    executorContractVersion: 1 as const
  };

  if (kind === "birth_data_available") {
    return { ...base, kind, config: { purpose: "service_preparation" } };
  }
  if (kind === "natal_chart_request") {
    return {
      ...base,
      kind,
      config: {
        interpretationMode: "adult_natal",
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      }
    };
  }
  if (kind === "natal_chart_ai_draft") {
    if (sourceNode.kind !== "natal_chart_request") {
      throw new Error("FLOW_CHART_AI_DRAFT_REQUIRES_CHART_REQUEST");
    }
    return {
      ...base,
      kind,
      config: {
        chartRequestNodeId: sourceNode.id,
        locale,
        approvalTitle: locale === "ru" ? "Проверить AI-черновик" : "Review AI draft"
      }
    };
  }
  if (kind === "send_message") {
    return {
      ...base,
      kind,
      config: {
        textTemplate:
          locale === "ru"
            ? "Здравствуйте! Напоминаем о вашем следующем шаге."
            : "Hello! Here is your next step."
      }
    };
  }
  if (kind === "astrologer_work_item") {
    return {
      ...base,
      kind,
      config: {
        taskKind: "consultation_preparation",
        taskTitle: locale === "ru" ? "Подготовить консультацию" : "Prepare consultation",
        priority: "normal"
      }
    };
  }
  if (kind === "astrologer_approval") {
    return {
      ...base,
      kind,
      config: {
        approvalKind: "manual_task",
        approvalTitle: locale === "ru" ? "Проверить результат" : "Review the result"
      }
    };
  }
  if (kind === "completed") {
    return { ...base, kind, config: { goalKey: "flow_completed" } };
  }
  if (kind === "suppressed") {
    return { ...base, kind, config: { reasonCode: "flow_suppressed" } };
  }
  return { ...base, kind: "failed", config: { errorCode: "flow_failed" } };
}

const paletteText = {
  birth_data_available: { ru: "Данные рождения заполнены?", en: "Birth data available?" },
  natal_chart_request: { ru: "Рассчитать натальную карту", en: "Calculate natal chart" },
  natal_chart_ai_draft: { ru: "AI-черновик трактовки", en: "AI interpretation draft" },
  send_message: { ru: "Отправить сообщение", en: "Send message" },
  astrologer_work_item: { ru: "Задача астрологу", en: "Astrologer task" },
  astrologer_approval: { ru: "Решение астролога", en: "Astrologer approval" },
  completed: { ru: "Завершено", en: "Completed" },
  suppressed: { ru: "Подавлено", en: "Suppressed" },
  failed: { ru: "Ошибка", en: "Failed" }
} satisfies Record<FlowPaletteNodeId, Record<FlowEditorLocale, string>>;

const nodeIdBase = {
  birth_data_available: "birth-data-available",
  natal_chart_request: "natal-chart-request",
  natal_chart_ai_draft: "natal-chart-ai-draft",
  send_message: "send-message",
  astrologer_work_item: "astrologer-work-item",
  astrologer_approval: "astrologer-approval",
  completed: "completed",
  suppressed: "suppressed",
  failed: "failed"
} satisfies Record<FlowPaletteNodeId, string>;

function uniqueNodeId(baseId: string, existingIds: ReadonlySet<string>): string {
  if (!existingIds.has(baseId)) return baseId;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${baseId}-${suffix}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  throw new Error("FLOW_NODE_ID_EXHAUSTED");
}

function uniqueEdgeId(baseId: string, existingIds: ReadonlySet<string>): string {
  if (!existingIds.has(baseId)) return baseId;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${baseId}-${suffix}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  throw new Error("FLOW_EDGE_ID_EXHAUSTED");
}

function branchOffset(handle: FlowSourceHandleV2): number {
  if (handle === "false" || handle === "rejected") return 160;
  if (handle === "timeout" || handle === "error") return 320;
  return 0;
}

function fallbackPosition(index: number): { x: number; y: number } {
  const normalizedIndex = Math.max(0, index);
  return { x: 80 + normalizedIndex * 320, y: 120 };
}
