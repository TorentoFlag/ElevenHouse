import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  ReviewAdminDetail,
  ReviewModerationCaseDetail,
  ReviewModerationCaseMessage
} from "@elevenhouse/contracts";

import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AdminSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { AdminReviewsService } from "./reviews.service";

@Controller("admin/reviews")
@UseGuards(AdminSessionAuthGuard)
export class AdminReviewsController {
  constructor(@Inject(AdminReviewsService) private readonly service: AdminReviewsService) {}

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
