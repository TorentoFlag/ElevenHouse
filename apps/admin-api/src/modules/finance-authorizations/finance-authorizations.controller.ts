import {
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  BeginFinanceAuthorizationResponse,
  BeginFinanceWebAuthnRegistrationResponse,
  VerifyFinanceAuthorizationResponse,
  VerifyFinanceWebAuthnRegistrationResponse
} from "@elevenhouse/contracts";

import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type {
  AdminAuthenticatedAccount,
  AdminSessionRequest
} from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { AdminFinanceAuthorizationsService } from "./finance-authorizations.service";

@Controller("admin/finance/authorizations")
@UseGuards(AdminSessionAuthGuard)
export class AdminFinanceAuthorizationsController {
  constructor(@Inject(AdminFinanceAuthorizationsService) private readonly service: AdminFinanceAuthorizationsService) {}

  @Post("begin")
  @RequireCsrf()
  begin(@Req() request: AdminSessionRequest, @Body() body: unknown): Promise<BeginFinanceAuthorizationResponse> {
    return this.service.begin(requireSuperAdmin(request), body);
  }

  @Post("verify")
  @RequireCsrf()
  verify(@Req() request: AdminSessionRequest, @Body() body: unknown): Promise<VerifyFinanceAuthorizationResponse> {
    return this.service.verify(requireSuperAdmin(request), body);
  }

  @Post("passkeys/registration-options")
  @RequireCsrf()
  beginRegistration(@Req() request: AdminSessionRequest): Promise<BeginFinanceWebAuthnRegistrationResponse> {
    return this.service.beginRegistration(requireSuperAdmin(request));
  }

  @Post("passkeys/verify-registration")
  @RequireCsrf()
  verifyRegistration(
    @Req() request: AdminSessionRequest,
    @Body() body: unknown
  ): Promise<VerifyFinanceWebAuthnRegistrationResponse> {
    return this.service.verifyRegistration(requireSuperAdmin(request), body);
  }
}

function requireSuperAdmin(request: AdminSessionRequest): AdminAuthenticatedAccount {
  const account = request.currentAdminAccount;
  if (!account) throw new UnauthorizedException("Valid admin session is required");
  if (!account.roles.includes("super_admin")) {
    throw new ForbiddenException("Super-admin finance authorization is required");
  }
  return account;
}
