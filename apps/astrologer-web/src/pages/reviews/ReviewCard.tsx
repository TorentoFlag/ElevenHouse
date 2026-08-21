import type { ReviewAstrologerItem, ReviewModerationReasonCode } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { AiDraftState } from "./ReviewsPage";
import type { DisputeDraft } from "./ReviewsPage";
import type { ReviewCaseState } from "./ReviewsPage";
import type { ReviewsPageCopy } from "./ReviewsPage";
import styles from "./ReviewsPage.module.css";

export function ReviewCard({
  copy,
  locale,
  review,
  replyDraft,
  aiDraftState,
  disputeDraft,
  caseState,
  caseMessageDraft,
  replyActive,
  disputeActive,
  commandPending,
  onStartReply,
  onCancelReply,
  onEditReply,
  onStartDispute,
  onCancelDispute,
  onEditDispute,
  onEditCaseMessage,
  onSubmitReply,
  onCreateAiDraft,
  onSubmitDispute,
  onSubmitCaseMessage
}: {
  readonly copy: ReviewsPageCopy;
  readonly locale: SupportedLocale;
  readonly review: ReviewAstrologerItem;
  readonly replyDraft: string;
  readonly aiDraftState: AiDraftState;
  readonly disputeDraft: DisputeDraft | null;
  readonly caseState: ReviewCaseState | undefined;
  readonly caseMessageDraft: string;
  readonly replyActive: boolean;
  readonly disputeActive: boolean;
  readonly commandPending: boolean;
  readonly onStartReply: () => void;
  readonly onCancelReply: () => void;
  readonly onEditReply: (value: string) => void;
  readonly onStartDispute: () => void;
  readonly onCancelDispute: () => void;
  readonly onEditDispute: (value: DisputeDraft) => void;
  readonly onEditCaseMessage: (value: string) => void;
  readonly onSubmitReply: () => void;
  readonly onCreateAiDraft: () => void;
  readonly onSubmitDispute: () => void;
  readonly onSubmitCaseMessage: () => void;
}) {
  const status = getReviewStatus(review);
  const hasReply = Boolean(review.activePublicReplyVersion || review.pendingReplyVersion);
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
      {review.activePublicReplyVersion ? (
        <div className={styles.replyBox}>
          <div className={styles.replyAvatar} aria-hidden="true">
            EH
          </div>
          <div>
            <h3>{copy.reply.ownReplyLabel}</h3>
            <p>{review.activePublicReplyVersion.text}</p>
          </div>
        </div>
      ) : null}
      {review.pendingReplyVersion ? (
        <div className={styles.pendingReplyBox}>
          <div className={styles.replyAvatar} aria-hidden="true">
            EH
          </div>
          <div>
            <h3>{copy.reply.pendingReplyLabel}</h3>
            <p>{review.pendingReplyVersion.text}</p>
          </div>
        </div>
      ) : null}
      {!hasReply && replyActive ? (
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
          {aiDraftState.status === "ready" ? (
            <p className={styles.pendingNote}>{copy.reply.aiReadyLabel}</p>
          ) : null}
          {aiDraftState.status === "error" ? (
            <p className={styles.aiStatus} data-status="error" role="status">
              {copy.reply.aiErrorLabel}
            </p>
          ) : null}
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
      ) : null}
      {!hasReply && !replyActive ? (
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
            disabled={commandPending || aiDraftState.status === "loading"}
            aria-busy={aiDraftState.status === "loading" ? "true" : undefined}
            onClick={onCreateAiDraft}
          >
            <Icon iconName="sparkle" size={14} aria-hidden="true" />
            {aiDraftState.status === "loading" ? copy.reply.aiLoadingLabel : copy.reply.aiLabel}
          </button>
          {aiDraftState.status === "loading" ? (
            <span className={styles.aiStatus} role="status">
              {copy.reply.aiLoadingLabel}
            </span>
          ) : null}
          {aiDraftState.status === "error" ? (
            <span className={styles.aiStatus} data-status="error" role="status">
              {copy.reply.aiErrorLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {canOpenDispute && disputeActive && disputeDraft ? (
        <form
          className={styles.disputeForm}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitDispute();
          }}
        >
          <label className={styles.formField}>
            <span>{copy.dispute.reasonLabel}</span>
            <select
              className={styles.selectInput}
              value={disputeDraft.reasonCode}
              onChange={(event) =>
                onEditDispute({
                  ...disputeDraft,
                  reasonCode: event.target.value as ReviewModerationReasonCode
                })
              }
            >
              {disputeReasonOrder.map((reasonCode) => (
                <option key={reasonCode} value={reasonCode}>
                  {copy.dispute.reasons[reasonCode]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.formField}>
            <span>{copy.dispute.noteLabel}</span>
            <textarea
              className={styles.replyInput}
              value={disputeDraft.note}
              rows={3}
              maxLength={2000}
              placeholder={copy.dispute.placeholder}
              onChange={(event) => onEditDispute({ ...disputeDraft, note: event.target.value })}
            />
          </label>
          <div className={styles.replyActions}>
            <button
              type="button"
              className={styles.quietButton}
              disabled={commandPending}
              onClick={onCancelDispute}
            >
              {copy.dispute.cancelLabel}
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={commandPending || !disputeDraft.note.trim()}
            >
              {copy.dispute.submitLabel}
            </button>
          </div>
        </form>
      ) : null}
      {canOpenDispute && !disputeActive ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.quietButton}
            disabled={commandPending}
            onClick={onStartDispute}
          >
            {copy.dispute.label}
          </button>
        </div>
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
          {caseState.detail.status === "closed" ? null : (
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
          )}
        </>
      ) : null}
    </section>
  );
}

const disputeReasonOrder: readonly ReviewModerationReasonCode[] = [
  "fraud_or_conflict",
  "not_service_related",
  "personal_data_exposure",
  "abuse_or_hate",
  "spam",
  "duplicate",
  "legal_risk",
  "off_topic",
  "other"
];

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
  if (review.visibilityStatus !== "visible" || hasActiveDispute(review)) return "hidden";
  if (review.pendingVersion || review.pendingReplyVersion) return "pending";
  return "published";
}

function hasActiveDispute(review: ReviewAstrologerItem): boolean {
  return [
    "open",
    "under_review",
    "waiting_client",
    "waiting_astrologer"
  ].includes(review.disputeStatus);
}

function formatReviewDate(value: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "short"
  }).format(new Date(value));
}
