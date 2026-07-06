import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { VerificationService } from "./verification.service";

@Controller("verification")
@UseGuards(AstrologerSessionAuthGuard)
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get("me")
  getCurrentVerification(@Req() request: AstrologerSessionRequest) {
    return this.verificationService.getCurrentVerification(request);
  }

  @Post("applications")
  @RequireCsrf()
  submitApplication(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.verificationService.submitApplication(body, request);
  }
}
