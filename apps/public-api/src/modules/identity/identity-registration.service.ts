import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import {
  registerCustomerAccountRequestSchema,
  registerCustomerAccountResponseSchema,
  type RegisterCustomerAccountRequest,
  type RegisterCustomerAccountResponse
} from "@elevenhouse/contracts";
import { CustomerAccountIdentityConflictError } from "@elevenhouse/domain";
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

    const response = await this.registerCustomerAccountThroughHandler(request.data);

    return registerCustomerAccountResponseSchema.parse(response);
  }

  private async registerCustomerAccountThroughHandler(
    request: RegisterCustomerAccountRequest
  ): Promise<RegisterCustomerAccountResponse> {
    try {
      return await this.handler.registerCustomerAccount(request);
    } catch (error) {
      if (error instanceof CustomerAccountIdentityConflictError) {
        throw new ConflictException("Customer account identity already exists", {
          cause: error
        });
      }

      throw error;
    }
  }
}
