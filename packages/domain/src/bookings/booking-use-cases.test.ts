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
  PaidBookingHoldClaim,
  ManualBookingClaim
} from "./booking-ports";
import type { Booking, BookingProduct } from "./booking-types";
import {
  completeBooking,
  createManualBooking,
  createPaidBookingHold,
  getAvailableBookingSlots,
  getBooking
} from "./booking-use-cases";

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
  requiredClientData: ["chart1"],
  methods: ["natal"],
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
    source: "manual",
    state: "confirmed",
    lifecycleRevision: 1,
    holdExpiresAt: null,
    startAt: claim.serviceStartAt,
    endAt: claim.serviceEndAt,
    productTitle: claim.productSnapshot.title,
    durationMinutes: claim.productSnapshot.durationMinutes,
    deliveryFormat: claim.productSnapshot.deliveryFormat,
    priceMinor: claim.productSnapshot.priceMinor,
    currency: claim.productSnapshot.currency,
    timeZone: claim.scheduleSnapshot.timeZone,
    policySnapshot: claim.scheduleSnapshot.policy,
    clientDataRequirementsSnapshot: claim.productSnapshot.clientDataRequirements,
    createdAt: now,
    updatedAt: now
  };
}

function paidBookingFromClaim(claim: PaidBookingHoldClaim, now: string): Booking {
  return {
    id: bookingId,
    reservationId,
    ownerUserId: claim.ownerUserId,
    clientUserId: claim.clientUserId,
    productId: claim.productId,
    source: "client_paid",
    state: "hold",
    lifecycleRevision: 0,
    holdExpiresAt: claim.holdExpiresAt,
    startAt: claim.serviceStartAt,
    endAt: claim.serviceEndAt,
    productTitle: claim.productSnapshot.title,
    durationMinutes: claim.productSnapshot.durationMinutes,
    deliveryFormat: claim.productSnapshot.deliveryFormat,
    priceMinor: claim.productSnapshot.priceMinor,
    currency: claim.productSnapshot.currency,
    timeZone: claim.scheduleSnapshot.timeZone,
    policySnapshot: claim.scheduleSnapshot.policy,
    clientDataRequirementsSnapshot: claim.productSnapshot.clientDataRequirements,
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
                currency: "RUB",
                clientDataRequirements: {
                  schemaVersion: "booking-client-data-requirements.v1",
                  executionMode: "live",
                  participantMode: "solo",
                  requiredClientData: ["chart1"],
                  methods: ["natal"]
                }
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
    executePaidHold: vi.fn(),
    executeOwnerCancellation: vi.fn(async () => {
      throw new Error("Cancellation is outside this fixture");
    }),
    executeOwnerReschedule: vi.fn(async () => {
      throw new Error("Reschedule is outside this fixture");
    }),
    executeOwnerCompletion: vi.fn(async () => {
      throw new Error("Completion is outside this fixture");
    }),
    confirmPaidBooking: vi.fn(async () => null),
    releasePaidBookingPaymentHold: vi.fn(async () => null),
    findByOwnerAndId: vi.fn(async () => null)
  };
}

function createPaidCommandStore(options: { replay?: boolean } = {}): BookingCommandStore {
  return {
    ...createCommandStore(),
    executePaidHold: vi.fn(async (command, createClaim) => {
      if (options.replay) {
        return {
          kind: "replayed" as const,
          booking: paidBookingFromClaim(
            {
              ownerUserId,
              clientUserId,
              productId,
              scheduleId,
              serviceStartAt: "2026-05-29T07:00:00Z",
              serviceEndAt: "2026-05-29T08:00:00Z",
              occupiedStartAt: "2026-05-29T06:50:00Z",
              occupiedEndAt: "2026-05-29T08:10:00Z",
              holdExpiresAt: "2026-05-20T00:15:00Z",
              productSnapshot: {
                title: product.title,
                durationMinutes: 60,
                deliveryFormat: "video",
                priceMinor: 490000,
                currency: "RUB",
                clientDataRequirements: {
                  schemaVersion: "booking-client-data-requirements.v1",
                  executionMode: "live",
                  participantMode: "solo",
                  requiredClientData: ["chart1"],
                  methods: ["natal"]
                }
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
      return { kind: "created" as const, booking: paidBookingFromClaim(claim, command.now) };
    })
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
        timeZone: "Europe/Moscow",
        clientDataRequirementsSnapshot: {
          schemaVersion: "booking-client-data-requirements.v1",
          executionMode: "live",
          participantMode: "solo",
          requiredClientData: ["chart1"],
          methods: ["natal"]
        }
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

  it("creates a paid client booking hold with an expiry before order checkout", async () => {
    const commandStore = createPaidCommandStore();
    const now = new Date("2026-05-20T00:00:00.000Z");

    await expect(
      createPaidBookingHold({
        commandStore,
        availabilityStore: createAvailabilityStore(),
        clientReader: createClientReader(),
        productReader: createProductReader(),
        clientUserId,
        ownerUserId,
        idempotencyKey: "booking-hold-12345",
        input: request,
        now
      })
    ).resolves.toMatchObject({
      replayed: false,
      booking: {
        source: "client_paid",
        state: "hold",
        holdExpiresAt: "2026-05-20T00:15:00Z",
        startAt: "2026-05-29T07:00:00Z",
        endAt: "2026-05-29T08:00:00Z",
        clientDataRequirementsSnapshot: {
          schemaVersion: "booking-client-data-requirements.v1",
          executionMode: "live",
          participantMode: "solo",
          requiredClientData: ["chart1"],
          methods: ["natal"]
        }
      }
    });

    const command = vi.mocked(commandStore.executePaidHold).mock.calls[0]?.[0];
    expect(command).toMatchObject({
      actorUserId: clientUserId,
      scope: "bookings.paid.hold.create",
      key: "booking-hold-12345",
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
            currency: "RUB",
            clientDataRequirements: {
              schemaVersion: "booking-client-data-requirements.v1",
              executionMode: "live",
              participantMode: "solo",
              requiredClientData: ["chart1"],
              methods: ["natal"]
            }
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

  it("submits an owner-authenticated paid-live completion with a revision fence", async () => {
    const completedBooking: Booking = {
      ...paidBookingFromClaim(
        {
          ownerUserId,
          clientUserId,
          productId,
          scheduleId,
          serviceStartAt: "2026-05-20T07:00:00.000Z",
          serviceEndAt: "2026-05-20T08:00:00.000Z",
          occupiedStartAt: "2026-05-20T07:00:00.000Z",
          occupiedEndAt: "2026-05-20T08:00:00.000Z",
          holdExpiresAt: "2026-05-19T08:00:00.000Z",
          productSnapshot: {
            title: product.title,
            durationMinutes: 60,
            deliveryFormat: "video",
            priceMinor: 490000,
            currency: "RUB",
            clientDataRequirements: {
              schemaVersion: "booking-client-data-requirements.v1",
              executionMode: "live",
              participantMode: "solo",
              requiredClientData: ["chart1"],
              methods: ["natal"]
            }
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
        "2026-05-20T08:01:00.000Z"
      ),
      state: "completed",
      lifecycleRevision: 2,
      holdExpiresAt: null
    };
    const store = {
      ...createCommandStore(),
      executeOwnerCompletion: vi.fn(async () => ({
        kind: "created" as const,
        booking: completedBooking,
        lifecycleEvent: {
          schemaVersion: "booking-lifecycle-event.v1" as const,
          id: "77777777-7777-4777-8777-777777777777",
          bookingId,
          ownerUserId,
          revision: 2,
          kind: "completed" as const,
          actor: { kind: "astrologer" as const, userId: ownerUserId },
          reasonCode: null,
          before: {
            startAt: completedBooking.startAt,
            endAt: completedBooking.endAt,
            timeZone: completedBooking.timeZone
          },
          after: null,
          occurredAt: "2026-05-20T08:01:00.000Z",
          canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
        }
      }))
    } as BookingCommandStore;

    await expect(
      completeBooking({
        commandStore: store,
        ownerUserId,
        bookingId,
        idempotencyKey: "booking-complete-12345",
        input: { expectedLifecycleRevision: 1 },
        now: new Date("2026-05-20T08:01:00.000Z")
      })
    ).resolves.toMatchObject({
      replayed: false,
      booking: { state: "completed", lifecycleRevision: 2 },
      lifecycleEvent: { kind: "completed", revision: 2 }
    });

    expect(store.executeOwnerCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ownerUserId,
        scope: "bookings.owner.complete",
        key: "booking-complete-12345"
      }),
      { bookingId, expectedLifecycleRevision: 1 }
    );
  });
});
