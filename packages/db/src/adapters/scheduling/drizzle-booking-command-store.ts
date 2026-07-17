import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  SlotNoLongerAvailableError,
  type Booking,
  type BookingCommandStore,
  type BookingPolicySnapshot,
  type ManualBookingClaim
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { bookings, scheduleReservations } from "../../schema";
import {
  executeIdempotentSchedulingCommand,
  isActiveReservationExclusionViolation,
  type SchedulingTransaction
} from "./drizzle-idempotent-scheduling-command";

type BookingRow = typeof bookings.$inferSelect;

export function createDrizzleBookingCommandStore(
  database: ElevenHouseDatabase
): BookingCommandStore {
  return {
    executeManualBooking: async (command, createClaim) => {
      try {
        const result = await executeIdempotentSchedulingCommand({
          database,
          command,
          create: async (transaction) => {
            const claim = await createClaim();
            assertActorOwnsClaim(command.actorUserId, claim);
            const bookingId = randomUUID();
            const reservationId = randomUUID();
            await transaction.insert(scheduleReservations).values({
              id: reservationId,
              ownerUserId: claim.ownerUserId,
              scheduleId: claim.scheduleId,
              kind: "booking",
              lifecycle: "active",
              serviceStartAt: new Date(claim.serviceStartAt),
              serviceEndAt: new Date(claim.serviceEndAt),
              occupiedStartAt: new Date(claim.occupiedStartAt),
              occupiedEndAt: new Date(claim.occupiedEndAt),
              sourceAggregateId: bookingId,
              createdAt: new Date(command.now),
              updatedAt: new Date(command.now)
            });
            const [row] = await transaction
              .insert(bookings)
              .values({
                id: bookingId,
                ownerUserId: claim.ownerUserId,
                clientUserId: claim.clientUserId,
                productId: claim.productId,
                reservationId,
                state: "confirmed",
                serviceStartAt: new Date(claim.serviceStartAt),
                serviceEndAt: new Date(claim.serviceEndAt),
                productTitleSnapshot: claim.productSnapshot.title,
                durationMinutesSnapshot: claim.productSnapshot.durationMinutes,
                deliveryFormatSnapshot: claim.productSnapshot.deliveryFormat,
                priceMinorSnapshot: claim.productSnapshot.priceMinor,
                currencySnapshot: claim.productSnapshot.currency,
                timeZoneSnapshot: claim.scheduleSnapshot.timeZone,
                policySnapshot: claim.scheduleSnapshot.policy,
                createdAt: new Date(command.now),
                updatedAt: new Date(command.now)
              })
              .returning();
            if (!row) throw new Error("Expected manual booking insert");
            return { aggregateId: bookingId, value: toBooking(row) };
          },
          replay: (bookingId) => findOwnedBooking(database, command.actorUserId, bookingId)
        });
        return { kind: result.kind, booking: result.value };
      } catch (error) {
        if (isActiveReservationExclusionViolation(error)) {
          throw new SlotNoLongerAvailableError();
        }
        throw error;
      }
    },
    findByOwnerAndId: ({ ownerUserId, bookingId }) =>
      findOwnedBooking(database, ownerUserId, bookingId)
  };
}

async function findOwnedBooking(
  database: ElevenHouseDatabase | SchedulingTransaction,
  ownerUserId: string,
  bookingId: string
): Promise<Booking | null> {
  const [row] = await database
    .select()
    .from(bookings)
    .where(and(eq(bookings.ownerUserId, ownerUserId), eq(bookings.id, bookingId)))
    .limit(1);
  return row ? toBooking(row) : null;
}

function assertActorOwnsClaim(actorUserId: string, claim: ManualBookingClaim): void {
  if (actorUserId !== claim.ownerUserId) {
    throw new Error("Manual booking actor does not own the claim");
  }
}

function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    reservationId: row.reservationId,
    ownerUserId: row.ownerUserId,
    clientUserId: row.clientUserId,
    productId: row.productId,
    state: row.state as Booking["state"],
    startAt: row.serviceStartAt.toISOString(),
    endAt: row.serviceEndAt.toISOString(),
    productTitle: row.productTitleSnapshot,
    durationMinutes: row.durationMinutesSnapshot,
    deliveryFormat: row.deliveryFormatSnapshot as Booking["deliveryFormat"],
    priceMinor: row.priceMinorSnapshot,
    currency: row.currencySnapshot as Booking["currency"],
    timeZone: row.timeZoneSnapshot,
    policySnapshot: toPolicySnapshot(row.policySnapshot),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toPolicySnapshot(value: Record<string, unknown>): BookingPolicySnapshot {
  const { bufferBeforeMinutes, bufferAfterMinutes, minimumNoticeMinutes } = value;
  if (
    typeof bufferBeforeMinutes !== "number" ||
    typeof bufferAfterMinutes !== "number" ||
    typeof minimumNoticeMinutes !== "number"
  ) {
    throw new Error("Persisted booking policy snapshot is invalid");
  }
  return { bufferBeforeMinutes, bufferAfterMinutes, minimumNoticeMinutes };
}
