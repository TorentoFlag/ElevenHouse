import type {
  FlowRunResponse,
  FlowRunStatus,
  FlowRuntimeAvailability,
  SimulateFlowRunResponse
} from "@elevenhouse/contracts";
import { buildFlowRuntimePresentation } from "../model/flowRuntimePresentation";

export type FlowRuntimePanelProps = {
  readonly runs: readonly FlowRunResponse[];
  readonly simulation: SimulateFlowRunResponse | null;
  readonly runtimeAvailability?: FlowRuntimeAvailability | null;
  readonly onSimulate?: () => void;
  readonly onCreateManualRun?: () => void;
  readonly isLoadingRuns?: boolean;
  readonly isSimulating?: boolean;
  readonly isCreatingManualRun?: boolean;
  readonly error?: Error | null;
  readonly unavailableReason?: string | null;
  readonly classNames?: Readonly<Record<string, string>>;
};

const runStatusLabel = {
  pending: "Ожидает",
  running: "Выполняется",
  waiting: "Ждет условия",
  approval_required: "Ожидает подтверждения",
  completed: "Завершен",
  skipped: "Пропущен",
  failed_retryable: "Ошибка с повтором",
  failed_terminal: "Ошибка",
  suppressed: "Подавлен",
  expired: "Истек",
  canceled: "Отменен"
} satisfies Record<FlowRunStatus, string>;

const simulationStatusLabel = {
  planned: "Запланирован",
  approval_required: "Ожидает подтверждения",
  blocked: "Заблокирован"
} as const;

export function FlowRuntimePanel({
  runs,
  simulation,
  runtimeAvailability = null,
  onSimulate,
  onCreateManualRun,
  isLoadingRuns = false,
  isSimulating = false,
  isCreatingManualRun = false,
  error = null,
  unavailableReason = null,
  classNames
}: FlowRuntimePanelProps) {
  const className = (name: string) => classNames?.[name] ?? "";
  const runtime = buildFlowRuntimePresentation(runtimeAvailability);
  const commandUnavailableReason = unavailableReason ?? runtime.unavailableReason;
  const canRunCommands = runtime.executionAvailable;
  const unverifiedHistory = runtimeHistoryPresentation(runtime.historySemantics);

  return (
    <section className={className("runtimePanel")} aria-label="Запуски воронки">
      <header className={className("runtimePanelHeader")}>
        <div>
          <p className={className("runtimeEyebrow")}>Runtime</p>
          <h2>Тестовый прогон</h2>
        </div>
        <div className={className("runtimeActions")}>
          <button
            type="button"
            onClick={() => {
              if (canRunCommands) onSimulate?.();
            }}
            disabled={!canRunCommands || !onSimulate || isSimulating}
          >
            {isSimulating ? "Проверяем" : "Тестовый прогон"}
          </button>
          {onCreateManualRun ? (
            <button
              type="button"
              onClick={() => {
                if (canRunCommands) onCreateManualRun();
              }}
              disabled={!canRunCommands || isCreatingManualRun}
            >
              {isCreatingManualRun ? "Создаем" : "Создать запуск"}
            </button>
          ) : null}
        </div>
      </header>

      {commandUnavailableReason ? (
        <p className={className("runtimeNotice")} role="status">{commandUnavailableReason}</p>
      ) : null}

      {!unavailableReason && error ? (
        <p className={className("runtimeError")} role="alert">{error.message}</p>
      ) : null}

      {canRunCommands && simulation ? (
        <div className={className("runtimeBlock")}>
          <h3>План выполнения</h3>
          <ol className={className("runtimeStepList")}>
            {simulation.plannedSteps.map((step) => (
              <li key={step.nodeId}>
                <span>{step.nodeId}</span>
                <strong>{simulationStatusLabel[step.status]}</strong>
                {step.reason ? <em>{step.reason}</em> : null}
              </li>
            ))}
          </ol>
          {simulation.warnings.length > 0 ? (
            <ul className={className("runtimeWarnings")}>
              {simulation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className={className("runtimeBlock")}>
        <h3>История запусков</h3>
        {isLoadingRuns ? (
          <p className={className("runtimeEmpty")}>Загружаем запуски</p>
        ) : runs.length === 0 ? (
          <p className={className("runtimeEmpty")}>Запусков пока нет</p>
        ) : (
          <ul className={className("runtimeRunList")}>
            {runs.map((run) => {
              const reason = runtimeReason(run);

              return (
                <li key={run.id}>
                  <span>
                    {unverifiedHistory?.label ?? runStatusLabel[run.status]}
                  </span>
                  <strong>{run.sourceEventId}</strong>
                  <small>{formatRuntimeDate(run.updatedAt)}</small>
                  {unverifiedHistory ? <em>{unverifiedHistory.notice}</em> : null}
                  {reason ? <em>{reason}</em> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function runtimeHistoryPresentation(
  semantics: FlowRuntimeAvailability["historySemantics"] | "unverified"
): { readonly label: string; readonly notice: string } | null {
  if (semantics === "durable_execution") return null;
  if (semantics === "legacy_preview") {
    return {
      label: "Архивный предпросмотр",
      notice: "Фактическое выполнение действий не подтверждено."
    };
  }
  if (semantics === "mixed") {
    return {
      label: "Переходная история",
      notice: "Тип исполнения запуска не подтвержден."
    };
  }
  return {
    label: "Неподтвержденная история",
    notice: "Источник исполнения не подтвержден сервером."
  };
}

function runtimeReason(run: FlowRunResponse): string | null {
  const payloadReason = run.snapshot.payload.reason;

  if (typeof payloadReason === "string" && payloadReason.trim()) {
    return payloadReason.trim();
  }

  if (run.status === "suppressed") return "Запуск подавлен правилами воронки";
  if (run.status === "failed_retryable" || run.status === "failed_terminal") return "Требуется проверка";
  return null;
}

function formatRuntimeDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
