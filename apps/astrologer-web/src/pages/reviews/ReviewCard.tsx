import type { ReviewAstrologerItem } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { ReviewCaseState } from "./ReviewsPage";
import type { ReviewsPageCopy } from "./ReviewsPage";
import styles from "./ReviewsPage.module.css";

export function ReviewCard({
  copy,
  locale,
  review,
  replyDraft,
  caseState,
  caseMessageDraft,
  replyActive,
  commandPending,
  onStartReply,
  onCancelReply,
  onEditReply,
  onEditCaseMessage,
  onSubmitReply,
  onCreateAiDraft,
  onOpenDispute,
  onSubmitCaseMessage
}: {
  readonly copy: ReviewsPageCopy;
  readonly locale: SupportedLocale;
  readonly review: ReviewAstrologerItem;
  readonly replyDraft: string;
  readonly caseState: ReviewCaseState | undefined;
  readonly caseMessageDraft: string;
  readonly replyActive: boolean;
  readonly commandPending: boolean;
  readonly onStartReply: () => void;
  readonly onCancelReply: () => void;
  readonly onEditReply: (value: string) => void;
  readonly onEditCaseMessage: (value: string) => void;
  readonly onSubmitReply: () => void;
  readonly onCreateAiDraft: () => void;
  readonly onOpenDispute: () => void;
  readonly onSubmitCaseMessage: () => void;
}) {
  const status = getReviewStatus(review);
  const reply = review.activePublicReplyVersion ?? review.pendingReplyVersion;
  const replyLabel = review.pendingReplyVersion
    ? copy.reply.pendingReplyLabel
    : copy.reply.ownReplyLabel;
  const canOpenDispute = review.visibilityStatus === "visible" && review.disputeStatus === "none";

  return (
    <article className={styles.reviewCard}>
      <div className={styles.reviewHeader}>
        <ReviewAvatar review={review} />
        <div className={styles.reviewMeta}>
          <h2>{review.author.displayName}</h2>
          <p>
            {review.reviewableInstance.title} ·{" "}
            {formatReviewDate(review.activePublicVersion.submittedAt, locale)}
          </p>
        </div>
        <div className={styles.rating} aria-label={`${review.activePublicVersion.rating} / 5`}>
          {[0, 1, 2, 3, 4].map((index) => (
            <Icon
              key={index}
              iconName="star"
              size={14}
              fill={index < review.activePublicVersion.rating ? "currentColor" : "none"}
              aria-hidden="true"
            />
          ))}
        </div>
        <span className={styles.statusPill} data-status={status}>
          {copy.status[status]}
        </span>
      </div>
      <p className={styles.reviewText}>{review.activePublicVersion.text}</p>
      {review.pendingVersion ? (
        <div className={styles.pendingVersionBox}>
          <h3>{copy.status.pending}</h3>
          <p className={styles.pendingVersionRating}>{review.pendingVersion.rating} / 5</p>
          <p>{review.pendingVersion.text}</p>
        </div>
      ) : null}
      {reply ? (
        <div className={styles.replyBox}>
          <div className={styles.replyAvatar} aria-hidden="true">
            EH
          </div>
          <div>
            <h3>{replyLabel}</h3>
            <p>{reply.text}</p>
          </div>
        </div>
      ) : replyActive ? (
        <form
          className={styles.replyForm}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitReply();
          }}
        >
          <textarea
            className={styles.replyInput}
            autoFocus
            value={replyDraft}
            rows={3}
            maxLength={4000}
            placeholder={copy.reply.placeholder}
            onChange={(event) => onEditReply(event.target.value)}
          />
          <div className={styles.replyActions}>
            <button
              type="button"
              className={styles.quietButton}
              disabled={commandPending}
              onClick={onCancelReply}
            >
              {copy.reply.cancelLabel}
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={commandPending || !replyDraft.trim()}
            >
              {copy.reply.submitLabel}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={commandPending}
            onClick={onStartReply}
          >
            <Icon iconName="chat" size={14} aria-hidden="true" />
            {copy.reply.startLabel}
          </button>
          <button
            type="button"
            className={styles.aiButton}
            disabled={commandPending}
            onClick={onCreateAiDraft}
          >
            <Icon iconName="sparkle" size={14} aria-hidden="true" />
            {copy.reply.aiLabel}
          </button>
          {canOpenDispute ? (
            <button
              type="button"
              className={styles.quietButton}
              disabled={commandPending}
              onClick={onOpenDispute}
            >
              {copy.disputeLabel}
            </button>
          ) : null}
        </div>
      )}
      {status === "pending" && !replyActive ? (
        <p className={styles.pendingNote}>{copy.reply.pendingReplyLabel}</p>
      ) : null}
      {review.moderationCase ? (
        <ReviewCaseThread
          copy={copy}
          caseState={caseState}
          draft={caseMessageDraft}
          commandPending={commandPending}
          onEdit={onEditCaseMessage}
          onSubmit={onSubmitCaseMessage}
        />
      ) : null}
    </article>
  );
}

function ReviewCaseThread({
  copy,
  caseState,
  draft,
  commandPending,
  onEdit,
  onSubmit
}: {
  readonly copy: ReviewsPageCopy;
  readonly caseState: ReviewCaseState | undefined;
  readonly draft: string;
  readonly commandPending: boolean;
  readonly onEdit: (value: string) => void;
  readonly onSubmit: () => void;
}) {
  const caseThread = copy.caseThread;

  return (
    <section className={styles.caseThread}>
      <div className={styles.caseHeader}>
        <h3>{caseThread.title}</h3>
        {caseState?.detail ? <span>{caseThread.status[caseState.detail.status]}</span> : null}
      </div>
      {!caseState || caseState.status === "loading" ? (
        <p className={styles.pendingNote}>{caseThread.loadingLabel}</p>
      ) : null}
      {caseState?.status === "error" ? (
        <p className={styles.pendingNote}>{caseThread.errorLabel}</p>
      ) : null}
      {caseState?.detail ? (
        <>
          <ul className={styles.caseMessages}>
            {caseState.detail.messages.map((message) => (
              <li key={message.messageId}>
                <strong>{caseThread.author[message.authorRole]}</strong>
                <p>{message.body}</p>
              </li>
            ))}
          </ul>
          <form
            className={styles.replyForm}
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <textarea
              className={styles.replyInput}
              value={draft}
              rows={3}
              maxLength={4000}
              aria-label={caseThread.messageLabel}
              placeholder={caseThread.placeholder}
              onChange={(event) => onEdit(event.target.value)}
            />
            <div className={styles.replyActions}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={commandPending || !draft.trim()}
              >
                {caseThread.submitLabel}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}

function ReviewAvatar({ review }: { readonly review: ReviewAstrologerItem }) {
  if (review.author.publicIdentityMode === "named" && review.author.avatarUrl) {
    return <img className={styles.avatar} src={review.author.avatarUrl} alt="" />;
  }

  return (
    <span className={styles.avatar} aria-hidden="true">
      {review.author.initials ?? "СП"}
    </span>
  );
}

function getReviewStatus(review: ReviewAstrologerItem): "published" | "pending" | "hidden" {
  if (review.visibilityStatus !== "visible" || review.disputeStatus !== "none") return "hidden";
  if (review.pendingVersion || review.pendingReplyVersion) return "pending";
  return "published";
}

function formatReviewDate(value: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "short"
  }).format(new Date(value));
}
