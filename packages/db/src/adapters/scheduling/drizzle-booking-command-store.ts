import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lt, lte } from "drizzle-orm";
import {
  SlotNoLongerAvailableError,
  FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
  type Booking,
  type BookingCommandStore,
  type BookingPolicySnapshot,
  type ManualBookingClaim,
  type PaidBookingHoldClaim,
  createBookingConfirmedFlowRuntimeDispatchPayload
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { bookings, outboxEvents, scheduleReservations } from "../../schema";
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
            await releaseExpiredPaidBookingHolds(transaction, {
              ownerUserId: claim.ownerUserId,
              scheduleId: claim.scheduleId,
              occupiedStartAt: claim.occupiedStartAt,
              occupiedEndAt: claim.occupiedEndAt,
              now: command.now
            });
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
                source: "manual",
                state: "confirmed",
                holdExpiresAt: null,
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
            const booking = toBooking(row);
            await transaction
              .insert(outboxEvents)
              .values({
                eventType: FLOW_RUNTIME_DISPATCH_REQUESTED_EVENT,
                aggregateId: booking.id,
                payload: createBookingConfirmedFlowRuntimeDispatchPayload(booking),
                status: "pending",
                attempts: 0,
                availableAt: new Date(command.now),
                createdAt: new Date(command.now),
                updatedAt: new Date(command.now)
              })
              .onConflictDoNothing({
                target: [outboxEvents.eventType, outboxEvents.aggregateId]
              });
            return { aggregateId: bookingId, value: booking };
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
    executePaidHold: async (command, createClaim) => {
      try {
        const result = await executeIdempotentSchedulingCommand({
          database,
          apiSurface: "public-api",
          command,
          create: async (transaction) => {
            const claim = await createClaim();
            assertActorOwnsPaidHold(command.actorUserId, claim);
            await releaseExpiredPaidBookingHolds(transaction, {
              ownerUserId: claim.ownerUserId,
              scheduleId: claim.scheduleId,
              occupiedStartAt: claim.occupiedStartAt,
              occupiedEndAt: claim.occupiedEndAt,
              now: command.now
            });
            const bookingId = randomUUID();
            const reservationId = randomUUID();
            await transaction.insert(scheduleReservations).values({
              id: reservationId,
              ownerUserId: claim.ownerUserId,
              scheduleId: claim.scheduleId,
              kind: "hold",
              lifecycle: "active",
              serviceStartAt: new Date(claim.serviceStartAt),
              serviceEndAt: new Date(claim.serviceEndAt),
              occupiedStartAt: new Date(claim.occupiedStartAt),
              occupiedEndAt: new Date(claim.occupiedEndAt),
              sourceAggregateId: null,
              holdExpiresAt: new Date(claim.holdExpiresAt),
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
                source: "client_paid",
                state: "hold",
                holdExpiresAt: new Date(claim.holdExpiresAt),
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
            if (!row) throw new Error("Expected paid booking hold insert");
            return { aggregateId: bookingId, value: toBooking(row) };
          },
          replay: (bookingId) => findOwnedBookingByClient(database, command.actorUserId, bookingId)
        });
        return { kind: result.kind, booking: result.value };
      } catch (error) {
        if (isActiveReservationExclusionViolation(error)) {
          throw new SlotNoLongerAvailableError();
        }
        throw error;
      }
    },
    confirmPaidBooking: (input) => confirmPaidBooking(database, input),
    releasePaidBookingPaymentHold: (input) => releasePaidBookingPaymentHold(database, input),
    findByOwnerAndId: ({ ownerUserId, bookingId }) =>
      findOwnedBooking(database, ownerUserId, bookingId)
  };
}

export async function confirmPaidBooking(
  database: ElevenHouseDatabase | SchedulingTransaction,
  input: { readonly bookingId: string; readonly now: string }
): Promise<Booking | null> {
  const [row] = await database
    .update(bookings)
    .set({ state: "confirmed", holdExpiresAt: null, updatedAt: new Date(input.now) })
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bookings.source, "client_paid"),
        eq(bookings.state, "pending_payment")
      )
    )
    .returning();
  return row ? toBooking(row) : null;
}

export async function releasePaidBookingPaymentHold(
  database: ElevenHouseDatabase | SchedulingTransaction,
  input: {
    readonly bookingId: string;
    readonly state: "cancelled" | "expired";
    readonly now: string;
  }
): Promise<Booking | null> {
  const [row] = await database
    .update(bookings)
    .set({ state: input.state, holdExpiresAt: null, updatedAt: new Date(input.now) })
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bookings.source, "client_paid"),
        inArray(bookings.state, ["hold", "pending_payment"])
      )
    )
    .returning();
  if (!row) return null;

  await database
    .update(scheduleReservations)
    .set({
      kind: "booking",
      lifecycle: "released",
      sourceAggregateId: input.bookingId,
      holdExpiresAt: null,
      updatedAt: new Date(input.now)
    })
    .where(eq(scheduleReservations.id, row.reservationId));

  return toBooking(row);
}

async function releaseExpiredPaidBookingHolds(
  database: SchedulingTransaction,
  input: {
    readonly ownerUserId: string;
    readonly scheduleId: string;
    readonly occupiedStartAt: string;
    readonly occupiedEndAt: string;
    readonly now: string;
  }
): Promise<void> {
  const expiredReservations = await database
    .update(scheduleReservations)
    .set({ lifecycle: "released", updatedAt: new Date(input.now) })
    .where(
      and(
        eq(scheduleReservations.ownerUserId, input.ownerUserId),
        eq(scheduleReservations.scheduleId, input.scheduleId),
        eq(scheduleReservations.kind, "hold"),
        eq(scheduleReservations.lifecycle, "active"),
        lte(scheduleReservations.holdExpiresAt, new Date(input.now)),
        lt(scheduleReservations.occupiedStartAt, new Date(input.occupiedEndAt)),
        gt(scheduleReservations.occupiedEndAt, new Date(input.occupiedStartAt))
      )
    )
    .returning({ id: scheduleReservations.id });
  const reservationIds = expiredReservations.map((reservation) => reservation.id);
  if (reservationIds.length === 0) return;

  await database
    .update(bookings)
    .set({ state: "expired", holdExpiresAt: null, updatedAt: new Date(input.now) })
    .where(
      and(
        eq(bookings.ownerUserId, input.ownerUserId),
        eq(bookings.source, "client_paid"),
        eq(bookings.state, "hold"),
        inArray(bookings.reservationId, reservationIds)
      )
    );
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

async function findOwnedBookingByClient(
  database: ElevenHouseDatabase | SchedulingTransaction,
  clientUserId: string,
  bookingId: string
): Promise<Booking | null> {
  const [row] = await database
    .select()
    .from(bookings)
    .where(and(eq(bookings.clientUserId, clientUserId), eq(bookings.id, bookingId)))
    .limit(1);
  return row ? toBooking(row) : null;
}

function assertActorOwnsClaim(actorUserId: string, claim: ManualBookingClaim): void {
  if (actorUserId !== claim.ownerUserId) {
    throw new Error("Manual booking actor does not own the claim");
  }
}

function assertActorOwnsPaidHold(actorUserId: string, claim: PaidBookingHoldClaim): void {
  if (actorUserId !== claim.clientUserId) {
    throw new Error("Paid booking hold actor does not own the claim");
  }
}

function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    reservationId: row.reservationId,
    ownerUserId: row.ownerUserId,
    clientUserId: row.clientUserId,
    productId: row.productId,
    source: row.source as Booking["source"],
    state: row.state as Booking["state"],
    holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
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
