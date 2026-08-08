import type { FlowWorkItemQueueEntry } from "@elevenhouse/contracts";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Link } from "react-router";

import { buildBookingCalendarPath } from "../../bookings/model/bookingNavigation";
import { buildFlowDefinitionPath } from "../model/flowsPageModel";
import { resolveFlowWorkItemCompletionDraft } from "../model/flowWorkItemCompletionModel";
import styles from "./FlowWorkItemCompleteDialog.module.css";

export type FlowWorkItemCompleteDialogProps = {
  readonly entry: FlowWorkItemQueueEntry | null;
  readonly locale: "ru" | "en";
  readonly pending: boolean;
  readonly error?: string | null;
  readonly onClose: () => void;
  readonly onConfirm: (resultSummary: string | undefined) => void;
};

export function FlowWorkItemCompleteDialog({
  entry,
  locale,
  pending,
  error = null,
  onClose,
  onConfirm
}: FlowWorkItemCompleteDialogProps) {
  const copy = dialogCopy[locale];
  const textareaId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [resultSummary, setResultSummary] = useState("");
  const availableContext = entry?.context.status === "available" ? entry.context : null;
  const workItem = entry && availableContext ? entry.workItem : null;
  const requirement = availableContext?.completionRequirements.resultSummary ?? "optional";
  const resolution = resolveFlowWorkItemCompletionDraft({ resultSummary, requirement });
  const validationId = `${textareaId}-validation`;
  const hintId = `${textareaId}-hint`;
  const commandErrorId = `${textareaId}-command-error`;

  useEffect(() => {
    setResultSummary("");
  }, [workItem?.id, workItem?.revision]);

  function handleClose() {
    if (!pending) onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !resolution.canSubmit) return;
    onConfirm(resolution.resultSummary);
  }

  function handleContextNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }
    onClose();
  }

  return (
    <Modal
      open={availableContext !== null}
      title={copy.title}
      closeLabel={copy.close}
      className={styles.dialog}
      contentClassName={styles.modalContent}
      initialFocusRef={textareaRef}
      onClose={handleClose}
    >
      {availableContext && workItem ? (
        <form className={styles.form} aria-busy={pending} onSubmit={handleSubmit}>
          <div className={styles.taskContext}>
            <span className={styles.taskIcon} aria-hidden="true">
              <Icon iconName="flow" width={15} height={15} />
            </span>
            <span className={styles.taskCopy}>
              <span>{availableContext.flow.currentName}</span>
              <strong>{workItem.title}</strong>
            </span>
          </div>

          <div className={styles.contextLine}>
            {availableContext.subjectType === "booking" ? (
              <span>{availableContext.product.titleSnapshot}</span>
            ) : null}
            {availableContext.client.currentDisplayName ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{availableContext.client.currentDisplayName}</span>
              </>
            ) : null}
          </div>

          <nav className={styles.contextLinks} aria-label={copy.contextLinks}>
            <Link
              to={buildFlowDefinitionPath(availableContext.flow.id)}
              aria-disabled={pending || undefined}
              onClick={handleContextNavigation}
            >
              <Icon iconName="flow" width={13} height={13} aria-hidden="true" />
              <span>{copy.openFlow}</span>
            </Link>
            {availableContext.subjectType === "booking" ? (
              <Link
                to={buildBookingCalendarPath({
                  bookingId: availableContext.booking.id,
                  startAt: availableContext.booking.currentStartAt
                })}
                aria-disabled={pending || undefined}
                onClick={handleContextNavigation}
              >
                <Icon iconName="calendar" width={13} height={13} aria-hidden="true" />
                <span>{copy.openBooking}</span>
              </Link>
            ) : null}
          </nav>

          {workItem.instructions ? (
            <section className={styles.instructions} aria-label={copy.instructions}>
              <span className={styles.instructionsIcon} aria-hidden="true">
                <Icon iconName="edit" width={14} height={14} />
              </span>
              <span>
                <strong>{copy.instructions}</strong>
                <span>{workItem.instructions}</span>
              </span>
            </section>
          ) : null}

          <div className={styles.resultField}>
            <div className={styles.resultLabelLine}>
              <label htmlFor={textareaId}>{copy.resultLabel}</label>
              <span>{requirement === "required" ? copy.required : copy.optional}</span>
            </div>
            <textarea
              ref={textareaRef}
              id={textareaId}
              value={resultSummary}
              rows={5}
              required={requirement === "required"}
              disabled={pending}
              aria-invalid={resolution.validation !== null}
              aria-describedby={
                resolution.validation !== null ? `${hintId} ${validationId}` : hintId
              }
              placeholder={copy.placeholder}
              onChange={(event) => setResultSummary(event.currentTarget.value)}
            />
            <div id={hintId} className={styles.fieldHint}>
              <span>{copy.hint}</span>
              <span className={styles.characterCount}>{resolution.characterCount}/1000</span>
            </div>
          </div>

          {resolution.validation ? (
            <p id={validationId} className={styles.validation} role="alert">
              <Icon iconName="lightning" width={14} height={14} aria-hidden="true" />
              <span>
                {resolution.validation === "required" ? copy.requiredError : copy.tooLongError}
              </span>
            </p>
          ) : null}

          {error ? (
            <p id={commandErrorId} className={styles.commandError} role="alert">
              <Icon iconName="lightning" width={14} height={14} aria-hidden="true" />
              <span>{error}</span>
            </p>
          ) : null}

          <footer className={styles.actions}>
            <Button
              type="button"
              size="medium"
              variant="default"
              title={copy.cancel}
              disabled={pending}
              onClick={handleClose}
            />
            <Button
              type="submit"
              size="medium"
              variant="brand"
              title={pending ? copy.submitting : copy.confirm}
              startIcon={<Icon iconName="check" width={14} height={14} aria-hidden="true" />}
              disabled={pending || !resolution.canSubmit}
            />
          </footer>
        </form>
      ) : null}
    </Modal>
  );
}

const dialogCopy = {
  ru: {
    title: "Завершить задачу",
    close: "Закрыть",
    instructions: "Что нужно сделать",
    contextLinks: "Связанные объекты",
    openFlow: "Открыть воронку",
    openBooking: "Открыть запись",
    resultLabel: "Результат выполнения",
    required: "Обязательно",
    optional: "Необязательно",
    placeholder: "Кратко зафиксируйте выполненную работу",
    hint: "Результат сохраняется в истории запуска воронки.",
    requiredError: "Добавьте результат выполнения задачи.",
    tooLongError: "Сократите результат до 1000 символов.",
    cancel: "Отмена",
    confirm: "Завершить задачу",
    submitting: "Завершаем"
  },
  en: {
    title: "Complete task",
    close: "Close",
    instructions: "What to do",
    contextLinks: "Related records",
    openFlow: "Open flow",
    openBooking: "Open booking",
    resultLabel: "Completion result",
    required: "Required",
    optional: "Optional",
    placeholder: "Briefly record the completed work",
    hint: "The result is stored in the flow run history.",
    requiredError: "Add the task completion result.",
    tooLongError: "Shorten the result to 1000 characters.",
    cancel: "Cancel",
    confirm: "Complete task",
    submitting: "Completing"
  }
} as const;
