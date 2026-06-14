import { BadRequestException, Injectable } from "@nestjs/common";
import {
  registerCustomerAccountRequestSchema,
  registerCustomerAccountResponseSchema,
  type RegisterCustomerAccountRequest,
  type RegisterCustomerAccountResponse
} from "@elevenhouse/contracts";
import { DomainCustomerAccountRegistrationHandler } from "./identity-registration.handler";

@Injectable()
export class IdentityRegistrationService {
  constructor(private readonly handler: DomainCustomerAccountRegistrationHandler) {}

  async registerCustomerAccount(
    body: RegisterCustomerAccountRequest
  ): Promise<RegisterCustomerAccountResponse> {
    const request = registerCustomerAccountRequestSchema.safeParse(body);

    if (!request.success) {
      throw new BadRequestException({
        message: "Invalid customer account registration request",
        issues: request.error.issues
      });
    }

    const response = await this.handler.registerCustomerAccount(request.data);

    return registerCustomerAccountResponseSchema.parse(response);
  }
}
