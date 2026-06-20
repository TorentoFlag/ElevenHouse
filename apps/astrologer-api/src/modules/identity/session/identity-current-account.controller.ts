import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type { AuthenticatedAstrologerAccountResponse } from "@elevenhouse/contracts";
import { AstrologerSessionAuthGuard } from "../auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "./identity-current-session.service";

@Controller("identity")
export class IdentityCurrentAccountController {
  @Get("me")
  @UseGuards(AstrologerSessionAuthGuard)
  getCurrentAstrologerAccount(
    @Req() request: AstrologerSessionRequest
  ): AuthenticatedAstrologerAccountResponse {
    if (!request.currentAstrologerAccount) {
      throw new UnauthorizedException("Valid astrologer session is required");
    }

    return request.currentAstrologerAccount;
  }
}
