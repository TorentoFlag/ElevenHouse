import { Body, Controller, Post } from "@nestjs/common";
import type {
  RegisterCustomerAccountRequest,
  RegisterCustomerAccountResponse
} from "@elevenhouse/contracts";
import { IdentityRegistrationService } from "./identity-registration.service";

@Controller("identity")
export class IdentityRegistrationController {
  constructor(private readonly identityRegistrationService: IdentityRegistrationService) {}

  @Post("register")
  registerCustomerAccount(
    @Body() body: RegisterCustomerAccountRequest
  ): Promise<RegisterCustomerAccountResponse> {
    return this.identityRegistrationService.registerCustomerAccount(body);
  }
}
