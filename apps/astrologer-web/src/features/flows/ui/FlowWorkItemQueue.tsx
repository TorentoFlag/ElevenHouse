import type { FlowWorkItemQueueEntry, ListFlowWorkItemsResponse } from "@elevenhouse/contracts";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useId, type ReactNode } from "react";

import type { FlowWorkItemCommandState } from "../model/flowWorkItemCommandModel";
import { buildFlowWorkItemPresentation } from "../model/flowWorkItemPresentation";
import styles from "./FlowWorkItemQueue.module.css";

export type FlowWorkItemQueueProps = {
  readonly items: ListFlowWorkItemsResponse["items"];
  readonly total: ListFlowWorkItemsResponse["total"];
  readonly asOf: ListFlowWorkItemsResponse["asOf"] | null;
  readonly locale: "ru" | "en";
  readonly timeZone: string;
  readonly isLoading?: boolean;
  readonly isError?: boolean;
  readonly isFetching?: boolean;
  readonly headerAction?: ReactNode;
  readonly commandStateByWorkItemId?: Readonly<
    Record<string, FlowWorkItemCommandState | undefined>
  >;
  readonly onStart: (entry: FlowWorkItemQueueEntry) => void;
  readonly onSnooze: (entry: FlowWorkItemQueueEntry) => void;
  readonly onComplete: (entry: FlowWorkItemQueueEntry) => void;
  readonly onRetry: () => void;
};

export function FlowWorkItemQueue({
  items,
  total,
  asOf,
  locale,
  timeZone,
  isLoading = false,
  isError = false,
  isFetching = false,
  headerAction,
  commandStateByWorkItemId = {},
  onStart,
  onSnooze,
  onComplete,
  onRetry
}: FlowWorkItemQueueProps) {
  const headingId = useId();
  const copy = queueCopy[locale];
  const now = asOf === null ? null : new Date(asOf);

  return (
    <section
      className={styles.root}
      aria-labelledby={headingId}
      aria-busy={isLoading || isFetching}
    >
      <header className={styles.header}>
        <span className={styles.headerIcon} aria-hidden="true">
          <Icon iconName="flow" width={16} height={16} />
        </span>
        <h2 id={headingId} className={styles.heading}>
          {copy.heading}
        </h2>
        <span className={styles.count}>{total}</span>
        {isFetching || headerAction ? (
          <div className={styles.headerTools}>
            {isFetching && !isLoading ? (
              <span className={styles.refreshStatus} role="status" aria-live="polite">
                <Icon iconName="refresh" width={12} height={12} aria-hidden="true" />
                {copy.refreshing}
              </span>
            ) : null}
            {headerAction}
          </div>
        ) : null}
      </header>

      {isLoading ? (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span>{copy.loading}</span>
          <div className={styles.skeletonList} aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className={styles.skeletonRow}
                data-testid="flow-work-item-skeleton"
              >
                <span className={styles.skeletonBadge} />
                <span className={styles.skeletonContent} />
                <span className={styles.skeletonAction} />
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {!isLoading && isError ? (
        <div className={styles.listError} role="alert">
          <span className={styles.errorIcon} aria-hidden="true">
            <Icon iconName="lightning" width={16} height={16} />
          </span>
          <span className={styles.errorCopy}>
            <strong>{copy.errorTitle}</strong>
            <span>{items.length > 0 ? copy.staleDescription : copy.errorDescription}</span>
          </span>
          <Button
            className={styles.retryButton}
            size="small"
            variant="glass"
            title={copy.retry}
            startIcon={<Icon iconName="refresh" width={13} height={13} aria-hidden="true" />}
            disabled={isFetching}
            onClick={onRetry}
          />
        </div>
      ) : null}

      {!isLoading && !isError && items.length === 0 ? (
        <div className={styles.emptyState} role="status">
          <Icon iconName="check" width={24} height={24} aria-hidden="true" />
          <strong>{copy.emptyTitle}</strong>
          <span>{copy.emptyDescription}</span>
        </div>
      ) : null}

      {!isLoading && items.length > 0 ? (
        <ul className={styles.list} aria-label={copy.listLabel}>
          {items.map((entry) => {
            if (now === null) throw new Error("FLOW_WORK_ITEM_QUEUE_AS_OF_REQUIRED");
            const { workItem } = entry;
            const presentation = buildFlowWorkItemPresentation({
              workItem,
              locale,
              timeZone,
              now
            });
            const titleId = `${headingId}-${workItem.id}-title`;
            const commandErrorId = `${headingId}-${workItem.id}-command-error`;
            const commandState = commandStateByWorkItemId[workItem.id];
            const commandPending = commandState?.status === "pending";
            const refetchRequired =
              commandState?.status === "error" && commandState.refetchRequired;
            const availableContext = entry.context.status === "available" ? entry.context : null;
            const contextPending = entry.context.status === "context_pending";
            const contextAvailable = availableContext !== null;
            const commandsDisabled = isError || commandPending || refetchRequired;
            const canStart = contextAvailable && presentation.primaryAction === "start";
            const canComplete = contextAvailable && presentation.primaryAction === "complete";
            const canSnooze =
              contextAvailable &&
              presentation.secondaryAction === "snooze" &&
              (workItem.status === "pending" || workItem.status === "in_progress");
            const hasActions = canStart || canComplete || canSnooze || !contextAvailable;

            return (
              <li key={workItem.id} className={styles.listItem}>
                <article
                  className={styles.row}
                  aria-labelledby={titleId}
                  aria-describedby={commandState?.status === "error" ? commandErrorId : undefined}
                  aria-busy={commandPending || undefined}
                  data-context-status={entry.context.status}
                  data-due-state={presentation.dueState}
                  data-priority={workItem.priority}
                  data-status={workItem.status}
                >
                  <span className={styles.kindBadge}>
                    <Icon iconName="flow" width={12} height={12} aria-hidden="true" />
                    {copy.flow}
                  </span>

                  <div className={styles.content}>
                    <h3 id={titleId} className={styles.title}>
                      {workItem.title}
                    </h3>
                    {availableContext ? (
                      <>
                        <div className={styles.contextLine}>
                          <span>{availableContext.flow.currentName}</span>
                          {availableContext.subjectType === "booking" ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{availableContext.product.titleSnapshot}</span>
                            </>
                          ) : null}
                          {availableContext.client.currentDisplayName ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{availableContext.client.currentDisplayName}</span>
                            </>
                          ) : null}
                        </div>
                        {workItem.instructions ? (
                          <p className={styles.instructions}>{workItem.instructions}</p>
                        ) : null}
                      </>
                    ) : (
                      <div
                        className={styles.contextMessage}
                        data-state={contextPending ? "pending" : "integrity-error"}
                      >
                        <strong>
                          {contextPending ? copy.contextPendingTitle : copy.integrityTitle}
                        </strong>
                        <span>
                          {contextPending
                            ? copy.contextPendingDescription
                            : copy.integrityDescription}
                        </span>
                      </div>
                    )}
                    {commandState?.status === "error" ? (
                      <p id={commandErrorId} className={styles.commandError} role="alert">
                        {commandState.userMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className={styles.meta}>
                    <span className={styles.statusLine}>
                      <span className={styles.status}>{presentation.statusLabel}</span>
                      {workItem.priority === "high" || workItem.priority === "urgent" ? (
                        <span className={styles.priority} data-priority={workItem.priority}>
                          {presentation.priorityLabel}
                        </span>
                      ) : null}
                    </span>
                    {presentation.dueLabel ? (
                      <span className={styles.due} data-due-state={presentation.dueState}>
                        <Icon iconName="clock" width={12} height={12} aria-hidden="true" />
                        {presentation.dueLabel}
                      </span>
                    ) : null}
                    {workItem.status === "snoozed" ? (
                      <span className={styles.wakeStatus}>
                        <Icon iconName="refresh" width={12} height={12} aria-hidden="true" />
                        {presentation.primaryAction === "resume"
                          ? copy.automaticWake
                          : presentation.snoozeLabel}
                      </span>
                    ) : null}
                  </div>

                  {hasActions ? (
                    <div className={styles.actions}>
                      {canStart ? (
                        <Button
                          className={styles.primaryAction}
                          size="small"
                          variant="brand"
                          title={
                            commandPending && commandState.operation === "start"
                              ? copy.starting
                              : copy.start
                          }
                          startIcon={
                            <Icon iconName="lightning" width={13} height={13} aria-hidden="true" />
                          }
                          disabled={commandsDisabled}
                          onClick={() => onStart(entry)}
                        />
                      ) : null}
                      {canComplete ? (
                        <Button
                          className={styles.primaryAction}
                          size="small"
                          variant="brand"
                          title={
                            commandPending && commandState.operation === "complete"
                              ? copy.completing
                              : copy.complete
                          }
                          startIcon={
                            <Icon iconName="check" width={13} height={13} aria-hidden="true" />
                          }
                          disabled={commandsDisabled}
                          onClick={() => onComplete(entry)}
                        />
                      ) : null}
                      {canSnooze ? (
                        <Button
                          className={styles.secondaryAction}
                          size="small"
                          variant="default"
                          title={
                            commandPending && commandState.operation === "snooze"
                              ? copy.snoozing
                              : copy.snooze
                          }
                          startIcon={
                            <Icon iconName="clock" width={13} height={13} aria-hidden="true" />
                          }
                          disabled={commandsDisabled}
                          onClick={() => onSnooze(entry)}
                        />
                      ) : null}
                      {!contextAvailable ? (
                        <Button
                          className={styles.secondaryAction}
                          size="small"
                          variant="glass"
                          title={copy.refreshQueue}
                          startIcon={
                            <Icon iconName="refresh" width={13} height={13} aria-hidden="true" />
                          }
                          disabled={isFetching}
                          onClick={onRetry}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

const queueCopy = {
  ru: {
    heading: "Задачи из воронок",
    flow: "Воронка",
    start: "Начать",
    starting: "Начинаем",
    snooze: "Отложить",
    snoozing: "Откладываем",
    complete: "Завершить",
    completing: "Завершаем",
    loading: "Загружаем задачи",
    refreshing: "Обновляем задачи",
    errorTitle: "Не удалось обновить задачи",
    errorDescription: "Данные очереди сейчас недоступны.",
    staleDescription: "Показаны ранее загруженные данные. Действия временно недоступны.",
    retry: "Повторить",
    emptyTitle: "Активных задач нет",
    emptyDescription: "Новые задачи появятся здесь, когда воронка передаст работу вам.",
    integrityTitle: "Контекст задачи недоступен",
    integrityDescription: "Данные скрыты из-за ошибки целостности.",
    contextPendingTitle: "Обновляем задачу после изменения записи",
    contextPendingDescription: "Действия появятся после синхронизации расписания.",
    refreshQueue: "Обновить очередь",
    automaticWake: "Возобновляется автоматически",
    listLabel: "Активные задачи из воронок"
  },
  en: {
    heading: "Flow tasks",
    flow: "Flow",
    start: "Start",
    starting: "Starting",
    snooze: "Snooze",
    snoozing: "Snoozing",
    complete: "Complete",
    completing: "Completing",
    loading: "Loading tasks",
    refreshing: "Refreshing tasks",
    errorTitle: "Could not refresh tasks",
    errorDescription: "The task queue is currently unavailable.",
    staleDescription: "Previously loaded data is shown. Actions are temporarily unavailable.",
    retry: "Retry",
    emptyTitle: "No active tasks",
    emptyDescription: "New tasks will appear here when a flow hands work to you.",
    integrityTitle: "Task context is unavailable",
    integrityDescription: "Context is hidden because its integrity could not be verified.",
    contextPendingTitle: "Updating the task after a booking change",
    contextPendingDescription: "Actions will return after the schedule is synchronized.",
    refreshQueue: "Refresh queue",
    automaticWake: "Resuming automatically",
    listLabel: "Active flow tasks"
  }
} as const;
