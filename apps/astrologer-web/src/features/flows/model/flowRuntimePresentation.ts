import type { FlowResponse, FlowRuntimeAvailability } from "@elevenhouse/contracts";

export const flowRuntimeExecutionUnavailableMessageRu =
  "Исполнение воронки пока недоступно. Сценарий можно редактировать и публиковать.";

export const flowApprovalDecisionUnavailableMessageRu =
  "Архивные подтверждения доступны только для просмотра; решения по ним не выполняются.";

export const flowApprovalMixedHistoryMessageRu =
  "Подтверждения из переходной истории доступны только для просмотра.";

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
  runtimeAvailability: FlowRuntimeAvailability | null | undefined
): FlowRuntimePresentation {
  if (!runtimeAvailability) {
    return {
      executionAvailable: false,
      historyIsLegacyPreview: false,
      historySemantics: "unverified",
      unavailableReason: "Доступность исполнения этой версии не подтверждена сервером."
    };
  }

  const executionAvailable = runtimeAvailability.executionAvailable === true;

  return {
    executionAvailable,
    historyIsLegacyPreview: runtimeAvailability.historySemantics === "legacy_preview",
    historySemantics: runtimeAvailability.historySemantics,
    unavailableReason: executionAvailable ? null : flowRuntimeExecutionUnavailableMessageRu
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
  flow: FlowResponse,
  runtimeAvailability: FlowRuntimeAvailability | null | undefined
): FlowAutomationControlPresentation {
  const runtime = buildFlowRuntimePresentation(runtimeAvailability);
  const checked = flow.status === "active";

  if (checked && !runtime.executionAvailable) {
    return {
      checked,
      canToggle: true,
      nextActive: false,
      accessibleLabel:
        "Исполнение отключено; сохраненную активацию можно поставить на паузу",
      title: `${runtime.unavailableReason ?? "Исполнение воронки недоступно"} Поставить сохраненный статус на паузу.`,
      statusLabel: "Исполнение отключено"
    };
  }

  if (checked) {
    return {
      checked,
      canToggle: true,
      nextActive: false,
      accessibleLabel: "Автоматизация активна",
      title: "Поставить автоматизацию на паузу",
      statusLabel: null
    };
  }

  const canActivateFromStatus =
    flow.publishedVersionId !== null && (flow.status === "published" || flow.status === "paused");

  if (canActivateFromStatus && !runtime.executionAvailable) {
    return {
      checked,
      canToggle: false,
      nextActive: true,
      accessibleLabel: "Исполнение этой версии воронки недоступно",
      title: runtime.unavailableReason ?? "Исполнение воронки недоступно",
      statusLabel: null
    };
  }

  return {
    checked,
    canToggle: canActivateFromStatus && runtime.executionAvailable,
    nextActive: true,
    accessibleLabel: canActivateFromStatus
      ? "Включить автоматизацию"
      : "Автоматизация не запущена",
    title: canActivateFromStatus ? "Включить автоматизацию" : "Сначала опубликуйте воронку",
    statusLabel: null
  };
}
