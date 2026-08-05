import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Get,
  Param,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type { AdminRefundCandidateReviewResponse } from "@elevenhouse/contracts";

import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AdminSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { AdminRefundCandidatesService } from "./refund-candidates.service";

@Controller("admin/finance/refund-candidates")
@UseGuards(AdminSessionAuthGuard)
export class AdminRefundCandidatesController {
  constructor(@Inject(AdminRefundCandidatesService) private readonly service: AdminRefundCandidatesService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.service.list(query);
  }

  @Put(":candidateId/review")
  @RequireCsrf()
  @RequireIdempotency()
  review(
    @Req() request: AdminSessionRequest,
    @Param("candidateId") candidateId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<AdminRefundCandidateReviewResponse> {
    return this.service.review(requireAdminUserId(request), candidateId, body, requireIdempotencyKey(idempotencyKey));
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
