import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";

import type {
  SessionActor,
  SessionParticipantProjection,
  SessionProjection,
  SessionReadStore,
  SessionSummary
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  bookings,
  sessionMessages,
  sessionParticipants,
  sessionRealtimeEvents,
  sessions
} from "../../schema";

export function createDrizzleSessionReadStore(database: ElevenHouseDatabase): SessionReadStore {
  return {
    getForActor: (input) => readProjection(database, input.actor, input.sessionId),

    listForActor: async (input) => {
      const rows = await database
        .select({ session: sessions, bookingState: bookings.state })
        .from(sessions)
        .innerJoin(bookings, eq(bookings.id, sessions.bookingId))
        .innerJoin(
          sessionParticipants,
          and(
            eq(sessionParticipants.sessionId, sessions.id),
            eq(sessionParticipants.userId, input.actor.userId),
            eq(sessionParticipants.role, input.actor.role)
          )
        )
        .where(
          and(
            lt(sessions.scheduledStartAt, new Date(input.rangeEndAt)),
            gt(sessions.scheduledEndAt, new Date(input.rangeStartAt))
          )
        )
        .orderBy(asc(sessions.scheduledStartAt), asc(sessions.id));
      if (rows.length === 0) return [];
      const participants = await database
        .select()
        .from(sessionParticipants)
        .where(inArray(sessionParticipants.sessionId, rows.map(({ session }) => session.id)))
        .orderBy(asc(sessionParticipants.role));
      const grouped = groupParticipants(participants);
      return rows.map(({ session, bookingState }): SessionSummary => {
        const projection = toProjection(
          session,
          bookingState,
          input.actor.role,
          grouped.get(session.id) ?? []
        );
        return {
          id: projection.id,
          bookingId: projection.bookingId,
          state: projection.state,
          bookingState: projection.bookingState,
          productTitle: projection.productTitle,
          scheduledStartAt: projection.scheduledStartAt,
          scheduledEndAt: projection.scheduledEndAt,
          timeZone: projection.timeZone,
          startedAt: projection.startedAt,
          endedAt: projection.endedAt,
          currentParticipantRole: projection.currentParticipantRole,
          participants: projection.participants
        };
      });
    },

    listMessages: async (input) => {
      if (!(await actorCanRead(database, input.actor, input.sessionId))) return emptyMessages();
      const afterSequence = parseSequence(input.afterSequence);
      const rows = await database
        .select()
        .from(sessionMessages)
        .where(
          and(
            eq(sessionMessages.sessionId, input.sessionId),
            gt(sessionMessages.sequence, afterSequence)
          )
        )
        .orderBy(asc(sessionMessages.sequence))
        .limit(input.limit + 1);
      const hasMore = rows.length > input.limit;
      const page = rows.slice(0, input.limit).map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        sequence: row.sequence.toString(),
        operationId: row.operationId,
        senderRole: row.senderRole as "astrologer" | "client",
        text: row.text,
        createdAt: row.createdAt.toISOString()
      }));
      return {
        messages: page,
        nextAfterSequence: hasMore ? (page.at(-1)?.sequence ?? null) : null
      };
    },

    listRealtimeEvents: async (input) => {
      if (!(await actorCanRead(database, input.actor, input.sessionId))) return { events: [] };
      const afterEventId = input.afterEventId ? parseSequence(input.afterEventId) : 0n;
      const rows = await database
        .select()
        .from(sessionRealtimeEvents)
        .where(
          and(
            eq(sessionRealtimeEvents.sessionId, input.sessionId),
            gt(sessionRealtimeEvents.eventId, afterEventId)
          )
        )
        .orderBy(asc(sessionRealtimeEvents.eventId))
        .limit(input.limit);
      return {
        events: rows.map((row) => ({
          eventId: row.eventId.toString(),
          sessionId: row.sessionId,
          type: row.type as "session.updated" | "message.created",
          occurredAt: row.occurredAt.toISOString(),
          messageId: row.messageId,
          state: row.state as SessionProjection["state"] | null
        }))
      };
    }
  };
}

async function readProjection(
  database: ElevenHouseDatabase,
  actor: SessionActor,
  sessionId: string
): Promise<SessionProjection | null> {
  const [row] = await database
    .select({ session: sessions, bookingState: bookings.state })
    .from(sessions)
    .innerJoin(bookings, eq(bookings.id, sessions.bookingId))
    .innerJoin(
      sessionParticipants,
      and(
        eq(sessionParticipants.sessionId, sessions.id),
        eq(sessionParticipants.userId, actor.userId),
        eq(sessionParticipants.role, actor.role)
      )
    )
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) return null;
  const participants = await database
    .select()
    .from(sessionParticipants)
    .where(eq(sessionParticipants.sessionId, sessionId))
    .orderBy(asc(sessionParticipants.role));
  return toProjection(row.session, row.bookingState, actor.role, participants);
}

function toProjection(
  session: typeof sessions.$inferSelect,
  bookingState: string,
  currentParticipantRole: SessionActor["role"],
  participants: readonly (typeof sessionParticipants.$inferSelect)[]
): SessionProjection {
  return {
    id: session.id,
    bookingId: session.bookingId,
    state: session.state as SessionProjection["state"],
    lifecycleRevision: session.lifecycleRevision,
    bookingState: bookingState as SessionProjection["bookingState"],
    productTitle: session.productTitleSnapshot,
    scheduledStartAt: session.scheduledStartAt.toISOString(),
    scheduledEndAt: session.scheduledEndAt.toISOString(),
    timeZone: session.timeZoneSnapshot,
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    endReason: session.endReason as SessionProjection["endReason"],
    currentParticipantRole,
    participants: participants.map(toParticipant),
    latestMessageSequence: session.latestMessageSequence.toString(),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  };
}

function toParticipant(
  participant: typeof sessionParticipants.$inferSelect
): SessionParticipantProjection {
  return {
    role: participant.role as SessionParticipantProjection["role"],
    displayName: participant.displayNameSnapshot,
    firstJoinedAt: participant.firstJoinedAt?.toISOString() ?? null,
    lastJoinedAt: participant.lastJoinedAt?.toISOString() ?? null,
    isPresent: participant.presenceState === "present"
  };
}

function groupParticipants(rows: readonly (typeof sessionParticipants.$inferSelect)[]) {
  const grouped = new Map<string, (typeof sessionParticipants.$inferSelect)[]>();
  for (const row of rows) {
    const group = grouped.get(row.sessionId) ?? [];
    group.push(row);
    grouped.set(row.sessionId, group);
  }
  return grouped;
}

async function actorCanRead(
  database: ElevenHouseDatabase,
  actor: SessionActor,
  sessionId: string
): Promise<boolean> {
  const [row] = await database
    .select({ id: sessionParticipants.id })
    .from(sessionParticipants)
    .where(
      and(
        eq(sessionParticipants.sessionId, sessionId),
        eq(sessionParticipants.userId, actor.userId),
        eq(sessionParticipants.role, actor.role)
      )
    )
    .limit(1);
  return Boolean(row);
}

function parseSequence(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("Invalid Session sequence");
  return BigInt(value);
}

function emptyMessages() {
  return { messages: [], nextAfterSequence: null };
}
