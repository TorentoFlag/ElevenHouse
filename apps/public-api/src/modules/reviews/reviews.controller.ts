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
  ClientReviewDetail,
  ReviewModerationCaseDetail,
  ReviewModerationCaseMessage,
  ReviewPublicListResponse
} from "@elevenhouse/contracts";

import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { PublicReviewsService } from "./reviews.service";

@Controller("reviews")
export class PublicReviewsController {
  constructor(@Inject(PublicReviewsService) private readonly service: PublicReviewsService) {}

  @Get()
  listPublicReviews(@Query() query: unknown): Promise<ReviewPublicListResponse> {
    return this.service.listPublicReviews(query);
  }
}

@Controller("me/reviews")
@UseGuards(PublicSessionAuthGuard)
export class PublicMyReviewsController {
  constructor(@Inject(PublicReviewsService) private readonly service: PublicReviewsService) {}

  @Get("reviewable-instances/:reviewableInstanceId")
  getClientReviewDetail(
    @Req() request: PublicSessionRequest,
    @Param("reviewableInstanceId") reviewableInstanceId: string
  ): Promise<ClientReviewDetail> {
    return this.service.getClientReviewDetail(requireCustomerUserId(request), reviewableInstanceId);
  }

  @Post("versions")
  @RequireCsrf()
  @RequireIdempotency({ scope: "reviews.client-version.submit" })
  submitReviewVersion(
    @Req() request: PublicSessionRequest,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<ClientReviewDetail> {
    return this.service.submitClientReviewVersion(
      requireCustomerUserId(request),
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }

  @Get("moderation-cases/:caseId")
  getModerationCaseDetail(
    @Req() request: PublicSessionRequest,
    @Param("caseId") caseId: string
  ): Promise<ReviewModerationCaseDetail> {
    return this.service.getClientModerationCaseDetail(requireCustomerUserId(request), caseId);
  }

  @Post("moderation-cases/:caseId/messages")
  @RequireCsrf()
  @RequireIdempotency({ scope: "reviews.case-message.client.create" })
  createModerationCaseMessage(
    @Req() request: PublicSessionRequest,
    @Param("caseId") caseId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<ReviewModerationCaseMessage> {
    return this.service.createClientModerationCaseMessage(
      requireCustomerUserId(request),
      caseId,
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }
}

function requireCustomerUserId(request: PublicSessionRequest): string {
  const account = request.currentCustomerAccount?.account;
  if (!account) throw new UnauthorizedException("Valid public session is required");
  return account.id;
}

function requireIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException("Valid Idempotency-Key header is required");
  return normalized;
}
