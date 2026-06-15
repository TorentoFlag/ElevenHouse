import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import {
  registerCustomerAccountRequestSchema,
  registerCustomerAccountResponseSchema,
  type RegisterCustomerAccountRequest
} from "@elevenhouse/contracts";
import { CustomerAccountIdentityConflictError } from "@elevenhouse/domain";
import {
  DomainCustomerAccountRegistrationHandler,
  type RegisterCustomerAccountWithSessionResult
} from "./identity-registration.handler";

@Injectable()
export class IdentityRegistrationService {
  constructor(private readonly handler: DomainCustomerAccountRegistrationHandler) {}

  async registerCustomerAccount(
    body: RegisterCustomerAccountRequest
  ): Promise<RegisterCustomerAccountWithSessionResult> {
    const request = registerCustomerAccountRequestSchema.safeParse(body);

    if (!request.success) {
      throw new BadRequestException({
        message: "Invalid customer account registration request",
        issues: request.error.issues
      });
    }

    const result = await this.registerCustomerAccountThroughHandler(request.data);

    return {
      response: registerCustomerAccountResponseSchema.parse(result.response),
      session: result.session
    };
  }

  private async registerCustomerAccountThroughHandler(
    request: RegisterCustomerAccountRequest
  ): Promise<RegisterCustomerAccountWithSessionResult> {
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
