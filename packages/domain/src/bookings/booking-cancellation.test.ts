import { describe, expect, it, vi } from "vitest";

import type { BookingCommandStore } from "./booking-ports";
import type { Booking } from "./booking-types";
import { cancelBooking } from "./booking-use-cases";
import { createBookingLifecycleEvent } from "./booking-lifecycle-events";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const clientUserId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const bookingId = "44444444-4444-4444-8444-444444444444";
const eventId = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-08-05T03:30:00.000Z");

describe("cancelBooking", () => {
  it("binds actor, booking, expected revision and reason to one idempotent command", async () => {
    const store = createStore();

    await expect(
      cancelBooking({
        commandStore: store,
        ownerUserId,
        bookingId,
        idempotencyKey: "booking-cancel:request-1",
        input: {
          expectedLifecycleRevision: 1,
          reasonCode: "astrologer_unavailable"
        },
        now
      })
    ).resolves.toMatchObject({
      replayed: false,
      booking: { id: bookingId, state: "cancelled", lifecycleRevision: 2 },
      lifecycleEvent: { id: eventId, revision: 2, kind: "cancelled" }
    });

    expect(store.executeOwnerCancellation).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ownerUserId,
        scope: "bookings.owner.cancel",
        key: "booking-cancel:request-1",
        requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        now: now.toISOString(),
        expiresAt: "2026-08-06T03:30:00Z"
      }),
      {
        bookingId,
        expectedLifecycleRevision: 1,
        reasonCode: "astrologer_unavailable"
      }
    );
  });

  it("rejects invalid command identity before touching persistence", async () => {
    const store = createStore();

    await expect(
      cancelBooking({
        commandStore: store,
        ownerUserId,
        bookingId,
        idempotencyKey: "short",
        input: { expectedLifecycleRevision: 0, reasonCode: "other" },
        now
      })
    ).rejects.toMatchObject({ code: "booking_validation_error" });
    expect(store.executeOwnerCancellation).not.toHaveBeenCalled();
  });
});

function createStore(): BookingCommandStore {
  const cancelledBooking: Booking = {
    id: bookingId,
    reservationId: "66666666-6666-4666-8666-666666666666",
    ownerUserId,
    clientUserId,
    productId,
    source: "manual",
    state: "cancelled",
    lifecycleRevision: 2,
    holdExpiresAt: null,
    startAt: "2026-08-08T09:00:00.000Z",
    endAt: "2026-08-08T10:00:00.000Z",
    productTitle: "Натальный разбор",
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
    updatedAt: now.toISOString()
  };
  const lifecycleEvent = createBookingLifecycleEvent({
    id: eventId,
    bookingId,
    ownerUserId,
    revision: 2,
    kind: "cancelled",
    actor: { kind: "astrologer", userId: ownerUserId },
    reasonCode: "astrologer_unavailable",
    before: {
      startAt: cancelledBooking.startAt,
      endAt: cancelledBooking.endAt,
      timeZone: cancelledBooking.timeZone
    },
    after: null,
    occurredAt: now.toISOString()
  });
  return {
    executeManualBooking: vi.fn(),
    executePaidHold: vi.fn(),
    executeOwnerCancellation: vi.fn(async () => ({
      kind: "created" as const,
      booking: cancelledBooking,
      lifecycleEvent
    })),
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
