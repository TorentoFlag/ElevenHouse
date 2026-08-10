import { Body, Controller, ForbiddenException, Inject, Param, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { AdminChargebackResolutionResponse, BeginFinanceAuthorizationResponse } from "@elevenhouse/contracts";
import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AdminAuthenticatedAccount, AdminSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { AdminChargebackResolutionsService } from "./chargeback-resolutions.service";

@Controller("admin/finance/chargeback-cases")
@UseGuards(AdminSessionAuthGuard)
export class AdminChargebackResolutionsController {
  constructor(@Inject(AdminChargebackResolutionsService) private readonly service: AdminChargebackResolutionsService) {}
  @Post(":chargebackCaseId/resolution/authorization") @RequireCsrf()
  begin(@Req() request: AdminSessionRequest, @Param("chargebackCaseId") caseId: string, @Body() body: unknown): Promise<BeginFinanceAuthorizationResponse> { return this.service.beginAuthorization(account(request), caseId, body); }
  @Post(":chargebackCaseId/resolution") @RequireCsrf()
  resolve(@Req() request: AdminSessionRequest, @Param("chargebackCaseId") caseId: string, @Body() body: unknown): Promise<AdminChargebackResolutionResponse> { return this.service.resolve(account(request), caseId, body); }
}
function account(request: AdminSessionRequest): AdminAuthenticatedAccount { const a = request.currentAdminAccount; if (!a) throw new UnauthorizedException("Valid admin session is required"); if (!a.roles.includes("super_admin")) throw new ForbiddenException("Super-admin chargeback resolution is required"); return a; }
