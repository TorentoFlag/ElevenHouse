import type { CreateManualClientFlowRunResponse } from "@elevenhouse/contracts";
import { useEffect, useRef, useState } from "react";
import { ClientSearchCombobox } from "../../clients/components/ClientSearchCombobox";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import styles from "./FlowManualClientRunDialog.module.css";

export type FlowManualClientRunDialogProps = {
  readonly flowName: string;
  readonly locale: "ru" | "en";
  readonly pending: boolean;
  readonly error: Error | null;
  readonly onClose: () => void;
  readonly onSubmit: (input: {
    readonly clientUserId: string;
    readonly idempotencyKey: string;
  }) => Promise<CreateManualClientFlowRunResponse>;
};

export function FlowManualClientRunDialog({
  flowName,
  locale,
  pending,
  error,
  onClose,
  onSubmit
}: FlowManualClientRunDialogProps) {
  const copy = dialogCopy[locale];
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const attemptKeys = useRef(new Map<string, string>());
  const [selectedClient, setSelectedClient] = useState<ClientSelectOption | null>(null);
  const [result, setResult] = useState<CreateManualClientFlowRunResponse | null>(null);
  const [localError, setLocalError] = useState<Error | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open && typeof dialog.showModal === "function") dialog.showModal();
    closeButtonRef.current?.focus();

    return () => {
      if (dialog?.open) dialog.close();
      returnFocusElement?.focus();
    };
  }, []);

  const submit = async () => {
    if (!selectedClient || pending) return;
    setLocalError(null);
    const idempotencyKey = stableAttemptKey(attemptKeys.current, selectedClient.value);
    try {
      const nextResult = await onSubmit({
        clientUserId: selectedClient.value,
        idempotencyKey
      });
      setResult(nextResult);
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason : new Error(copy.submitFailed));
    }
  };

  const feedback = result ? resultCopy(result, locale) : null;
  const visibleError = localError ?? error;
  const canSubmit = selectedClient !== null && !pending;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="flow-manual-client-run-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <section className={styles.card} aria-live="polite">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h2 id="flow-manual-client-run-title">{copy.title}</h2>
            <p className={styles.description}>{copy.description(flowName)}</p>
          </div>
          <button
            ref={closeButtonRef}
            className={styles.closeButton}
            type="button"
            aria-label={copy.close}
            disabled={pending}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <ClientSearchCombobox
          id="flow-manual-client-run-client"
          label={copy.clientLabel}
          value={selectedClient?.value ?? ""}
          placeholder={copy.clientPlaceholder}
          selectedClient={selectedClient}
          requireBirthDate={false}
          fullWidth
          disabled={pending}
          emptyMessage={copy.emptyClients}
          onSelect={(client) => {
            setSelectedClient(client);
            setResult(null);
            setLocalError(null);
          }}
        />

        {feedback ? (
          <p className={feedback.kind === "error" ? styles.error : styles.notice} role={feedback.kind === "error" ? "alert" : "status"}>
            {feedback.message}
          </p>
        ) : null}
        {visibleError ? <p className={styles.error} role="alert">{visibleError.message}</p> : null}

        <footer className={styles.actions}>
          {result?.status === "enrolled" ? (
            <button className={styles.secondaryButton} type="button" disabled={pending} onClick={onClose}>
              {copy.done}
            </button>
          ) : (
            <>
              <button className={styles.secondaryButton} type="button" disabled={pending} onClick={onClose}>
                {copy.cancel}
              </button>
              <button className={styles.primaryButton} type="button" disabled={!canSubmit} onClick={() => void submit()}>
                {pending ? copy.creating : result ? copy.retry : copy.submit}
              </button>
            </>
          )}
        </footer>
      </section>
    </dialog>
  );
}

function stableAttemptKey(keys: Map<string, string>, clientUserId: string): string {
  const existing = keys.get(clientUserId);
  if (existing) return existing;
  const key = `flow-manual-client:${crypto.randomUUID()}`;
  keys.set(clientUserId, key);
  return key;
}

function resultCopy(
  result: CreateManualClientFlowRunResponse,
  locale: "ru" | "en"
): { readonly kind: "notice" | "error"; readonly message: string } {
  const copy = dialogCopy[locale];
  if (result.status === "enrolled") return { kind: "notice", message: copy.enrolled };
  if (result.status === "suppressed") return { kind: "error", message: copy.suppressed };
  return { kind: "error", message: copy.noMatch };
}

const dialogCopy = {
  ru: {
    eyebrow: "Ручной запуск",
    title: "Запустить воронку для клиента",
    description: (flowName: string) => `Будет запущена активная версия «${flowName}».`,
    close: "Закрыть",
    clientLabel: "Клиент",
    clientPlaceholder: "Выберите клиента из CRM",
    emptyClients: "В CRM пока нет клиентов",
    cancel: "Отмена",
    submit: "Запустить",
    creating: "Создаём…",
    retry: "Повторить",
    done: "Готово",
    submitFailed: "Не удалось создать запуск.",
    enrolled: "Запуск создан и поставлен в обработку.",
    noMatch: "В активной версии этой воронки нет ручного запуска.",
    suppressed: "Запуск не создан: выполнение воронок сейчас недоступно."
  },
  en: {
    eyebrow: "Manual run",
    title: "Run flow for a client",
    description: (flowName: string) => `The active version of “${flowName}” will be started.`,
    close: "Close",
    clientLabel: "Client",
    clientPlaceholder: "Choose a client from CRM",
    emptyClients: "There are no CRM clients yet",
    cancel: "Cancel",
    submit: "Run flow",
    creating: "Creating…",
    retry: "Retry",
    done: "Done",
    submitFailed: "Could not create the run.",
    enrolled: "The run was created and queued for processing.",
    noMatch: "The active version of this flow has no manual start.",
    suppressed: "The run was not created because Flow execution is unavailable."
  }
} as const;
