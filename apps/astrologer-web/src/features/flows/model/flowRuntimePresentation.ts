import type { FlowDefinitionSummaryV3, FlowRuntimeAvailability } from "@elevenhouse/contracts";

export const flowRuntimeExecutionUnavailableMessageRu =
  "Исполнение воронки пока недоступно. Сценарий можно редактировать и публиковать.";

export type FlowRuntimeLocale = "ru" | "en";

export type FlowRuntimePresentation = {
  readonly executionAvailable: boolean;
  readonly historySemantics: FlowRuntimeAvailability["historySemantics"] | "unverified";
  readonly unavailableReason: string | null;
};

export type FlowAutomationControlPresentation = {
  readonly checked: boolean;
  readonly canToggle: boolean;
  readonly nextAction: "review_activation" | "pause_enrollment" | "none";
  readonly accessibleLabel: string;
  readonly title: string;
  readonly statusLabel: string | null;
};

export function buildFlowRuntimePresentation(
  runtimeAvailability: FlowRuntimeAvailability | null | undefined,
  locale: FlowRuntimeLocale = "ru"
): FlowRuntimePresentation {
  const copy = runtimeCopy[locale];
  if (!runtimeAvailability) {
    return {
      executionAvailable: false,
      historySemantics: "unverified",
      unavailableReason: copy.unverified
    };
  }

  const executionAvailable = runtimeAvailability.executionAvailable === true;

  return {
    executionAvailable,
    historySemantics: runtimeAvailability.historySemantics,
    unavailableReason: executionAvailable ? null : copy.unavailable
  };
}

export function canProjectLiveFlowRuntime(
  runtimeAvailability: FlowRuntimeAvailability | null | undefined
): boolean {
  return (
    runtimeAvailability?.executionAvailable === true &&
    runtimeAvailability.historySemantics === "durable_execution"
  );
}

export function buildFlowAutomationControl(
  flow: FlowDefinitionSummaryV3,
  locale: FlowRuntimeLocale = "ru"
): FlowAutomationControlPresentation {
  const copy = runtimeCopy[locale];
  const enrollment = flow.enrollment.control;
  if (enrollment.state === "active") {
    const anotherVersionIsActive = enrollment.activeVersionId !== flow.latestPublishedVersionId;
    return {
      checked: true,
      canToggle: true,
      nextAction: "pause_enrollment",
      accessibleLabel: copy.activeLabel,
      title: copy.pauseTitle,
      statusLabel: anotherVersionIsActive ? copy.otherVersionActive : copy.active
    };
  }

  if (flow.state === "archived") {
    return {
      checked: false,
      canToggle: false,
      nextAction: "none",
      accessibleLabel: copy.archivedLabel,
      title: copy.archivedLabel,
      statusLabel: null
    };
  }

  const hasPublishedVersion = flow.latestPublishedVersionId !== null;
  return {
    checked: false,
    canToggle: hasPublishedVersion,
    nextAction: hasPublishedVersion ? "review_activation" : "none",
    accessibleLabel: hasPublishedVersion ? copy.reviewActivationLabel : copy.publishFirstTitle,
    title: hasPublishedVersion ? copy.reviewActivationTitle : copy.publishFirstTitle,
    statusLabel: null
  };
}

const runtimeCopy = {
  ru: {
    unverified: "Доступность исполнения этой версии не подтверждена сервером.",
    unavailable: flowRuntimeExecutionUnavailableMessageRu,
    active: "Активна",
    otherVersionActive: "Активна другая версия",
    activeLabel: "Автоматизация активна",
    pauseTitle: "Поставить автоматизацию на паузу",
    reviewActivationLabel: "Проверить и включить автоматизацию",
    reviewActivationTitle: "Проверить готовность опубликованной версии к запуску",
    publishFirstTitle: "Сначала опубликуйте воронку",
    archivedLabel: "Воронка находится в архиве"
  },
  en: {
    unverified: "Execution availability has not been confirmed by the server.",
    unavailable: "Flow execution is not available yet. You can edit and publish the definition.",
    active: "Active",
    otherVersionActive: "Another version is active",
    activeLabel: "Automation is active",
    pauseTitle: "Pause automation",
    reviewActivationLabel: "Review and enable automation",
    reviewActivationTitle: "Review the published version before activation",
    publishFirstTitle: "Publish the flow first",
    archivedLabel: "The flow is archived"
  }
} as const;
