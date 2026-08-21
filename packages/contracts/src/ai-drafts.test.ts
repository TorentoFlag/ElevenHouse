import { describe, expect, it } from "vitest";

import {
  createReviewReplyAiDraftRequestSchema,
  createReviewReplyAiDraftResponseSchema
} from "./ai-drafts";

describe("AI draft contracts", () => {
  it("accepts review reply draft requests and responses", () => {
    expect(createReviewReplyAiDraftRequestSchema.parse({})).toEqual({ locale: "ru" });
    expect(
      createReviewReplyAiDraftResponseSchema.parse({
        draftId: "10000000-0000-4000-8000-000000000001",
        attemptId: "10000000-0000-4000-8000-000000000002",
        draftText: "Спасибо за отзыв."
      }).draftText
    ).toBe("Спасибо за отзыв.");
  });

  it("does not expose review reply draft provider internals to frontend", () => {
    expect(() =>
      createReviewReplyAiDraftResponseSchema.parse({
        draftId: "10000000-0000-4000-8000-000000000001",
        attemptId: "10000000-0000-4000-8000-000000000002",
        draftText: "Спасибо за отзыв.",
        provider: "openai",
        model: "gpt-5.5",
        promptId: "reviews.replyDraft",
        promptVersion: 1,
        finishReason: "completed",
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15
        }
      })
    ).toThrow();
  });
});
