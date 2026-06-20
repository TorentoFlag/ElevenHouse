import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import type {
  RequestAstrologerPasswordlessCodeRequest,
  RequestAstrologerPasswordlessCodeResponse,
  VerifyAstrologerPasswordlessCodeRequest,
  VerifyAstrologerPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import { IdentityPasswordlessService } from "./identity-passwordless.service";
import {
  AstrologerSessionCookieService,
  type AstrologerSessionCookieResponse
} from "../session/identity-session.service";
import {
  getIdentityRequestContext,
  type IdentityHttpRequest
} from "../http/identity-http-context";

@Controller("identity/astrologer/passwordless")
export class IdentityPasswordlessController {
  constructor(
    private readonly identityPasswordlessService: IdentityPasswordlessService,
    private readonly astrologerSessionCookieService: AstrologerSessionCookieService
  ) {}

  @Post("request-code")
  requestCode(
    @Body() body: RequestAstrologerPasswordlessCodeRequest,
    @Req() request: IdentityHttpRequest
  ): Promise<RequestAstrologerPasswordlessCodeResponse> {
    return this.identityPasswordlessService.requestCode(body, getIdentityRequestContext(request));
  }

  @Post("verify-code")
  async verifyCode(
    @Body() body: VerifyAstrologerPasswordlessCodeRequest,
    @Req() request: IdentityHttpRequest,
    @Res({ passthrough: true }) response: AstrologerSessionCookieResponse
  ): Promise<VerifyAstrologerPasswordlessCodeResponse> {
    const result = await this.identityPasswordlessService.verifyCode(
      body,
      getIdentityRequestContext(request)
    );

    this.astrologerSessionCookieService.setSessionCookie(response, result.session);

    return result.response;
  }
}
