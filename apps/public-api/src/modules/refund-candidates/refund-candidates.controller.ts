import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Inject,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type { ClientRefundCandidateResponse } from "@elevenhouse/contracts";

import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { RefundCandidatesService } from "./refund-candidates.service";

@Controller("client/orders")
@UseGuards(PublicSessionAuthGuard)
export class RefundCandidatesController {
  constructor(
    @Inject(RefundCandidatesService)
    private readonly refundCandidatesService: RefundCandidatesService
  ) {}

  @Post(":orderId/disputes")
  @RequireCsrf()
  @RequireIdempotency({ scope: "refund-candidates.submit" })
  submit(
    @Req() request: PublicSessionRequest,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<ClientRefundCandidateResponse> {
    return this.refundCandidatesService.submit(
      requireClientUserId(request),
      orderId,
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }

  @Get(":orderId/disputes")
  list(
    @Req() request: PublicSessionRequest,
    @Param("orderId") orderId: string
  ): Promise<readonly ClientRefundCandidateResponse[]> {
    return this.refundCandidatesService.list(requireClientUserId(request), orderId);
  }
}

function requireClientUserId(request: PublicSessionRequest): string {
  const account = request.currentCustomerAccount?.account;
  if (!account) throw new UnauthorizedException("Valid public session is required");
  if (!account.roles.includes("client")) throw new ForbiddenException("Client role is required");
  return account.id;
}

function requireIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException("Valid Idempotency-Key header is required");
  return normalized;
}
