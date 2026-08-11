import type { FlowDefinitionSummary } from "@elevenhouse/contracts";
import type { FlowNodeKindV2 } from "@elevenhouse/contracts";
import {
  flowApprovalModeLabel,
  flowAutomationStateLabel,
  flowDefinitionStateLabel,
  type FlowDisplayLocale
} from "../model/flowDisplay";

export type FlowGalleryCardModel = {
  readonly id: string;
  readonly title: string;
  readonly definitionStateLabel: string;
  readonly automationStatusLabel: string;
  readonly approvalModeLabel: string;
  readonly graphSchemaLabel: string;
  readonly graphNodeKinds: readonly FlowNodeKindV2[];
  readonly graphSummary: string | null;
  readonly originLabel: string;
  readonly revisionLabel: string;
  readonly publishedVersionLabel: string;
};

export function buildFlowGalleryCard(
  flow: FlowDefinitionSummary,
  locale: FlowDisplayLocale
): FlowGalleryCardModel {
  return {
    id: flow.id,
    title: flow.name,
    definitionStateLabel: flowDefinitionStateLabel(flow.state, locale),
    automationStatusLabel: flowAutomationStateLabel(flow, locale),
    approvalModeLabel: flowApprovalModeLabel(flow.approvalMode, locale),
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
  };
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
  const labels = {
    booking_confirmed: ["Запись подтверждена", "Booking confirmed"],
    manual_client: ["Клиент выбран", "Client selected"],
    birth_data_available: ["Данные рождения", "Birth data"],
    natal_chart_request: ["Натальная карта", "Natal chart"],
    natal_chart_ai_draft: ["AI-черновик", "AI draft"],
    send_message: ["Сообщение", "Message"],
    astrologer_work_item: ["Задача астрологу", "Astrologer task"],
    astrologer_approval: ["Подтверждение", "Approval"],
    completed: ["Завершено", "Completed"],
    suppressed: ["Пропущено", "Suppressed"],
    failed: ["Ошибка", "Failed"]
  } as const satisfies Record<FlowNodeKindV2, readonly [string, string]>;
  return labels[kind][locale === "ru" ? 0 : 1];
}

function originLabel(flow: FlowDefinitionSummary, locale: FlowDisplayLocale): string {
  if (flow.origin.type === "template") return locale === "ru" ? "Из шаблона" : "From template";
  return locale === "ru" ? "С нуля" : "Blank";
}
