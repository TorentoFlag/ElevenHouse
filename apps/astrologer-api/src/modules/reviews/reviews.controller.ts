import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  ReviewAstrologerListResponse,
  ReviewModerationCaseDetail,
  ReviewModerationCaseMessage,
  ReviewRequestDeliveryResponse,
  ReviewReplyVersion
} from "@elevenhouse/contracts";

import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { PlatformTariffCapabilityGuard } from "../platform-entitlements/platform-tariff-capability.guard";
import { RequirePlatformTariffCapability } from "../platform-entitlements/platform-tariff-capability.policy";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { AstrologerReviewsService } from "./reviews.service";

@Controller("reviews")
@UseGuards(AstrologerSessionAuthGuard, PlatformTariffCapabilityGuard)
export class AstrologerReviewsController {
  constructor(private readonly service: AstrologerReviewsService) {}

  @Get()
  listAstrologerReviews(
    @Req() request: AstrologerSessionRequest,
    @Query() query: unknown
  ): Promise<ReviewAstrologerListResponse> {
    return this.service.listAstrologerReviews(requireAstrologerUserId(request), query);
  }

  @Post(":reviewId/reply-drafts/ai")
  @RequirePlatformTariffCapability({
    surfaceId: "ai.reviews.reply_draft",
    capability: "ai",
    operation: "generation"
  })
  @RequireIdempotency({ scope: "reviews.reply-draft.ai.create" })
  @RequireCsrf()
  createReplyAiDraft(
    @Param("reviewId") reviewId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.createReplyAiDraft(
      requireAstrologerUserId(request),
      reviewId,
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }

  @Post("request-review")
  @RequireIdempotency({ scope: "reviews.request-review.astrologer.send" })
  @RequireCsrf()
  requestReview(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ): Promise<ReviewRequestDeliveryResponse> {
    return this.service.requestReview(
      requireAstrologerUserId(request),
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }

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
