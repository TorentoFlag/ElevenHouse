import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { PlatformBillingService } from "./platform-billing.service";

@Controller("platform-billing")
@UseGuards(AstrologerSessionAuthGuard)
export class PlatformBillingController {
  constructor(private readonly platformBillingService: PlatformBillingService) {}

  @Get("me")
  getCurrentBillingOverview(@Req() request: AstrologerSessionRequest) {
    return this.platformBillingService.getCurrentBillingOverview(request);
  }
}
