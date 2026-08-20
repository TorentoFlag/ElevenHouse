import { describe, expect, it } from "vitest";

import { createReviewReplyDraftCommand } from "./review-ai-policy";
import type { ReviewLifecycleState } from "./review-lifecycle";

const ids = {
  reviewId: "10000000-0000-4000-8000-000000000101",
  reviewableInstanceId: "10000000-0000-4000-8000-000000000102",
  clientUserId: "10000000-0000-4000-8000-000000000103",
  astrologerUserId: "10000000-0000-4000-8000-000000000104",
  versionId: "10000000-0000-4000-8000-000000000105",
  attemptId: "10000000-0000-4000-8000-000000000106"
} as const;

const publishedReview = (overrides: Partial<ReviewLifecycleState> = {}): ReviewLifecycleState => ({
  id: ids.reviewId,
  reviewableInstanceId: ids.reviewableInstanceId,
  clientUserId: ids.clientUserId,
  astrologerUserId: ids.astrologerUserId,
  revision: 1,
  publicIdentityMode: "secret_user",
  visibilityStatus: "visible",
  disputeStatus: "none",
  firstPublishedAt: "2026-08-20T10:00:00.000Z",
  activePublicVersion: {
    id: ids.versionId,
    versionNumber: 1,
    rating: 5,
    text: "Помогло понять ситуацию и следующие шаги.",
    publicIdentityMode: "secret_user",
    moderationStatus: "approved",
    submittedAt: "2026-08-19T10:00:00.000Z",
    decidedAt: "2026-08-20T10:00:00.000Z"
  },
  pendingVersion: null,
  activePublicReplyVersion: null,
  pendingReplyVersion: null,
  ...overrides
});

describe("Review AI reply draft policy", () => {
  it("creates a draft command with safe prompt input and no ability to publish", () => {
    const result = createReviewReplyDraftCommand({
      actorUserId: ids.astrologerUserId,
      attemptId: ids.attemptId,
      now: "2026-08-20T11:00:00.000Z",
      review: publishedReview(),
      serviceContext: {
        title: "Солярная консультация",
        contextLabel: "60 минут"
      }
    });

    expect(result).toMatchObject({
      kind: "created",
      command: {
        attemptId: ids.attemptId,
        feature: "reviews.reply_draft",
        promptId: "reviews.replyDraft",
        promptVersion: 1,
        provider: "openai",
        outputMode: "draft_only",
        canSubmitOrPublish: false
      }
    });
    if (result.kind !== "created") throw new Error("Expected draft command");

    expect(result.command.promptInput).toEqual({
      rating: 5,
      reviewText: "Помогло понять ситуацию и следующие шаги.",
      publicIdentityMode: "secret_user",
      serviceTitle: "Солярная консультация",
      serviceContextLabel: "60 минут"
    });
    expect(JSON.stringify(result.command.promptInput)).not.toContain(ids.clientUserId);
    expect(JSON.stringify(result.command.promptInput)).not.toContain("Анна");
    expect(JSON.stringify(result.command.promptInput)).not.toContain("payment");
    expect(JSON.stringify(result.command.promptInput)).not.toContain("moderation");
    expect(JSON.stringify(result.command.promptInput)).not.toContain("case");
  });

  it("rejects non-astrologer actors and hidden or unpublished reviews", () => {
    expect(
      createReviewReplyDraftCommand({
        actorUserId: ids.clientUserId,
        attemptId: ids.attemptId,
        now: "2026-08-20T11:00:00.000Z",
        review: publishedReview(),
        serviceContext: {
          title: "Солярная консультация",
          contextLabel: "60 минут"
        }
      })
    ).toMatchObject({ kind: "rejected", reason: "not_review_astrologer" });

    expect(
      createReviewReplyDraftCommand({
        actorUserId: ids.astrologerUserId,
        attemptId: ids.attemptId,
        now: "2026-08-20T11:00:00.000Z",
        review: publishedReview({ visibilityStatus: "temporarily_hidden_by_dispute" }),
        serviceContext: {
          title: "Солярная консультация",
          contextLabel: "60 минут"
        }
      })
    ).toMatchObject({ kind: "rejected", reason: "review_not_public" });
  });
});
