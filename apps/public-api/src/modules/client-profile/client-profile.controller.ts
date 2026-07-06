import {
  Controller,
  ForbiddenException,
  Get,
  Put,
  Body,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  ClientBirthDataResponse,
  ClientBirthDataUpsertRequest,
  RelatedAstrologerListResponse
} from "@elevenhouse/contracts";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import { ClientProfileService } from "./client-profile.service";

@Controller("me")
@UseGuards(PublicSessionAuthGuard)
export class ClientProfileController {
  constructor(private readonly clientProfileService: ClientProfileService) {}

  @Get("astrologers")
  listRelatedAstrologers(@Req() request: PublicSessionRequest): Promise<RelatedAstrologerListResponse> {
    return this.clientProfileService.listRelatedAstrologers(requireClientUserId(request));
  }

  @Get("birth-data")
  getBirthData(@Req() request: PublicSessionRequest): Promise<ClientBirthDataResponse | null> {
    return this.clientProfileService.getBirthData(requireClientUserId(request));
  }

  @Put("birth-data")
  upsertBirthData(
    @Req() request: PublicSessionRequest,
    @Body() body: ClientBirthDataUpsertRequest
  ): Promise<ClientBirthDataResponse> {
    return this.clientProfileService.upsertBirthData(requireClientUserId(request), body);
  }
}

function requireClientUserId(request: PublicSessionRequest): string {
  const account = request.currentCustomerAccount?.account;
  if (!account) {
    throw new UnauthorizedException("Valid public session is required");
  }
  if (!account.roles.includes("client")) {
    throw new ForbiddenException("Client role is required");
  }
  return account.id;
}
