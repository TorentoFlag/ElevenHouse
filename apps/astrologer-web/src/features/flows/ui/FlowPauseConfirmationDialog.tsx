import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";

export type FlowPauseConfirmationDialogProps = {
  readonly open: boolean;
  readonly locale: "ru" | "en";
  readonly mode: "pause_enrollment";
  readonly flowName: string;
  readonly loading?: boolean;
  readonly pending: boolean;
  readonly error?: Error | null;
  readonly refetchRequired?: boolean;
  readonly retrySameAttempt?: boolean;
  readonly onClose: () => void;
  readonly onRefetch: () => void;
  readonly onConfirm: () => void;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowPauseConfirmationDialog({
  open,
  locale,
  flowName,
  loading = false,
  pending,
  error = null,
  refetchRequired = false,
  retrySameAttempt = false,
  onClose,
  onRefetch,
  onConfirm,
  classNames
}: FlowPauseConfirmationDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const copy = pauseCopy[locale];

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (getFocusableElements(dialogRef.current)[0] ?? dialogRef.current)?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  const className = (key: string) => classNames?.[key] ?? "";
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return (
    <div
      className={className("automationDialogBackdrop")}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={className("automationDialog")}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={loading || pending}
        onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, pending, onClose)}
      >
        <header className={className("automationDialogHeader")}>
          <div>
            <h2 id={titleId}>{copy.title}</h2>
            <p>{flowName}</p>
          </div>
          <button
            className={className("automationDialogClose")}
            type="button"
            aria-label={copy.close}
            disabled={pending}
            onClick={onClose}
          >
            <Icon iconName="close" width={18} height={18} aria-hidden="true" />
          </button>
        </header>

        <section className={className("automationPauseBody")}>
          <div className={className("automationReviewStatusIcon")} aria-hidden="true">
            <Icon iconName="bell" width={18} height={18} />
          </div>
          <div>
            <h3>{copy.enrollmentTitle}</h3>
            <p id={descriptionId}>{copy.enrollmentDescription}</p>
          </div>
        </section>

        {loading ? (
          <p className={className("automationDialogNotice")} role="status">
            {copy.loading}
          </p>
        ) : null}

        {error ? (
          <p className={className("automationDialogErrorText")} role="alert">
            {error.message}
          </p>
        ) : null}

        <footer className={className("automationDialogFooter")}>
          {refetchRequired ? (
            <button className={className("automationDialogPrimary")} type="button" onClick={onRefetch}>
              <Icon iconName="refresh" width={15} height={15} aria-hidden="true" />
              {copy.refetch}
            </button>
          ) : (
            <>
              <button
                className={className("automationDialogSecondary")}
                type="button"
                disabled={loading || pending}
                onClick={onClose}
              >
                {copy.cancel}
              </button>
              <button
                className={className("automationDialogPrimary")}
                type="button"
                disabled={loading || pending}
                onClick={onConfirm}
              >
                <Icon iconName="check" width={15} height={15} aria-hidden="true" />
                {pending ? copy.pausing : retrySameAttempt ? copy.retryPause : copy.confirm}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function handleDialogKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  dialog: HTMLDivElement | null,
  pending: boolean,
  onClose: () => void
) {
  if (event.key === "Escape" && !pending) {
    event.preventDefault();
    event.stopPropagation();
    onClose();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = getFocusableElements(dialog);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    dialog?.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function getFocusableElements(dialog: HTMLDivElement | null): HTMLElement[] {
  return dialog
    ? Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      )
    : [];
}

const pauseCopy = {
  ru: {
    title: "Подтвердите паузу",
    close: "Закрыть",
    enrollmentTitle: "Остановить активную версию?",
    enrollmentDescription: "Новые события перестанут запускать активную версию.",
    cancel: "Отмена",
    confirm: "Поставить на паузу",
    pausing: "Останавливаем",
    retryPause: "Повторить паузу",
    refetch: "Обновить состояние",
    loading: "Обновляем состояние автоматизации."
  },
  en: {
    title: "Confirm pause",
    close: "Close",
    enrollmentTitle: "Pause the active version?",
    enrollmentDescription: "New events will stop starting the active version.",
    cancel: "Cancel",
    confirm: "Pause automation",
    pausing: "Pausing",
    retryPause: "Retry pause",
    refetch: "Refresh state",
    loading: "Refreshing automation state."
  }
} as const;
