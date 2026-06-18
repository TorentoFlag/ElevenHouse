import { Body, Controller, Post, Req, Res } from "@nestjs/common";
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
import {
  getIdentityRequestContext,
  type IdentityHttpRequest
} from "./identity-http-context";

@Controller("identity/passwordless")
export class IdentityPasswordlessController {
  constructor(
    private readonly identityPasswordlessService: IdentityPasswordlessService,
    private readonly publicSessionCookieService: PublicSessionCookieService
  ) {}

  @Post("request-code")
  requestCode(
    @Body() body: RequestPasswordlessCodeRequest,
    @Req() request: IdentityHttpRequest
  ): Promise<RequestPasswordlessCodeResponse> {
    return this.identityPasswordlessService.requestCode(body, getIdentityRequestContext(request));
  }

  @Post("verify-code")
  async verifyCode(
    @Body() body: VerifyPasswordlessCodeRequest,
    @Req() request: IdentityHttpRequest,
    @Res({ passthrough: true }) response: PublicSessionCookieResponse
  ): Promise<VerifyPasswordlessCodeResponse> {
    const result = await this.identityPasswordlessService.verifyCode(
      body,
      getIdentityRequestContext(request)
    );

    this.publicSessionCookieService.setSessionCookie(response, result.session);

    return result.response;
  }
}
