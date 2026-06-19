import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type { AuthenticatedAstrologerAccountResponse } from "@elevenhouse/contracts";
import { OpsSessionAuthGuard } from "./identity-auth.guard";
import type { OpsSessionRequest } from "./identity-current-session.service";

@Controller("identity")
export class IdentityCurrentAccountController {
  @Get("me")
  @UseGuards(OpsSessionAuthGuard)
  getCurrentAstrologerAccount(
    @Req() request: OpsSessionRequest
  ): AuthenticatedAstrologerAccountResponse {
    if (!request.currentAstrologerAccount) {
      throw new UnauthorizedException("Valid ops session is required");
    }

    return request.currentAstrologerAccount;
  }
}
