import { describe, expect, it, vi } from "vitest";
import type { AvailabilitySchedule, AvailabilityStore } from "../availability";
import {
  BookingDailyLimitReachedError,
  BookingHorizonViolationError,
  BookingNoticeViolationError,
  BookingNotFoundError,
  ClientRelationshipNotActiveError,
  ProductNotBookableError,
  SlotNoLongerAvailableError,
  SlotOutsideAvailabilityError
} from "./booking-errors";
import type {
  BookingClientReader,
  BookingCommandStore,
  BookingProductReader,
  ManualBookingClaim
} from "./booking-ports";
import type { Booking, BookingProduct } from "./booking-types";
import { createManualBooking, getAvailableBookingSlots, getBooking } from "./booking-use-cases";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const clientUserId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const scheduleId = "44444444-4444-4444-8444-444444444444";
const bookingId = "55555555-5555-4555-8555-555555555555";
const reservationId = "66666666-6666-4666-8666-666666666666";

const schedule: AvailabilitySchedule = {
  id: scheduleId,
  ownerUserId,
  name: "Основное расписание",
  timeZone: "Europe/Moscow",
  isDefault: true,
  version: 1,
  startIntervalMinutes: 30,
  bufferBeforeMinutes: 10,
  bufferAfterMinutes: 10,
  minimumNoticeMinutes: 60,
  bookingHorizonDays: 60,
  maximumBookingsPerDay: 5,
  weeklyPeriods: [{ weekday: 5, startMinute: 600, endMinute: 720 }],
  dateOverrides: [],
  productIds: [productId],
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
};

const product: BookingProduct = {
  id: productId,
  title: "Натальный разбор",
  status: "active",
  executionMode: "live",
  participantMode: "solo",
  durationMinutes: 60,
  deliveryFormats: ["video", "audio"],
  priceMinor: 490000,
  currency: "RUB"
};

function createAvailabilityStore(
  scheduleOverride: AvailabilitySchedule = schedule,
  activeReservations: Array<{ occupiedStartAt: string; occupiedEndAt: string }> = [],
  countByDate: Readonly<Record<string, number>> = {}
): AvailabilityStore {
  return {
    findDefaultByOwner: vi.fn(async () => scheduleOverride),
    putDefault: vi.fn(async () => ({ kind: "not_found" as const })),
    replace: vi.fn(async () => ({ kind: "not_found" as const })),
    readProjectionContext: vi.fn(async () => ({
      schedule: scheduleOverride,
      activeReservations,
      confirmedBookingCountByLocalDate: countByDate
    }))
  };
}

function createClientReader(active = true): BookingClientReader {
  return { hasActiveRelationship: vi.fn(async () => active) };
}

function createProductReader(value: BookingProduct | null = product): BookingProductReader {
  return { findByOwnerAndId: vi.fn(async () => value) };
}

function bookingFromClaim(claim: ManualBookingClaim, now: string): Booking {
  return {
    id: bookingId,
    reservationId,
    ownerUserId: claim.ownerUserId,
    clientUserId: claim.clientUserId,
    productId: claim.productId,
    state: "confirmed",
    startAt: claim.serviceStartAt,
    endAt: claim.serviceEndAt,
    productTitle: claim.productSnapshot.title,
    durationMinutes: claim.productSnapshot.durationMinutes,
    deliveryFormat: claim.productSnapshot.deliveryFormat,
    priceMinor: claim.productSnapshot.priceMinor,
    currency: claim.productSnapshot.currency,
    timeZone: claim.scheduleSnapshot.timeZone,
    policySnapshot: claim.scheduleSnapshot.policy,
    createdAt: now,
    updatedAt: now
  };
}

function createCommandStore(options: { replay?: boolean } = {}): BookingCommandStore {
  return {
    executeManualBooking: vi.fn(async (command, createClaim) => {
      if (options.replay) {
        return {
          kind: "replayed" as const,
          booking: bookingFromClaim(
            {
              ownerUserId,
              clientUserId,
              productId,
              scheduleId,
              serviceStartAt: "2026-05-29T07:00:00Z",
              serviceEndAt: "2026-05-29T08:00:00Z",
              occupiedStartAt: "2026-05-29T06:50:00Z",
              occupiedEndAt: "2026-05-29T08:10:00Z",
              productSnapshot: {
                title: product.title,
                durationMinutes: 60,
                deliveryFormat: "video",
                priceMinor: 490000,
                currency: "RUB"
              },
              scheduleSnapshot: {
                timeZone: schedule.timeZone,
                policy: {
                  bufferBeforeMinutes: 10,
                  bufferAfterMinutes: 10,
                  minimumNoticeMinutes: 60
                }
              }
            },
            command.now
          )
        };
      }

      const claim = await createClaim();
      return { kind: "created" as const, booking: bookingFromClaim(claim, command.now) };
    }),
    findByOwnerAndId: vi.fn(async () => null)
  };
}

const request = {
  clientUserId,
  productId,
  deliveryFormat: "video" as const,
  projectedStartAt: "2026-05-29T07:00:00.000Z"
};

describe("booking use cases", () => {
  it("projects server-authoritative slots for an assigned live product", async () => {
    const availabilityStore = createAvailabilityStore(schedule, [
      {
        occupiedStartAt: "2026-05-29T06:50:00.000Z",
        occupiedEndAt: "2026-05-29T08:10:00.000Z"
      }
    ]);

    await expect(
      getAvailableBookingSlots({
        availabilityStore,
        productReader: createProductReader(),
        ownerUserId,
        productId,
        rangeStartAt: "2026-05-28T21:00:00.000Z",
        rangeEndAt: "2026-05-29T21:00:00.000Z",
        now: new Date("2026-05-20T00:00:00.000Z")
      })
    ).resolves.toEqual({
      productId,
      timeZone: "Europe/Moscow",
      slots: []
    });
    expect(availabilityStore.readProjectionContext).toHaveBeenCalledWith({
      ownerUserId,
      scheduleId,
      rangeStartAt: "2026-05-28T21:00:00.000Z",
      rangeEndAt: "2026-05-29T21:00:00.000Z"
    });
  });

  it("rejects slot projection for a product not assigned to the schedule", async () => {
    await expect(
      getAvailableBookingSlots({
        availabilityStore: createAvailabilityStore({ ...schedule, productIds: [] }),
        productReader: createProductReader(),
        ownerUserId,
        productId,
        rangeStartAt: "2026-05-28T21:00:00.000Z",
        rangeEndAt: "2026-05-29T21:00:00.000Z",
        now: new Date("2026-05-20T00:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(ProductNotBookableError);
  });

  it("creates an idempotent claim with immutable product and schedule snapshots", async () => {
    const commandStore = createCommandStore();
    const now = new Date("2026-05-20T00:00:00.000Z");

    await expect(
      createManualBooking({
        commandStore,
        availabilityStore: createAvailabilityStore(),
        clientReader: createClientReader(),
        productReader: createProductReader(),
        ownerUserId,
        idempotencyKey: "booking-12345",
        input: request,
        now
      })
    ).resolves.toMatchObject({
      replayed: false,
      booking: {
        state: "confirmed",
        startAt: "2026-05-29T07:00:00Z",
        endAt: "2026-05-29T08:00:00Z",
        productTitle: product.title,
        deliveryFormat: "video",
        priceMinor: 490000,
        currency: "RUB",
        timeZone: "Europe/Moscow"
      }
    });

    const command = vi.mocked(commandStore.executeManualBooking).mock.calls[0]?.[0];
    expect(command).toMatchObject({
      actorUserId: ownerUserId,
      scope: "bookings.manual.create",
      key: "booking-12345",
      now: now.toISOString()
    });
    expect(command?.requestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("replays a stored result without revalidating mutable product or client state", async () => {
    const clientReader = createClientReader(false);
    const productReader = createProductReader(null);

    await expect(
      createManualBooking({
        commandStore: createCommandStore({ replay: true }),
        availabilityStore: createAvailabilityStore(),
        clientReader,
        productReader,
        ownerUserId,
        idempotencyKey: "booking-12345",
        input: request,
        now: new Date("2026-05-20T00:00:00.000Z")
      })
    ).resolves.toMatchObject({ replayed: true, booking: { id: bookingId } });
    expect(clientReader.hasActiveRelationship).not.toHaveBeenCalled();
    expect(productReader.findByOwnerAndId).not.toHaveBeenCalled();
  });

  it("rejects a client without an active owner-scoped relationship", async () => {
    await expect(
      createManualBooking({
        commandStore: createCommandStore(),
        availabilityStore: createAvailabilityStore(),
        clientReader: createClientReader(false),
        productReader: createProductReader(),
        ownerUserId,
        idempotencyKey: "booking-12345",
        input: request,
        now: new Date("2026-05-20T00:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(ClientRelationshipNotActiveError);
  });

  it.each([
    null,
    { ...product, status: "draft" as const },
    { ...product, executionMode: "async" as const },
    { ...product, participantMode: "group" as const },
    { ...product, durationMinutes: null }
  ])("rejects a non-bookable product variant", async (productVariant) => {
    await expect(
      createManualBooking({
        commandStore: createCommandStore(),
        availabilityStore: createAvailabilityStore(),
        clientReader: createClientReader(),
        productReader: createProductReader(productVariant),
        ownerUserId,
        idempotencyKey: "booking-12345",
        input: request,
        now: new Date("2026-05-20T00:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(ProductNotBookableError);
  });

  it("rejects a delivery format not offered by the selected product", async () => {
    await expect(
      createManualBooking({
        commandStore: createCommandStore(),
        availabilityStore: createAvailabilityStore(),
        clientReader: createClientReader(),
        productReader: createProductReader(),
        ownerUserId,
        idempotencyKey: "booking-12345",
        input: { ...request, deliveryFormat: "chat" },
        now: new Date("2026-05-20T00:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(ProductNotBookableError);
  });

  it.each([
    {
      expected: SlotOutsideAvailabilityError,
      schedule: { ...schedule, weeklyPeriods: [] },
      reservations: [],
      counts: {}
    },
    {
      expected: BookingNoticeViolationError,
      schedule: { ...schedule, minimumNoticeMinutes: 20_000 },
      reservations: [],
      counts: {}
    },
    {
      expected: BookingHorizonViolationError,
      schedule: { ...schedule, bookingHorizonDays: 1 },
      reservations: [],
      counts: {}
    },
    {
      expected: BookingDailyLimitReachedError,
      schedule,
      reservations: [],
      counts: { "2026-05-29": 5 }
    },
    {
      expected: SlotNoLongerAvailableError,
      schedule,
      reservations: [
        {
          occupiedStartAt: "2026-05-29T06:55:00.000Z",
          occupiedEndAt: "2026-05-29T08:00:00.000Z"
        }
      ],
      counts: {}
    }
  ])("maps rejected projected starts to a stable typed error", async (fixture) => {
    await expect(
      createManualBooking({
        commandStore: createCommandStore(),
        availabilityStore: createAvailabilityStore(
          fixture.schedule,
          fixture.reservations,
          fixture.counts as Readonly<Record<string, number>>
        ),
        clientReader: createClientReader(),
        productReader: createProductReader(),
        ownerUserId,
        idempotencyKey: "booking-12345",
        input: request,
        now: new Date("2026-05-20T00:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(fixture.expected);
  });

  it("canonicalizes equivalent projected instants before hashing", async () => {
    const commandStore = createCommandStore({ replay: true });

    await createManualBooking({
      commandStore,
      availabilityStore: createAvailabilityStore(),
      clientReader: createClientReader(),
      productReader: createProductReader(),
      ownerUserId,
      idempotencyKey: "booking-12345",
      input: request,
      now: new Date("2026-05-20T00:00:00.000Z")
    });
    await createManualBooking({
      commandStore,
      availabilityStore: createAvailabilityStore(),
      clientReader: createClientReader(),
      productReader: createProductReader(),
      ownerUserId,
      idempotencyKey: "booking-12345",
      input: { ...request, projectedStartAt: "2026-05-29T10:00:00+03:00" },
      now: new Date("2026-05-20T00:00:00.000Z")
    });

    const hashes = vi
      .mocked(commandStore.executeManualBooking)
      .mock.calls.map(([command]) => command.requestHash);
    expect(new Set(hashes).size).toBe(1);
  });

  it("returns owner-scoped booking detail and hides foreign or missing records", async () => {
    const store = createCommandStore();
    vi.mocked(store.findByOwnerAndId).mockResolvedValue(
      bookingFromClaim(
        {
          ownerUserId,
          clientUserId,
          productId,
          scheduleId,
          serviceStartAt: "2026-05-29T07:00:00Z",
          serviceEndAt: "2026-05-29T08:00:00Z",
          occupiedStartAt: "2026-05-29T06:50:00Z",
          occupiedEndAt: "2026-05-29T08:10:00Z",
          productSnapshot: {
            title: product.title,
            durationMinutes: 60,
            deliveryFormat: "video",
            priceMinor: 490000,
            currency: "RUB"
          },
          scheduleSnapshot: {
            timeZone: schedule.timeZone,
            policy: {
              bufferBeforeMinutes: 10,
              bufferAfterMinutes: 10,
              minimumNoticeMinutes: 60
            }
          }
        },
        "2026-05-20T00:00:00.000Z"
      )
    );

    await expect(getBooking({ store, ownerUserId, bookingId })).resolves.toMatchObject({
      id: bookingId
    });
    vi.mocked(store.findByOwnerAndId).mockResolvedValue(null);
    await expect(getBooking({ store, ownerUserId, bookingId })).rejects.toBeInstanceOf(
      BookingNotFoundError
    );
  });
});
