import { useEffect, useId, useRef } from "react";

export type FlowRunCancelDialogProps = {
  readonly open: boolean;
  readonly locale: "ru" | "en";
  readonly pending: boolean;
  readonly error: Error | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
};

export function FlowRunCancelDialog({
  open,
  locale,
  pending,
  error,
  onClose,
  onConfirm
}: FlowRunCancelDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const copy = cancelCopy[locale];

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);
  if (!open) return null;

  return (
    <div className="flowRunCancelBackdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pending) onClose();
    }}>
      <section className="flowRunCancelDialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={pending}>
        <h2 id={titleId}>{copy.title}</h2>
        <p id={descriptionId}>{copy.description}</p>
        {error ? <p role="alert">{copy.error}</p> : null}
        <div>
          <button type="button" disabled={pending} onClick={onClose}>{copy.keep}</button>
          <button ref={confirmRef} type="button" disabled={pending} onClick={onConfirm}>{pending ? copy.cancelling : copy.confirm}</button>
        </div>
      </section>
    </div>
  );
}

const cancelCopy = {
  ru: {
    title: "Отменить запуск?",
    description: "Новые шаги не будут выполняться. Уже завершённые действия не отменяются.",
    keep: "Оставить запуск",
    confirm: "Отменить запуск",
    cancelling: "Отменяем…",
    error: "Не удалось отменить запуск. Можно повторить попытку."
  },
  en: {
    title: "Cancel this run?",
    description: "No new steps will execute. Actions already completed cannot be undone.",
    keep: "Keep run",
    confirm: "Cancel run",
    cancelling: "Canceling…",
    error: "The run could not be canceled. You can try again."
  }
} as const;
