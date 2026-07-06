import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { ClientsService } from "./clients.service";

@Controller("clients")
@UseGuards(AstrologerSessionAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  listClients(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.clientsService.listClients(query, request);
  }

  @Get(":clientUserId")
  getClient(@Param("clientUserId") clientUserId: string, @Req() request: AstrologerSessionRequest) {
    return this.clientsService.getClient(clientUserId, request);
  }
}
