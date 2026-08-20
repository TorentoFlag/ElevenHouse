import { createHash } from "node:crypto";

import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  clientReviewDetailSchema,
  reviewModerationCaseDetailSchema,
  reviewModerationCaseMessageCreateSchema,
  reviewModerationCaseMessageSchema,
  reviewPublicListQuerySchema,
  reviewPublicListResponseSchema,
  reviewVersionSubmissionSchema,
  type ClientReviewDetail,
  type ReviewModerationCaseDetail,
  type ReviewModerationCaseMessage,
  type ReviewPublicListResponse
} from "@elevenhouse/contracts";
import type {
  CreateReviewCaseMessageResult,
  ReviewReadStore,
  SubmitReviewVersionResult
} from "@elevenhouse/domain";

import { SystemClock } from "../../common/system-clock.js";
import { PUBLIC_REVIEWS_COMMAND_STORE, PUBLIC_REVIEWS_READ_STORE } from "./reviews.tokens";

type PublicReviewCommandStore = {
  readonly submitReviewVersion: (input: {
    readonly actorUserId: string;
    readonly now: string;
    readonly reviewableInstanceId: string;
    readonly nextReviewId: string;
    readonly nextVersionId: string;
    readonly submission: {
      readonly rating: number;
      readonly text: string;
      readonly publicIdentityMode: "named" | "secret_user";
    };
  }) => Promise<SubmitReviewVersionResult>;
  readonly createReviewCaseMessage: (input: {
    readonly messageId: string;
    readonly caseId: string;
    readonly authorUserId: string | null;
    readonly authorRole: "client";
    readonly visibility: "all_case_participants" | "client_and_moderators";
    readonly body: string;
    readonly now: string;
  }) => Promise<CreateReviewCaseMessageResult>;
};

@Injectable()
export class PublicReviewsService {
  constructor(
    @Inject(PUBLIC_REVIEWS_READ_STORE)
    private readonly readStore: Pick<
      ReviewReadStore,
      "listPublicReviews" | "getClientReviewDetail" | "getModerationCaseDetail"
    >,
    @Inject(PUBLIC_REVIEWS_COMMAND_STORE)
    private readonly commandStore: PublicReviewCommandStore,
    @Inject(SystemClock)
    private readonly clock: SystemClock
  ) {}

  async listPublicReviews(query: unknown): Promise<ReviewPublicListResponse> {
    const normalized = normalizePublicReviewsQuery(query);
    if (!normalized.astrologerUserId) {
      throw new BadRequestException("astrologerUserId is required");
    }
    return reviewPublicListResponseSchema.parse(await this.readStore.listPublicReviews(normalized));
  }

  async getClientReviewDetail(
    clientUserId: string,
    reviewableInstanceId: string
  ): Promise<ClientReviewDetail> {
    return this.readRequiredClientReviewDetail(
      requireUuid(clientUserId),
      requireUuid(reviewableInstanceId)
    );
  }

  async submitClientReviewVersion(
    clientUserId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<ClientReviewDetail> {
    const parsed = reviewVersionSubmissionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid review version submission");

    const safeClientUserId = requireUuid(clientUserId);
    const safeReviewableInstanceId = requireUuid(parsed.data.reviewableInstanceId);
    const result = await this.commandStore.submitReviewVersion({
      actorUserId: safeClientUserId,
      now: this.clock.now().toISOString(),
      reviewableInstanceId: safeReviewableInstanceId,
      nextReviewId: deterministicUuid(
        `${safeClientUserId}:${safeReviewableInstanceId}:${idempotencyKey}:review`
      ),
      nextVersionId: deterministicUuid(
        `${safeClientUserId}:${safeReviewableInstanceId}:${idempotencyKey}:version`
      ),
      submission: {
        rating: parsed.data.rating,
        text: parsed.data.text,
        publicIdentityMode: parsed.data.publicIdentityMode
      }
    });

    if (result.kind === "rejected" && result.reason !== "pending_version_exists") {
      throw new BadRequestException("Review version cannot be submitted");
    }

    return this.readRequiredClientReviewDetail(safeClientUserId, safeReviewableInstanceId);
  }

  async getClientModerationCaseDetail(
    clientUserId: string,
    caseId: string
  ): Promise<ReviewModerationCaseDetail> {
    const detail = await this.readStore.getModerationCaseDetail({
      caseId: requireUuid(caseId),
      actorUserId: requireUuid(clientUserId),
      actorRole: "client"
    });
    if (!detail) throw new NotFoundException("Review moderation case was not found");
    return reviewModerationCaseDetailSchema.parse(detail);
  }

  async createClientModerationCaseMessage(
    clientUserId: string,
    caseId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<ReviewModerationCaseMessage> {
    const parsed = reviewModerationCaseMessageCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid review case message");
    if (
      parsed.data.visibility !== "all_case_participants" &&
      parsed.data.visibility !== "client_and_moderators"
    ) {
      throw new BadRequestException("Invalid review case message visibility");
    }

    const safeCaseId = requireUuid(caseId);
    const safeClientUserId = requireUuid(clientUserId);
    const result = await this.commandStore.createReviewCaseMessage({
      messageId: deterministicUuid(`${safeCaseId}:${safeClientUserId}:${idempotencyKey}`),
      caseId: safeCaseId,
      authorUserId: safeClientUserId,
      authorRole: "client",
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

  private async readRequiredClientReviewDetail(
    clientUserId: string,
    reviewableInstanceId: string
  ): Promise<ClientReviewDetail> {
    const detail = await this.readStore.getClientReviewDetail({
      clientUserId,
      reviewableInstanceId
    });
    if (!detail) throw new NotFoundException("Review was not found");
    return clientReviewDetailSchema.parse(detail);
  }
}

function normalizePublicReviewsQuery(query: unknown) {
  if (!isRecord(query)) throw new BadRequestException("Invalid reviews query");
  const parsed = reviewPublicListQuerySchema.safeParse({
    astrologerUserId: optionalString(query.astrologerUserId),
    productId: optionalString(query.productId),
    limit: optionalInteger(query.limit) ?? undefined,
    cursor: optionalString(query.cursor) ?? null
  });
  if (!parsed.success) throw new BadRequestException("Invalid reviews query");
  return parsed.data;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" ? value : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
