import type {
  FlowActionKind,
  FlowAiKind,
  FlowConditionKind,
  FlowDelayKind,
  FlowHandoffKind,
  FlowTemplate,
  FlowTriggerKind
} from "@elevenhouse/contracts";

export function getBuiltInFlowTemplates(): FlowTemplate[] {
  return [
    {
      key: "session-prep",
      name: "Подготовка к живой сессии",
      description: "Запись -> данные рождения -> карта -> бриф -> напоминание.",
      category: "service_delivery",
      recommendedApprovalMode: "manual_approve",
      requiredCapabilities: ["booking", "birth_data", "chart_engine"],
      graph: {
        schemaVersion: "flow-graph.v1",
        nodes: [
          trigger("trigger-booking", "booking_confirmed", "Запись подтверждена"),
          action("request-birth-data", "request_birth_data", "Запросить данные рождения"),
          action("calculate-natal", "calculate_chart", "Построить карту"),
          ai("astrologer-brief", "summarize", "AI-бриф астрологу"),
          action("session-reminder", "send_message", "Черновик напоминания")
        ],
        edges: chain([
          "trigger-booking",
          "request-birth-data",
          "calculate-natal",
          "astrologer-brief",
          "session-reminder"
        ])
      }
    },
    {
      key: "async-recorded-reading",
      name: "Авто-разбор в записи",
      description: "Покупка -> сбор данных -> расчет -> AI-черновик -> доставка после одобрения.",
      category: "sales",
      recommendedApprovalMode: "manual_approve",
      requiredCapabilities: ["products", "birth_data", "chart_engine", "ai_drafts"],
      graph: {
        schemaVersion: "flow-graph.v1",
        nodes: [
          trigger("trigger-purchase", "product_purchased", "Куплен разбор в записи"),
          action("request-birth-data", "request_birth_data", "Запросить данные"),
          condition("birth-data-ready", "data_available", "Данные получены?"),
          action("calculate-chart", "calculate_chart", "Построить карту"),
          ai("interpretation-draft", "interpretation_draft", "AI-разбор"),
          handoff("approve-delivery", "approval", "Подтвердить доставку"),
          action("deliver-result", "deliver_result", "Доставить результат")
        ],
        edges: chain([
          "trigger-purchase",
          "request-birth-data",
          "birth-data-ready",
          "calculate-chart",
          "interpretation-draft",
          "approve-delivery",
          "deliver-result"
        ])
      }
    },
    {
      key: "lead-magnet-upsell",
      name: "Лид-магнит -> апселл",
      description: "Бесплатная ценность -> серия пользы -> скоринг -> персональный оффер.",
      category: "sales",
      recommendedApprovalMode: "manual_approve",
      requiredCapabilities: ["products", "messaging", "ai_drafts"],
      graph: {
        schemaVersion: "flow-graph.v1",
        nodes: [
          trigger("trigger-lead", "lead_created", "Получен лид-магнит"),
          delay("intro-delay", "delay_for", "Пауза 1 день"),
          action("value-message", "send_message", "Черновик полезного сообщения"),
          ai("lead-score", "score", "Скоринг лида"),
          condition("warm-lead", "if_else", "Теплый лид?"),
          action("offer-consultation", "send_message", "Черновик предложения")
        ],
        edges: chain([
          "trigger-lead",
          "intro-delay",
          "value-message",
          "lead-score",
          "warm-lead",
          "offer-consultation"
        ])
      }
    },
    {
      key: "sleeping-client-reactivation",
      name: "Реактивация спящих",
      description: "Спящий клиент + астроповод -> заботливый черновик -> no-contact окно.",
      category: "retention",
      recommendedApprovalMode: "manual_approve",
      requiredCapabilities: ["crm", "astro_calendar", "messaging", "ai_drafts"],
      graph: {
        schemaVersion: "flow-graph.v1",
        nodes: [
          trigger("trigger-astro-event", "astro_event", "Транзит у спящего клиента"),
          ai("personal-reason", "interpretation_draft", "Персональный повод"),
          action("care-message", "send_message", "Черновик заботливого сообщения"),
          condition("client-replied", "reply_received", "Клиент ответил?"),
          action("follow-up-task", "create_task", "Создать задачу follow-up")
        ],
        edges: chain([
          "trigger-astro-event",
          "personal-reason",
          "care-message",
          "client-replied",
          "follow-up-task"
        ])
      }
    },
    {
      key: "post-session-follow-up",
      name: "Post-session follow-up",
      description: "Сессия завершена -> итоги -> отзыв -> связанное предложение.",
      category: "retention",
      recommendedApprovalMode: "manual_approve",
      requiredCapabilities: ["booking", "messaging", "ai_drafts", "products"],
      graph: {
        schemaVersion: "flow-graph.v1",
        nodes: [
          trigger("trigger-session-complete", "review_received", "Сессия завершена"),
          ai("session-summary", "summarize", "Резюме сессии"),
          action("review-request", "send_message", "Черновик запроса отзыва"),
          delay("follow-up-delay", "delay_for", "Пауза 3 дня"),
          action("related-offer", "send_message", "Черновик связанного предложения")
        ],
        edges: chain([
          "trigger-session-complete",
          "session-summary",
          "review-request",
          "follow-up-delay",
          "related-offer"
        ])
      }
    }
  ];
}

function trigger(id: string, kind: FlowTriggerKind, title: string) {
  return {
    id,
    category: "trigger" as const,
    kind,
    title,
    config: {}
  };
}

function action(
  id: string,
  kind: Extract<
    FlowActionKind,
    "send_message" | "request_birth_data" | "calculate_chart" | "deliver_result" | "create_task"
  >,
  title: string
) {
  return {
    id,
    category: "action" as const,
    kind,
    title,
    approvalMode:
      kind === "create_task" || kind === "calculate_chart"
        ? ("auto_internal" as const)
        : ("manual_approve" as const),
    config: {}
  };
}

function ai(
  id: string,
  kind: Extract<FlowAiKind, "summarize" | "score" | "interpretation_draft">,
  title: string
) {
  return {
    id,
    category: "ai" as const,
    kind,
    title,
    approvalMode: "manual_approve" as const,
    config: {}
  };
}

function condition(
  id: string,
  kind: Extract<FlowConditionKind, "if_else" | "reply_received" | "data_available">,
  title: string
) {
  return {
    id,
    category: "condition" as const,
    kind,
    title,
    config: {}
  };
}

function delay(id: string, kind: Extract<FlowDelayKind, "delay_for">, title: string) {
  return {
    id,
    category: "delay" as const,
    kind,
    title,
    config: {}
  };
}

function handoff(id: string, kind: Extract<FlowHandoffKind, "approval">, title: string) {
  return {
    id,
    category: "handoff" as const,
    kind,
    title,
    approvalMode: "manual_approve" as const,
    config: {}
  };
}

function chain(nodeIds: string[]) {
  const edges: Array<{ id: string; fromNodeId: string; toNodeId: string }> = [];
  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    edges.push({
      id: `edge-${index + 1}`,
      fromNodeId: nodeIds[index]!,
      toNodeId: nodeIds[index + 1]!
    });
  }
  return edges;
}
