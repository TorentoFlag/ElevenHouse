import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { AstrologerProfileService } from "./astrologer-profile.service";

@Controller("astrologer-profile")
@UseGuards(AstrologerSessionAuthGuard)
export class AstrologerProfileController {
  constructor(private readonly astrologerProfileService: AstrologerProfileService) {}

  @Get("me")
  getCurrentProfile(@Req() request: AstrologerSessionRequest) {
    return this.astrologerProfileService.getCurrentProfile(request);
  }

  @Put("me")
  @RequireCsrf()
  upsertCurrentProfile(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.astrologerProfileService.upsertCurrentProfile(body, request);
  }
}
