import type { FlowDefinitionSummaryV2, FlowRuntimeAvailability } from "@elevenhouse/contracts";

export const flowRuntimeExecutionUnavailableMessageRu =
  "Исполнение воронки пока недоступно. Сценарий можно редактировать и публиковать.";

export const flowApprovalDecisionUnavailableMessageRu =
  "Архивные подтверждения доступны только для просмотра; решения по ним не выполняются.";

export const flowApprovalMixedHistoryMessageRu =
  "Подтверждения из переходной истории доступны только для просмотра.";

export type FlowRuntimeLocale = "ru" | "en";

export type FlowRuntimePresentation = {
  readonly executionAvailable: boolean;
  readonly historyIsLegacyPreview: boolean;
  readonly historySemantics: FlowRuntimeAvailability["historySemantics"] | "unverified";
  readonly unavailableReason: string | null;
};

export type FlowAutomationControlPresentation = {
  readonly checked: boolean;
  readonly canToggle: boolean;
  readonly nextActive: boolean;
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
      historyIsLegacyPreview: false,
      historySemantics: "unverified",
      unavailableReason: copy.unverified
    };
  }

  const executionAvailable = runtimeAvailability.executionAvailable === true;

  return {
    executionAvailable,
    historyIsLegacyPreview: runtimeAvailability.historySemantics === "legacy_preview",
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
  flow: Pick<FlowDefinitionSummaryV2, "runtimeStatus" | "latestPublishedVersionId">,
  runtimeAvailability: FlowRuntimeAvailability | null | undefined,
  locale: FlowRuntimeLocale = "ru"
): FlowAutomationControlPresentation {
  const copy = runtimeCopy[locale];
  const runtime = buildFlowRuntimePresentation(runtimeAvailability, locale);
  const checked = flow.runtimeStatus === "active";

  if (checked && !runtime.executionAvailable) {
    return {
      checked,
      canToggle: true,
      nextActive: false,
      accessibleLabel: copy.persistedActiveLabel,
      title: `${runtime.unavailableReason ?? copy.unavailableShort} ${copy.pausePersistedTitle}`,
      statusLabel: copy.executionDisabled
    };
  }

  if (checked) {
    return {
      checked,
      canToggle: true,
      nextActive: false,
      accessibleLabel: copy.activeLabel,
      title: copy.pauseTitle,
      statusLabel: null
    };
  }

  const canActivateFromStatus =
    flow.latestPublishedVersionId !== null &&
    (flow.runtimeStatus === "published" || flow.runtimeStatus === "paused");

  if (canActivateFromStatus && !runtime.executionAvailable) {
    return {
      checked,
      canToggle: false,
      nextActive: true,
      accessibleLabel: copy.versionUnavailableLabel,
      title: runtime.unavailableReason ?? copy.unavailableShort,
      statusLabel: null
    };
  }

  return {
    checked,
    canToggle: canActivateFromStatus && runtime.executionAvailable,
    nextActive: true,
    accessibleLabel: canActivateFromStatus ? copy.activateLabel : copy.notStartedLabel,
    title: canActivateFromStatus ? copy.activateTitle : copy.publishFirstTitle,
    statusLabel: null
  };
}

const runtimeCopy = {
  ru: {
    unverified: "Доступность исполнения этой версии не подтверждена сервером.",
    unavailable: flowRuntimeExecutionUnavailableMessageRu,
    unavailableShort: "Исполнение воронки недоступно.",
    persistedActiveLabel: "Исполнение отключено; сохраненную активацию можно поставить на паузу",
    pausePersistedTitle: "Поставить сохраненный статус на паузу.",
    executionDisabled: "Исполнение недоступно",
    activeLabel: "Автоматизация активна",
    pauseTitle: "Поставить автоматизацию на паузу",
    versionUnavailableLabel: "Исполнение этой версии воронки недоступно",
    activateLabel: "Включить автоматизацию",
    notStartedLabel: "Автоматизация не запущена",
    activateTitle: "Включить автоматизацию",
    publishFirstTitle: "Сначала опубликуйте воронку"
  },
  en: {
    unverified: "Execution availability has not been confirmed by the server.",
    unavailable: "Flow execution is not available yet. You can edit and publish the definition.",
    unavailableShort: "Flow execution is unavailable.",
    persistedActiveLabel: "Execution is disabled; the persisted active state can be paused",
    pausePersistedTitle: "Pause the persisted active state.",
    executionDisabled: "Execution unavailable",
    activeLabel: "Automation is active",
    pauseTitle: "Pause automation",
    versionUnavailableLabel: "Execution is unavailable for this flow version",
    activateLabel: "Enable automation",
    notStartedLabel: "Automation has not started",
    activateTitle: "Enable automation",
    publishFirstTitle: "Publish the flow first"
  }
} as const;
