import { describe, expect, it } from "vitest";
import { buildAstrologerReviewsSummary, filterAstrologerReviews } from "./reviewsPresentation";
import type { ReviewAstrologerItem } from "@elevenhouse/contracts";

describe("reviewsPresentation", () => {
  it("computes aggregate rating only from visible published reviews", () => {
    expect(buildAstrologerReviewsSummary(reviews)).toMatchObject({
      averageRating: "4.5",
      publishedCount: 2,
      totalCount: 3,
      distribution: [
        { rating: 5, count: 1 },
        { rating: 4, count: 1 },
        { rating: 3, count: 0 },
        { rating: 2, count: 0 },
        { rating: 1, count: 0 }
      ]
    });
  });

  it("maps filters to production review states", () => {
    expect(filterAstrologerReviews(reviews, "published").map((review) => review.reviewId)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "21111111-1111-4111-8111-111111111111"
    ]);
    expect(filterAstrologerReviews(reviews, "pending").map((review) => review.reviewId)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "31111111-1111-4111-8111-111111111111"
    ]);
    expect(filterAstrologerReviews(reviews, "hidden").map((review) => review.reviewId)).toEqual([
      "31111111-1111-4111-8111-111111111111"
    ]);
  });
});

const baseReview = {
  reviewableInstance: {
    id: "91111111-1111-4111-8111-111111111111",
    kind: "booking",
    status: "review_submitted",
    title: "Натальный разбор",
    contextLabel: "Сессия завершена",
    receivedAt: "2026-08-20T09:00:00.000Z",
    reviewWindowClosesAt: "2026-09-03T09:00:00.000Z",
    windowPolicy: "standard_14_days_after_receipt"
  },
  author: {
    publicIdentityMode: "named",
    displayName: "Марина К.",
    initials: "МК",
    avatarUrl: null
  },
  activePublicVersion: {
    id: "81111111-1111-4111-8111-111111111111",
    versionNumber: 1,
    rating: 5,
    text: "Очень бережная консультация.",
    publicIdentityMode: "named",
    moderationStatus: "approved",
    moderationReasonCode: null,
    submittedAt: "2026-08-20T10:00:00.000Z",
    decidedAt: "2026-08-20T11:00:00.000Z"
  },
  activePublicReplyVersion: null,
  pendingVersion: null,
  pendingReplyVersion: null,
  moderationCase: null
} satisfies Omit<ReviewAstrologerItem, "reviewId" | "visibilityStatus" | "disputeStatus">;

const reviews: ReviewAstrologerItem[] = [
  {
    ...baseReview,
    reviewId: "11111111-1111-4111-8111-111111111111",
    visibilityStatus: "visible",
    disputeStatus: "none",
    pendingVersion: {
      id: "51111111-1111-4111-8111-111111111111",
      versionNumber: 2,
      rating: 4,
      text: "Новая версия ожидает модерацию.",
      publicIdentityMode: "named",
      moderationStatus: "pending",
      moderationReasonCode: null,
      submittedAt: "2026-08-21T09:00:00.000Z",
      decidedAt: null
    }
  },
  {
    ...baseReview,
    reviewId: "21111111-1111-4111-8111-111111111111",
    visibilityStatus: "visible",
    disputeStatus: "none",
    activePublicVersion: { ...baseReview.activePublicVersion, rating: 4 }
  },
  {
    ...baseReview,
    reviewId: "31111111-1111-4111-8111-111111111111",
    visibilityStatus: "temporarily_hidden_by_dispute",
    disputeStatus: "open",
    pendingReplyVersion: {
      id: "61111111-1111-4111-8111-111111111111",
      versionNumber: 1,
      text: "Спасибо за уточнение.",
      moderationStatus: "pending",
      moderationReasonCode: null,
      submittedAt: "2026-08-21T09:00:00.000Z",
      decidedAt: null
    }
  }
];
