import type { FlowRunResponse } from "@elevenhouse/contracts";
import { useEffect, useRef, useState } from "react";

import { HttpError } from "../../../common/http/HttpError";
import { useCurrentAstrologerProfileQuery } from "../../astrologer-profile/model/useCurrentAstrologerProfileQuery";
import { useCancelFlowRunMutation } from "../model/useCancelFlowRunMutation";
import { useFlowRunQuery } from "../model/useFlowRunQuery";
import { useFlowRunsQuery } from "../model/useFlowRunsQuery";
import { FlowRunCancelDialog } from "./FlowRunCancelDialog";

export type FlowRunHistoryPanelProps = {
  readonly flowId: string;
  readonly locale: "ru" | "en";
  readonly classNames?: Readonly<Record<string, string>>;
};

const cancellableStatuses = new Set<FlowRunResponse["status"]>([
  "pending",
  "running",
  "waiting",
  "failed_retryable"
]);

export function FlowRunHistoryPanel({ flowId, locale, classNames }: FlowRunHistoryPanelProps) {
  const runsQuery = useFlowRunsQuery(flowId, { status: "all", limit: 20, offset: 0 });
  const profileQuery = useCurrentAstrologerProfileQuery();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FlowRunResponse | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);
  const attempts = useRef(new Map<string, string>());
  const detailQuery = useFlowRunQuery(selectedRunId);
  const cancelMutation = useCancelFlowRunMutation();
  const copy = historyCopy[locale];
  const timeZone = profileQuery.data?.profile?.timezone ?? "UTC";

  useEffect(() => {
    if (!selectedRunId) return;
    if (runsQuery.data?.runs.some((run) => run.id === selectedRunId)) return;
    setSelectedRunId(null);
  }, [runsQuery.data?.runs, selectedRunId]);

  const requestCancel = () => {
    if (!cancelTarget) return;
    const idempotencyKey =
      attempts.current.get(cancelTarget.id) ?? `flows:run:cancel:${crypto.randomUUID()}`;
    attempts.current.set(cancelTarget.id, idempotencyKey);
    cancelMutation.mutate(
      { runId: cancelTarget.id, idempotencyKey },
      {
        onSuccess: () => {
          attempts.current.delete(cancelTarget.id);
          setCancelTarget(null);
        },
        onError: (error) => {
          if (!(error instanceof HttpError) || (error.status !== 404 && error.status !== 409))
            return;
          attempts.current.delete(cancelTarget.id);
          setCancelTarget(null);
          setCancelFeedback(copy.cancelStateChanged);
          void runsQuery.refetch();
          void detailQuery.refetch();
        }
      }
    );
  };

  return (
    <section className={classNames?.runHistory ?? ""} aria-label={copy.heading}>
      <header className={classNames?.runHistoryHeader ?? ""}>
        <div>
          <p className={classNames?.runHistoryEyebrow ?? ""}>{copy.eyebrow}</p>
          <h2>{copy.heading}</h2>
        </div>
        {runsQuery.data ? (
          <span className={classNames?.runHistoryCount ?? ""}>{runsQuery.data.total}</span>
        ) : null}
      </header>

      {runsQuery.isLoading ? (
        <p className={classNames?.runHistoryState ?? ""}>{copy.loading}</p>
      ) : null}
      {runsQuery.isError ? (
        <div className={classNames?.runHistoryError ?? ""} role="alert">
          <p>{copy.error}</p>
          <button type="button" onClick={() => void runsQuery.refetch()}>
            {copy.retry}
          </button>
        </div>
      ) : null}
      {cancelFeedback ? (
        <p className={classNames?.runHistoryError ?? ""} role="status">
          {cancelFeedback}
        </p>
      ) : null}
      {!runsQuery.isLoading && !runsQuery.isError && runsQuery.data?.runs.length === 0 ? (
        <p className={classNames?.runHistoryState ?? ""}>{copy.empty}</p>
      ) : null}
      {runsQuery.data?.runs.length ? (
        <ul className={classNames?.runHistoryList ?? ""} aria-label={copy.list}>
          {runsQuery.data.runs.map((run) => (
            <li key={run.id}>
              <button
                className={classNames?.runHistoryRow ?? ""}
                type="button"
                aria-pressed={selectedRunId === run.id}
                onClick={() => setSelectedRunId(run.id)}
              >
                <span>
                  <strong>{statusLabel(run.status, locale)}</strong>
                  <small>{formatInstant(run.updatedAt, locale, timeZone)}</small>
                </span>
                <span className={classNames?.runHistoryNode ?? ""}>
                  {run.currentNodeId ?? copy.finished}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selectedRunId ? (
        <section
          className={classNames?.runTrace ?? ""}
          aria-label={copy.trace}
          aria-busy={detailQuery.isLoading}
        >
          <header className={classNames?.runTraceHeader ?? ""}>
            <h3>{copy.trace}</h3>
            {detailQuery.data && cancellableStatuses.has(detailQuery.data.run.status) ? (
              <button
                className={classNames?.runCancelButton ?? ""}
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => {
                  cancelMutation.reset();
                  setCancelFeedback(null);
                  setCancelTarget(detailQuery.data!.run);
                }}
              >
                {copy.cancel}
              </button>
            ) : null}
          </header>
          {detailQuery.isLoading ? (
            <p className={classNames?.runHistoryState ?? ""}>{copy.loadingTrace}</p>
          ) : null}
          {detailQuery.isError ? (
            <div className={classNames?.runHistoryError ?? ""} role="alert">
              <p>{copy.traceError}</p>
              <button type="button" onClick={() => void detailQuery.refetch()}>
                {copy.retry}
              </button>
            </div>
          ) : null}
          {detailQuery.data ? (
            <ol className={classNames?.runTraceList ?? ""}>
              {detailQuery.data.trace.map((event) => (
                <li key={event.sequence}>
                  <span className={classNames?.runTraceSequence ?? ""}>{event.sequence}</span>
                  <div>
                    <strong>{traceEventLabel(event.eventType, locale, event.summary)}</strong>
                    <small>{event.nodeId ?? copy.runLevel}</small>
                    <time dateTime={event.occurredAt}>
                      {formatInstant(event.occurredAt, locale, timeZone)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      <FlowRunCancelDialog
        open={cancelTarget !== null}
        locale={locale}
        pending={cancelMutation.isPending}
        error={cancelMutation.error instanceof Error ? cancelMutation.error : null}
        onClose={() => {
          if (!cancelMutation.isPending) setCancelTarget(null);
        }}
        onConfirm={requestCancel}
      />
    </section>
  );
}

function formatInstant(value: string, locale: "ru" | "en", timeZone: string): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone
  }).format(new Date(value));
}

function statusLabel(status: FlowRunResponse["status"], locale: "ru" | "en"): string {
  return statusCopy[locale][status];
}

function traceEventLabel(
  eventType: string,
  locale: "ru" | "en",
  summary: Readonly<Record<string, unknown>>
): string {
  if (eventType === "token_advanced" && typeof summary.sourceHandle === "string") {
    const branch =
      traceBranchCopy[locale][summary.sourceHandle as keyof (typeof traceBranchCopy)["ru"]];
    if (branch) {
      return locale === "ru"
        ? `Шаг направлен по ветке «${branch}»`
        : `Step routed through the ${branch} branch`;
    }
  }

  return (
    (traceCopy[locale] as Readonly<Record<string, string>>)[eventType] ??
    eventType.replaceAll("_", " ")
  );
}

const historyCopy = {
  ru: {
    eyebrow: "Исполнение",
    heading: "Запуски",
    loading: "Загружаем запуски…",
    error: "Не удалось загрузить запуски.",
    retry: "Повторить",
    empty: "У этой воронки ещё не было запусков.",
    list: "Запуски воронки",
    finished: "завершён",
    trace: "Ход запуска",
    loadingTrace: "Загружаем журнал…",
    traceError: "Не удалось загрузить журнал запуска.",
    runLevel: "событие запуска",
    cancel: "Отменить запуск",
    cancelStateChanged: "Состояние запуска изменилось. Журнал обновлён."
  },
  en: {
    eyebrow: "Execution",
    heading: "Runs",
    loading: "Loading runs…",
    error: "Could not load runs.",
    retry: "Retry",
    empty: "This flow has not run yet.",
    list: "Flow runs",
    finished: "finished",
    trace: "Run trace",
    loadingTrace: "Loading journal…",
    traceError: "Could not load the run journal.",
    runLevel: "run event",
    cancel: "Cancel run",
    cancelStateChanged: "The run changed state. Its journal has been refreshed."
  }
} as const;

const statusCopy = {
  ru: {
    pending: "Ожидает",
    running: "Выполняется",
    waiting: "Ожидает",
    approval_required: "Нужно подтверждение",
    completed: "Завершён",
    skipped: "Пропущен",
    failed_retryable: "Повторяется",
    failed_terminal: "Ошибка",
    suppressed: "Подавлен",
    expired: "Истёк",
    canceled: "Отменён"
  },
  en: {
    pending: "Pending",
    running: "Running",
    waiting: "Waiting",
    approval_required: "Approval required",
    completed: "Completed",
    skipped: "Skipped",
    failed_retryable: "Retrying",
    failed_terminal: "Failed",
    suppressed: "Suppressed",
    expired: "Expired",
    canceled: "Canceled"
  }
} as const;

const traceCopy = {
  ru: {
    run_enrolled: "Запуск создан",
    token_waiting: "Ожидание шага",
    token_advanced: "Шаг выполнен",
    token_signaled: "Получен сигнал",
    work_item_available: "Создана задача",
    approval_available: "Ожидается подтверждение",
    approval_expired: "Срок подтверждения истёк",
    booking_rescheduled: "Запись перенесена",
    token_retry_scheduled: "Запланирован повтор",
    token_lease_expired: "Истекло время обработки",
    run_completed: "Запуск завершён",
    run_failed: "Запуск завершился ошибкой",
    run_suppressed: "Запуск подавлен",
    run_canceled: "Запуск отменён"
  },
  en: {
    run_enrolled: "Run enrolled",
    token_waiting: "Waiting for step",
    token_advanced: "Step advanced",
    token_signaled: "Signal received",
    work_item_available: "Task created",
    approval_available: "Approval required",
    approval_expired: "Approval expired",
    booking_rescheduled: "Booking rescheduled",
    token_retry_scheduled: "Retry scheduled",
    token_lease_expired: "Processing lease expired",
    run_completed: "Run completed",
    run_failed: "Run failed",
    run_suppressed: "Run suppressed",
    run_canceled: "Run canceled"
  }
} as const;

const traceBranchCopy = {
  ru: {
    true: "Да",
    false: "Нет",
    success: "Успех",
    error: "Ошибка",
    approved: "Подтверждено",
    rejected: "Отклонено",
    timeout: "Срок истёк"
  },
  en: {
    true: "Yes",
    false: "No",
    success: "Success",
    error: "Error",
    approved: "Approved",
    rejected: "Rejected",
    timeout: "Timed out"
  }
} as const;
