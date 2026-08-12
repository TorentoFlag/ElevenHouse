import { Controller, HttpCode, Post, Req, Res, SetMetadata, UseGuards } from "@nestjs/common";
import {
  getIdentityRequestContext,
  type IdentityHttpRequest
} from "../http/identity-http-context";
import type { AstrologerSessionRequest } from "./identity-current-session.service";
import { AstrologerSessionAuthGuard } from "../auth/identity-auth.guard";
import { IdentityLogoutService } from "./identity-logout.service";
import {
  AstrologerSessionCookieService,
  type AstrologerSessionCookieResponse
} from "./identity-session.service";
import { CsrfGuard } from "../../security/csrf/csrf.guard";
import { csrfRequiredMetadataKey } from "../../security/route-policy/route-security-metadata";

@Controller("identity")
export class IdentitySessionController {
  constructor(
    private readonly logoutService: IdentityLogoutService,
    private readonly astrologerSessionCookieService: AstrologerSessionCookieService
  ) {}

  @Post("logout")
  @HttpCode(204)
  @SetMetadata(csrfRequiredMetadataKey, true)
  @UseGuards(AstrologerSessionAuthGuard, CsrfGuard)
  async logout(
    @Req() request: AstrologerSessionRequest & IdentityHttpRequest,
    @Res({ passthrough: true }) response: AstrologerSessionCookieResponse
  ): Promise<void> {
    await this.logoutService.logout(request, getIdentityRequestContext(request));
    this.astrologerSessionCookieService.clearSessionCookie(response);
  }
}
