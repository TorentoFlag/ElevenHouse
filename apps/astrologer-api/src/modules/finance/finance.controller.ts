import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  AstrologerFinanceOverviewResponse,
  PayoutMethodResponse,
  PayoutRequestResponse
} from "@elevenhouse/contracts";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { FinanceService } from "./finance.service";

@Controller("finance")
@UseGuards(AstrologerSessionAuthGuard)
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly service: FinanceService) {}

  @Get("me")
  getCurrentFinanceOverview(
    @Req() request: AstrologerSessionRequest
  ): Promise<AstrologerFinanceOverviewResponse> {
    return this.service.getCurrentFinanceOverview(request);
  }

  @Post("payout-methods/manual-bank-transfer")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astrologer.finance.payout-method.manual-bank-transfer" })
  createManualBankTransferPayoutMethod(
    @Req() request: AstrologerSessionRequest,
    @Body() body: unknown
  ): Promise<PayoutMethodResponse> {
    return this.service.createManualBankTransferPayoutMethod(request, body);
  }

  @Post("payout-requests")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astrologer.finance.payout-request" })
  createPayoutRequest(
    @Req() request: AstrologerSessionRequest,
    @Body() body: unknown
  ): Promise<PayoutRequestResponse> {
    return this.service.createPayoutRequest(request, body);
  }
}
