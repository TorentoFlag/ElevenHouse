import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import {
  SessionCancelledError,
  SessionEndedError,
  SessionExpiredError,
  SessionMessageOperationConflictError,
  SessionNotFoundError,
  SessionValidationError,
  evaluateSessionJoinPolicy,
  type ApplyProviderEventResult,
  type SessionCommandStore,
  type SessionProjection
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  bookings,
  clientAstrologerRelationships,
  sessionCommands,
  sessionMessages,
  sessionParticipants,
  sessionProviderEvents,
  sessionRealtimeEvents,
  sessions
} from "../../schema";
import { createDrizzleSessionReadStore } from "./drizzle-session-read-store";

export function createDrizzleSessionCommandStore(
  database: ElevenHouseDatabase
): SessionCommandStore {
  const reads = createDrizzleSessionReadStore(database);

  return {
    issueJoin: async (input) => {
      const [row] = await database
        .select({
          session: sessions,
          bookingState: bookings.state,
          deliveryFormat: bookings.deliveryFormatSnapshot,
          relationshipStatus: clientAstrologerRelationships.status,
          participantId: sessionParticipants.providerParticipantId,
          participantRole: sessionParticipants.role,
          participantDisplayName: sessionParticipants.displayNameSnapshot
        })
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
        .leftJoin(
          clientAstrologerRelationships,
          and(
            eq(clientAstrologerRelationships.astrologerUserId, sessions.ownerUserId),
            eq(clientAstrologerRelationships.clientUserId, sessions.clientUserId)
          )
        )
        .where(eq(sessions.id, input.sessionId))
        .limit(1);

      if (!row || !row.relationshipStatus) return { kind: "denied", reason: "not_found" };
      const policy = evaluateSessionJoinPolicy({
        sessionState: row.session.state as Parameters<typeof evaluateSessionJoinPolicy>[0]["sessionState"],
        bookingState: row.bookingState as Parameters<typeof evaluateSessionJoinPolicy>[0]["bookingState"],
        deliveryFormat:
          row.deliveryFormat as Parameters<typeof evaluateSessionJoinPolicy>[0]["deliveryFormat"],
        relationshipStatus:
          row.relationshipStatus as Parameters<typeof evaluateSessionJoinPolicy>[0]["relationshipStatus"],
        scheduledStartAt: row.session.scheduledStartAt.toISOString(),
        scheduledEndAt: row.session.scheduledEndAt.toISOString(),
        now: input.now
      });
      if (policy.kind === "too_early") {
        return { kind: "denied", reason: "too_early", joinableAt: policy.joinableAt };
      }
      if (policy.kind === "denied") return { kind: "denied", reason: policy.reason };
      return {
        kind: "authorized",
        sessionId: row.session.id,
        providerRoomName: row.session.providerRoomName,
        providerParticipantId: row.participantId,
        participantRole: row.participantRole as "astrologer" | "client",
        participantDisplayName: row.participantDisplayName
      };
    },

    recordMessage: async (input) =>
      database.transaction(async (transaction) => {
        const [existing] = await transaction
          .select()
          .from(sessionMessages)
          .where(
            and(
              eq(sessionMessages.sessionId, input.sessionId),
              eq(sessionMessages.senderUserId, input.actor.userId),
              eq(sessionMessages.operationId, input.operationId)
            )
          )
          .limit(1);
        if (existing) {
          if (existing.requestHash !== input.requestHash) {
            throw new SessionMessageOperationConflictError();
          }
          return { kind: "replayed", message: toSessionMessage(existing) };
        }

        await assertParticipant(transaction, input.sessionId, input.actor);
        const [session] = await transaction
          .select()
          .from(sessions)
          .where(eq(sessions.id, input.sessionId))
          .limit(1)
          .for("update");
        if (!session) throw new SessionNotFoundError();
        assertSessionAcceptsCommands(session.state);
        const sequence = session.latestMessageSequence + 1n;
        const [created] = await transaction
          .insert(sessionMessages)
          .values({
            id: randomUUID(),
            sessionId: input.sessionId,
            sequence,
            operationId: input.operationId,
            senderUserId: input.actor.userId,
            senderRole: input.actor.role,
            requestHash: input.requestHash,
            text: input.text,
            createdAt: new Date(input.now)
          })
          .returning();
        if (!created) throw new Error("Expected Session message insert");
        await transaction
          .update(sessions)
          .set({ latestMessageSequence: sequence, updatedAt: new Date(input.now) })
          .where(eq(sessions.id, input.sessionId));
        await transaction.insert(sessionRealtimeEvents).values({
          sessionId: input.sessionId,
          type: "message.created",
          messageId: created.id,
          state: null,
          occurredAt: new Date(input.now)
        });
        return { kind: "created", message: toSessionMessage(created) };
      }),

    recordLeave: async (input) => {
      const kind = await database.transaction(async (transaction) => {
        const existing = await findCommand(transaction, input, "leave");
        if (existing) return "replayed" as const;
        await assertParticipant(transaction, input.sessionId, input.actor);
        await transaction.insert(sessionCommands).values({
          id: randomUUID(),
          sessionId: input.sessionId,
          operationId: input.operationId,
          actorUserId: input.actor.userId,
          actorRole: input.actor.role,
          kind: "leave",
          requestHash: input.requestHash,
          status: "completed",
          createdAt: new Date(input.now),
          updatedAt: new Date(input.now),
          completedAt: new Date(input.now)
        });
        await transaction
          .update(sessionParticipants)
          .set({
            presenceState: "absent",
            presenceUpdatedAt: new Date(input.now),
            updatedAt: new Date(input.now)
          })
          .where(
            and(
              eq(sessionParticipants.sessionId, input.sessionId),
              eq(sessionParticipants.userId, input.actor.userId),
              eq(sessionParticipants.role, input.actor.role)
            )
          );
        return "recorded" as const;
      });
      const session = await requireProjection(reads, input.actor, input.sessionId, input.now);
      return { kind, session };
    },

    prepareEnd: async (input) => {
      const outcome = await database.transaction(async (transaction) => {
        const existing = await findCommand(transaction, input, "end");
        if (existing) {
          if (existing.status === "completed") return { kind: "replayed" as const };
          return { kind: "prepared" as const, commandId: existing.id };
        }
        await assertParticipant(transaction, input.sessionId, input.actor);
        const [session] = await transaction
          .select()
          .from(sessions)
          .where(eq(sessions.id, input.sessionId))
          .limit(1)
          .for("update");
        if (!session) throw new SessionNotFoundError();
        if (session.state === "ended") return { kind: "already_ended" as const };
        assertSessionAcceptsCommands(session.state);
        const commandId = randomUUID();
        await transaction.insert(sessionCommands).values({
          id: commandId,
          sessionId: input.sessionId,
          operationId: input.operationId,
          actorUserId: input.actor.userId,
          actorRole: input.actor.role,
          kind: "end",
          requestHash: input.requestHash,
          status: "prepared",
          createdAt: new Date(input.now),
          updatedAt: new Date(input.now)
        });
        return { kind: "prepared" as const, commandId, providerRoomName: session.providerRoomName };
      });
      if (outcome.kind === "prepared") {
        const providerRoomName =
          outcome.providerRoomName ??
          (await readProviderRoomName(database, input.sessionId));
        return {
          kind: "prepared",
          commandId: outcome.commandId,
          sessionId: input.sessionId,
          providerRoomName
        };
      }
      const session = await requireProjection(reads, input.actor, input.sessionId, input.now);
      return { kind: outcome.kind, session };
    },

    completeEnd: async (input) => {
      await database.transaction(async (transaction) => {
        const [command] = await transaction
          .select()
          .from(sessionCommands)
          .where(
            and(
              eq(sessionCommands.id, input.commandId),
              eq(sessionCommands.sessionId, input.sessionId),
              eq(sessionCommands.kind, "end")
            )
          )
          .limit(1)
          .for("update");
        if (!command) throw new SessionValidationError("Session end command was not found");
        if (command.status === "completed") return;
        const [session] = await transaction
          .select()
          .from(sessions)
          .where(eq(sessions.id, input.sessionId))
          .limit(1)
          .for("update");
        if (!session) throw new SessionNotFoundError();
        if (session.state !== "ended") {
          await transaction
            .update(sessions)
            .set({
              state: "ended",
              lifecycleRevision: session.lifecycleRevision + 1,
              endedAt: new Date(input.endedAt),
              endReason: input.endReason,
              updatedAt: new Date(input.endedAt)
            })
            .where(eq(sessions.id, input.sessionId));
          await transaction
            .update(sessionParticipants)
            .set({
              presenceState: "absent",
              presenceUpdatedAt: new Date(input.endedAt),
              updatedAt: new Date(input.endedAt)
            })
            .where(eq(sessionParticipants.sessionId, input.sessionId));
          await transaction.insert(sessionRealtimeEvents).values({
            sessionId: input.sessionId,
            type: "session.updated",
            messageId: null,
            state: "ended",
            occurredAt: new Date(input.endedAt)
          });
        }
        await transaction
          .update(sessionCommands)
          .set({
            status: "completed",
            safeFailureCode: null,
            completedAt: new Date(input.endedAt),
            updatedAt: new Date(input.endedAt)
          })
          .where(eq(sessionCommands.id, input.commandId));
      });
      const [command] = await database
        .select({ actorUserId: sessionCommands.actorUserId, actorRole: sessionCommands.actorRole })
        .from(sessionCommands)
        .where(eq(sessionCommands.id, input.commandId))
        .limit(1);
      if (!command) throw new SessionValidationError("Session end command was not found");
      return {
        session: await requireProjection(
          reads,
          { userId: command.actorUserId, role: command.actorRole as "astrologer" | "client" },
          input.sessionId,
          input.endedAt
        )
      };
    },

    markEndOutcomeUnknown: async (input) => {
      const [updated] = await database
        .update(sessionCommands)
        .set({
          status: "outcome_unknown",
          safeFailureCode: input.safeCode,
          updatedAt: new Date(input.observedAt)
        })
        .where(
          and(
            eq(sessionCommands.id, input.commandId),
            eq(sessionCommands.sessionId, input.sessionId),
            eq(sessionCommands.kind, "end")
          )
        )
        .returning({ id: sessionCommands.id });
      if (!updated) throw new SessionValidationError("Session end command was not found");
    },

    applyProviderEvent: async (input) =>
      database.transaction(async (transaction): Promise<ApplyProviderEventResult> => {
        const [existing] = await transaction
          .select({
            payloadDigest: sessionProviderEvents.payloadDigest,
            applicationStatus: sessionProviderEvents.applicationStatus,
            sessionId: sessionProviderEvents.sessionId
          })
          .from(sessionProviderEvents)
          .where(
            and(
              eq(sessionProviderEvents.provider, "livekit"),
              eq(sessionProviderEvents.providerEventId, input.event.id)
            )
          )
          .limit(1);
        if (existing) {
          if (existing.payloadDigest !== input.payloadDigest) {
            throw new SessionValidationError("Provider event id was reused with different content");
          }
          return {
            kind: "replayed",
            state: existing.sessionId
              ? await readSessionState(transaction, existing.sessionId)
              : null
          };
        }

        const [session] = await transaction
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.provider, "livekit"),
              eq(sessions.providerRoomName, input.event.roomName)
            )
          )
          .limit(1)
          .for("update");
        if (!session) {
          await transaction.insert(sessionProviderEvents).values({
            provider: "livekit",
            providerEventId: input.event.id,
            providerRoomName: input.event.roomName,
            eventType: input.event.kind,
            providerParticipantId: input.event.participantId,
            payloadDigest: input.payloadDigest,
            occurredAt: new Date(input.event.occurredAt),
            receivedAt: new Date(input.receivedAt),
            applicationStatus: "ignored"
          });
          return { kind: "ignored", state: null };
        }

        const occurredAt = new Date(input.event.occurredAt);
        let applicationStatus: "applied" | "ignored" = "applied";
        let state = session.state as SessionProjection["state"];
        if (input.event.kind === "participant_joined" && input.event.participantId) {
          const [participant] = await transaction
            .select({ id: sessionParticipants.id })
            .from(sessionParticipants)
            .where(
              and(
                eq(sessionParticipants.sessionId, session.id),
                eq(sessionParticipants.providerParticipantId, input.event.participantId)
              )
            )
            .limit(1);
          if (!participant) {
            applicationStatus = "ignored";
          } else {
            await transaction
              .update(sessionParticipants)
              .set({
                firstJoinedAt: sql`coalesce(${sessionParticipants.firstJoinedAt}, ${occurredAt})`,
                lastJoinedAt: occurredAt,
                presenceState: "present",
                presenceUpdatedAt: occurredAt,
                updatedAt: occurredAt
              })
              .where(eq(sessionParticipants.id, participant.id));
            if (session.state === "scheduled") {
              state = "active";
              await transaction
                .update(sessions)
                .set({
                  state,
                  lifecycleRevision: session.lifecycleRevision + 1,
                  startedAt: occurredAt,
                  updatedAt: occurredAt
                })
                .where(eq(sessions.id, session.id));
              await insertSessionUpdatedEvent(transaction, session.id, state, occurredAt);
            }
          }
        } else if (input.event.kind === "participant_left" && input.event.participantId) {
          const updated = await transaction
            .update(sessionParticipants)
            .set({ presenceState: "absent", presenceUpdatedAt: occurredAt, updatedAt: occurredAt })
            .where(
              and(
                eq(sessionParticipants.sessionId, session.id),
                eq(sessionParticipants.providerParticipantId, input.event.participantId)
              )
            )
            .returning({ id: sessionParticipants.id });
          if (updated.length === 0) applicationStatus = "ignored";
        } else if (input.event.kind === "room_started" && session.state === "scheduled") {
          state = "active";
          await transaction
            .update(sessions)
            .set({
              state,
              lifecycleRevision: session.lifecycleRevision + 1,
              startedAt: occurredAt,
              updatedAt: occurredAt
            })
            .where(eq(sessions.id, session.id));
          await insertSessionUpdatedEvent(transaction, session.id, state, occurredAt);
        } else if (input.event.kind === "room_finished" && session.state === "active") {
          state = "ended";
          await transaction
            .update(sessions)
            .set({
              state,
              lifecycleRevision: session.lifecycleRevision + 1,
              endedAt: occurredAt,
              endReason: "participants_absent",
              updatedAt: occurredAt
            })
            .where(eq(sessions.id, session.id));
          await transaction
            .update(sessionParticipants)
            .set({ presenceState: "absent", presenceUpdatedAt: occurredAt, updatedAt: occurredAt })
            .where(eq(sessionParticipants.sessionId, session.id));
          await insertSessionUpdatedEvent(transaction, session.id, state, occurredAt);
        } else {
          applicationStatus = "ignored";
        }

        await transaction.insert(sessionProviderEvents).values({
          sessionId: session.id,
          provider: "livekit",
          providerEventId: input.event.id,
          providerRoomName: input.event.roomName,
          eventType: input.event.kind,
          providerParticipantId: input.event.participantId,
          payloadDigest: input.payloadDigest,
          occurredAt,
          receivedAt: new Date(input.receivedAt),
          applicationStatus
        });
        return { kind: applicationStatus === "applied" ? "applied" : "ignored", state };
      })
  };
}

type SessionTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];

async function assertParticipant(
  database: SessionTransaction,
  sessionId: string,
  actor: { readonly userId: string; readonly role: "astrologer" | "client" }
): Promise<void> {
  const [participant] = await database
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
  if (!participant) throw new SessionNotFoundError();
}

async function findCommand(
  database: SessionTransaction,
  input: {
    readonly actor: { readonly userId: string };
    readonly sessionId: string;
    readonly operationId: string;
    readonly requestHash: string;
  },
  kind: "leave" | "end"
) {
  const [existing] = await database
    .select()
    .from(sessionCommands)
    .where(
      and(
        eq(sessionCommands.sessionId, input.sessionId),
        eq(sessionCommands.actorUserId, input.actor.userId),
        eq(sessionCommands.kind, kind),
        eq(sessionCommands.operationId, input.operationId)
      )
    )
    .limit(1);
  if (existing && existing.requestHash !== input.requestHash) {
    throw new SessionValidationError("Session operation id was reused with different content");
  }
  return existing;
}

function assertSessionAcceptsCommands(state: string): void {
  if (state === "cancelled") throw new SessionCancelledError();
  if (state === "expired") throw new SessionExpiredError();
  if (state === "ended") throw new SessionEndedError();
  if (state !== "active") throw new SessionValidationError("Session is not active");
}

function toSessionMessage(row: typeof sessionMessages.$inferSelect) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    sequence: row.sequence.toString(),
    operationId: row.operationId,
    senderRole: row.senderRole as "astrologer" | "client",
    text: row.text,
    createdAt: row.createdAt.toISOString()
  };
}

async function readProviderRoomName(database: ElevenHouseDatabase, sessionId: string) {
  const [session] = await database
    .select({ providerRoomName: sessions.providerRoomName })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) throw new SessionNotFoundError();
  return session.providerRoomName;
}

async function readSessionState(database: SessionTransaction, sessionId: string) {
  const [session] = await database
    .select({ state: sessions.state })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return (session?.state as SessionProjection["state"] | undefined) ?? null;
}

async function insertSessionUpdatedEvent(
  database: SessionTransaction,
  sessionId: string,
  state: SessionProjection["state"],
  occurredAt: Date
) {
  await database.insert(sessionRealtimeEvents).values({
    sessionId,
    type: "session.updated",
    messageId: null,
    state,
    occurredAt
  });
}

async function requireProjection(
  reads: ReturnType<typeof createDrizzleSessionReadStore>,
  actor: { readonly userId: string; readonly role: "astrologer" | "client" },
  sessionId: string,
  now: string
) {
  const session = await reads.getForActor({ actor, sessionId, now });
  if (!session) throw new SessionNotFoundError();
  return session;
}
