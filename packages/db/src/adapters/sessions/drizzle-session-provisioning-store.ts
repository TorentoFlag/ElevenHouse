import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  decideSessionBookingLifecycleProjection,
  type SessionMaintenanceStore,
  type SessionProvisioningStore
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  astrologerProfiles,
  bookingLifecycleEvents,
  bookings,
  clientProfiles,
  sessionBookingLifecycleReceipts,
  sessionParticipants,
  sessionRealtimeEvents,
  sessions
} from "../../schema";

export type DrizzleSessionLifecycleStore = SessionProvisioningStore & SessionMaintenanceStore;

export function createDrizzleSessionLifecycleStore(
  database: ElevenHouseDatabase
): DrizzleSessionLifecycleStore {
  return {
    processPending: async (input) => {
      const counters = { processed: 0, provisioned: 0, updated: 0, ignored: 0 };
      for (let index = 0; index < input.limit; index += 1) {
        const outcome = await processNextBookingLifecycleEvent(database, input.now);
        if (!outcome) break;
        counters.processed += 1;
        counters[outcome] += 1;
      }
      return counters;
    },

    expireScheduled: async (input) =>
      database.transaction(async (transaction) => {
        const due = await transaction
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(
              eq(sessions.state, "scheduled"),
              sql`${sessions.scheduledEndAt} + interval '30 minutes' <= ${new Date(input.now)}`
            )
          )
          .orderBy(asc(sessions.scheduledEndAt), asc(sessions.id))
          .limit(input.limit)
          .for("update", { skipLocked: true });
        const ids = due.map(({ id }) => id);
        if (ids.length === 0) return [];
        await transaction
          .update(sessions)
          .set({
            state: "expired",
            lifecycleRevision: sql`${sessions.lifecycleRevision} + 1`,
            endedAt: new Date(input.now),
            updatedAt: new Date(input.now)
          })
          .where(and(inArray(sessions.id, ids), eq(sessions.state, "scheduled")));
        await transaction.insert(sessionRealtimeEvents).values(
          ids.map((sessionId) => ({
            sessionId,
            type: "session.updated" as const,
            messageId: null,
            state: "expired",
            occurredAt: new Date(input.now)
          }))
        );
        return ids;
      }),

    endAbsentActive: async (input) =>
      database.transaction(async (transaction) => {
        const due = await transaction.execute<{ id: string }>(sql`
          select target.id
            from sessions target
           where target.state = 'active'
             and (
               select count(*)
                 from session_participants participant
                where participant.session_id = target.id
             ) = 2
             and not exists (
               select 1
                 from session_participants participant
                where participant.session_id = target.id
                  and participant.presence_state = 'present'
             )
             and (
               select max(participant.presence_updated_at)
                 from session_participants participant
                where participant.session_id = target.id
             ) <= ${new Date(input.absentBefore)}
           order by target.scheduled_end_at, target.id
           for update of target skip locked
           limit ${input.limit}
        `);
        const ids = due.rows.map(({ id }) => id);
        if (ids.length === 0) return [];
        await transaction
          .update(sessions)
          .set({
            state: "ended",
            lifecycleRevision: sql`${sessions.lifecycleRevision} + 1`,
            endedAt: new Date(input.now),
            endReason: "participants_absent",
            updatedAt: new Date(input.now)
          })
          .where(and(inArray(sessions.id, ids), eq(sessions.state, "active")));
        await transaction.insert(sessionRealtimeEvents).values(
          ids.map((sessionId) => ({
            sessionId,
            type: "session.updated" as const,
            messageId: null,
            state: "ended",
            occurredAt: new Date(input.now)
          }))
        );
        return ids;
      })
  };
}

async function processNextBookingLifecycleEvent(
  database: ElevenHouseDatabase,
  processedAt: string
): Promise<"provisioned" | "updated" | "ignored" | null> {
  return database.transaction(async (transaction) => {
    const [source] = await transaction
      .select({ event: bookingLifecycleEvents, booking: bookings })
      .from(bookingLifecycleEvents)
      .innerJoin(bookings, eq(bookings.id, bookingLifecycleEvents.bookingId))
      .leftJoin(
        sessionBookingLifecycleReceipts,
        eq(sessionBookingLifecycleReceipts.eventId, bookingLifecycleEvents.id)
      )
      .where(isNull(sessionBookingLifecycleReceipts.eventId))
      .orderBy(
        asc(bookingLifecycleEvents.occurredAt),
        asc(bookingLifecycleEvents.bookingId),
        asc(bookingLifecycleEvents.revision)
      )
      .limit(1)
      .for("update", { of: bookingLifecycleEvents, skipLocked: true });
    if (!source) return null;

    const action = decideSessionBookingLifecycleProjection({
      eventKind: source.event.eventKind as Parameters<
        typeof decideSessionBookingLifecycleProjection
      >[0]["eventKind"],
      deliveryFormat: source.booking.deliveryFormatSnapshot as Parameters<
        typeof decideSessionBookingLifecycleProjection
      >[0]["deliveryFormat"]
    });
    let outcome: "provisioned" | "updated" | "ignored" = "ignored";
    let sessionId: string | null = null;

    if (action === "provision") {
      const existing = await findSessionByBooking(transaction, source.booking.id);
      if (existing) {
        sessionId = existing.id;
        outcome = "updated";
      } else if (source.event.afterStartAt && source.event.afterEndAt && source.event.afterTimeZone) {
        const [names] = await transaction
          .select({
            astrologerName: astrologerProfiles.publicName,
            clientName: clientProfiles.displayNameSnapshot
          })
          .from(bookings)
          .leftJoin(astrologerProfiles, eq(astrologerProfiles.ownerUserId, bookings.ownerUserId))
          .leftJoin(clientProfiles, eq(clientProfiles.userId, bookings.clientUserId))
          .where(eq(bookings.id, source.booking.id))
          .limit(1);
        sessionId = randomUUID();
        await transaction.insert(sessions).values({
          id: sessionId,
          bookingId: source.booking.id,
          ownerUserId: source.booking.ownerUserId,
          clientUserId: source.booking.clientUserId,
          state: "scheduled",
          lifecycleRevision: 1,
          scheduledStartAt: source.event.afterStartAt,
          scheduledEndAt: source.event.afterEndAt,
          timeZoneSnapshot: source.event.afterTimeZone,
          productTitleSnapshot: source.booking.productTitleSnapshot,
          provider: "livekit",
          providerRoomName: `session_${randomUUID().replaceAll("-", "")}`,
          createdAt: new Date(processedAt),
          updatedAt: new Date(processedAt)
        });
        await transaction.insert(sessionParticipants).values([
          {
            sessionId,
            userId: source.booking.ownerUserId,
            role: "astrologer",
            displayNameSnapshot: names?.astrologerName ?? source.booking.ownerUserId,
            presenceUpdatedAt: new Date(processedAt),
            createdAt: new Date(processedAt),
            updatedAt: new Date(processedAt)
          },
          {
            sessionId,
            userId: source.booking.clientUserId,
            role: "client",
            displayNameSnapshot: names?.clientName ?? source.booking.clientUserId,
            presenceUpdatedAt: new Date(processedAt),
            createdAt: new Date(processedAt),
            updatedAt: new Date(processedAt)
          }
        ]);
        outcome = "provisioned";
      }
    } else if (action === "reschedule") {
      const existing = await findSessionByBooking(transaction, source.booking.id);
      sessionId = existing?.id ?? null;
      if (
        existing?.state === "scheduled" &&
        source.event.afterStartAt &&
        source.event.afterEndAt &&
        source.event.afterTimeZone
      ) {
        await transaction
          .update(sessions)
          .set({
            scheduledStartAt: source.event.afterStartAt,
            scheduledEndAt: source.event.afterEndAt,
            timeZoneSnapshot: source.event.afterTimeZone,
            lifecycleRevision: existing.lifecycleRevision + 1,
            updatedAt: new Date(processedAt)
          })
          .where(and(eq(sessions.id, existing.id), eq(sessions.state, "scheduled")));
        await insertProjectionEvent(transaction, existing.id, "scheduled", processedAt);
        outcome = "updated";
      }
    } else if (action === "cancel") {
      const existing = await findSessionByBooking(transaction, source.booking.id);
      sessionId = existing?.id ?? null;
      if (existing?.state === "scheduled") {
        await transaction
          .update(sessions)
          .set({
            state: "cancelled",
            lifecycleRevision: existing.lifecycleRevision + 1,
            endedAt: source.event.occurredAt,
            updatedAt: new Date(processedAt)
          })
          .where(and(eq(sessions.id, existing.id), eq(sessions.state, "scheduled")));
        await insertProjectionEvent(transaction, existing.id, "cancelled", processedAt);
        outcome = "updated";
      }
    }

    await transaction.insert(sessionBookingLifecycleReceipts).values({
      eventId: source.event.id,
      bookingId: source.event.bookingId,
      ownerUserId: source.event.ownerUserId,
      revision: source.event.revision,
      outcome,
      sessionId,
      processedAt: new Date(processedAt)
    });
    return outcome;
  });
}

type SessionTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];

async function findSessionByBooking(database: SessionTransaction, bookingId: string) {
  const [session] = await database
    .select()
    .from(sessions)
    .where(eq(sessions.bookingId, bookingId))
    .limit(1)
    .for("update");
  return session;
}

async function insertProjectionEvent(
  database: SessionTransaction,
  sessionId: string,
  state: "scheduled" | "cancelled",
  occurredAt: string
) {
  await database.insert(sessionRealtimeEvents).values({
    sessionId,
    type: "session.updated",
    messageId: null,
    state,
    occurredAt: new Date(occurredAt)
  });
}
