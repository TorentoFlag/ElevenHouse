import { HttpException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  AvailabilityScheduleNotFoundError,
  BookingCancellationNotAllowedError,
  BookingCancellationRequiresRefundAuthorityError,
  BookingCompletionNotAllowedError,
  BookingCompletionTooEarlyError,
  BookingDailyLimitReachedError,
  BookingHorizonViolationError,
  BookingLifecycleRevisionConflictError,
  BookingNotFoundError,
  BookingNoticeViolationError,
  BookingRescheduleNotAllowedError,
  BookingValidationError,
  ClientRelationshipNotActiveError,
  IdempotencyKeyReuseError,
  ProductNotBookableError,
  SlotNoLongerAvailableError,
  SlotOutsideAvailabilityError,
  cancelBooking as cancelBookingUseCase,
  completeBooking as completeBookingUseCase,
  rescheduleBooking as rescheduleBookingUseCase,
  createManualBooking,
  getAvailableBookingSlots,
  getBooking,
  type AvailabilityStore,
  type Booking,
  type BookingClientReader,
  type BookingCommandStore,
  type BookingProductReader
} from "@elevenhouse/domain";
import {
  availableBookingSlotsQuerySchema,
  availableBookingSlotsResponseSchema,
  bookingParamsSchema,
  bookingResponseSchema,
  cancelBookingRequestSchema,
  cancelBookingResponseSchema,
  completeBookingRequestSchema,
  completeBookingResponseSchema,
  rescheduleBookingRequestSchema,
  rescheduleBookingResponseSchema,
  createManualBookingRequestSchema,
  manualBookingResponseSchema,
  type AvailableBookingSlotsResponse,
  type BookingResponse,
  type CancelBookingResponse,
  type CompleteBookingResponse,
  type RescheduleBookingResponse,
  type ManualBookingResponse
} from "@elevenhouse/contracts";
import type { ZodType } from "@elevenhouse/validation";
import { AVAILABILITY_STORE } from "../availability/availability.tokens";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  BOOKING_CLIENT_READER,
  BOOKING_COMMAND_STORE,
  BOOKING_PRODUCT_READER
} from "./bookings.tokens";

@Injectable()
export class BookingsService {
  constructor(
    @Inject(BOOKING_COMMAND_STORE) private readonly store: BookingCommandStore,
    @Inject(AVAILABILITY_STORE) private readonly availabilityStore: AvailabilityStore,
    @Inject(BOOKING_CLIENT_READER) private readonly clientReader: BookingClientReader,
    @Inject(BOOKING_PRODUCT_READER) private readonly productReader: BookingProductReader,
    private readonly clock: SystemClock
  ) {}

  createManual(
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<ManualBookingResponse> {
    return mapBookingErrors(async () => {
      const parsedBody = parseContract(
        createManualBookingRequestSchema,
        body,
        "Invalid manual booking request"
      );
      const result = await createManualBooking({
        commandStore: this.store,
        availabilityStore: this.availabilityStore,
        clientReader: this.clientReader,
        productReader: this.productReader,
        ownerUserId: requireOwnerUserId(request),
        idempotencyKey: idempotencyKey ?? "",
        input: parsedBody,
        now: this.clock.now()
      });
      return manualBookingResponseSchema.parse({
        booking: toResponse(result.booking),
        replayed: result.replayed
      });
    });
  }

  getAvailableSlots(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<AvailableBookingSlotsResponse> {
    return mapBookingErrors(async () => {
      const parsedQuery = parseContract(
        availableBookingSlotsQuerySchema,
        query,
        "Invalid available booking slots query"
      );
      const result = await getAvailableBookingSlots({
        availabilityStore: this.availabilityStore,
        productReader: this.productReader,
        ownerUserId: requireOwnerUserId(request),
        productId: parsedQuery.productId,
        rangeStartAt: parsedQuery.start,
        rangeEndAt: parsedQuery.end,
        now: this.clock.now()
      });
      return availableBookingSlotsResponseSchema.parse(result);
    });
  }

  getBooking(bookingId: string, request: AstrologerSessionRequest): Promise<BookingResponse> {
    return mapBookingErrors(async () => {
      const params = parseContract(
        bookingParamsSchema,
        { bookingId },
        "Invalid booking identifier"
      );
      const booking = await getBooking({
        store: this.store,
        ownerUserId: requireOwnerUserId(request),
        bookingId: params.bookingId
      });
      return bookingResponseSchema.parse({ booking: toResponse(booking) });
    });
  }

  cancelBooking(
    bookingId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<CancelBookingResponse> {
    return mapBookingErrors(async () => {
      const params = parseContract(
        bookingParamsSchema,
        { bookingId },
        "Invalid booking identifier"
      );
      const parsedBody = parseContract(
        cancelBookingRequestSchema,
        body,
        "Invalid booking cancellation request"
      );
      const result = await cancelBookingUseCase({
        commandStore: this.store,
        ownerUserId: requireOwnerUserId(request),
        bookingId: params.bookingId,
        idempotencyKey: idempotencyKey ?? "",
        input: parsedBody,
        now: this.clock.now()
      });
      return cancelBookingResponseSchema.parse({
        booking: toResponse(result.booking),
        lifecycleEvent: {
          id: result.lifecycleEvent.id,
          revision: result.lifecycleEvent.revision,
          kind: result.lifecycleEvent.kind,
          reasonCode: result.lifecycleEvent.reasonCode,
          occurredAt: result.lifecycleEvent.occurredAt
        },
        replayed: result.replayed
      });
    });
  }

  completeBooking(
    bookingId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<CompleteBookingResponse> {
    return mapBookingErrors(async () => {
      const params = parseContract(
        bookingParamsSchema,
        { bookingId },
        "Invalid booking identifier"
      );
      const parsedBody = parseContract(
        completeBookingRequestSchema,
        body,
        "Invalid booking completion request"
      );
      const result = await completeBookingUseCase({
        commandStore: this.store,
        ownerUserId: requireOwnerUserId(request),
        bookingId: params.bookingId,
        idempotencyKey: idempotencyKey ?? "",
        input: parsedBody,
        now: this.clock.now()
      });
      return completeBookingResponseSchema.parse({
        booking: toResponse(result.booking),
        lifecycleEvent: {
          id: result.lifecycleEvent.id,
          revision: result.lifecycleEvent.revision,
          kind: result.lifecycleEvent.kind,
          reasonCode: result.lifecycleEvent.reasonCode,
          occurredAt: result.lifecycleEvent.occurredAt
        },
        replayed: result.replayed
      });
    });
  }

  rescheduleBooking(
    bookingId: string,
    body: unknown,
    idempotencyKey: string | undefined,
    request: AstrologerSessionRequest
  ): Promise<RescheduleBookingResponse> {
    return mapBookingErrors(async () => {
      const params = parseContract(
        bookingParamsSchema,
        { bookingId },
        "Invalid booking identifier"
      );
      const parsedBody = parseContract(
        rescheduleBookingRequestSchema,
        body,
        "Invalid booking reschedule request"
      );
      const result = await rescheduleBookingUseCase({
        commandStore: this.store,
        ownerUserId: requireOwnerUserId(request),
        bookingId: params.bookingId,
        idempotencyKey: idempotencyKey ?? "",
        input: parsedBody,
        now: this.clock.now()
      });
      return rescheduleBookingResponseSchema.parse({
        booking: toResponse(result.booking),
        lifecycleEvent: {
          id: result.lifecycleEvent.id,
          revision: result.lifecycleEvent.revision,
          kind: result.lifecycleEvent.kind,
          reasonCode: result.lifecycleEvent.reasonCode,
          occurredAt: result.lifecycleEvent.occurredAt
        },
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
    lifecycleRevision: booking.lifecycleRevision,
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

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) throw new UnauthorizedException("Valid astrologer session is required");
  return ownerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw bookingHttpError(400, "invalid_request", message);
  return result.data;
}

async function mapBookingErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    if (error instanceof BookingValidationError || error instanceof SlotOutsideAvailabilityError) {
      throw bookingHttpError(400, error.code, error.message);
    }
    if (
      error instanceof BookingNotFoundError ||
      error instanceof AvailabilityScheduleNotFoundError
    ) {
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
    if (error instanceof BookingLifecycleRevisionConflictError) {
      throw bookingHttpError(409, error.code, error.message, {
        expectedLifecycleRevision: error.expectedRevision,
        currentLifecycleRevision: error.currentRevision
      });
    }
    if (error instanceof BookingCancellationNotAllowedError) {
      throw bookingHttpError(409, error.code, error.message, {
        currentState: error.state
      });
    }
    if (error instanceof BookingCancellationRequiresRefundAuthorityError) {
      throw bookingHttpError(409, error.code, error.message);
    }
    if (error instanceof BookingCompletionNotAllowedError) {
      throw bookingHttpError(409, error.code, error.message, { currentState: error.state });
    }
    if (error instanceof BookingCompletionTooEarlyError) {
      throw bookingHttpError(409, error.code, error.message);
    }
    if (error instanceof BookingRescheduleNotAllowedError) {
      throw bookingHttpError(409, error.code, error.message, {
        currentState: error.state
      });
    }
    throw error;
  }
}

function bookingHttpError(
  status: number,
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {}
): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message, ...details }, status);
}
