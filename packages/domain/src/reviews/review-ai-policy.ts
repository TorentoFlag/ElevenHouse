import { createHash } from "node:crypto";
import type { ReviewPublicIdentityMode } from "@elevenhouse/contracts";
import type { ReviewLifecycleState } from "./review-lifecycle";

export type ReviewReplyDraftPromptInput = {
  readonly rating: number;
  readonly reviewText: string;
  readonly publicIdentityMode: ReviewPublicIdentityMode;
  readonly serviceTitle: string;
  readonly serviceContextLabel: string;
};

export type ReviewReplyDraftCommand = {
  readonly attemptId: string;
  readonly feature: "reviews.reply_draft";
  readonly promptId: "reviews.replyDraft";
  readonly promptVersion: 1;
  readonly provider: "openai";
  readonly outputMode: "draft_only";
  readonly canSubmitOrPublish: false;
  readonly ownerSafetyId: string;
  readonly resourceEvidence: {
    readonly resourceType: "review";
    readonly resourceId: string;
    readonly sourceChecksum: string;
  };
  readonly promptInput: ReviewReplyDraftPromptInput;
  readonly requestedAt: string;
};

export type CreateReviewReplyDraftCommandResult =
  | { readonly kind: "created"; readonly command: ReviewReplyDraftCommand }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "not_review_astrologer"
        | "review_not_public"
        | "review_has_no_public_version"
        | "draft_already_pending";
    };

export function createReviewReplyDraftCommand(input: {
  readonly actorUserId: string;
  readonly attemptId: string;
  readonly now: string;
  readonly review: ReviewLifecycleState;
  readonly serviceContext: {
    readonly title: string;
    readonly contextLabel: string;
  };
  readonly draftAlreadyPending?: boolean;
}): CreateReviewReplyDraftCommandResult {
  if (input.actorUserId !== input.review.astrologerUserId) {
    return { kind: "rejected", reason: "not_review_astrologer" };
  }
  if (input.review.visibilityStatus !== "visible") {
    return { kind: "rejected", reason: "review_not_public" };
  }
  if (!input.review.activePublicVersion) {
    return { kind: "rejected", reason: "review_has_no_public_version" };
  }
  if (input.draftAlreadyPending === true) {
    return { kind: "rejected", reason: "draft_already_pending" };
  }

  const promptInput: ReviewReplyDraftPromptInput = {
    rating: input.review.activePublicVersion.rating,
    reviewText: input.review.activePublicVersion.text,
    publicIdentityMode: input.review.activePublicVersion.publicIdentityMode,
    serviceTitle: normalizePromptText(input.serviceContext.title),
    serviceContextLabel: normalizePromptText(input.serviceContext.contextLabel)
  };

  return {
    kind: "created",
    command: {
      attemptId: input.attemptId,
      feature: "reviews.reply_draft",
      promptId: "reviews.replyDraft",
      promptVersion: 1,
      provider: "openai",
      outputMode: "draft_only",
      canSubmitOrPublish: false,
      ownerSafetyId: input.review.astrologerUserId,
      resourceEvidence: {
        resourceType: "review",
        resourceId: input.review.id,
        sourceChecksum: createPromptInputChecksum(promptInput)
      },
      promptInput,
      requestedAt: input.now
    }
  };
}

function normalizePromptText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function createPromptInputChecksum(input: ReviewReplyDraftPromptInput): string {
  return `sha256:${createHash("sha256").update(stableJson(input)).digest("hex")}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}
