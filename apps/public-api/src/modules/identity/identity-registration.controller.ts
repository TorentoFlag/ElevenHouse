import { Body, Controller, Post, Res } from "@nestjs/common";
import type {
  RegisterCustomerAccountRequest,
  RegisterCustomerAccountResponse
} from "@elevenhouse/contracts";
import { IdentityRegistrationService } from "./identity-registration.service";
import {
  PublicSessionCookieService,
  type PublicSessionCookieResponse
} from "./identity-session.service";

@Controller("identity")
export class IdentityRegistrationController {
  constructor(
    private readonly identityRegistrationService: IdentityRegistrationService,
    private readonly publicSessionCookieService: PublicSessionCookieService
  ) {}

  @Post("register")
  async registerCustomerAccount(
    @Body() body: RegisterCustomerAccountRequest,
    @Res({ passthrough: true }) response: PublicSessionCookieResponse
  ): Promise<RegisterCustomerAccountResponse> {
    const result = await this.identityRegistrationService.registerCustomerAccount(body);

    this.publicSessionCookieService.setSessionCookie(response, result.session);

    return result.response;
  }
}
