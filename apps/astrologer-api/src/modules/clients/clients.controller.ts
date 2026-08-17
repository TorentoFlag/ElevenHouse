import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { ClientsService } from "./clients.service";

@Controller("clients")
@UseGuards(AstrologerSessionAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  listClients(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.clientsService.listClients(query, request);
  }

  @Get("birth-places")
  searchBirthPlaces(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.clientsService.searchBirthPlaces(query, request);
  }

  @Get("birth-places/geoapify/:providerPlaceId")
  resolveBirthPlaceReference(
    @Param("providerPlaceId") providerPlaceId: string,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.clientsService.resolveBirthPlaceReference(providerPlaceId, request);
  }

  @Get(":clientUserId")
  getClient(@Param("clientUserId") clientUserId: string, @Req() request: AstrologerSessionRequest) {
    return this.clientsService.getClient(clientUserId, request);
  }

  @Put(":clientUserId/birth-data")
  @RequireCsrf()
  updateBirthData(
    @Param("clientUserId") clientUserId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.clientsService.updateBirthData(clientUserId, body, request);
  }

  @Post(":clientUserId/related-birth-profiles")
  @RequireCsrf()
  createRelatedBirthProfile(
    @Param("clientUserId") clientUserId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.clientsService.createRelatedBirthProfile(clientUserId, body, request);
  }

  @Put(":clientUserId/related-birth-profiles/:relatedProfileId")
  @RequireCsrf()
  updateRelatedBirthProfile(
    @Param("clientUserId") clientUserId: string,
    @Param("relatedProfileId") relatedProfileId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.clientsService.updateRelatedBirthProfile(
      clientUserId,
      relatedProfileId,
      body,
      request
    );
  }
}
