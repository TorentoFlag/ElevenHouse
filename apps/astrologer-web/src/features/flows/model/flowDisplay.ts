import type {
  FlowApprovalMode,
  FlowDefinitionState,
  FlowDefinitionSummaryV3,
  FlowNodeKindV2,
  FlowSourceHandleV2
} from "@elevenhouse/contracts";

export type FlowDisplayLocale = "ru" | "en";

export function flowDefinitionStateLabel(
  state: FlowDefinitionState,
  locale: FlowDisplayLocale
): string {
  return definitionStateLabels[locale][state];
}

export function flowAutomationStateLabel(
  flow: FlowDefinitionSummaryV3,
  locale: FlowDisplayLocale
): string {
  const labels = automationStateLabels[locale];
  const enrollment = flow.enrollment.control;
  if (enrollment.state === "active") {
    return enrollment.activeVersionId === flow.latestPublishedVersionId
      ? labels.active
      : labels.otherVersionActive;
  }
  if (enrollment.state === "paused") return labels.paused;
  if (flow.state === "archived") return labels.archived;
  return flow.latestPublishedVersionId === null ? labels.notPublished : labels.notRunning;
}

export function flowApprovalModeLabel(mode: FlowApprovalMode, locale: FlowDisplayLocale): string {
  return approvalModeLabels[locale][mode];
}

export function flowNodeKindLabel(kind: FlowNodeKindV2, locale: FlowDisplayLocale): string {
  return nodeKindLabels[locale][kind];
}

export function flowSourceHandleLabel(
  handle: FlowSourceHandleV2,
  locale: FlowDisplayLocale
): string {
  return sourceHandleLabels[locale][handle];
}

export type FlowDefinitionGallerySummary = {
  readonly total: number;
  readonly editableDrafts: number;
  readonly versioned: number;
  readonly archived: number;
  readonly active: number;
  readonly paused: number;
};

export function summarizeFlowDefinitions(
  flows: readonly FlowDefinitionSummaryV3[]
): FlowDefinitionGallerySummary {
  return flows.reduce<FlowDefinitionGallerySummary>(
    (summary, flow) => ({
      total: summary.total + 1,
      editableDrafts: summary.editableDrafts + (flow.state === "draft" ? 1 : 0),
      versioned: summary.versioned + (flow.state === "versioned" ? 1 : 0),
      archived: summary.archived + (flow.state === "archived" ? 1 : 0),
      active: summary.active + (flow.enrollment.control.state === "active" ? 1 : 0),
      paused: summary.paused + (flow.enrollment.control.state === "paused" ? 1 : 0)
    }),
    { total: 0, editableDrafts: 0, versioned: 0, archived: 0, active: 0, paused: 0 }
  );
}

const definitionStateLabels = {
  ru: { draft: "Черновик", versioned: "Опубликована", archived: "В архиве" },
  en: { draft: "Draft", versioned: "Published", archived: "Archived" }
} satisfies Record<FlowDisplayLocale, Record<FlowDefinitionState, string>>;

const automationStateLabels = {
  ru: {
    notPublished: "Не опубликована",
    notRunning: "Не запущена",
    active: "Активна",
    otherVersionActive: "Активна другая версия",
    paused: "На паузе",
    archived: "В архиве"
  },
  en: {
    notPublished: "Not published",
    notRunning: "Not running",
    active: "Active",
    otherVersionActive: "Another version is active",
    paused: "Paused",
    archived: "Archived"
  }
} as const;

const approvalModeLabels = {
  ru: {
    draft_only: "Только черновик",
    manual_approve: "С подтверждением",
    auto_internal: "Автоматически внутри",
    auto_send: "Автодоставка настроена"
  },
  en: {
    draft_only: "Draft only",
    manual_approve: "Approval required",
    auto_internal: "Automatic internal actions",
    auto_send: "Automatic delivery configured"
  }
} satisfies Record<FlowDisplayLocale, Record<FlowApprovalMode, string>>;

const nodeKindLabels = {
  ru: {
    booking_confirmed: "Запись подтверждена",
    manual_client: "Ручной запуск",
    birth_data_available: "Данные рождения",
    natal_chart_request: "Расчёт натальной карты",
    astrologer_work_item: "Задача астрологу",
    astrologer_approval: "Решение астролога",
    completed: "Завершено",
    suppressed: "Подавлено",
    failed: "Ошибка"
  },
  en: {
    booking_confirmed: "Booking confirmed",
    manual_client: "Manual start",
    birth_data_available: "Birth data",
    natal_chart_request: "Natal chart calculation",
    astrologer_work_item: "Astrologer task",
    astrologer_approval: "Astrologer approval",
    completed: "Completed",
    suppressed: "Suppressed",
    failed: "Failed"
  }
} satisfies Record<FlowDisplayLocale, Record<FlowNodeKindV2, string>>;

const sourceHandleLabels = {
  ru: {
    next: "Далее",
    true: "Да",
    false: "Нет",
    success: "Выполнено",
    error: "Ошибка",
    timeout: "Срок истёк",
    approved: "Подтверждено",
    rejected: "Отклонено"
  },
  en: {
    next: "Next",
    true: "Yes",
    false: "No",
    success: "Completed",
    error: "Error",
    timeout: "Timed out",
    approved: "Approved",
    rejected: "Rejected"
  }
} satisfies Record<FlowDisplayLocale, Record<FlowSourceHandleV2, string>>;
