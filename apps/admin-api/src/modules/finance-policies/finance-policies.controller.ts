import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  AdminPayoutQueueResponse,
  PayoutRequestResponse,
  AstrologerRiskProfileResponse,
  FinancePoliciesResponse,
  FinancePolicyResponse,
  OrderResponse
} from "@elevenhouse/contracts";
import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AdminSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { FinancePoliciesService } from "./finance-policies.service";

@Controller("admin/finance")
@UseGuards(AdminSessionAuthGuard)
export class FinancePoliciesController {
  constructor(@Inject(FinancePoliciesService) private readonly service: FinancePoliciesService) {}

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

  @Post("orders/:orderId/apply-risk-policy")
  @RequireCsrf()
  applyRiskPolicyToOrder(
    @Req() request: AdminSessionRequest,
    @Param("orderId") orderId: string
  ): Promise<OrderResponse> {
    return this.service.applyRiskPolicyToOrder(requireAdminUserId(request), orderId);
  }

  @Get("payout-requests")
  listPayoutRequests(): Promise<AdminPayoutQueueResponse> {
    return this.service.listPayoutRequests();
  }

  @Put("payout-requests/:payoutRequestId/status")
  @RequireCsrf()
  updatePayoutRequestStatus(
    @Req() request: AdminSessionRequest,
    @Param("payoutRequestId") payoutRequestId: string,
    @Body() body: unknown
  ): Promise<PayoutRequestResponse> {
    return this.service.updatePayoutRequestStatus(
      requireAdminUserId(request),
      payoutRequestId,
      body
    );
  }
}

function requireAdminUserId(request: AdminSessionRequest): string {
  const account = request.currentAdminAccount;
  if (!account) {
    throw new UnauthorizedException("Valid admin session is required");
  }
  return account.id;
}
