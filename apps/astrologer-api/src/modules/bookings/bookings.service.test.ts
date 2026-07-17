import { HttpException } from "@nestjs/common";
import {
  BookingNotFoundError,
  ClientRelationshipNotActiveError,
  IdempotencyKeyReuseError,
  ProductNotBookableError,
  SlotNoLongerAvailableError,
  type AvailabilitySchedule,
  type AvailabilityStore,
  type Booking,
  type BookingClientReader,
  type BookingCommandStore,
  type BookingProductReader
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { BookingsService } from "./bookings.service";

const ownerUserId = "22222222-2222-4222-8222-222222222222";
const clientUserId = "11111111-1111-4111-8111-111111111111";
const productId = "33333333-3333-4333-8333-333333333333";
const bookingId = "44444444-4444-4444-8444-444444444444";
const schedule: AvailabilitySchedule = {
  id: "55555555-5555-4555-8555-555555555555",
  ownerUserId,
  name: "Default",
  timeZone: "Europe/Moscow",
  isDefault: true,
  version: 1,
  startIntervalMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minimumNoticeMinutes: 0,
  bookingHorizonDays: 60,
  maximumBookingsPerDay: null,
  weeklyPeriods: [{ weekday: 1, startMinute: 600, endMinute: 720 }],
  dateOverrides: [],
  productIds: [productId],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z"
};
const booking: Booking = {
  id: bookingId,
  reservationId: "66666666-6666-4666-8666-666666666666",
  ownerUserId,
  clientUserId,
  productId,
  state: "confirmed",
  startAt: "2026-07-20T07:00:00.000Z",
  endAt: "2026-07-20T08:00:00.000Z",
  productTitle: "Натальный разбор",
  durationMinutes: 60,
  deliveryFormat: "video",
  priceMinor: 490000,
  currency: "RUB",
  timeZone: "Europe/Moscow",
  policySnapshot: {
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minimumNoticeMinutes: 0
  },
  createdAt: "2026-07-17T09:00:00.000Z",
  updatedAt: "2026-07-17T09:00:00.000Z"
};

describe("BookingsService", () => {
  it("creates a manual booking and returns a contract-safe response", async () => {
    const service = createService();
    await expect(
      service.createManual(validBody(), "booking-create:request-1", request())
    ).resolves.toEqual({
      booking: expect.not.objectContaining({ ownerUserId: expect.anything() }),
      replayed: false
    });
  });

  it("returns only an owner-scoped booking and validates the route UUID", async () => {
    const service = createService();
    await expect(service.getBooking(bookingId, request())).resolves.toMatchObject({
      booking: { id: bookingId }
    });
    await expect(service.getBooking("not-a-uuid", request())).rejects.toMatchObject({ status: 400 });
  });

  it("projects contract-safe slots for an owner-scoped product", async () => {
    const service = createService();

    await expect(
      service.getAvailableSlots(
        {
          productId,
          start: "2026-07-20T00:00:00.000Z",
          end: "2026-07-21T00:00:00.000Z"
        },
        request()
      )
    ).resolves.toEqual({
      productId,
      timeZone: "Europe/Moscow",
      slots: [
        { startAt: "2026-07-20T07:00:00Z", endAt: "2026-07-20T08:00:00Z" },
        { startAt: "2026-07-20T07:30:00Z", endAt: "2026-07-20T08:30:00Z" },
        { startAt: "2026-07-20T08:00:00Z", endAt: "2026-07-20T09:00:00Z" }
      ]
    });
  });

  it("validates available-slot queries and maps an unbookable product", async () => {
    const service = createService({
      productReader: { findByOwnerAndId: vi.fn(async () => null) }
    });

    await expect(
      service.getAvailableSlots(
        { productId, start: "2026-07-21T00:00:00.000Z", end: "2026-07-20T00:00:00.000Z" },
        request()
      )
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.getAvailableSlots(
        {
          productId,
          start: "2026-07-20T00:00:00.000Z",
          end: "2026-07-21T00:00:00.000Z"
        },
        request()
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === 422 &&
        (error.getResponse() as { code: string }).code ===
          new ProductNotBookableError().code
    );
  });

  it.each([
    [new ClientRelationshipNotActiveError(), 422, "client_relationship_not_active"],
    [new SlotNoLongerAvailableError(), 409, "slot_no_longer_available"],
    [new IdempotencyKeyReuseError(), 409, "idempotency_key_reused_with_different_request"],
    [new BookingNotFoundError(), 404, "booking_not_found"]
  ] as const)("maps %s to a safe HTTP error", async (domainError, status, code) => {
    const store = createCommandStore({
      executeManualBooking: vi.fn(async () => {
        throw domainError;
      }),
      findByOwnerAndId: vi.fn(async () => {
        throw domainError;
      })
    });
    const service = createService({ store });
    const operation =
      domainError instanceof BookingNotFoundError
        ? service.getBooking(bookingId, request())
        : service.createManual(validBody(), "booking-create:request-1", request());
    await expect(operation).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === status &&
        (error.getResponse() as { code: string }).code === code
    );
  });
});

function validBody() {
  return { clientUserId, productId, deliveryFormat: "video", projectedStartAt: booking.startAt };
}

function request() {
  return { currentAstrologerAccount: { account: { id: ownerUserId } } } as never;
}

function createService(
  overrides: { store?: BookingCommandStore; productReader?: BookingProductReader } = {}
) {
  return new BookingsService(
    overrides.store ?? createCommandStore(),
    createAvailabilityStore(),
    { hasActiveRelationship: vi.fn(async () => true) } satisfies BookingClientReader,
    overrides.productReader ?? {
      findByOwnerAndId: vi.fn(async () => ({
        id: productId,
        title: booking.productTitle,
        status: "active",
        executionMode: "live",
        participantMode: "solo",
        durationMinutes: 60,
        deliveryFormats: ["video"],
        priceMinor: booking.priceMinor,
        currency: "RUB"
      }) as const)
    } satisfies BookingProductReader,
    { now: () => new Date("2026-07-17T09:00:00.000Z") }
  );
}

function createCommandStore(overrides: Partial<BookingCommandStore> = {}): BookingCommandStore {
  return {
    executeManualBooking: vi.fn(async () => ({ kind: "created" as const, booking })),
    findByOwnerAndId: vi.fn(async () => booking),
    ...overrides
  };
}

function createAvailabilityStore(): AvailabilityStore {
  return {
    findDefaultByOwner: vi.fn(async () => schedule),
    putDefault: vi.fn(async () => ({ kind: "created" as const, schedule })),
    replace: vi.fn(async () => ({ kind: "updated" as const, schedule })),
    readProjectionContext: vi.fn(async () => ({
      schedule,
      activeReservations: [],
      confirmedBookingCountByLocalDate: {}
    }))
  };
}
