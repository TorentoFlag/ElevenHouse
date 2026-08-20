import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  ReviewModerationCaseDetail,
  ReviewModerationCaseMessage,
  ReviewReplyVersion
} from "@elevenhouse/contracts";

import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { AstrologerReviewsService } from "./reviews.service";

@Controller("reviews")
@UseGuards(AstrologerSessionAuthGuard)
export class AstrologerReviewsController {
  constructor(private readonly service: AstrologerReviewsService) {}

  @Post(":reviewId/reply-versions")
  @RequireIdempotency({ scope: "reviews.reply-version.astrologer.submit" })
  @RequireCsrf()
  submitReviewReplyVersion(
    @Param("reviewId") reviewId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ): Promise<ReviewReplyVersion> {
    return this.service.submitReviewReplyVersion(
      requireAstrologerUserId(request),
      reviewId,
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }

  @Post(":reviewId/disputes")
  @RequireIdempotency({ scope: "reviews.dispute.astrologer.open" })
  @RequireCsrf()
  openReviewDispute(
    @Param("reviewId") reviewId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ): Promise<ReviewModerationCaseDetail> {
    return this.service.openReviewDispute(
      requireAstrologerUserId(request),
      reviewId,
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }

  @Get("moderation-cases/:caseId")
  getModerationCaseDetail(
    @Param("caseId") caseId: string,
    @Req() request: AstrologerSessionRequest
  ): Promise<ReviewModerationCaseDetail> {
    return this.service.getModerationCaseDetail(requireAstrologerUserId(request), caseId);
  }

  @Post("moderation-cases/:caseId/messages")
  @RequireIdempotency({ scope: "reviews.case-message.astrologer.create" })
  @RequireCsrf()
  createModerationCaseMessage(
    @Param("caseId") caseId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ): Promise<ReviewModerationCaseMessage> {
    return this.service.createModerationCaseMessage(
      requireAstrologerUserId(request),
      caseId,
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }
}

function requireAstrologerUserId(request: AstrologerSessionRequest): string {
  const account = request.currentAstrologerAccount?.account;
  if (!account) throw new UnauthorizedException("Valid astrologer session is required");
  return account.id;
}

function requireIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException("Valid Idempotency-Key header is required");
  return normalized;
}
