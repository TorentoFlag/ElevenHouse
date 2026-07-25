import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  AstrologerRiskProfileResponse,
  FinancePoliciesResponse,
  FinancePolicyResponse
} from "@elevenhouse/contracts";
import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AdminSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { FinancePoliciesService } from "./finance-policies.service";

@Controller("admin/finance")
@UseGuards(AdminSessionAuthGuard)
export class FinancePoliciesController {
  constructor(private readonly service: FinancePoliciesService) {}

  @Get("policies")
  listPolicies(): Promise<FinancePoliciesResponse> {
    return this.service.listPolicies();
  }

  @Post("policies/default")
  @RequireCsrf()
  ensureDefault(@Req() request: AdminSessionRequest): Promise<FinancePolicyResponse> {
    return this.service.ensureDefault(requireAdminUserId(request));
  }

  @Put("policies/default")
  @RequireCsrf()
  updatePolicy(
    @Req() request: AdminSessionRequest,
    @Body() body: unknown
  ): Promise<FinancePolicyResponse> {
    return this.service.updatePolicy(requireAdminUserId(request), body);
  }

  @Put("risk-profiles/:astrologerId")
  @RequireCsrf()
  updateRiskProfile(
    @Req() request: AdminSessionRequest,
    @Param("astrologerId") astrologerId: string,
    @Body() body: unknown
  ): Promise<AstrologerRiskProfileResponse> {
    return this.service.updateRiskProfile(requireAdminUserId(request), astrologerId, body);
  }
}

function requireAdminUserId(request: AdminSessionRequest): string {
  const account = request.currentAdminAccount;
  if (!account) {
    throw new UnauthorizedException("Valid admin session is required");
  }
  return account.id;
}
