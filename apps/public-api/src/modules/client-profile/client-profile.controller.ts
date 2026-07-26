import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Body,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  ClientBirthDataListResponse,
  ClientBirthDataResponse,
  ClientBirthDataUpsertRequest,
  ClientCabinetOverviewResponse,
  RelatedAstrologerListResponse
} from "@elevenhouse/contracts";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { ClientProfileService } from "./client-profile.service";

@Controller("me")
@UseGuards(PublicSessionAuthGuard)
export class ClientProfileController {
  constructor(@Inject(ClientProfileService) private readonly clientProfileService: ClientProfileService) {}

  @Get("astrologers")
  listRelatedAstrologers(@Req() request: PublicSessionRequest): Promise<RelatedAstrologerListResponse> {
    return this.clientProfileService.listRelatedAstrologers(requireClientUserId(request));
  }

  @Get("overview")
  getOverview(@Req() request: PublicSessionRequest): Promise<ClientCabinetOverviewResponse> {
    return this.clientProfileService.getOverview(requireClientUserId(request));
  }

  @Get("birth-data")
  getBirthData(@Req() request: PublicSessionRequest): Promise<ClientBirthDataResponse | null> {
    return this.clientProfileService.getBirthData(requireClientUserId(request));
  }

  @Get("birth-profiles")
  listBirthProfiles(@Req() request: PublicSessionRequest): Promise<ClientBirthDataListResponse> {
    return this.clientProfileService.listBirthProfiles(requireClientUserId(request));
  }

  @Put("birth-data")
  @RequireCsrf()
  upsertBirthData(
    @Req() request: PublicSessionRequest,
    @Body() body: ClientBirthDataUpsertRequest
  ): Promise<ClientBirthDataResponse> {
    return this.clientProfileService.upsertBirthData(requireClientUserId(request), body);
  }

  @Post("birth-profiles")
  @RequireCsrf()
  createBirthProfile(
    @Req() request: PublicSessionRequest,
    @Body() body: ClientBirthDataUpsertRequest
  ): Promise<ClientBirthDataResponse> {
    return this.clientProfileService.createBirthProfile(requireClientUserId(request), body);
  }

  @Put("birth-profiles/:birthDataId")
  @RequireCsrf()
  async updateBirthProfile(
    @Req() request: PublicSessionRequest,
    @Param("birthDataId") birthDataId: string,
    @Body() body: ClientBirthDataUpsertRequest
  ): Promise<ClientBirthDataResponse> {
    const response = await this.clientProfileService.updateBirthProfile(
      requireClientUserId(request),
      birthDataId,
      body
    );
    if (!response) {
      throw new NotFoundException("Birth profile was not found");
    }
    return response;
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
