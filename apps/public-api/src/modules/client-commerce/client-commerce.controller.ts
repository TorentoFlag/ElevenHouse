import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type { AvailableBookingSlotsResponse, ClientPurchaseOptionsResponse } from "@elevenhouse/contracts";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import { ClientCommerceService } from "./client-commerce.service";

@Controller("me/astrologers")
@UseGuards(PublicSessionAuthGuard)
export class ClientCommerceController {
  constructor(@Inject(ClientCommerceService) private readonly service: ClientCommerceService) {}

  @Get(":astrologerUserId/purchase-options")
  listPurchaseOptions(
    @Req() request: PublicSessionRequest,
    @Param("astrologerUserId") astrologerUserId: string
  ): Promise<ClientPurchaseOptionsResponse> {
    return this.service.listPurchaseOptions(requireClientUserId(request), astrologerUserId);
  }

  @Get(":astrologerUserId/available-slots")
  getAvailableSlots(
    @Req() request: PublicSessionRequest,
    @Param("astrologerUserId") astrologerUserId: string,
    @Query() query: unknown
  ): Promise<AvailableBookingSlotsResponse> {
    return this.service.getAvailableSlots(requireClientUserId(request), astrologerUserId, query);
  }
}

function requireClientUserId(request: PublicSessionRequest): string {
  const account = request.currentCustomerAccount?.account;
  if (!account) throw new UnauthorizedException("Valid public session is required");
  if (!account.roles.includes("client")) throw new ForbiddenException("Client role is required");
  return account.id;
}
