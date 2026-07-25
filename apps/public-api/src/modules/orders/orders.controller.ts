import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type { OrderResponse } from "@elevenhouse/contracts";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import {
  RequireCsrf,
  RequireIdempotency
} from "../security/route-policy/route-security-policy";
import { OrdersService } from "./orders.service";

@Controller("orders")
@UseGuards(PublicSessionAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequireCsrf()
  @RequireIdempotency({ scope: "orders.create" })
  createOrder(
    @Req() request: PublicSessionRequest,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<OrderResponse> {
    return this.ordersService.createOrder(
      requireClientUserId(request),
      body,
      requireIdempotencyKey(idempotencyKey)
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

function requireIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException("Valid Idempotency-Key header is required");
  }
  return normalized;
}
