import { Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import {
  getIdentityRequestContext,
  type IdentityHttpRequest
} from "../http/identity-http-context";
import type { AstrologerSessionRequest } from "./identity-current-session.service";
import { IdentityLogoutService } from "./identity-logout.service";
import {
  AstrologerSessionCookieService,
  type AstrologerSessionCookieResponse
} from "./identity-session.service";
import { RequireCsrf } from "../../security/route-policy/route-security-policy";

@Controller("identity")
export class IdentitySessionController {
  constructor(
    private readonly logoutService: IdentityLogoutService,
    private readonly astrologerSessionCookieService: AstrologerSessionCookieService
  ) {}

  @Post("logout")
  @HttpCode(204)
  @RequireCsrf()
  async logout(
    @Req() request: AstrologerSessionRequest & IdentityHttpRequest,
    @Res({ passthrough: true }) response: AstrologerSessionCookieResponse
  ): Promise<void> {
    await this.logoutService.logout(request, getIdentityRequestContext(request));
    this.astrologerSessionCookieService.clearSessionCookie(response);
  }
}
