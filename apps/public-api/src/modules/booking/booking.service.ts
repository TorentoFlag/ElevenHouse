import { HttpException, Inject, Injectable } from "@nestjs/common";
import {
  AvailabilityScheduleNotFoundError,
  BookingDailyLimitReachedError,
  BookingHorizonViolationError,
  BookingNoticeViolationError,
  BookingValidationError,
  ClientRelationshipNotActiveError,
  IdempotencyKeyReuseError,
  ProductNotBookableError,
  SlotNoLongerAvailableError,
  SlotOutsideAvailabilityError,
  createPaidBookingHold,
  type AvailabilityStore,
  type Booking,
  type BookingClientReader,
  type BookingCommandStore,
  type BookingProductReader
} from "@elevenhouse/domain";
import {
  createPaidBookingHoldRequestSchema,
  paidBookingHoldResponseSchema,
  type PaidBookingHoldResponse
} from "@elevenhouse/contracts";
import { SystemClock } from "../../common/system-clock.js";
import {
  PUBLIC_BOOKING_AVAILABILITY_STORE,
  PUBLIC_BOOKING_CLIENT_READER,
  PUBLIC_BOOKING_COMMAND_STORE,
  PUBLIC_BOOKING_PRODUCT_READER
} from "./booking.tokens";

@Injectable()
export class BookingService {
  constructor(
    @Inject(PUBLIC_BOOKING_COMMAND_STORE) private readonly store: BookingCommandStore,
    @Inject(PUBLIC_BOOKING_AVAILABILITY_STORE)
    private readonly availabilityStore: AvailabilityStore,
    @Inject(PUBLIC_BOOKING_CLIENT_READER) private readonly clientReader: BookingClientReader,
    @Inject(PUBLIC_BOOKING_PRODUCT_READER) private readonly productReader: BookingProductReader,
    private readonly clock: SystemClock
  ) {}

  createPaidHold(
    clientUserId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<PaidBookingHoldResponse> {
    return mapBookingErrors(async () => {
      const request = createPaidBookingHoldRequestSchema.safeParse(body);
      if (!request.success) {
        throw bookingHttpError(400, "invalid_request", "Invalid paid booking hold request");
      }
      const result = await createPaidBookingHold({
        commandStore: this.store,
        availabilityStore: this.availabilityStore,
        clientReader: this.clientReader,
        productReader: this.productReader,
        clientUserId,
        ownerUserId: request.data.astrologerUserId,
        idempotencyKey,
        input: request.data,
        now: this.clock.now()
      });
      return paidBookingHoldResponseSchema.parse({
        booking: toResponse(result.booking),
        replayed: result.replayed
      });
    });
  }
}

function toResponse(booking: Booking) {
  return {
    id: booking.id,
    reservationId: booking.reservationId,
    clientUserId: booking.clientUserId,
    productId: booking.productId,
    source: booking.source,
    state: booking.state,
    holdExpiresAt: booking.holdExpiresAt,
    startAt: booking.startAt,
    endAt: booking.endAt,
    productTitle: booking.productTitle,
    durationMinutes: booking.durationMinutes,
    deliveryFormat: booking.deliveryFormat,
    priceMinor: booking.priceMinor,
    currency: booking.currency,
    timeZone: booking.timeZone,
    policySnapshot: booking.policySnapshot,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt
  };
}

async function mapBookingErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    if (error instanceof BookingValidationError || error instanceof SlotOutsideAvailabilityError) {
      throw bookingHttpError(400, error.code, error.message);
    }
    if (error instanceof AvailabilityScheduleNotFoundError) {
      throw bookingHttpError(404, error.code, error.message);
    }
    if (
      error instanceof ClientRelationshipNotActiveError ||
      error instanceof ProductNotBookableError ||
      error instanceof BookingNoticeViolationError ||
      error instanceof BookingHorizonViolationError ||
      error instanceof BookingDailyLimitReachedError
    ) {
      throw bookingHttpError(422, error.code, error.message);
    }
    if (error instanceof SlotNoLongerAvailableError || error instanceof IdempotencyKeyReuseError) {
      throw bookingHttpError(409, error.code, error.message);
    }
    throw error;
  }
}

function bookingHttpError(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message }, status);
}
