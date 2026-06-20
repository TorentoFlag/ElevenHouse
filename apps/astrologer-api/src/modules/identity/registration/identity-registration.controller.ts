import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import type {
  VerifyAstrologerRegistrationPasswordlessCodeRequest,
  VerifyAstrologerRegistrationPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import {
  getIdentityRequestContext,
  type IdentityHttpRequest
} from "../http/identity-http-context";
import {
  AstrologerSessionCookieService,
  type AstrologerSessionCookieResponse
} from "../session/identity-session.service";
import { IdentityRegistrationService } from "./identity-registration.service";

@Controller("identity/astrologer/registration/passwordless")
export class IdentityRegistrationController {
  constructor(
    private readonly registrationService: IdentityRegistrationService,
    private readonly astrologerSessionCookieService: AstrologerSessionCookieService
  ) {}

  @Post("verify-code")
  async verifyCodeAndRegister(
    @Body() body: VerifyAstrologerRegistrationPasswordlessCodeRequest,
    @Req() request: IdentityHttpRequest,
    @Res({ passthrough: true }) response: AstrologerSessionCookieResponse
  ): Promise<VerifyAstrologerRegistrationPasswordlessCodeResponse> {
    const result = await this.registrationService.verifyCodeAndRegister(
      body,
      getIdentityRequestContext(request)
    );

    this.astrologerSessionCookieService.setSessionCookie(response, result.session);

    return result.response;
  }
}
