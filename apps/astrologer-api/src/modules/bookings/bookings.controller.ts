import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
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

  @Post(":bookingId/cancel")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "bookings.owner.cancel" })
  cancelBooking(
    @Param("bookingId") bookingId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.cancelBooking(bookingId, body, idempotencyKey, request);
  }

  @Post(":bookingId/complete")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "bookings.owner.complete" })
  completeBooking(
    @Param("bookingId") bookingId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.completeBooking(bookingId, body, idempotencyKey, request);
  }

  @Post(":bookingId/reschedule")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "bookings.owner.reschedule" })
  rescheduleBooking(
    @Param("bookingId") bookingId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.rescheduleBooking(bookingId, body, idempotencyKey, request);
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
