import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  ClientBirthDataResponse,
  ClientBirthDataUpsertRequest,
  ClientCabinetOverviewResponse,
  ClientRelatedBirthProfileListResponse,
  ClientRelatedBirthProfileResponse,
  ClientRelatedBirthProfileUpsertRequest,
  RelatedAstrologerListResponse
} from "@elevenhouse/contracts";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { ClientBirthPlaceSearchService } from "./client-birth-place-search.service";
import { ClientProfileService } from "./client-profile.service";

@Controller("me")
@UseGuards(PublicSessionAuthGuard)
export class ClientProfileController {
  constructor(
    @Inject(ClientProfileService) private readonly clientProfileService: ClientProfileService,
    @Inject(ClientBirthPlaceSearchService)
    private readonly clientBirthPlaceSearchService: ClientBirthPlaceSearchService
  ) {}

  @Get("astrologers")
  listRelatedAstrologers(
    @Req() request: PublicSessionRequest
  ): Promise<RelatedAstrologerListResponse> {
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

  @Get("related-birth-profiles")
  listRelatedBirthProfiles(
    @Req() request: PublicSessionRequest
  ): Promise<ClientRelatedBirthProfileListResponse> {
    return this.clientProfileService.listRelatedBirthProfiles(requireClientUserId(request));
  }

  @Get("birth-places")
  searchBirthPlaces(@Req() request: PublicSessionRequest, @Query() query: unknown) {
    return this.clientBirthPlaceSearchService.search(requireClientUserId(request), query);
  }

  @Put("birth-data")
  @RequireCsrf()
  upsertBirthData(
    @Req() request: PublicSessionRequest,
    @Body() body: ClientBirthDataUpsertRequest
  ): Promise<ClientBirthDataResponse> {
    return this.clientProfileService.upsertBirthData(requireClientUserId(request), body);
  }

  @Post("related-birth-profiles")
  @RequireCsrf()
  createRelatedBirthProfile(
    @Req() request: PublicSessionRequest,
    @Body() body: ClientRelatedBirthProfileUpsertRequest
  ): Promise<ClientRelatedBirthProfileResponse> {
    return this.clientProfileService.createRelatedBirthProfile(requireClientUserId(request), body);
  }

  @Put("related-birth-profiles/:relatedProfileId")
  @RequireCsrf()
  updateRelatedBirthProfile(
    @Req() request: PublicSessionRequest,
    @Param("relatedProfileId") relatedProfileId: string,
    @Body() body: ClientRelatedBirthProfileUpsertRequest
  ): Promise<ClientRelatedBirthProfileResponse> {
    return this.clientProfileService.updateRelatedBirthProfile(
      requireClientUserId(request),
      relatedProfileId,
      body
    );
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
