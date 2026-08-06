import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  AdminPaymentReversalQueueResponse,
  AdminPaymentReversalCase,
  AdminReconciliationExceptionQueueResponse,
  AdminPayoutQueueResponse,
  ReconciliationRecordResponse,
  PayoutRequestResponse,
  AstrologerRiskProfileResponse,
  BeginFinanceAuthorizationResponse,
  FinancePoliciesResponse,
  FinancePolicyResponse,
  OrderResponse
} from "@elevenhouse/contracts";
import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type {
  AdminAuthenticatedAccount,
  AdminSessionRequest
} from "../identity/session/identity-current-session.service";
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
  listPayoutRequests(@Query("status") status?: string): Promise<AdminPayoutQueueResponse> {
    return this.service.listPayoutRequests(status);
  }

  @Get("reversal-cases")
  listPaymentReversalCases(
    @Query("type") type?: string
  ): Promise<AdminPaymentReversalQueueResponse> {
    return this.service.listPaymentReversalCases(type);
  }

  @Put("reversal-cases/:reversalCaseId/review")
  @RequireCsrf()
  reviewPaymentReversalCase(
    @Req() request: AdminSessionRequest,
    @Param("reversalCaseId") reversalCaseId: string,
    @Body() body: unknown
  ): Promise<AdminPaymentReversalCase> {
    return this.service.reviewPaymentReversalCase(
      requireAdminUserId(request),
      reversalCaseId,
      body
    );
  }

  @Get("reconciliation/exceptions")
  listReconciliationExceptions(
    @Query("provider") provider?: string,
    @Query("environment") environment?: string,
    @Query("evidence") evidence?: string
  ): Promise<AdminReconciliationExceptionQueueResponse> {
    return this.service.listReconciliationExceptions({ provider, environment, evidence });
  }

  @Put("reconciliation/exceptions/:reconciliationRecordId")
  @RequireCsrf()
  resolveReconciliationException(
    @Req() request: AdminSessionRequest,
    @Param("reconciliationRecordId") reconciliationRecordId: string,
    @Body() body: unknown
  ): Promise<ReconciliationRecordResponse> {
    return this.service.resolveReconciliationException(
      requireAdminUserId(request),
      reconciliationRecordId,
      body
    );
  }

  @Put("payout-requests/:payoutRequestId/status")
  @RequireCsrf()
  updatePayoutRequestStatus(
    @Req() request: AdminSessionRequest,
    @Param("payoutRequestId") payoutRequestId: string,
    @Body() body: unknown
  ): Promise<PayoutRequestResponse> {
    return this.service.updatePayoutRequestStatus(
      requireAdminAccount(request),
      payoutRequestId,
      body
    );
  }

  @Post("payout-requests/:payoutRequestId/approval/authorization")
  @RequireCsrf()
  beginOnlinePayoutApprovalAuthorization(
    @Req() request: AdminSessionRequest,
    @Param("payoutRequestId") payoutRequestId: string
  ): Promise<BeginFinanceAuthorizationResponse> {
    return this.service.beginOnlinePayoutApprovalAuthorization(
      requireSuperAdminAccount(request),
      payoutRequestId
    );
  }

  @Post("payout-requests/:payoutRequestId/approval")
  @RequireCsrf()
  approveOnlinePayout(
    @Req() request: AdminSessionRequest,
    @Param("payoutRequestId") payoutRequestId: string,
    @Body() body: unknown
  ): Promise<PayoutRequestResponse> {
    return this.service.approveOnlinePayout(requireSuperAdminAccount(request), payoutRequestId, body);
  }

  @Post("payout-requests/:payoutRequestId/manual-execution/authorization")
  @RequireCsrf()
  beginOnlinePayoutManualExecutionAuthorization(
    @Req() request: AdminSessionRequest,
    @Param("payoutRequestId") payoutRequestId: string
  ): Promise<BeginFinanceAuthorizationResponse> {
    return this.service.beginOnlinePayoutManualExecutionAuthorization(
      requireSuperAdminAccount(request),
      payoutRequestId
    );
  }

  @Post("payout-requests/:payoutRequestId/manual-execution")
  @RequireCsrf()
  startOnlinePayoutManualExecution(
    @Req() request: AdminSessionRequest,
    @Param("payoutRequestId") payoutRequestId: string,
    @Body() body: unknown
  ): Promise<PayoutRequestResponse> {
    return this.service.startOnlinePayoutManualExecution(
      requireSuperAdminAccount(request),
      payoutRequestId,
      body
    );
  }

  @Post("payout-requests/:payoutRequestId/paid/authorization")
  @RequireCsrf()
  beginOnlinePayoutPaidAuthorization(
    @Req() request: AdminSessionRequest,
    @Param("payoutRequestId") payoutRequestId: string,
    @Body() body: unknown
  ): Promise<BeginFinanceAuthorizationResponse> {
    return this.service.beginOnlinePayoutPaidAuthorization(
      requireSuperAdminAccount(request),
      payoutRequestId,
      body
    );
  }

  @Post("payout-requests/:payoutRequestId/paid")
  @RequireCsrf()
  confirmOnlinePayoutPaid(
    @Req() request: AdminSessionRequest,
    @Param("payoutRequestId") payoutRequestId: string,
    @Body() body: unknown
  ): Promise<PayoutRequestResponse> {
    return this.service.confirmOnlinePayoutPaid(
      requireSuperAdminAccount(request),
      payoutRequestId,
      body
    );
  }
}

function requireAdminUserId(request: AdminSessionRequest): string {
  return requireAdminAccount(request).id;
}

function requireAdminAccount(request: AdminSessionRequest): AdminAuthenticatedAccount {
  const account = request.currentAdminAccount;
  if (!account) {
    throw new UnauthorizedException("Valid admin session is required");
  }
  return account;
}

function requireSuperAdminAccount(request: AdminSessionRequest): AdminAuthenticatedAccount {
  const account = requireAdminAccount(request);
  if (!account.roles.includes("super_admin")) {
    throw new ForbiddenException("Super-admin finance authorization is required");
  }
  return account;
}
