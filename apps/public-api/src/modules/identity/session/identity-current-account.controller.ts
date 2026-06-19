import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type { AuthenticatedCustomerAccountResponse } from "@elevenhouse/contracts";
import { PublicSessionAuthGuard } from "../auth/identity-auth.guard";
import type { PublicSessionRequest } from "./identity-current-session.service";

@Controller("identity")
export class IdentityCurrentAccountController {
  @Get("me")
  @UseGuards(PublicSessionAuthGuard)
  getCurrentCustomerAccount(
    @Req() request: PublicSessionRequest
  ): AuthenticatedCustomerAccountResponse {
    if (!request.currentCustomerAccount) {
      throw new UnauthorizedException("Valid public session is required");
    }

    return request.currentCustomerAccount;
  }
}
