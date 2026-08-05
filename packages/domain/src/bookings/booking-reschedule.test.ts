import { describe, expect, it, vi } from "vitest";

import type { ProjectionContext } from "../availability";
import type {
  BookingCommandStore,
  BookingRescheduleContext,
  BookingRescheduleClaim
} from "./booking-ports";
import type { Booking } from "./booking-types";
import { createBookingLifecycleEvent } from "./booking-lifecycle-events";
import { rescheduleBooking } from "./booking-use-cases";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const clientUserId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const bookingId = "44444444-4444-4444-8444-444444444444";
const reservationId = "55555555-5555-4555-8555-555555555555";
const scheduleId = "66666666-6666-4666-8666-666666666666";
const eventId = "77777777-7777-4777-8777-777777777777";
const now = new Date("2026-08-05T03:30:00.000Z");

describe("rescheduleBooking", () => {
  it("evaluates the new time inside the command transaction and preserves booking identity", async () => {
    const booking = confirmedBooking();
    const context = rescheduleContext(booking);
    const lifecycleEvent = createBookingLifecycleEvent({
      id: eventId,
      bookingId,
      ownerUserId,
      revision: 2,
      kind: "rescheduled",
      actor: { kind: "astrologer", userId: ownerUserId },
      reasonCode: null,
      before: scheduleSnapshot(booking),
      after: {
        startAt: "2026-08-10T12:00:00.000Z",
        endAt: "2026-08-10T13:00:00.000Z",
        timeZone: "Europe/Moscow"
      },
      occurredAt: now.toISOString()
    });
    const store = createStore(async (_command, _input, createClaim) => {
      const claim = await createClaim(context);
      expect(claim).toEqual<BookingRescheduleClaim>({
        ownerUserId,
        bookingId,
        reservationId,
        scheduleId,
        expectedLifecycleRevision: 1,
        serviceStartAt: "2026-08-10T12:00:00Z",
        serviceEndAt: "2026-08-10T13:00:00Z",
        occupiedStartAt: "2026-08-10T11:50:00Z",
        occupiedEndAt: "2026-08-10T13:10:00Z",
        scheduleSnapshot: {
          timeZone: "Europe/Moscow",
          policy: {
            bufferBeforeMinutes: 10,
            bufferAfterMinutes: 10,
            minimumNoticeMinutes: 60
          }
        }
      });
      return {
        kind: "created" as const,
        booking: {
          ...booking,
          lifecycleRevision: 2,
          startAt: claim.serviceStartAt,
          endAt: claim.serviceEndAt,
          timeZone: claim.scheduleSnapshot.timeZone,
          policySnapshot: claim.scheduleSnapshot.policy,
          updatedAt: now.toISOString()
        },
        lifecycleEvent
      };
    });

    await expect(
      rescheduleBooking({
        commandStore: store,
        ownerUserId,
        bookingId,
        idempotencyKey: "booking-reschedule:request-1",
        input: {
          expectedLifecycleRevision: 1,
          projectedStartAt: "2026-08-10T12:00:00.000Z"
        },
        now
      })
    ).resolves.toMatchObject({
      replayed: false,
      booking: {
        id: bookingId,
        reservationId,
        productId,
        priceMinor: 490000,
        lifecycleRevision: 2,
        startAt: "2026-08-10T12:00:00Z"
      },
      lifecycleEvent: { id: eventId, revision: 2, kind: "rescheduled" }
    });

    expect(store.executeOwnerReschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ownerUserId,
        scope: "bookings.owner.reschedule",
        key: "booking-reschedule:request-1",
        requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        now: now.toISOString(),
        expiresAt: "2026-08-06T03:30:00Z"
      }),
      {
        bookingId,
        expectedLifecycleRevision: 1,
        projectedStartAt: "2026-08-10T12:00:00Z"
      },
      expect.any(Function)
    );
  });

  it("rejects an unchanged start and unavailable target before persistence mutates the booking", async () => {
    const booking = confirmedBooking();
    const unchangedStore = createStore(async (_command, _input, createClaim) => {
      await createClaim(rescheduleContext(booking));
      throw new Error("unreachable");
    });
    await expect(
      rescheduleBooking({
        commandStore: unchangedStore,
        ownerUserId,
        bookingId,
        idempotencyKey: "booking-reschedule:unchanged",
        input: { expectedLifecycleRevision: 1, projectedStartAt: booking.startAt },
        now
      })
    ).rejects.toMatchObject({ code: "booking_validation_error" });

    const occupiedContext = rescheduleContext(booking, {
      activeReservations: [
        {
          occupiedStartAt: "2026-08-10T11:30:00.000Z",
          occupiedEndAt: "2026-08-10T13:30:00.000Z"
        }
      ]
    });
    const occupiedStore = createStore(async (_command, _input, createClaim) => {
      await createClaim(occupiedContext);
      throw new Error("unreachable");
    });
    await expect(
      rescheduleBooking({
        commandStore: occupiedStore,
        ownerUserId,
        bookingId,
        idempotencyKey: "booking-reschedule:occupied",
        input: {
          expectedLifecycleRevision: 1,
          projectedStartAt: "2026-08-10T12:00:00.000Z"
        },
        now
      })
    ).rejects.toMatchObject({ code: "slot_no_longer_available" });
  });
});

function createStore(
  executeOwnerReschedule: BookingCommandStore["executeOwnerReschedule"]
): BookingCommandStore {
  return {
    executeManualBooking: vi.fn(),
    executePaidHold: vi.fn(),
    executeOwnerCancellation: vi.fn(),
    executeOwnerReschedule: vi.fn(executeOwnerReschedule),
    executeOwnerCompletion: vi.fn(),
    confirmPaidBooking: vi.fn(async () => null),
    releasePaidBookingPaymentHold: vi.fn(async () => null),
    findByOwnerAndId: vi.fn(async () => null)
  };
}

function confirmedBooking(): Booking {
  return {
    id: bookingId,
    reservationId,
    ownerUserId,
    clientUserId,
    productId,
    source: "client_paid",
    state: "confirmed",
    lifecycleRevision: 1,
    holdExpiresAt: null,
    startAt: "2026-08-08T09:00:00.000Z",
    endAt: "2026-08-08T10:00:00.000Z",
    productTitle: "Natal consultation",
    durationMinutes: 60,
    deliveryFormat: "video",
    priceMinor: 490000,
    currency: "RUB",
    timeZone: "Europe/Moscow",
    policySnapshot: {
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 10,
      minimumNoticeMinutes: 60
    },
    clientDataRequirementsSnapshot: {
      schemaVersion: "booking-client-data-requirements.v1",
      executionMode: "live",
      participantMode: "solo",
      requiredClientData: ["chart1"],
      methods: ["natal"]
    },
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z"
  };
}

function rescheduleContext(
  booking: Booking,
  overrides: Partial<ProjectionContext> = {}
): BookingRescheduleContext {
  return {
    booking,
    scheduleId,
    availability: {
      schedule: {
        id: scheduleId,
        ownerUserId,
        name: "Primary",
        timeZone: "Europe/Moscow",
        isDefault: true,
        version: 3,
        startIntervalMinutes: 30,
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 10,
        minimumNoticeMinutes: 60,
        bookingHorizonDays: 60,
        maximumBookingsPerDay: null,
        weeklyPeriods: [],
        dateOverrides: [
          {
            date: "2026-08-10",
            mode: "available",
            periods: [{ startMinute: 0, endMinute: 1440 }]
          }
        ],
        productIds: [],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      },
      activeReservations: [],
      confirmedBookingCountByLocalDate: {},
      ...overrides
    }
  };
}

function scheduleSnapshot(booking: Booking) {
  return { startAt: booking.startAt, endAt: booking.endAt, timeZone: booking.timeZone };
}
