import { Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import {
  getIdentityRequestContext,
  type IdentityHttpRequest
} from "../http/identity-http-context";
import type { PublicSessionRequest } from "./identity-current-session.service";
import { IdentityLogoutService } from "./identity-logout.service";
import {
  PublicSessionCookieService,
  type PublicSessionCookieResponse
} from "./identity-session.service";
import { RequireCsrf } from "../../security/route-policy/route-security-policy";

@Controller("identity")
export class IdentitySessionController {
  constructor(
    private readonly logoutService: IdentityLogoutService,
    private readonly publicSessionCookieService: PublicSessionCookieService
  ) {}

  @Post("logout")
  @HttpCode(204)
  @RequireCsrf()
  async logout(
    @Req() request: PublicSessionRequest & IdentityHttpRequest,
    @Res({ passthrough: true }) response: PublicSessionCookieResponse
  ): Promise<void> {
    await this.logoutService.logout(request, getIdentityRequestContext(request));
    this.publicSessionCookieService.clearSessionCookie(response);
  }
}
