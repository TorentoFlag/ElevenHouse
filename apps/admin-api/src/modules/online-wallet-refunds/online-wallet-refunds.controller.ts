import {
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  AdminOnlineWalletRefundApprovalResponse,
  BeginFinanceAuthorizationResponse
} from "@elevenhouse/contracts";

import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type {
  AdminAuthenticatedAccount,
  AdminSessionRequest
} from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { AdminOnlineWalletRefundsService } from "./online-wallet-refunds.service";

@Controller("admin/finance/refund-candidates")
@UseGuards(AdminSessionAuthGuard)
export class AdminOnlineWalletRefundsController {
  constructor(@Inject(AdminOnlineWalletRefundsService) private readonly service: AdminOnlineWalletRefundsService) {}

  @Post(":candidateId/approval/authorization")
  @RequireCsrf()
  beginAuthorization(
    @Req() request: AdminSessionRequest,
    @Param("candidateId") candidateId: string,
    @Body() body: unknown
  ): Promise<BeginFinanceAuthorizationResponse> {
    return this.service.beginAuthorization(requireSuperAdmin(request), candidateId, body);
  }

  @Post(":candidateId/approval")
  @RequireCsrf()
  approve(
    @Req() request: AdminSessionRequest,
    @Param("candidateId") candidateId: string,
    @Body() body: unknown
  ): Promise<AdminOnlineWalletRefundApprovalResponse> {
    return this.service.approve(requireSuperAdmin(request), candidateId, body);
  }
}

function requireSuperAdmin(request: AdminSessionRequest): AdminAuthenticatedAccount {
  const account = request.currentAdminAccount;
  if (!account) throw new UnauthorizedException("Valid admin session is required");
  if (!account.roles.includes("super_admin")) {
    throw new ForbiddenException("Super-admin refund authorization is required");
  }
  return account;
}
