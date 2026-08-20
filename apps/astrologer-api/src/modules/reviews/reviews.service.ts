import { createHash } from "node:crypto";

import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  reviewModerationCaseDetailSchema,
  reviewModerationCaseMessageCreateSchema,
  reviewModerationCaseMessageSchema,
  type ReviewModerationCaseDetail,
  type ReviewModerationCaseMessage
} from "@elevenhouse/contracts";
import type { CreateReviewCaseMessageResult, ReviewReadStore } from "@elevenhouse/domain";

import { SystemClock } from "../clock/system-clock.service";
import { ASTROLOGER_REVIEWS_COMMAND_STORE, ASTROLOGER_REVIEWS_READ_STORE } from "./reviews.tokens";

type AstrologerReviewCommandStore = {
  readonly createReviewCaseMessage: (input: {
    readonly messageId: string;
    readonly caseId: string;
    readonly authorUserId: string | null;
    readonly authorRole: "astrologer";
    readonly visibility: "all_case_participants" | "astrologer_and_moderators";
    readonly body: string;
    readonly now: string;
  }) => Promise<CreateReviewCaseMessageResult>;
};

@Injectable()
export class AstrologerReviewsService {
  constructor(
    @Inject(ASTROLOGER_REVIEWS_READ_STORE)
    private readonly readStore: Pick<ReviewReadStore, "getModerationCaseDetail">,
    @Inject(ASTROLOGER_REVIEWS_COMMAND_STORE)
    private readonly commandStore: AstrologerReviewCommandStore,
    private readonly clock: SystemClock
  ) {}

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
    if (
      parsed.data.visibility !== "all_case_participants" &&
      parsed.data.visibility !== "astrologer_and_moderators"
    ) {
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
