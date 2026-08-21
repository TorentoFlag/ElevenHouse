import type { ReviewAstrologerItem } from "@elevenhouse/contracts";

export type AstrologerReviewFilter = "all" | "published" | "pending" | "hidden";

export type AstrologerReviewsSummary = {
  readonly averageRating: string;
  readonly publishedCount: number;
  readonly totalCount: number;
  readonly distribution: ReadonlyArray<{ readonly rating: number; readonly count: number }>;
};

export function buildAstrologerReviewsSummary(
  reviews: readonly ReviewAstrologerItem[]
): AstrologerReviewsSummary {
  const published = reviews.filter(isVisiblePublishedReview);
  const average =
    published.length === 0
      ? "—"
      : (
          published.reduce((sum, review) => sum + review.activePublicVersion.rating, 0) /
          published.length
        ).toFixed(1);

  return {
    averageRating: average,
    publishedCount: published.length,
    totalCount: reviews.length,
    distribution: [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: published.filter((review) => review.activePublicVersion.rating === rating).length
    }))
  };
}

export function filterAstrologerReviews(
  reviews: readonly ReviewAstrologerItem[],
  filter: AstrologerReviewFilter
): ReviewAstrologerItem[] {
  switch (filter) {
    case "published":
      return reviews.filter(isVisiblePublishedReview);
    case "pending":
      return reviews.filter(hasPendingModeration);
    case "hidden":
      return reviews.filter(isHiddenReview);
    case "all":
      return [...reviews];
  }
}

export function countAstrologerReviewFilters(
  reviews: readonly ReviewAstrologerItem[]
): Record<AstrologerReviewFilter, number> {
  return {
    all: reviews.length,
    published: reviews.filter(isVisiblePublishedReview).length,
    pending: reviews.filter(hasPendingModeration).length,
    hidden: reviews.filter(isHiddenReview).length
  };
}

function isVisiblePublishedReview(review: ReviewAstrologerItem): boolean {
  return review.visibilityStatus === "visible" && !hasActiveDispute(review);
}

function isHiddenReview(review: ReviewAstrologerItem): boolean {
  return review.visibilityStatus !== "visible" || hasActiveDispute(review);
}

function hasPendingModeration(review: ReviewAstrologerItem): boolean {
  return Boolean(review.pendingVersion || review.pendingReplyVersion);
}

function hasActiveDispute(review: ReviewAstrologerItem): boolean {
  return [
    "open",
    "under_review",
    "waiting_client",
    "waiting_astrologer"
  ].includes(review.disputeStatus);
}
