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
import type { PaidBookingHoldResponse } from "@elevenhouse/contracts";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import {
  RequireCsrf,
  RequireIdempotency
} from "../security/route-policy/route-security-policy";
import { BookingService } from "./booking.service";

@Controller("booking")
@UseGuards(PublicSessionAuthGuard)
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post("intent")
  @RequireCsrf()
  @RequireIdempotency({ scope: "bookings.paid.hold.create" })
  createPaidHold(
    @Req() request: PublicSessionRequest,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<PaidBookingHoldResponse> {
    return this.bookingService.createPaidHold(
      requireClientUserId(request),
      body,
      requireIdempotencyKey(idempotencyKey)
    );
  }
}

function requireClientUserId(request: PublicSessionRequest): string {
  const account = request.currentCustomerAccount?.account;
  if (!account) throw new UnauthorizedException("Valid public session is required");
  if (!account.roles.includes("client")) throw new ForbiddenException("Client role is required");
  return account.id;
}

function requireIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException("Valid Idempotency-Key header is required");
  return normalized;
}
