import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lt, lte } from "drizzle-orm";
import {
  BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED,
  BookingCancellationNotAllowedError,
  BookingCancellationRequiresRefundAuthorityError,
  BookingCompletionNotAllowedError,
  BookingCompletionTooEarlyError,
  BookingLifecycleRevisionConflictError,
  BookingNotFoundError,
  BookingRescheduleNotAllowedError,
  SlotNoLongerAvailableError,
  type Booking,
  type BookingCancellationReasonCode,
  type BookingCommandStore,
  type BookingLifecycleEvent,
  type BookingPolicySnapshot,
  type BookingRescheduleClaim,
  type BookingRescheduleContext,
  type ManualBookingClaim,
  type OwnerCancelBookingCommand,
  type OwnerCompleteBookingCommand,
  type OwnerRescheduleBookingCommand,
  type PaidBookingHoldClaim,
  createBookingLifecycleEvent,
  createBookingLifecycleEventDispatchPayload,
  parseBookingClientDataRequirementsSnapshot
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { bookingLifecycleEvents, bookings, outboxEvents, scheduleReservations } from "../../schema";
import {
  executeIdempotentSchedulingCommand,
  isActiveReservationExclusionViolation,
  type SchedulingTransaction
} from "./drizzle-idempotent-scheduling-command";
import { readDrizzleAvailabilityProjectionContext } from "./drizzle-availability-store";

type BookingRow = typeof bookings.$inferSelect;
type BookingLifecycleEventRow = typeof bookingLifecycleEvents.$inferSelect;

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
                lifecycleRevision: 1,
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
                clientDataRequirementsSnapshot: claim.productSnapshot.clientDataRequirements,
                createdAt: new Date(command.now),
                updatedAt: new Date(command.now)
              })
              .returning();
            if (!row) throw new Error("Expected manual booking insert");
            const booking = toBooking(row);
            const lifecycleEvent = createBookingLifecycleEvent({
              id: randomUUID(),
              bookingId: booking.id,
              ownerUserId: booking.ownerUserId,
              revision: booking.lifecycleRevision,
              kind: "confirmed",
              actor: { kind: "astrologer", userId: command.actorUserId },
              reasonCode: null,
              before: null,
              after: toBookingScheduleSnapshot(booking),
              occurredAt: command.now
            });
            await persistBookingLifecycleEventAndOutbox(transaction, lifecycleEvent);
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
                lifecycleRevision: 0,
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
                clientDataRequirementsSnapshot: claim.productSnapshot.clientDataRequirements,
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
    executeOwnerCancellation: async (command, input) => {
      const result = await executeIdempotentSchedulingCommand({
        database,
        command,
        create: (transaction) => cancelOwnedBooking(transaction, command, input),
        replay: (bookingId) =>
          findOwnedBookingCancellation(database, command.actorUserId, bookingId)
      });
      return {
        kind: result.kind,
        booking: result.value.booking,
        lifecycleEvent: result.value.lifecycleEvent
      };
    },
    executeOwnerReschedule: async (command, input, createClaim) => {
      try {
        const result = await executeIdempotentSchedulingCommand({
          database,
          command,
          create: (transaction) =>
            rescheduleOwnedBooking(transaction, command, input, createClaim),
          replay: (lifecycleEventId) =>
            findOwnedBookingReschedule(database, command.actorUserId, lifecycleEventId)
        });
        return {
          kind: result.kind,
          booking: result.value.booking,
          lifecycleEvent: result.value.lifecycleEvent
        };
      } catch (error) {
        if (isActiveReservationExclusionViolation(error)) {
          throw new SlotNoLongerAvailableError();
        }
        throw error;
      }
    },
    executeOwnerCompletion: async (command, input) => {
      const result = await executeIdempotentSchedulingCommand({
        database,
        command,
        create: (transaction) => completeOwnedBooking(transaction, command, input),
        replay: (bookingId) =>
          findOwnedBookingCompletion(database, command.actorUserId, bookingId)
      });
      return {
        kind: result.kind,
        booking: result.value.booking,
        lifecycleEvent: result.value.lifecycleEvent
      };
    },
    confirmPaidBooking: (input) =>
      database.transaction((transaction) => confirmPaidBooking(transaction, input)),
    releasePaidBookingPaymentHold: (input) => releasePaidBookingPaymentHold(database, input),
    findByOwnerAndId: ({ ownerUserId, bookingId }) =>
      findOwnedBooking(database, ownerUserId, bookingId)
  };
}

async function rescheduleOwnedBooking(
  database: SchedulingTransaction,
  command: OwnerRescheduleBookingCommand,
  input: {
    readonly bookingId: string;
    readonly expectedLifecycleRevision: number;
    readonly projectedStartAt: string;
  },
  createClaim: (context: BookingRescheduleContext) => Promise<BookingRescheduleClaim>
): Promise<{
  readonly aggregateId: string;
  readonly value: {
    readonly booking: Booking;
    readonly lifecycleEvent: BookingLifecycleEvent;
  };
}> {
  const [lockedRow] = await database
    .select()
    .from(bookings)
    .where(and(eq(bookings.ownerUserId, command.actorUserId), eq(bookings.id, input.bookingId)))
    .limit(1)
    .for("update");
  if (!lockedRow) throw new BookingNotFoundError();
  if (lockedRow.lifecycleRevision !== input.expectedLifecycleRevision) {
    throw new BookingLifecycleRevisionConflictError(
      input.expectedLifecycleRevision,
      lockedRow.lifecycleRevision
    );
  }
  if (lockedRow.state !== "confirmed") {
    throw new BookingRescheduleNotAllowedError(lockedRow.state);
  }

  const [reservation] = await database
    .select()
    .from(scheduleReservations)
    .where(
      and(
        eq(scheduleReservations.id, lockedRow.reservationId),
        eq(scheduleReservations.ownerUserId, lockedRow.ownerUserId),
        eq(scheduleReservations.kind, "booking"),
        eq(scheduleReservations.lifecycle, "active"),
        eq(scheduleReservations.sourceAggregateId, lockedRow.id)
      )
    )
    .limit(1)
    .for("update");
  if (!reservation) throw new Error("Confirmed booking reservation was not active");

  const projectionStart = new Date(input.projectedStartAt);
  const maximumProjectionPaddingMs = 8 * 24 * 60 * 60 * 1_000;
  const availability = await readDrizzleAvailabilityProjectionContext(database, {
    ownerUserId: lockedRow.ownerUserId,
    scheduleId: reservation.scheduleId,
    rangeStartAt: new Date(projectionStart.getTime() - maximumProjectionPaddingMs).toISOString(),
    rangeEndAt: new Date(
      projectionStart.getTime() +
        lockedRow.durationMinutesSnapshot * 60 * 1_000 +
        maximumProjectionPaddingMs
    ).toISOString(),
    excludeReservationId: reservation.id
  });
  if (!availability) throw new Error("Confirmed booking availability schedule was not found");

  const previousBooking = toBooking(lockedRow);
  const claim = await createClaim({
    booking: previousBooking,
    scheduleId: reservation.scheduleId,
    availability
  });
  assertRescheduleClaim(command, input, reservation.id, reservation.scheduleId, claim);
  await releaseExpiredPaidBookingHolds(database, {
    ownerUserId: claim.ownerUserId,
    scheduleId: claim.scheduleId,
    occupiedStartAt: claim.occupiedStartAt,
    occupiedEndAt: claim.occupiedEndAt,
    now: command.now
  });

  const [movedReservation] = await database
    .update(scheduleReservations)
    .set({
      serviceStartAt: new Date(claim.serviceStartAt),
      serviceEndAt: new Date(claim.serviceEndAt),
      occupiedStartAt: new Date(claim.occupiedStartAt),
      occupiedEndAt: new Date(claim.occupiedEndAt),
      updatedAt: new Date(command.now)
    })
    .where(
      and(
        eq(scheduleReservations.id, reservation.id),
        eq(scheduleReservations.ownerUserId, previousBooking.ownerUserId),
        eq(scheduleReservations.scheduleId, claim.scheduleId),
        eq(scheduleReservations.kind, "booking"),
        eq(scheduleReservations.lifecycle, "active"),
        eq(scheduleReservations.sourceAggregateId, previousBooking.id)
      )
    )
    .returning({ id: scheduleReservations.id });
  if (!movedReservation) throw new Error("Locked booking reservation move did not update a row");

  const nextRevision = previousBooking.lifecycleRevision + 1;
  const [updatedRow] = await database
    .update(bookings)
    .set({
      lifecycleRevision: nextRevision,
      serviceStartAt: new Date(claim.serviceStartAt),
      serviceEndAt: new Date(claim.serviceEndAt),
      timeZoneSnapshot: claim.scheduleSnapshot.timeZone,
      updatedAt: new Date(command.now)
    })
    .where(
      and(
        eq(bookings.id, previousBooking.id),
        eq(bookings.ownerUserId, previousBooking.ownerUserId),
        eq(bookings.state, "confirmed"),
        eq(bookings.lifecycleRevision, input.expectedLifecycleRevision)
      )
    )
    .returning();
  if (!updatedRow) throw new Error("Locked booking reschedule compare-and-set did not update a row");

  const booking = toBooking(updatedRow);
  const lifecycleEvent = createBookingLifecycleEvent({
    id: randomUUID(),
    bookingId: booking.id,
    ownerUserId: booking.ownerUserId,
    revision: booking.lifecycleRevision,
    kind: "rescheduled",
    actor: { kind: "astrologer", userId: command.actorUserId },
    reasonCode: null,
    before: toBookingScheduleSnapshot(previousBooking),
    after: toBookingScheduleSnapshot(booking),
    occurredAt: command.now
  });
  await persistBookingLifecycleEventAndOutbox(database, lifecycleEvent);
  return {
    aggregateId: lifecycleEvent.id,
    value: { booking, lifecycleEvent }
  };
}

export async function confirmPaidBooking(
  database: SchedulingTransaction,
  input: { readonly bookingId: string; readonly now: string }
): Promise<Booking | null> {
  const [row] = await database
    .update(bookings)
    .set({
      state: "confirmed",
      lifecycleRevision: 1,
      holdExpiresAt: null,
      updatedAt: new Date(input.now)
    })
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bookings.source, "client_paid"),
        eq(bookings.state, "pending_payment"),
        eq(bookings.lifecycleRevision, 0)
      )
    )
    .returning();
  if (!row) return null;

  const booking = toBooking(row);
  const lifecycleEvent = createBookingLifecycleEvent({
    id: randomUUID(),
    bookingId: booking.id,
    ownerUserId: booking.ownerUserId,
    revision: booking.lifecycleRevision,
    kind: "confirmed",
    actor: { kind: "system", userId: null },
    reasonCode: null,
    before: null,
    after: toBookingScheduleSnapshot(booking),
    occurredAt: input.now
  });
  await persistBookingLifecycleEventAndOutbox(database, lifecycleEvent);
  return booking;
}

async function cancelOwnedBooking(
  database: SchedulingTransaction,
  command: OwnerCancelBookingCommand,
  input: {
    readonly bookingId: string;
    readonly expectedLifecycleRevision: number;
    readonly reasonCode: BookingCancellationReasonCode;
  }
): Promise<{
  readonly aggregateId: string;
  readonly value: {
    readonly booking: Booking;
    readonly lifecycleEvent: BookingLifecycleEvent;
  };
}> {
  const [lockedRow] = await database
    .select()
    .from(bookings)
    .where(and(eq(bookings.ownerUserId, command.actorUserId), eq(bookings.id, input.bookingId)))
    .limit(1)
    .for("update");
  if (!lockedRow) throw new BookingNotFoundError();
  if (lockedRow.lifecycleRevision !== input.expectedLifecycleRevision) {
    throw new BookingLifecycleRevisionConflictError(
      input.expectedLifecycleRevision,
      lockedRow.lifecycleRevision
    );
  }
  if (lockedRow.source === "client_paid") {
    throw new BookingCancellationRequiresRefundAuthorityError();
  }
  if (lockedRow.source !== "manual" || lockedRow.state !== "confirmed") {
    throw new BookingCancellationNotAllowedError(lockedRow.state);
  }

  const previousBooking = toBooking(lockedRow);
  const nextRevision = lockedRow.lifecycleRevision + 1;
  const lifecycleEvent = createBookingLifecycleEvent({
    id: randomUUID(),
    bookingId: previousBooking.id,
    ownerUserId: previousBooking.ownerUserId,
    revision: nextRevision,
    kind: "cancelled",
    actor: { kind: "astrologer", userId: command.actorUserId },
    reasonCode: input.reasonCode,
    before: toBookingScheduleSnapshot(previousBooking),
    after: null,
    occurredAt: command.now
  });
  const [cancelledRow] = await database
    .update(bookings)
    .set({
      state: "cancelled",
      lifecycleRevision: nextRevision,
      updatedAt: new Date(command.now)
    })
    .where(
      and(
        eq(bookings.id, previousBooking.id),
        eq(bookings.ownerUserId, previousBooking.ownerUserId),
        eq(bookings.source, "manual"),
        eq(bookings.state, "confirmed"),
        eq(bookings.lifecycleRevision, input.expectedLifecycleRevision)
      )
    )
    .returning();
  if (!cancelledRow) {
    throw new Error("Locked booking cancellation compare-and-set did not update a row");
  }

  const [releasedReservation] = await database
    .update(scheduleReservations)
    .set({ lifecycle: "released", updatedAt: new Date(command.now) })
    .where(
      and(
        eq(scheduleReservations.id, cancelledRow.reservationId),
        eq(scheduleReservations.ownerUserId, cancelledRow.ownerUserId),
        eq(scheduleReservations.kind, "booking"),
        eq(scheduleReservations.lifecycle, "active"),
        eq(scheduleReservations.sourceAggregateId, cancelledRow.id)
      )
    )
    .returning({ id: scheduleReservations.id });
  if (!releasedReservation) {
    throw new Error("Cancelled booking reservation was not active");
  }

  await persistBookingLifecycleEventAndOutbox(database, lifecycleEvent);
  return {
    aggregateId: cancelledRow.id,
    value: { booking: toBooking(cancelledRow), lifecycleEvent }
  };
}

async function completeOwnedBooking(
  database: SchedulingTransaction,
  command: OwnerCompleteBookingCommand,
  input: {
    readonly bookingId: string;
    readonly expectedLifecycleRevision: number;
  }
): Promise<{
  readonly aggregateId: string;
  readonly value: {
    readonly booking: Booking;
    readonly lifecycleEvent: BookingLifecycleEvent;
  };
}> {
  const [lockedRow] = await database
    .select()
    .from(bookings)
    .where(and(eq(bookings.ownerUserId, command.actorUserId), eq(bookings.id, input.bookingId)))
    .limit(1)
    .for("update");
  if (!lockedRow) throw new BookingNotFoundError();
  if (lockedRow.lifecycleRevision !== input.expectedLifecycleRevision) {
    throw new BookingLifecycleRevisionConflictError(
      input.expectedLifecycleRevision,
      lockedRow.lifecycleRevision
    );
  }
  if (
    lockedRow.source !== "client_paid" ||
    lockedRow.state !== "confirmed" ||
    !isPaidLiveSoloBooking(lockedRow)
  ) {
    throw new BookingCompletionNotAllowedError(lockedRow.state);
  }
  if (lockedRow.serviceEndAt.getTime() > new Date(command.now).getTime()) {
    throw new BookingCompletionTooEarlyError();
  }

  const previousBooking = toBooking(lockedRow);
  const nextRevision = previousBooking.lifecycleRevision + 1;
  const lifecycleEvent = createBookingLifecycleEvent({
    id: randomUUID(),
    bookingId: previousBooking.id,
    ownerUserId: previousBooking.ownerUserId,
    revision: nextRevision,
    kind: "completed",
    actor: { kind: "astrologer", userId: command.actorUserId },
    reasonCode: null,
    before: toBookingScheduleSnapshot(previousBooking),
    after: null,
    occurredAt: command.now
  });
  const [completedRow] = await database
    .update(bookings)
    .set({
      state: "completed",
      lifecycleRevision: nextRevision,
      updatedAt: new Date(command.now)
    })
    .where(
      and(
        eq(bookings.id, previousBooking.id),
        eq(bookings.ownerUserId, previousBooking.ownerUserId),
        eq(bookings.source, "client_paid"),
        eq(bookings.state, "confirmed"),
        eq(bookings.lifecycleRevision, input.expectedLifecycleRevision),
        lte(bookings.serviceEndAt, new Date(command.now))
      )
    )
    .returning();
  if (!completedRow) {
    throw new Error("Locked booking completion compare-and-set did not update a row");
  }
  await persistBookingLifecycleEventAndOutbox(database, lifecycleEvent);
  return {
    aggregateId: completedRow.id,
    value: { booking: toBooking(completedRow), lifecycleEvent }
  };
}

async function persistBookingLifecycleEventAndOutbox(
  database: SchedulingTransaction,
  event: BookingLifecycleEvent
): Promise<void> {
  await database.insert(bookingLifecycleEvents).values({
    id: event.id,
    bookingId: event.bookingId,
    ownerUserId: event.ownerUserId,
    revision: event.revision,
    eventKind: event.kind,
    actorKind: event.actor.kind,
    actorUserId: event.actor.userId,
    reasonCode: event.reasonCode,
    beforeStartAt: event.before ? new Date(event.before.startAt) : null,
    beforeEndAt: event.before ? new Date(event.before.endAt) : null,
    beforeTimeZone: event.before?.timeZone ?? null,
    afterStartAt: event.after ? new Date(event.after.startAt) : null,
    afterEndAt: event.after ? new Date(event.after.endAt) : null,
    afterTimeZone: event.after?.timeZone ?? null,
    canonicalDigest: event.canonicalDigest,
    occurredAt: new Date(event.occurredAt),
    createdAt: new Date(event.occurredAt)
  });
  await database.insert(outboxEvents).values({
    eventType: BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED,
    aggregateId: event.id,
    payload: createBookingLifecycleEventDispatchPayload(event),
    status: "pending",
    attempts: 0,
    availableAt: new Date(event.occurredAt),
    createdAt: new Date(event.occurredAt),
    updatedAt: new Date(event.occurredAt)
  });
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

async function findOwnedBookingCancellation(
  database: ElevenHouseDatabase | SchedulingTransaction,
  ownerUserId: string,
  bookingId: string
): Promise<{
  readonly booking: Booking;
  readonly lifecycleEvent: BookingLifecycleEvent;
} | null> {
  const booking = await findOwnedBooking(database, ownerUserId, bookingId);
  if (!booking || booking.state !== "cancelled") return null;
  const [eventRow] = await database
    .select()
    .from(bookingLifecycleEvents)
    .where(
      and(
        eq(bookingLifecycleEvents.bookingId, booking.id),
        eq(bookingLifecycleEvents.ownerUserId, ownerUserId),
        eq(bookingLifecycleEvents.revision, booking.lifecycleRevision),
        eq(bookingLifecycleEvents.eventKind, "cancelled")
      )
    )
    .limit(1);
  if (!eventRow) return null;
  return { booking, lifecycleEvent: toBookingLifecycleEvent(eventRow) };
}

async function findOwnedBookingCompletion(
  database: ElevenHouseDatabase | SchedulingTransaction,
  ownerUserId: string,
  bookingId: string
): Promise<{
  readonly booking: Booking;
  readonly lifecycleEvent: BookingLifecycleEvent;
} | null> {
  const booking = await findOwnedBooking(database, ownerUserId, bookingId);
  if (!booking || booking.state !== "completed") return null;
  const [eventRow] = await database
    .select()
    .from(bookingLifecycleEvents)
    .where(
      and(
        eq(bookingLifecycleEvents.bookingId, booking.id),
        eq(bookingLifecycleEvents.ownerUserId, ownerUserId),
        eq(bookingLifecycleEvents.revision, booking.lifecycleRevision),
        eq(bookingLifecycleEvents.eventKind, "completed")
      )
    )
    .limit(1);
  if (!eventRow) return null;
  return { booking, lifecycleEvent: toBookingLifecycleEvent(eventRow) };
}

async function findOwnedBookingReschedule(
  database: ElevenHouseDatabase | SchedulingTransaction,
  ownerUserId: string,
  lifecycleEventId: string
): Promise<{
  readonly booking: Booking;
  readonly lifecycleEvent: BookingLifecycleEvent;
} | null> {
  const [eventRow] = await database
    .select()
    .from(bookingLifecycleEvents)
    .where(
      and(
        eq(bookingLifecycleEvents.id, lifecycleEventId),
        eq(bookingLifecycleEvents.ownerUserId, ownerUserId),
        eq(bookingLifecycleEvents.eventKind, "rescheduled")
      )
    )
    .limit(1);
  if (!eventRow) return null;
  const lifecycleEvent = toBookingLifecycleEvent(eventRow);
  if (!lifecycleEvent.after) return null;
  const current = await findOwnedBooking(database, ownerUserId, lifecycleEvent.bookingId);
  if (!current) return null;
  return {
    booking: {
      ...current,
      state: "confirmed",
      lifecycleRevision: lifecycleEvent.revision,
      holdExpiresAt: null,
      startAt: lifecycleEvent.after.startAt,
      endAt: lifecycleEvent.after.endAt,
      timeZone: lifecycleEvent.after.timeZone,
      updatedAt: lifecycleEvent.occurredAt
    },
    lifecycleEvent
  };
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

function assertRescheduleClaim(
  command: OwnerRescheduleBookingCommand,
  input: {
    readonly bookingId: string;
    readonly expectedLifecycleRevision: number;
    readonly projectedStartAt: string;
  },
  reservationId: string,
  scheduleId: string,
  claim: BookingRescheduleClaim
): void {
  if (
    claim.ownerUserId !== command.actorUserId ||
    claim.bookingId !== input.bookingId ||
    claim.reservationId !== reservationId ||
    claim.scheduleId !== scheduleId ||
    claim.expectedLifecycleRevision !== input.expectedLifecycleRevision ||
    new Date(claim.serviceStartAt).getTime() !== new Date(input.projectedStartAt).getTime()
  ) {
    throw new Error("Booking reschedule claim does not match the locked command authority");
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
    lifecycleRevision: row.lifecycleRevision,
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
    clientDataRequirementsSnapshot: parseBookingClientDataRequirementsSnapshot(
      row.clientDataRequirementsSnapshot
    ),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toBookingLifecycleEvent(row: BookingLifecycleEventRow): BookingLifecycleEvent {
  const event = createBookingLifecycleEvent({
    id: row.id,
    bookingId: row.bookingId,
    ownerUserId: row.ownerUserId,
    revision: row.revision,
    kind: toBookingLifecycleEventKind(row.eventKind),
    actor: toBookingLifecycleActor(row.actorKind, row.actorUserId),
    reasonCode: toBookingCancellationReason(row.reasonCode),
    before: toPersistedScheduleSnapshot(row.beforeStartAt, row.beforeEndAt, row.beforeTimeZone),
    after: toPersistedScheduleSnapshot(row.afterStartAt, row.afterEndAt, row.afterTimeZone),
    occurredAt: row.occurredAt.toISOString()
  });
  if (event.canonicalDigest !== row.canonicalDigest) {
    throw new Error("Persisted booking lifecycle event digest does not match its content");
  }
  return event;
}

function toBookingScheduleSnapshot(booking: Booking): NonNullable<BookingLifecycleEvent["after"]> {
  return { startAt: booking.startAt, endAt: booking.endAt, timeZone: booking.timeZone };
}

function toPersistedScheduleSnapshot(
  startAt: Date | null,
  endAt: Date | null,
  timeZone: string | null
): NonNullable<BookingLifecycleEvent["after"]> | null {
  if (startAt === null && endAt === null && timeZone === null) return null;
  if (startAt === null || endAt === null || timeZone === null) {
    throw new Error("Persisted booking lifecycle schedule snapshot is incomplete");
  }
  return { startAt: startAt.toISOString(), endAt: endAt.toISOString(), timeZone };
}

function toBookingLifecycleEventKind(value: string): BookingLifecycleEvent["kind"] {
  if (
    value === "confirmed" ||
    value === "rescheduled" ||
    value === "completed" ||
    value === "cancelled"
  ) {
    return value;
  }
  throw new Error("Persisted booking lifecycle event kind is invalid");
}

function isPaidLiveSoloBooking(row: BookingRow): boolean {
  const requirements = parseBookingClientDataRequirementsSnapshot(
    row.clientDataRequirementsSnapshot
  );
  return (
    requirements.schemaVersion === "booking-client-data-requirements.v1" &&
    requirements.executionMode === "live" &&
    requirements.participantMode === "solo"
  );
}

function toBookingLifecycleActor(
  kind: string,
  userId: string | null
): BookingLifecycleEvent["actor"] {
  if (kind === "system" && userId === null) return { kind, userId };
  if ((kind === "astrologer" || kind === "client") && userId !== null) {
    return { kind, userId };
  }
  throw new Error("Persisted booking lifecycle actor is invalid");
}

function toBookingCancellationReason(value: string | null): BookingLifecycleEvent["reasonCode"] {
  if (
    value === null ||
    value === "astrologer_unavailable" ||
    value === "client_request" ||
    value === "mutual_agreement" ||
    value === "other"
  ) {
    return value;
  }
  throw new Error("Persisted booking cancellation reason is invalid");
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
