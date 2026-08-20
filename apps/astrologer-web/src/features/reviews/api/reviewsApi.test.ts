import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReviewReplyAiDraft,
  listAstrologerReviews,
  openReviewDispute,
  submitReviewReplyVersion
} from "./reviewsApi";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());

vi.mock("../../../Application", () => ({
  application: { http: { get, post } }
}));

describe("reviewsApi", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it("loads astrologer-owned reviews through the shared list contract", async () => {
    get.mockResolvedValueOnce(reviewListResponse);

    await expect(listAstrologerReviews({ limit: 20, cursor: null })).resolves.toEqual(
      reviewListResponse
    );
    expect(get).toHaveBeenCalledWith("/reviews?limit=20");
  });

  it("submits astrologer replies for moderation with CSRF and idempotency", async () => {
    post.mockResolvedValueOnce(replyVersion);

    await expect(
      submitReviewReplyVersion({
        reviewId,
        idempotencyKey: "reviews:reply:test",
        body: { text: "Спасибо за отзыв. Я рада, что консультация помогла." }
      })
    ).resolves.toEqual(replyVersion);
    expect(post).toHaveBeenCalledWith(
      `/reviews/${reviewId}/reply-versions`,
      { text: "Спасибо за отзыв. Я рада, что консультация помогла." },
      { csrf: true, headers: { "idempotency-key": "reviews:reply:test" } }
    );
  });

  it("creates AI reply drafts without submitting a public reply", async () => {
    post.mockResolvedValueOnce({
      draftId,
      attemptId,
      draftText: "Спасибо за такой теплый отзыв.",
      provider: "openai",
      model: "gpt-5.4-mini",
      promptId: "reviews.replyDraft",
      promptVersion: 1,
      finishReason: "completed"
    });

    await expect(
      createReviewReplyAiDraft({
        reviewId,
        idempotencyKey: "reviews:ai:test",
        body: { locale: "ru" }
      })
    ).resolves.toMatchObject({ draftText: "Спасибо за такой теплый отзыв." });
    expect(post).toHaveBeenCalledWith(
      `/reviews/${reviewId}/reply-drafts/ai`,
      { locale: "ru" },
      { csrf: true, headers: { "idempotency-key": "reviews:ai:test" } }
    );
  });

  it("opens disputes through the moderation case contract", async () => {
    post.mockResolvedValueOnce(moderationCase);

    await expect(
      openReviewDispute({
        reviewId,
        idempotencyKey: "reviews:dispute:test",
        body: { reasonCode: "other", note: "Нужно уточнение по формату услуги." }
      })
    ).resolves.toEqual(moderationCase);
    expect(post).toHaveBeenCalledWith(
      `/reviews/${reviewId}/disputes`,
      { reasonCode: "other", note: "Нужно уточнение по формату услуги." },
      { csrf: true, headers: { "idempotency-key": "reviews:dispute:test" } }
    );
  });
});

const reviewId = "11111111-1111-4111-8111-111111111111";
const reviewableInstanceId = "21111111-1111-4111-8111-111111111111";
const draftId = "31111111-1111-4111-8111-111111111111";
const attemptId = "41111111-1111-4111-8111-111111111111";
const caseId = "51111111-1111-4111-8111-111111111111";
const replyVersion = {
  id: "61111111-1111-4111-8111-111111111111",
  versionNumber: 1,
  text: "Спасибо за отзыв. Я рада, что консультация помогла.",
  moderationStatus: "pending",
  moderationReasonCode: null,
  submittedAt: "2026-08-21T09:00:00.000Z",
  decidedAt: null
} as const;

const reviewListResponse = {
  items: [
    {
      reviewId,
      visibilityStatus: "visible",
      disputeStatus: "none",
      reviewableInstance: {
        id: reviewableInstanceId,
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
        id: "71111111-1111-4111-8111-111111111111",
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
      pendingReplyVersion: null,
      moderationCase: null
    }
  ],
  nextCursor: null
} as const;

const moderationCase = {
  caseId,
  reviewId,
  status: "open",
  openedAt: "2026-08-21T09:00:00.000Z",
  closedAt: null,
  serviceContext: {
    title: "Натальный разбор",
    contextLabel: "Сессия завершена"
  },
  messages: []
} as const;
