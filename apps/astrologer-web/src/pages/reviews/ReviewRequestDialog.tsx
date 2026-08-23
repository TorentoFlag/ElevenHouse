import type { MessagingThread, ReviewRequestTarget } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { ReviewsPageCopy } from "./ReviewsPage";
import styles from "./ReviewsPage.module.css";

export type ReviewRequestDialogProps = {
  readonly copy: ReviewsPageCopy;
  readonly targets: readonly ReviewRequestTarget[];
  readonly threads: readonly MessagingThread[];
  readonly selectedTargetId: string;
  readonly selectedThreadId: string;
  readonly message: string;
  readonly loading: boolean;
  readonly error: boolean;
  readonly pending: boolean;
  readonly sent: boolean;
  readonly onClose: () => void;
  readonly onTargetChange: (reviewableInstanceId: string) => void;
  readonly onThreadChange: (threadId: string) => void;
  readonly onMessageChange: (message: string) => void;
  readonly onSend: () => void;
};

export function ReviewRequestDialog({
  copy,
  targets,
  threads,
  selectedTargetId,
  selectedThreadId,
  message,
  loading,
  error,
  pending,
  sent,
  onClose,
  onTargetChange,
  onThreadChange,
  onMessageChange,
  onSend
}: ReviewRequestDialogProps) {
  const selectedTarget =
    targets.find((target) => target.reviewableInstance.id === selectedTargetId) ?? null;
  const threadOptions = selectedTarget
    ? threads.filter(
        (thread) =>
          thread.clientUserId === selectedTarget.client.clientUserId &&
          thread.status === "open" &&
          thread.primaryIdentity !== null
      )
    : [];
  const canSend = Boolean(selectedTarget && selectedThreadId && message.trim()) && !pending;

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section className={styles.requestDialog} role="dialog" aria-modal="true">
        <header className={styles.requestDialogHeader}>
          <div>
            <h2>{copy.requestReview.title}</h2>
            <p>{copy.requestReview.description}</p>
          </div>
          <button type="button" className={styles.quietButton} onClick={onClose}>
            {copy.requestReview.closeLabel}
          </button>
        </header>

        {loading ? <p className={styles.pendingNote}>{copy.requestReview.loadingLabel}</p> : null}
        {error ? <p className={styles.errorText}>{copy.requestReview.errorLabel}</p> : null}

        {!loading && !error && targets.length === 0 ? (
          <p className={styles.pendingNote}>{copy.requestReview.emptyTargetsLabel}</p>
        ) : null}

        {!loading && !error && targets.length > 0 ? (
          <>
            <label className={styles.formField}>
              <span>{copy.requestReview.targetLabel}</span>
              <select
                className={styles.selectInput}
                value={selectedTargetId}
                onChange={(event) => onTargetChange(event.currentTarget.value)}
              >
                {targets.map((target) => (
                  <option
                    key={target.reviewableInstance.id}
                    value={target.reviewableInstance.id}
                  >
                    {target.client.displayName} · {target.reviewableInstance.title}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.formField}>
              <span>{copy.requestReview.threadLabel}</span>
              <select
                className={styles.selectInput}
                value={selectedThreadId}
                onChange={(event) => onThreadChange(event.currentTarget.value)}
                disabled={threadOptions.length === 0}
              >
                {threadOptions.length === 0 ? (
                  <option value="">{copy.requestReview.emptyThreadsLabel}</option>
                ) : null}
                {threadOptions.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {formatThreadLabel(thread)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.formField}>
              <span>{copy.requestReview.messageLabel}</span>
              <textarea
                className={styles.replyInput}
                rows={5}
                value={message}
                onChange={(event) => onMessageChange(event.currentTarget.value)}
              />
            </label>

            <div className={styles.replyActions}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!canSend}
                onClick={onSend}
              >
                <Icon iconName="send" size={15} aria-hidden="true" />
                {pending ? copy.requestReview.sendingLabel : copy.requestReview.sendLabel}
              </button>
              {sent ? <p className={styles.successText}>{copy.requestReview.sentLabel}</p> : null}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function formatThreadLabel(thread: MessagingThread): string {
  const identity = thread.primaryIdentity;
  if (!identity) return thread.id;
  const name = identity.displayName ?? identity.username ?? identity.providerChatId;
  return `${name} · ${identity.provider}`;
}
