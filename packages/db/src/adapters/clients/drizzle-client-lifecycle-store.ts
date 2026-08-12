import { and, eq } from "drizzle-orm";
import {
  FLOW_CLIENT_LIFECYCLE_CHANGED_ENROLLMENT_REQUESTED_EVENT,
  createClientLifecycleChangedFlowEnrollmentRequestedPayload,
  resolveClientLifecycleTransition,
  type ClientLifecycleMode,
  type ClientLifecycleStatus,
  type ClientLifecycleStore,
  type ClientLifecycleTransitionStoreInput,
  type ClientLifecycleTransitionStoreResult
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  clientAstrologerRelationships,
  clientLifecycleHistory,
  clientLifecycleStates
} from "../../schema";
import { outboxEvents } from "../../schema/outbox/outbox-events.schema";

type ClientLifecycleTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type ClientLifecycleDatabase = ElevenHouseDatabase | ClientLifecycleTransaction;

export function createDrizzleClientLifecycleStore(
  database: ClientLifecycleDatabase
): ClientLifecycleStore {
  return {
    applyTransition: (input) =>
      withTransaction(database, (transaction) => applyTransition(transaction, input))
  };
}

async function applyTransition(
  transaction: ClientLifecycleDatabase,
  input: ClientLifecycleTransitionStoreInput
): Promise<ClientLifecycleTransitionStoreResult> {
  const [relationship] = await transaction
    .select({
      id: clientAstrologerRelationships.id,
      clientUserId: clientAstrologerRelationships.clientUserId,
      astrologerUserId: clientAstrologerRelationships.astrologerUserId
    })
    .from(clientAstrologerRelationships)
    .where(
      and(
        eq(clientAstrologerRelationships.id, input.relationshipId),
        eq(clientAstrologerRelationships.status, "active")
      )
    )
    .limit(1)
    .for("update");
  if (!relationship) throw new Error("CLIENT_LIFECYCLE_RELATIONSHIP_UNAVAILABLE");

  const [existingHistory] = await transaction
    .select({ id: clientLifecycleHistory.id })
    .from(clientLifecycleHistory)
    .where(
      and(
        eq(clientLifecycleHistory.relationshipId, input.relationshipId),
        eq(clientLifecycleHistory.sourceEventId, input.sourceEventId)
      )
    )
    .limit(1)
    .for("share");
  if (existingHistory) {
    const state = await requireState(transaction, input.relationshipId);
    return {
      replayed: true,
      decision: {
        disposition: "no_change",
        status: state.status as ClientLifecycleStatus,
        mode: state.mode as ClientLifecycleMode,
        latestAutomaticCandidateStatus:
          state.latestAutomaticCandidateStatus as ClientLifecycleStatus | null
      },
      revision: state.revision,
      lastActivityAt: state.lastActivityAt.toISOString()
    };
  }

  const [current] = await transaction
    .select()
    .from(clientLifecycleStates)
    .where(eq(clientLifecycleStates.relationshipId, input.relationshipId))
    .limit(1)
    .for("update");
  const decision = resolveClientLifecycleTransition({
    current: current
      ? {
          status: current.status as ClientLifecycleStatus,
          mode: current.mode as ClientLifecycleMode,
          latestAutomaticCandidateStatus:
            current.latestAutomaticCandidateStatus as ClientLifecycleStatus | null
        }
      : {
          status: "new",
          mode: "automatic",
          latestAutomaticCandidateStatus: null
        },
    cause: input.cause
  });
  const occurredAt = new Date(input.cause.occurredAt);
  const lastActivityAt =
    input.cause.kind === "inactivity_elapsed" && current
      ? current.lastActivityAt
      : occurredAt;
  const revision = current ? current.revision + 1 : 1;

  const [history] = await transaction.insert(clientLifecycleHistory).values({
    relationshipId: input.relationshipId,
    sourceEventId: input.sourceEventId,
    causeKind: input.cause.kind,
    beforeStatus: current?.status ?? null,
    afterStatus: decision.status,
    disposition: decision.disposition,
    actorUserId: input.actorUserId,
    occurredAt
  }).returning({ id: clientLifecycleHistory.id });
  if (!history) throw new Error("CLIENT_LIFECYCLE_HISTORY_NOT_PERSISTED");

  if (current) {
    await transaction
      .update(clientLifecycleStates)
      .set({
        status: decision.status,
        mode: decision.mode,
        latestAutomaticCandidateStatus: decision.latestAutomaticCandidateStatus,
        revision,
        lastActivityAt,
        updatedAt: occurredAt
      })
      .where(eq(clientLifecycleStates.relationshipId, input.relationshipId));
  } else {
    await transaction.insert(clientLifecycleStates).values({
      relationshipId: input.relationshipId,
      status: decision.status,
      mode: decision.mode,
      latestAutomaticCandidateStatus: decision.latestAutomaticCandidateStatus,
      revision,
      lastActivityAt,
      createdAt: occurredAt,
      updatedAt: occurredAt
    });
  }
  if ((current?.status ?? null) !== decision.status) {
    await transaction.insert(outboxEvents).values({
      eventType: FLOW_CLIENT_LIFECYCLE_CHANGED_ENROLLMENT_REQUESTED_EVENT,
      aggregateId: relationship.clientUserId,
      payload: createClientLifecycleChangedFlowEnrollmentRequestedPayload({
        historyId: history.id,
        ownerUserId: relationship.astrologerUserId,
        clientUserId: relationship.clientUserId,
        relationshipId: input.relationshipId,
        fromStatus: (current?.status as ClientLifecycleStatus | undefined) ?? null,
        toStatus: decision.status,
        occurredAt: input.cause.occurredAt
      })
    });
  }
  return { replayed: false, decision, revision, lastActivityAt: lastActivityAt.toISOString() };
}

async function requireState(transaction: ClientLifecycleDatabase, relationshipId: string) {
  const [state] = await transaction
    .select()
    .from(clientLifecycleStates)
    .where(eq(clientLifecycleStates.relationshipId, relationshipId))
    .limit(1)
    .for("share");
  if (!state) throw new Error("CLIENT_LIFECYCLE_REPLAY_STATE_MISSING");
  return state;
}

function withTransaction<T>(
  database: ClientLifecycleDatabase,
  operation: (transaction: ClientLifecycleDatabase) => Promise<T>
): Promise<T> {
  if ("transaction" in database && typeof database.transaction === "function") {
    return database.transaction((transaction) => operation(transaction));
  }
  return operation(database);
}
