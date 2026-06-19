import { Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import {
  getIdentityRequestContext,
  type IdentityHttpRequest
} from "./identity-http-context";
import type { OpsSessionRequest } from "./identity-current-session.service";
import { IdentityLogoutService } from "./identity-logout.service";
import {
  OpsSessionCookieService,
  type OpsSessionCookieResponse
} from "./identity-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";

@Controller("identity")
export class IdentitySessionController {
  constructor(
    private readonly logoutService: IdentityLogoutService,
    private readonly opsSessionCookieService: OpsSessionCookieService
  ) {}

  @Post("logout")
  @HttpCode(204)
  @RequireCsrf()
  async logout(
    @Req() request: OpsSessionRequest & IdentityHttpRequest,
    @Res({ passthrough: true }) response: OpsSessionCookieResponse
  ): Promise<void> {
    await this.logoutService.logout(request, getIdentityRequestContext(request));
    this.opsSessionCookieService.clearSessionCookie(response);
  }
}
