import type { FlowDefinitionSummary, FlowNodeKindV2 } from "@elevenhouse/contracts";
import type { IconProps } from "@elevenhouse/design-system/icons/Icon";
import {
  flowAutomationStateLabel,
  flowDefinitionStateLabel,
  type FlowDisplayLocale
} from "../model/flowDisplay";

export type FlowGalleryCardModel = {
  readonly id: string;
  readonly title: string;
  readonly definitionStateLabel: string;
  readonly automationStatusLabel: string;
  readonly automationControlLabel: string;
  readonly approvalModeLabel: string;
  readonly graphSchemaLabel: string;
  readonly graphNodeKinds: readonly FlowNodeKindV2[];
  readonly graphSummary: string | null;
  readonly originLabel: string;
  readonly revisionLabel: string;
  readonly publishedVersionLabel: string;
  readonly updatedAtLabel: string;
  readonly draftChangesLabel: string;
  readonly activeRunCountLabel: string;
};

export type FlowVisualTone =
  | "trigger"
  | "communication"
  | "chartAi"
  | "logic"
  | "human"
  | "result"
  | "error";

export type FlowNodeVisual = {
  readonly iconName: IconProps["iconName"];
  readonly label: string;
  readonly tone: FlowVisualTone;
};

export function buildFlowGalleryCard(
  flow: FlowDefinitionSummary,
  locale: FlowDisplayLocale
): FlowGalleryCardModel {
  return {
    id: flow.id,
    title: flow.name,
    definitionStateLabel: userFacingLifecycleStateLabel(flow, locale),
    automationStatusLabel: flowAutomationStateLabel(flow, locale),
    automationControlLabel: compactAutomationControlLabel(flow, locale),
    approvalModeLabel: compactApprovalModeLabel(flow.approvalMode, locale),
    graphSchemaLabel: locale === "ru" ? "Схема V2" : "V2 graph",
    graphNodeKinds: flow.graphNodeKinds ?? [],
    graphSummary: summarizeGraph(flow.graphNodeKinds ?? [], locale),
    originLabel: originLabel(flow, locale),
    revisionLabel: locale === "ru" ? `Редакция ${flow.revision}` : `Revision ${flow.revision}`,
    publishedVersionLabel:
      flow.latestPublishedVersion === null
        ? locale === "ru"
          ? "Не опубликована"
          : "Not published"
        : locale === "ru"
          ? `Версия ${flow.latestPublishedVersion}`
          : `Version ${flow.latestPublishedVersion}`,
    updatedAtLabel: updatedAtLabel(flow.updatedAt, locale),
    draftChangesLabel: draftChangesLabel(flow, locale),
    activeRunCountLabel:
      locale === "ru"
        ? `Клиентов внутри: ${flow.activeRunCount}`
        : `Clients inside: ${flow.activeRunCount}`
  };
}

function userFacingLifecycleStateLabel(
  flow: FlowDefinitionSummary,
  locale: FlowDisplayLocale
): string {
  const ru = locale === "ru";
  if (flow.state === "versioned") {
    if (flow.enrollment.control.state === "active") {
      return ru ? "Активна" : "Active";
    }
    return ru ? "Отключена" : "Disabled";
  }
  return flowDefinitionStateLabel(flow.state, locale);
}

function compactAutomationControlLabel(
  flow: FlowDefinitionSummary,
  locale: FlowDisplayLocale
): string {
  const ru = locale === "ru";
  if (flow.enrollment.control.state === "active") {
    return flow.enrollment.control.activeVersionId === flow.latestPublishedVersionId
      ? ru
        ? "Активна"
        : "Active"
      : ru
        ? "Другая"
        : "Other";
  }
  if (flow.state === "archived") return ru ? "Архив" : "Archived";
  if (flow.latestPublishedVersionId !== null) return ru ? "Выкл." : "Off";
  return ru ? "Черновик" : "Draft";
}

function compactApprovalModeLabel(
  mode: FlowDefinitionSummary["approvalMode"],
  locale: FlowDisplayLocale
): string {
  const labels = {
    draft_only: ["Черновик", "Draft"],
    manual_approve: ["Ручное", "Manual"],
    auto_internal: ["Авто", "Auto"],
    auto_send: ["Автодоставка", "Auto-send"]
  } as const satisfies Record<
    FlowDefinitionSummary["approvalMode"],
    readonly [string, string]
  >;
  return labels[mode][locale === "ru" ? 0 : 1];
}

function summarizeGraph(
  nodeKinds: readonly FlowNodeKindV2[],
  locale: FlowDisplayLocale
): string | null {
  const labels = nodeKinds
    .filter((kind) => kind !== "completed" && kind !== "suppressed" && kind !== "failed")
    .slice(0, 3)
    .map((kind) => graphNodeLabel(kind, locale));
  if (labels.length === 0) return null;
  return locale === "ru" ? `Узлы: ${labels.join(" · ")}` : `Nodes: ${labels.join(" · ")}`;
}

function graphNodeLabel(kind: FlowNodeKindV2, locale: FlowDisplayLocale): string {
  return getFlowNodeVisual(kind, locale).label;
}

function originLabel(flow: FlowDefinitionSummary, locale: FlowDisplayLocale): string {
  if (flow.origin.type === "template") return locale === "ru" ? "Из шаблона" : "From template";
  return locale === "ru" ? "С нуля" : "Blank";
}

function updatedAtLabel(value: string, locale: FlowDisplayLocale): string {
  const formatted = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
  return locale === "ru" ? `Изменена ${formatted}` : `Updated ${formatted}`;
}

function draftChangesLabel(flow: FlowDefinitionSummary, locale: FlowDisplayLocale): string {
  const ru = locale === "ru";
  if (flow.state === "draft" && flow.draftBaseVersionId !== null) {
    return ru ? "Есть правки" : "Unpublished changes";
  }
  if (flow.state === "draft") return ru ? "Черновик" : "Draft";
  return ru ? "Без черновых правок" : "No draft changes";
}

export function getFlowNodeVisual(
  kind: FlowNodeKindV2,
  locale: FlowDisplayLocale
): FlowNodeVisual {
  const visual = flowNodeVisualByKind[kind];
  return {
    iconName: visual.iconName,
    label: visual.labels[locale === "ru" ? 0 : 1],
    tone: visual.tone
  };
}

const flowNodeVisualByKind = {
  booking_confirmed: {
    iconName: "calendar",
    labels: ["Запись подтверждена", "Booking confirmed"],
    tone: "trigger"
  },
  manual_client: {
    iconName: "users",
    labels: ["Клиент выбран", "Client selected"],
    tone: "trigger"
  },
  product_purchased: {
    iconName: "gift",
    labels: ["Куплен продукт", "Product purchased"],
    tone: "trigger"
  },
  first_inbound_message: {
    iconName: "chat",
    labels: ["Первое сообщение", "First message"],
    tone: "trigger"
  },
  client_lifecycle_changed: {
    iconName: "users",
    labels: ["Статус клиента", "Client status"],
    tone: "trigger"
  },
  birth_data_available: {
    iconName: "doc",
    labels: ["Данные рождения", "Birth data"],
    tone: "logic"
  },
  natal_chart_request: {
    iconName: "orbit",
    labels: ["Натальная карта", "Natal chart"],
    tone: "chartAi"
  },
  natal_chart_ai_draft: {
    iconName: "sparkle",
    labels: ["AI-черновик", "AI draft"],
    tone: "chartAi"
  },
  send_message: {
    iconName: "chat",
    labels: ["Сообщение", "Message"],
    tone: "communication"
  },
  astrologer_work_item: {
    iconName: "doc",
    labels: ["Задача астрологу", "Astrologer task"],
    tone: "human"
  },
  astrologer_approval: {
    iconName: "check",
    labels: ["Подтверждение", "Approval"],
    tone: "human"
  },
  completed: {
    iconName: "check",
    labels: ["Завершено", "Completed"],
    tone: "result"
  },
  suppressed: {
    iconName: "dots",
    labels: ["Пропущено", "Suppressed"],
    tone: "result"
  },
  failed: {
    iconName: "close",
    labels: ["Ошибка", "Failed"],
    tone: "error"
  }
} as const satisfies Record<
  FlowNodeKindV2,
  {
    readonly iconName: IconProps["iconName"];
    readonly labels: readonly [string, string];
    readonly tone: FlowVisualTone;
  }
>;
