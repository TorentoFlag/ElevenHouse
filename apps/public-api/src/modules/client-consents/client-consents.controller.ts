import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  ClientDataConsentListQuery,
  ClientDataConsentListResponse,
  GrantChartAiConsentRequest,
  GrantChartAiConsentResponse,
  RevokeClientDataConsentRequest,
  RevokeClientDataConsentResponse
} from "@elevenhouse/contracts";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { ClientConsentsService } from "./client-consents.service";

@Controller("me/consents")
@UseGuards(PublicSessionAuthGuard)
export class ClientConsentsController {
  constructor(
    @Inject(ClientConsentsService) private readonly clientConsentsService: ClientConsentsService
  ) {}

  @Get()
  list(
    @Req() request: PublicSessionRequest,
    @Query() query: ClientDataConsentListQuery
  ): Promise<ClientDataConsentListResponse> {
    return this.clientConsentsService.list(requireClientUserId(request), query);
  }

  @Put(":astrologerUserId/chart-ai")
  @RequireCsrf()
  grant(
    @Req() request: PublicSessionRequest,
    @Param("astrologerUserId") astrologerUserId: string,
    @Body() body: GrantChartAiConsentRequest
  ): Promise<GrantChartAiConsentResponse> {
    return this.clientConsentsService.grant(
      requireClientUserId(request),
      astrologerUserId,
      body
    );
  }

  @Delete(":consentId")
  @RequireCsrf()
  revoke(
    @Req() request: PublicSessionRequest,
    @Param("consentId") consentId: string,
    @Body() body: RevokeClientDataConsentRequest
  ): Promise<RevokeClientDataConsentResponse> {
    return this.clientConsentsService.revoke(requireClientUserId(request), consentId, body);
  }
}

function requireClientUserId(request: PublicSessionRequest): string {
  const account = request.currentCustomerAccount?.account;
  if (!account) throw new UnauthorizedException("Valid public session is required");
  if (!account.roles.includes("client")) throw new ForbiddenException("Client role is required");
  return account.id;
}
