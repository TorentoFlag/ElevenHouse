import type { ReviewAstrologerItem } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
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
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isCommandPending: boolean;
  readonly commandError: string | null;
  readonly onFilterChange: (filter: AstrologerReviewFilter) => void;
  readonly onRefresh: () => void;
  readonly onStartReply: (review: ReviewAstrologerItem) => void;
  readonly onCancelReply: () => void;
  readonly onEditReply: (reviewId: string, value: string) => void;
  readonly onSubmitReply: (review: ReviewAstrologerItem) => void;
  readonly onCreateAiDraft: (review: ReviewAstrologerItem) => void;
  readonly onOpenDispute: (review: ReviewAstrologerItem) => void;
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
  isLoading,
  isError,
  isCommandPending,
  commandError,
  onFilterChange,
  onRefresh,
  onStartReply,
  onCancelReply,
  onEditReply,
  onSubmitReply,
  onCreateAiDraft,
  onOpenDispute
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
                  replyActive={replyTargetId === review.reviewId}
                  commandPending={isCommandPending}
                  onStartReply={() => onStartReply(review)}
                  onCancelReply={onCancelReply}
                  onEditReply={(value) => onEditReply(review.reviewId, value)}
                  onSubmitReply={() => onSubmitReply(review)}
                  onCreateAiDraft={() => onCreateAiDraft(review)}
                  onOpenDispute={() => onOpenDispute(review)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
