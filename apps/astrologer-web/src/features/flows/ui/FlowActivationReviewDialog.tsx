import type { FlowActivationReviewResponse } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";

import { buildFlowActivationReviewPresentation } from "../model/flowActivationReviewPresentation";

export type FlowActivationReviewDialogProps = {
  readonly open: boolean;
  readonly locale: "ru" | "en";
  readonly flowName: string;
  readonly versionNumber: number;
  readonly review: FlowActivationReviewResponse | null;
  readonly loading: boolean;
  readonly pending: boolean;
  readonly reviewError?: Error | null;
  readonly commandError?: Error | null;
  readonly refetchRequired?: boolean;
  readonly retrySameAttempt?: boolean;
  readonly onClose: () => void;
  readonly onRetryReview: () => void;
  readonly onRefetch: () => void;
  readonly onConfirm: () => void;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowActivationReviewDialog({
  open,
  locale,
  flowName,
  versionNumber,
  review,
  loading,
  pending,
  reviewError = null,
  commandError = null,
  refetchRequired = false,
  retrySameAttempt = false,
  onClose,
  onRetryReview,
  onRefetch,
  onConfirm,
  classNames
}: FlowActivationReviewDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const copy = dialogCopy[locale];

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
  const presentation = review ? buildFlowActivationReviewPresentation(review, locale) : null;
  const canConfirm =
    presentation?.canConfirm === true &&
    !loading &&
    !pending &&
    !reviewError &&
    !refetchRequired;

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

        <p id={descriptionId} className={className("automationDialogIntro")}>
          {copy.version(versionNumber)}
        </p>

        {loading ? (
          <p className={className("automationDialogNotice")} role="status">
            {copy.loading(versionNumber)}
          </p>
        ) : null}

        {reviewError ? (
          <div className={className("automationDialogError")} role="alert">
            <p>{reviewError.message}</p>
            <button type="button" onClick={onRetryReview}>
              <Icon iconName="refresh" width={15} height={15} aria-hidden="true" />
              {copy.retryReview}
            </button>
          </div>
        ) : null}

        {presentation && !reviewError ? (
          <section
            className={className("automationReviewState")}
            data-status={presentation.status}
            aria-live="polite"
          >
            <div className={className("automationReviewStatusIcon")} aria-hidden="true">
              <Icon
                iconName={presentation.status === "ready" ? "check" : "bell"}
                width={18}
                height={18}
              />
            </div>
            <div>
              <h3>{presentation.title}</h3>
              <p>{presentation.description}</p>
            </div>
            {presentation.blockers.length > 0 ? (
              <ul className={className("automationBlockerList")}>
                {presentation.blockers.map((blocker) => (
                  <li key={`${blocker.code}:${blocker.capabilityKey ?? "none"}`}>
                    <span>{blocker.label}</span>
                    {blocker.capabilityKey ? <code>{blocker.capabilityKey}</code> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {commandError ? (
          <p className={className("automationDialogErrorText")} role="alert">
            {commandError.message}
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
              {presentation?.status === "blocked" && !reviewError ? (
                <button
                  className={className("automationDialogSecondary")}
                  type="button"
                  disabled={loading || pending}
                  onClick={onRetryReview}
                >
                  <Icon iconName="refresh" width={15} height={15} aria-hidden="true" />
                  {copy.retryReview}
                </button>
              ) : null}
              <button
                className={className("automationDialogPrimary")}
                type="button"
                disabled={!canConfirm}
                onClick={onConfirm}
              >
                <Icon iconName="check" width={15} height={15} aria-hidden="true" />
                {pending
                  ? copy.activating
                  : retrySameAttempt
                    ? copy.retryActivation
                    : copy.activate}
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
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
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

const dialogCopy = {
  ru: {
    title: "Проверка запуска",
    close: "Закрыть",
    version: (version: number) => `Опубликованная версия ${version}`,
    loading: (version: number) => `Проверяем готовность версии ${version}`,
    retryReview: "Проверить снова",
    refetch: "Обновить состояние",
    activate: "Запустить версию",
    activating: "Запускаем",
    retryActivation: "Повторить запуск"
  },
  en: {
    title: "Activation review",
    close: "Close",
    version: (version: number) => `Published version ${version}`,
    loading: (version: number) => `Reviewing version ${version}`,
    retryReview: "Review again",
    refetch: "Refresh state",
    activate: "Activate version",
    activating: "Activating",
    retryActivation: "Retry activation"
  }
} as const;
