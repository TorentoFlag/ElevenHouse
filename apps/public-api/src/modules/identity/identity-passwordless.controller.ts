import { Body, Controller, Post, Res } from "@nestjs/common";
import type {
  RequestPasswordlessCodeRequest,
  RequestPasswordlessCodeResponse,
  VerifyPasswordlessCodeRequest,
  VerifyPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import { IdentityPasswordlessService } from "./identity-passwordless.service";
import {
  PublicSessionCookieService,
  type PublicSessionCookieResponse
} from "./identity-session.service";

@Controller("identity/passwordless")
export class IdentityPasswordlessController {
  constructor(
    private readonly identityPasswordlessService: IdentityPasswordlessService,
    private readonly publicSessionCookieService: PublicSessionCookieService
  ) {}

  @Post("request-code")
  requestCode(
    @Body() body: RequestPasswordlessCodeRequest
  ): Promise<RequestPasswordlessCodeResponse> {
    return this.identityPasswordlessService.requestCode(body);
  }

  @Post("verify-code")
  async verifyCode(
    @Body() body: VerifyPasswordlessCodeRequest,
    @Res({ passthrough: true }) response: PublicSessionCookieResponse
  ): Promise<VerifyPasswordlessCodeResponse> {
    const result = await this.identityPasswordlessService.verifyCode(body);

    this.publicSessionCookieService.setSessionCookie(response, result.session);

    return result.response;
  }
}
