import type { ReviewAstrologerItem } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { ReviewsPageCopy } from "./ReviewsPage";
import styles from "./ReviewsPage.module.css";

export function ReviewCard({
  copy,
  locale,
  review,
  replyDraft,
  replyActive,
  commandPending,
  onStartReply,
  onCancelReply,
  onEditReply,
  onSubmitReply,
  onCreateAiDraft,
  onOpenDispute
}: {
  readonly copy: ReviewsPageCopy;
  readonly locale: SupportedLocale;
  readonly review: ReviewAstrologerItem;
  readonly replyDraft: string;
  readonly replyActive: boolean;
  readonly commandPending: boolean;
  readonly onStartReply: () => void;
  readonly onCancelReply: () => void;
  readonly onEditReply: (value: string) => void;
  readonly onSubmitReply: () => void;
  readonly onCreateAiDraft: () => void;
  readonly onOpenDispute: () => void;
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
    </article>
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
  if (review.pendingReplyVersion) return "pending";
  return "published";
}

function formatReviewDate(value: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "short"
  }).format(new Date(value));
}
