import { createHash } from "node:crypto";

import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  reviewAdminDetailSchema,
  reviewModerationCaseDetailSchema,
  reviewModerationCaseMessageCreateSchema,
  reviewModerationCaseMessageSchema,
  type ReviewAdminDetail,
  type ReviewModerationCaseDetail,
  type ReviewModerationCaseMessage
} from "@elevenhouse/contracts";
import type { CreateReviewCaseMessageResult, ReviewReadStore } from "@elevenhouse/domain";

import { SystemClock } from "../../common/system-clock.js";
import { ADMIN_REVIEWS_COMMAND_STORE, ADMIN_REVIEWS_READ_STORE } from "./reviews.tokens";

type AdminReviewCommandStore = {
  readonly createReviewCaseMessage: (input: {
    readonly messageId: string;
    readonly caseId: string;
    readonly authorUserId: string | null;
    readonly authorRole: "moderator";
    readonly visibility:
      | "all_case_participants"
      | "client_and_moderators"
      | "astrologer_and_moderators"
      | "moderators_only";
    readonly body: string;
    readonly now: string;
  }) => Promise<CreateReviewCaseMessageResult>;
};

@Injectable()
export class AdminReviewsService {
  constructor(
    @Inject(ADMIN_REVIEWS_READ_STORE)
    private readonly readStore: Pick<
      ReviewReadStore,
      "getAdminReviewDetail" | "getModerationCaseDetail"
    >,
    @Inject(ADMIN_REVIEWS_COMMAND_STORE)
    private readonly commandStore: AdminReviewCommandStore,
    @Inject(SystemClock)
    private readonly clock: SystemClock
  ) {}

  async getReviewDetail(reviewId: string): Promise<ReviewAdminDetail> {
    const detail = await this.readStore.getAdminReviewDetail({ reviewId: requireUuid(reviewId) });
    if (!detail) throw new NotFoundException("Review was not found");
    return reviewAdminDetailSchema.parse(detail);
  }

  async getModerationCaseDetail(
    adminUserId: string,
    caseId: string
  ): Promise<ReviewModerationCaseDetail> {
    const detail = await this.readStore.getModerationCaseDetail({
      caseId: requireUuid(caseId),
      actorUserId: requireUuid(adminUserId),
      actorRole: "moderator"
    });
    if (!detail) throw new NotFoundException("Review moderation case was not found");
    return reviewModerationCaseDetailSchema.parse(detail);
  }

  async createModerationCaseMessage(
    adminUserId: string,
    caseId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<ReviewModerationCaseMessage> {
    const parsed = reviewModerationCaseMessageCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid review case message");
    const safeCaseId = requireUuid(caseId);
    const safeAdminUserId = requireUuid(adminUserId);
    const result = await this.commandStore.createReviewCaseMessage({
      messageId: deterministicUuid(`${safeCaseId}:${safeAdminUserId}:${idempotencyKey}`),
      caseId: safeCaseId,
      authorUserId: safeAdminUserId,
      authorRole: "moderator",
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

function deterministicUuid(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function requireUuid(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value
    )
  ) {
    throw new BadRequestException("Valid UUID is required");
  }
  return value;
}
