import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  RequireCsrf,
  RequireIdempotency
} from "../security/route-policy/route-security-policy";
import { BookingsService } from "./bookings.service";

@Controller("bookings")
@UseGuards(AstrologerSessionAuthGuard)
export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  @Post("manual")
  @RequireCsrf()
  @RequireIdempotency({ scope: "bookings.manual.create" })
  createManual(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.createManual(body, idempotencyKey, request);
  }

  @Get("available-slots")
  getAvailableSlots(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.getAvailableSlots(query, request);
  }

  @Get(":bookingId")
  getBooking(@Param("bookingId") bookingId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.getBooking(bookingId, request);
  }
}
