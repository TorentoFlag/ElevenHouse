import { createHash } from "node:crypto";

import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { reviewReplyDraftPromptV1 } from "@elevenhouse/ai";
import {
  createReviewReplyAiDraftRequestSchema,
  createReviewReplyAiDraftResponseSchema,
  reviewAstrologerListQuerySchema,
  reviewAstrologerListResponseSchema,
  reviewModerationCaseDetailSchema,
  reviewModerationCaseMessageCreateSchema,
  reviewModerationCaseMessageSchema,
  reviewModerationDecisionSchema,
  reviewRequestCreateSchema,
  reviewRequestDeliveryResponseSchema,
  reviewRequestTargetListQuerySchema,
  reviewRequestTargetListResponseSchema,
  reviewReplySubmissionSchema,
  reviewReplyVersionSchema,
  type CreateReviewReplyAiDraftResponse,
  type ReviewAstrologerListResponse,
  type ReviewModerationCaseDetail,
  type ReviewModerationCaseMessage,
  type ReviewRequestDeliveryResponse,
  type ReviewRequestTargetListResponse,
  type ReviewReplyVersion
} from "@elevenhouse/contracts";
import { ReviewRatingAggregateProjectionDriftError } from "@elevenhouse/db/reviews";
import type {
  CreateReviewReplyDraftCommandResult,
  CreateReviewCaseMessageResult,
  OpenReviewDisputeResult,
  ReviewReadStore,
  SubmitReviewReplyVersionResult
} from "@elevenhouse/domain";
import {
  createOutboundMessage,
  MessagingIdempotencyConflictError,
  MessagingThreadNotFoundError,
  MessagingValidationError,
  type MessagingStore
} from "@elevenhouse/domain";

import { AiGenerationService } from "../ai/ai-generation.service";
import { SystemClock } from "../clock/system-clock.service";
import {
  ASTROLOGER_REVIEWS_AI_REPLY_DRAFT_STORE,
  ASTROLOGER_REVIEWS_COMMAND_STORE,
  ASTROLOGER_REVIEWS_MESSAGING_STORE,
  ASTROLOGER_REVIEWS_READ_STORE
} from "./reviews.tokens";

type AstrologerReviewCommandStore = {
  readonly openReviewDispute: (input: {
    readonly actorUserId: string;
    readonly now: string;
    readonly reviewId: string;
    readonly nextCaseId: string;
    readonly nextMessageId: string | null;
    readonly reasonCode: string;
    readonly note: string | null;
  }) => Promise<OpenReviewDisputeResult>;
  readonly submitReviewReplyVersion: (input: {
    readonly actorUserId: string;
    readonly now: string;
    readonly reviewId: string;
    readonly nextReplyVersionId: string;
    readonly text: string;
  }) => Promise<SubmitReviewReplyVersionResult>;
  readonly createReviewCaseMessage: (input: {
    readonly messageId: string;
    readonly caseId: string;
    readonly authorUserId: string | null;
    readonly authorRole: "astrologer";
    readonly visibility: "astrologer_and_moderators";
    readonly body: string;
    readonly now: string;
  }) => Promise<CreateReviewCaseMessageResult>;
};

type AstrologerReviewAiReplyDraftStore = {
  readonly createReplyDraftCommand: (input: {
    readonly actorUserId: string;
    readonly now: string;
    readonly reviewId: string;
    readonly nextDraftId: string;
    readonly attemptId: string;
  }) => Promise<
    | CreateReviewReplyDraftCommandResult
    | {
        readonly kind: "replayed";
        readonly draftId: string;
        readonly attemptId: string;
        readonly status: "pending";
      }
    | {
        readonly kind: "replayed";
        readonly draftId: string;
        readonly attemptId: string;
        readonly status: "succeeded";
        readonly draftText: string;
      }
    | {
        readonly kind: "replayed";
        readonly draftId: string;
        readonly attemptId: string;
        readonly status: "failed";
        readonly safeErrorCode: string;
      }
  >;
  readonly markReplyDraftSucceeded: (input: {
    readonly attemptId: string;
    readonly now: string;
    readonly draftText: string;
  }) => Promise<unknown>;
  readonly markReplyDraftFailed: (input: {
    readonly attemptId: string;
    readonly now: string;
    readonly safeErrorCode: string;
  }) => Promise<unknown>;
};

@Injectable()
export class AstrologerReviewsService {
  constructor(
    @Inject(ASTROLOGER_REVIEWS_READ_STORE)
    private readonly readStore: Pick<
      ReviewReadStore,
      | "listAstrologerReviews"
      | "listReviewRequestTargets"
      | "getModerationCaseDetail"
      | "getClientReviewDetail"
    >,
    @Inject(ASTROLOGER_REVIEWS_COMMAND_STORE)
    private readonly commandStore: AstrologerReviewCommandStore,
    @Inject(ASTROLOGER_REVIEWS_AI_REPLY_DRAFT_STORE)
    private readonly aiReplyDraftStore: AstrologerReviewAiReplyDraftStore,
    @Inject(ASTROLOGER_REVIEWS_MESSAGING_STORE)
    private readonly messagingStore: MessagingStore,
    private readonly aiGeneration: AiGenerationService,
    private readonly clock: SystemClock
  ) {}

  async listAstrologerReviews(
    astrologerUserId: string,
    query: unknown
  ): Promise<ReviewAstrologerListResponse> {
    const normalized = normalizeAstrologerReviewsQuery(astrologerUserId, query);
    return reviewAstrologerListResponseSchema.parse(
      await this.readStore.listAstrologerReviews(normalized)
    );
  }

  async listReviewRequestTargets(
    astrologerUserId: string,
    query: unknown
  ): Promise<ReviewRequestTargetListResponse> {
    const normalized = normalizeReviewRequestTargetsQuery(astrologerUserId, query);
    return reviewRequestTargetListResponseSchema.parse(
      await this.readStore.listReviewRequestTargets(normalized)
    );
  }

  async requestReview(
    astrologerUserId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<ReviewRequestDeliveryResponse> {
    const parsed = reviewRequestCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid review request payload");

    const safeAstrologerUserId = requireUuid(astrologerUserId);
    const thread = await this.messagingStore.findThreadForAstrologer({
      astrologerUserId: safeAstrologerUserId,
      threadId: parsed.data.threadId
    });
    if (!thread) throw new NotFoundException("Messaging thread was not found");
    if (!thread.clientUserId) {
      throw new BadRequestException("Review request requires a linked client thread");
    }

    const reviewTarget = await this.readStore.getClientReviewDetail({
      clientUserId: thread.clientUserId,
      reviewableInstanceId: parsed.data.reviewableInstanceId
    });
    if (!reviewTarget) throw new NotFoundException("Reviewable service was not found");
    if (!reviewTarget.canSubmitNewVersion) {
      throw new BadRequestException("Review request target is not currently reviewable");
    }

    try {
      const result = await createOutboundMessage({
        store: this.messagingStore,
        astrologerUserId: safeAstrologerUserId,
        threadId: parsed.data.threadId,
        channelConnectionId: parsed.data.channelConnectionId,
        text: parsed.data.text,
        idempotencyKey,
        now: this.clock.now()
      });

      return reviewRequestDeliveryResponseSchema.parse({
        messageId: result.message.id,
        threadId: result.message.threadId,
        status: result.message.status,
        createdAt: result.message.createdAt,
        replayed: result.replayed
      });
    } catch (error) {
      if (error instanceof MessagingThreadNotFoundError) {
        throw new NotFoundException("Messaging thread was not found");
      }
      if (error instanceof MessagingIdempotencyConflictError) {
        throw new ConflictException("Review request idempotency key conflicts with another message");
      }
      if (error instanceof MessagingValidationError) {
        throw new BadRequestException("Invalid review request messaging target");
      }
      throw error;
    }
  }

  async createReplyAiDraft(
    astrologerUserId: string,
    reviewId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<CreateReviewReplyAiDraftResponse> {
    const parsed = createReviewReplyAiDraftRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid review reply AI draft request");

    const safeAstrologerUserId = requireUuid(astrologerUserId);
    const safeReviewId = requireUuid(reviewId);
    const draftId = deterministicUuid(
      `${safeReviewId}:${safeAstrologerUserId}:${idempotencyKey}:draft`
    );
    const attemptId = deterministicUuid(
      `${safeReviewId}:${safeAstrologerUserId}:${idempotencyKey}:attempt`
    );
    const created = await this.aiReplyDraftStore.createReplyDraftCommand({
      actorUserId: safeAstrologerUserId,
      now: this.clock.now().toISOString(),
      reviewId: safeReviewId,
      nextDraftId: draftId,
      attemptId
    });
    if (created.kind === "rejected") {
      throw new BadRequestException("Review reply AI draft cannot be created");
    }
    if (created.kind === "replayed") {
      if (created.status === "succeeded") {
        return createReviewReplyAiDraftResponseSchema.parse({
          draftId: created.draftId,
          attemptId: created.attemptId,
          draftText: created.draftText
        });
      }
      if (created.status === "failed") {
        throw new BadGatewayException("Review reply AI draft provider response is unavailable");
      }
      throw new ConflictException("Review reply AI draft generation is still in progress");
    }

    let generated: Awaited<ReturnType<AiGenerationService["generate"]>>;
    try {
      generated = await this.aiGeneration.generate({
        prompt: reviewReplyDraftPromptV1,
        input: reviewReplyDraftPromptV1.inputSchema.parse({
          locale: parsed.data.locale,
          ...created.command.promptInput
        }),
        ownerUserId: safeAstrologerUserId,
        feature: created.command.feature,
        resourceEvidence: created.command.resourceEvidence
      });
    } catch (error) {
      await this.aiReplyDraftStore.markReplyDraftFailed({
        attemptId,
        now: this.clock.now().toISOString(),
        safeErrorCode: "AI_PROVIDER_UNKNOWN_FAILURE"
      });
      throw error;
    }

    const output = reviewReplyDraftPromptV1.outputSchema.safeParse(generated.output);
    if (!output.success) {
      await this.aiReplyDraftStore.markReplyDraftFailed({
        attemptId,
        now: this.clock.now().toISOString(),
        safeErrorCode: "AI_PROVIDER_RESPONSE_INVALID"
      });
      throw new BadGatewayException("Review reply AI draft provider response is invalid");
    }
    await this.aiReplyDraftStore.markReplyDraftSucceeded({
      attemptId,
      now: this.clock.now().toISOString(),
      draftText: output.data.draftText
    });

    return createReviewReplyAiDraftResponseSchema.parse({
      draftId,
      attemptId,
      draftText: output.data.draftText
    });
  }

  async submitReviewReplyVersion(
    astrologerUserId: string,
    reviewId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<ReviewReplyVersion> {
    const parsed = reviewReplySubmissionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid review reply submission");

    const safeAstrologerUserId = requireUuid(astrologerUserId);
    const safeReviewId = requireUuid(reviewId);
    const result = await this.commandStore.submitReviewReplyVersion({
      actorUserId: safeAstrologerUserId,
      now: this.clock.now().toISOString(),
      reviewId: safeReviewId,
      nextReplyVersionId: deterministicUuid(
        `${safeReviewId}:${safeAstrologerUserId}:${idempotencyKey}:reply`
      ),
      text: parsed.data.text
    });
    if (result.kind === "rejected") {
      throw new BadRequestException("Review reply version cannot be submitted");
    }
    return reviewReplyVersionSchema.parse({
      id: result.replyVersion.id,
      versionNumber: result.replyVersion.versionNumber,
      text: result.replyVersion.text,
      moderationStatus: result.replyVersion.moderationStatus,
      moderationReasonCode: null,
      submittedAt: result.replyVersion.submittedAt,
      decidedAt: result.replyVersion.decidedAt
    });
  }

  async openReviewDispute(
    astrologerUserId: string,
    reviewId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<ReviewModerationCaseDetail> {
    const parsed = reviewModerationDecisionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid review dispute request");

    const safeAstrologerUserId = requireUuid(astrologerUserId);
    const safeReviewId = requireUuid(reviewId);
    const result = await mapReviewAggregateProjectionDrift(() =>
      this.commandStore.openReviewDispute({
        actorUserId: safeAstrologerUserId,
        now: this.clock.now().toISOString(),
        reviewId: safeReviewId,
        nextCaseId: deterministicUuid(
          `${safeReviewId}:${safeAstrologerUserId}:${idempotencyKey}:case`
        ),
        nextMessageId: parsed.data.note
          ? deterministicUuid(`${safeReviewId}:${safeAstrologerUserId}:${idempotencyKey}:case-note`)
          : null,
        reasonCode: parsed.data.reasonCode,
        note: parsed.data.note
      })
    );
    if (result.kind === "rejected") {
      throw new BadRequestException("Review dispute cannot be opened");
    }

    const detail = await this.readStore.getModerationCaseDetail({
      caseId: result.moderationCase.caseId,
      actorUserId: safeAstrologerUserId,
      actorRole: "astrologer"
    });
    if (!detail) throw new NotFoundException("Review moderation case was not found");
    return reviewModerationCaseDetailSchema.parse(detail);
  }

  async getModerationCaseDetail(
    astrologerUserId: string,
    caseId: string
  ): Promise<ReviewModerationCaseDetail> {
    const detail = await this.readStore.getModerationCaseDetail({
      caseId: requireUuid(caseId),
      actorUserId: requireUuid(astrologerUserId),
      actorRole: "astrologer"
    });
    if (!detail) throw new NotFoundException("Review moderation case was not found");
    return reviewModerationCaseDetailSchema.parse(detail);
  }

  async createModerationCaseMessage(
    astrologerUserId: string,
    caseId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<ReviewModerationCaseMessage> {
    const parsed = reviewModerationCaseMessageCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid review case message");
    if (parsed.data.visibility !== "astrologer_and_moderators") {
      throw new BadRequestException("Invalid review case message visibility");
    }

    const safeCaseId = requireUuid(caseId);
    const safeAstrologerUserId = requireUuid(astrologerUserId);
    const result = await this.commandStore.createReviewCaseMessage({
      messageId: deterministicUuid(`${safeCaseId}:${safeAstrologerUserId}:${idempotencyKey}`),
      caseId: safeCaseId,
      authorUserId: safeAstrologerUserId,
      authorRole: "astrologer",
      visibility: parsed.data.visibility,
      body: parsed.data.body,
      now: this.clock.now().toISOString()
    });
    if (result.kind === "rejected") {
      throw new BadRequestException("Invalid review case message visibility");
    }
    return reviewModerationCaseMessageSchema.parse({
      messageId: result.message.messageId,
      authorRole: result.message.authorRole,
      visibility: result.message.visibility,
      body: result.message.body,
      createdAt: result.message.createdAt
    });
  }
}

async function mapReviewAggregateProjectionDrift<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ReviewRatingAggregateProjectionDriftError) {
      throw new ConflictException({
        code: error.code,
        scope: error.scope
      });
    }
    throw error;
  }
}

function deterministicUuid(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function requireUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new BadRequestException("Valid UUID is required");
  }
  return value;
}

function normalizeAstrologerReviewsQuery(astrologerUserId: string, query: unknown) {
  const input = query && typeof query === "object" ? (query as Record<string, unknown>) : {};
  const limit = Array.isArray(input.limit) ? input.limit[0] : input.limit;
  const cursor = Array.isArray(input.cursor) ? input.cursor[0] : input.cursor;
  const parsed = reviewAstrologerListQuerySchema.safeParse({
    astrologerUserId: requireUuid(astrologerUserId),
    limit: typeof limit === "string" && limit.trim() !== "" ? Number(limit) : undefined,
    cursor: typeof cursor === "string" && cursor.trim() !== "" ? cursor : null
  });
  if (!parsed.success) throw new BadRequestException("Invalid reviews query");
  return parsed.data;
}

function normalizeReviewRequestTargetsQuery(astrologerUserId: string, query: unknown) {
  const input = query && typeof query === "object" ? (query as Record<string, unknown>) : {};
  const limit = Array.isArray(input.limit) ? input.limit[0] : input.limit;
  const cursor = Array.isArray(input.cursor) ? input.cursor[0] : input.cursor;
  const parsed = reviewRequestTargetListQuerySchema.safeParse({
    astrologerUserId: requireUuid(astrologerUserId),
    limit: typeof limit === "string" && limit.trim() !== "" ? Number(limit) : undefined,
    cursor: typeof cursor === "string" && cursor.trim() !== "" ? cursor : null
  });
  if (!parsed.success) throw new BadRequestException("Invalid review request targets query");
  return parsed.data;
}
