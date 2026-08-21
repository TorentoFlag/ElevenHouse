import type { ReviewAstrologerItem } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { DisputeDraft, ReviewCaseState } from "./ReviewsPage";
import type {
  AstrologerReviewFilter,
  AstrologerReviewsSummary
} from "../../features/reviews/model/reviewsPresentation";
import type { ReviewsPageCopy } from "./ReviewsPage";
import { ReviewCard } from "./ReviewCard";
import { ReviewsSummaryPanel } from "./ReviewsSummaryPanel";
import styles from "./ReviewsPage.module.css";

export type ReviewsPageViewProps = {
  readonly copy: ReviewsPageCopy;
  readonly locale: SupportedLocale;
  readonly reviews: readonly ReviewAstrologerItem[];
  readonly summary: AstrologerReviewsSummary;
  readonly counts: Record<AstrologerReviewFilter, number>;
  readonly selectedFilter: AstrologerReviewFilter;
  readonly replyTargetId: string | null;
  readonly replyDrafts: Record<string, string>;
  readonly disputeTargetId: string | null;
  readonly disputeDrafts: Record<string, DisputeDraft>;
  readonly caseStates: Record<string, ReviewCaseState>;
  readonly caseMessageDrafts: Record<string, string>;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isCommandPending: boolean;
  readonly commandError: string | null;
  readonly onFilterChange: (filter: AstrologerReviewFilter) => void;
  readonly onRefresh: () => void;
  readonly onStartReply: (review: ReviewAstrologerItem) => void;
  readonly onCancelReply: () => void;
  readonly onStartDispute: (review: ReviewAstrologerItem) => void;
  readonly onCancelDispute: () => void;
  readonly onEditReply: (reviewId: string, value: string) => void;
  readonly onEditDispute: (reviewId: string, draft: DisputeDraft) => void;
  readonly onEditCaseMessage: (caseId: string, value: string) => void;
  readonly onSubmitReply: (review: ReviewAstrologerItem) => void;
  readonly onCreateAiDraft: (review: ReviewAstrologerItem) => void;
  readonly onSubmitDispute: (review: ReviewAstrologerItem) => void;
  readonly onSubmitCaseMessage: (review: ReviewAstrologerItem) => void;
};

const filterOrder: readonly AstrologerReviewFilter[] = ["all", "published", "pending", "hidden"];

export function ReviewsPageView({
  copy,
  locale,
  reviews,
  summary,
  counts,
  selectedFilter,
  replyTargetId,
  replyDrafts,
  disputeTargetId,
  disputeDrafts,
  caseStates,
  caseMessageDrafts,
  isLoading,
  isError,
  isCommandPending,
  commandError,
  onFilterChange,
  onRefresh,
  onStartReply,
  onCancelReply,
  onStartDispute,
  onCancelDispute,
  onEditReply,
  onEditDispute,
  onEditCaseMessage,
  onSubmitReply,
  onCreateAiDraft,
  onSubmitDispute,
  onSubmitCaseMessage
}: ReviewsPageViewProps) {
  return (
    <section className={styles.page} aria-labelledby="reviews-title">
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <h1 id="reviews-title" className={styles.title}>
            {copy.title}
          </h1>
        </div>
        <div className={styles.filters} role="group" aria-label={copy.filterAriaLabel}>
          {filterOrder.map((filter) => (
            <button
              key={filter}
              type="button"
              className={styles.filterChip}
              data-active={selectedFilter === filter ? "true" : undefined}
              onClick={() => onFilterChange(filter)}
            >
              {copy.filters[filter]}
              {counts[filter] > 0 ? (
                <span className={styles.chipCount}>{counts[filter]}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className={styles.toolbarSpacer} />
        <button
          type="button"
          className={styles.secondaryButton}
          disabled
          title={copy.requestReviewUnavailableLabel}
        >
          <Icon iconName="chat" size={15} aria-hidden="true" />
          {copy.requestReviewLabel}
        </button>
      </header>

      <div className={styles.content}>
        {commandError ? <div className={styles.errorBanner}>{commandError}</div> : null}
        {isLoading ? <div className={styles.stateCard}>{copy.loadingLabel}</div> : null}
        {isError ? (
          <div className={styles.stateCard}>
            <p>{copy.errorLabel}</p>
            <button type="button" className={styles.secondaryButton} onClick={onRefresh}>
              <Icon iconName="refresh" size={15} aria-hidden="true" />
              {copy.retryLabel}
            </button>
          </div>
        ) : null}
        {!isLoading && !isError ? (
          <div className={styles.grid}>
            <ReviewsSummaryPanel copy={copy} summary={summary} />
            <div className={styles.list}>
              {reviews.length === 0 ? (
                <div className={styles.stateCard}>{copy.emptyLabel}</div>
              ) : null}
              {reviews.map((review) => (
                <ReviewCard
                  key={review.reviewId}
                  copy={copy}
                  locale={locale}
                  review={review}
                  replyDraft={replyDrafts[review.reviewId] ?? ""}
                  disputeDraft={disputeDrafts[review.reviewId] ?? null}
                  caseState={
                    review.moderationCase ? caseStates[review.moderationCase.caseId] : undefined
                  }
                  caseMessageDraft={
                    review.moderationCase
                      ? (caseMessageDrafts[review.moderationCase.caseId] ?? "")
                      : ""
                  }
                  replyActive={replyTargetId === review.reviewId}
                  disputeActive={disputeTargetId === review.reviewId}
                  commandPending={isCommandPending}
                  onStartReply={() => onStartReply(review)}
                  onCancelReply={onCancelReply}
                  onEditReply={(value) => onEditReply(review.reviewId, value)}
                  onStartDispute={() => onStartDispute(review)}
                  onCancelDispute={onCancelDispute}
                  onEditDispute={(draft) => onEditDispute(review.reviewId, draft)}
                  onEditCaseMessage={(value) => {
                    if (review.moderationCase) {
                      onEditCaseMessage(review.moderationCase.caseId, value);
                    }
                  }}
                  onSubmitReply={() => onSubmitReply(review)}
                  onCreateAiDraft={() => onCreateAiDraft(review)}
                  onSubmitDispute={() => onSubmitDispute(review)}
                  onSubmitCaseMessage={() => onSubmitCaseMessage(review)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
