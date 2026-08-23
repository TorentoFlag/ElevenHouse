import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  ReviewAdminDetail,
  ReviewModerationCaseDetail,
  ReviewModerationCaseMessage,
  ReviewModerationQueueResponse,
  ReviewRatingAggregateReconciliationResponse
} from "@elevenhouse/contracts";

import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AdminSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { AdminReviewsService } from "./reviews.service";

@Controller("admin/reviews")
@UseGuards(AdminSessionAuthGuard)
export class AdminReviewsController {
  constructor(@Inject(AdminReviewsService) private readonly service: AdminReviewsService) {}

  @Get("moderation-queue")
  listModerationQueue(@Query() query: unknown): Promise<ReviewModerationQueueResponse> {
    return this.service.listModerationQueue(query);
  }

  @Get("moderation-cases/:caseId")
  getModerationCaseDetail(
    @Req() request: AdminSessionRequest,
    @Param("caseId") caseId: string
  ): Promise<ReviewModerationCaseDetail> {
    return this.service.getModerationCaseDetail(requireAdminUserId(request), caseId);
  }

  @Post("moderation-cases/:caseId/messages")
  @RequireCsrf()
  @RequireIdempotency()
  createModerationCaseMessage(
    @Req() request: AdminSessionRequest,
    @Param("caseId") caseId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<ReviewModerationCaseMessage> {
    return this.service.createModerationCaseMessage(
      requireAdminUserId(request),
      caseId,
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }

  @Post("moderation-cases/:caseId/status")
  @RequireCsrf()
  @RequireIdempotency()
  updateModerationCaseStatus(
    @Req() request: AdminSessionRequest,
    @Param("caseId") caseId: string,
    @Body() body: unknown
  ): Promise<ReviewModerationCaseDetail> {
    return this.service.updateModerationCaseStatus(requireAdminUserId(request), caseId, body);
  }

  @Post(":reviewId/versions/:versionId/approve")
  @RequireCsrf()
  @RequireIdempotency()
  approveReviewVersion(
    @Req() request: AdminSessionRequest,
    @Param("reviewId") reviewId: string,
    @Param("versionId") versionId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<ReviewAdminDetail> {
    return this.service.approveReviewVersion(
      requireAdminUserId(request),
      reviewId,
      versionId,
      requireIdempotencyKey(idempotencyKey)
    );
  }

  @Post(":reviewId/versions/:versionId/reject")
  @RequireCsrf()
  @RequireIdempotency()
  rejectReviewVersion(
    @Req() request: AdminSessionRequest,
    @Param("reviewId") reviewId: string,
    @Param("versionId") versionId: string,
    @Body() body: unknown
  ): Promise<ReviewAdminDetail> {
    return this.service.rejectReviewVersion(requireAdminUserId(request), reviewId, versionId, body);
  }

  @Post(":reviewId/reply-versions/:replyVersionId/approve")
  @RequireCsrf()
  @RequireIdempotency()
  approveReviewReplyVersion(
    @Req() request: AdminSessionRequest,
    @Param("reviewId") reviewId: string,
    @Param("replyVersionId") replyVersionId: string
  ): Promise<ReviewAdminDetail> {
    return this.service.approveReviewReplyVersion(
      requireAdminUserId(request),
      reviewId,
      replyVersionId
    );
  }

  @Post(":reviewId/reply-versions/:replyVersionId/reject")
  @RequireCsrf()
  @RequireIdempotency()
  rejectReviewReplyVersion(
    @Req() request: AdminSessionRequest,
    @Param("reviewId") reviewId: string,
    @Param("replyVersionId") replyVersionId: string,
    @Body() body: unknown
  ): Promise<ReviewAdminDetail> {
    return this.service.rejectReviewReplyVersion(
      requireAdminUserId(request),
      reviewId,
      replyVersionId,
      body
    );
  }

  @Post(":reviewId/moderation-cases/:caseId/restore")
  @RequireCsrf()
  @RequireIdempotency()
  restoreReviewAfterDispute(
    @Req() request: AdminSessionRequest,
    @Param("reviewId") reviewId: string,
    @Param("caseId") caseId: string
  ): Promise<ReviewAdminDetail> {
    return this.service.restoreReviewAfterDispute(requireAdminUserId(request), reviewId, caseId);
  }

  @Post(":reviewId/moderation-cases/:caseId/hide")
  @RequireCsrf()
  @RequireIdempotency()
  hideReviewByModerationFromCase(
    @Req() request: AdminSessionRequest,
    @Param("reviewId") reviewId: string,
    @Param("caseId") caseId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<ReviewAdminDetail> {
    return this.service.hideReviewByModeration(
      requireAdminUserId(request),
      reviewId,
      caseId,
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }

  @Post(":reviewId/hide")
  @RequireCsrf()
  @RequireIdempotency()
  hideReviewByModeration(
    @Req() request: AdminSessionRequest,
    @Param("reviewId") reviewId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<ReviewAdminDetail> {
    return this.service.hideReviewByModeration(
      requireAdminUserId(request),
      reviewId,
      null,
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }

  @Post(":reviewId/rating-aggregates/reconcile")
  @RequireCsrf()
  @RequireIdempotency()
  reconcileRatingAggregatesForReview(
    @Req() request: AdminSessionRequest,
    @Param("reviewId") reviewId: string
  ): Promise<ReviewRatingAggregateReconciliationResponse> {
    return this.service.reconcileRatingAggregatesForReview(requireAdminUserId(request), reviewId);
  }

  @Get(":reviewId")
  getReviewDetail(@Param("reviewId") reviewId: string): Promise<ReviewAdminDetail> {
    return this.service.getReviewDetail(reviewId);
  }
}

function requireAdminUserId(request: AdminSessionRequest): string {
  const account = request.currentAdminAccount;
  if (!account) throw new UnauthorizedException("Valid admin session is required");
  return account.id;
}

function requireIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException("Valid Idempotency-Key header is required");
  return normalized;
}
