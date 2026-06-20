import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import type {
  VerifyRegistrationPasswordlessCodeRequest,
  VerifyRegistrationPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import {
  getIdentityRequestContext,
  type IdentityHttpRequest
} from "../http/identity-http-context";
import {
  PublicSessionCookieService,
  type PublicSessionCookieResponse
} from "../session/identity-session.service";
import { IdentityRegistrationService } from "./identity-registration.service";

@Controller("identity/registration/passwordless")
export class IdentityRegistrationController {
  constructor(
    private readonly registrationService: IdentityRegistrationService,
    private readonly publicSessionCookieService: PublicSessionCookieService
  ) {}

  @Post("verify-code")
  async verifyCodeAndRegister(
    @Body() body: VerifyRegistrationPasswordlessCodeRequest,
    @Req() request: IdentityHttpRequest,
    @Res({ passthrough: true }) response: PublicSessionCookieResponse
  ): Promise<VerifyRegistrationPasswordlessCodeResponse> {
    const result = await this.registrationService.verifyCodeAndRegister(
      body,
      getIdentityRequestContext(request)
    );

    this.publicSessionCookieService.setSessionCookie(response, result.session);

    return result.response;
  }
}
