import {
  assertChartBirthDataReady,
  CLIENT_BIRTH_PROFILE_UPDATED_EVENT,
  FlowExecutionIntegrityError,
  formatFlowNodeExecutorKey,
  parseBookingClientDataRequirementsSnapshot,
  parseFlowRuntimeTraceSummary,
  resolvePinnedFlowExecutionAdvanceTarget,
  resolvePinnedFlowExecutionNode,
  type FlowBirthProfileRecheckResult,
  type FlowBirthProfileRecheckStore
} from "@elevenhouse/domain";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "@elevenhouse/validation";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  clientAstrologerRelationships,
  clientBirthData,
  clientBirthDataHistory,
  bookings,
  outboxEvents
} from "../../schema";
import {
  flowBirthProfileRecheckReceipts,
  flowExecutionTokens,
  flowRunEvents,
  flowRuns,
  flowRuntimeEvents,
  flowVersions,
  flowWorkItems
} from "../../schema/flows";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";

type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

const activeWorkItemStatuses = ["pending", "in_progress", "snoozed"] as const;
const birthProfileEventSchema = z
  .object({
    schemaVersion: z.literal("client-birth-profile-updated.v1"),
    birthDataHistoryId: z.string().uuid(),
    birthDataId: z.string().uuid(),
    clientUserId: z.string().uuid(),
    revision: z.number().int().positive(),
    actorUserId: z.string().uuid(),
    actorRole: z.enum(["client", "astrologer"]),
    occurredAt: z.string().datetime({ offset: true })
  })
  .strict();

type RecheckCandidate = {
  readonly workItem: typeof flowWorkItems.$inferSelect;
  readonly token: typeof flowExecutionTokens.$inferSelect;
  readonly run: typeof flowRuns.$inferSelect;
  readonly version: typeof flowVersions.$inferSelect;
  readonly booking: typeof bookings.$inferSelect;
};

/**
 * Resolves only existing birth-data collection tasks. It never creates a task,
 * impersonates an astrologer, or reads birth values from the outbox payload.
 */
export function createDrizzleFlowBirthProfileRecheckStore(
  database: ElevenHouseDatabase
): FlowBirthProfileRecheckStore {
  return {
    recheck: ({ sourceOutboxEventId, event }) =>
      database.transaction((transaction) =>
        recheckBirthProfileInTransaction(transaction, { sourceOutboxEventId, event })
      )
  };
}

async function recheckBirthProfileInTransaction(
  transaction: FlowTransaction,
  input: Parameters<FlowBirthProfileRecheckStore["recheck"]>[0]
): Promise<FlowBirthProfileRecheckResult> {
  const event = birthProfileEventSchema.parse(input.event);
  const [outboxEvent] = await transaction
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.id, input.sourceOutboxEventId))
    .limit(1)
    .for("update", { of: outboxEvents });
  if (
    !outboxEvent ||
    outboxEvent.eventType !== CLIENT_BIRTH_PROFILE_UPDATED_EVENT ||
    outboxEvent.aggregateId !== event.birthDataHistoryId ||
    !sameBirthProfileEvent(outboxEvent.payload, event)
  ) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_RUNTIME_STATE_INVALID",
      "Birth-profile recheck must be sourced from its durable redacted outbox event"
    );
  }

  const [history] = await transaction
    .select()
    .from(clientBirthDataHistory)
    .where(eq(clientBirthDataHistory.id, event.birthDataHistoryId))
    .limit(1)
    .for("update", { of: clientBirthDataHistory });
  if (
    !history ||
    history.birthDataId !== event.birthDataId ||
    history.clientUserId !== event.clientUserId ||
    history.revision !== event.revision ||
    history.actorUserId !== event.actorUserId ||
    history.actorRole !== event.actorRole
  ) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_RUNTIME_STATE_INVALID",
      "Birth-profile recheck event does not match immutable profile history"
    );
  }

  const [profile] = await transaction
    .select()
    .from(clientBirthData)
    .where(
      and(
        eq(clientBirthData.id, event.birthDataId),
        eq(clientBirthData.clientUserId, event.clientUserId)
      )
    )
    .limit(1)
    .for("update", { of: clientBirthData });
  if (!profile) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_RUNTIME_STATE_INVALID",
      "Birth-profile history must retain its singleton profile"
    );
  }

  const candidates = await findWaitingBirthDataCandidates(transaction, event.clientUserId);
  let affectedRunCount = 0;
  let sawNotReady = false;
  let replayed = candidates.length > 0;

  for (const candidate of candidates) {
    const [existingReceipt] = await transaction
      .select({ id: flowBirthProfileRecheckReceipts.id })
      .from(flowBirthProfileRecheckReceipts)
      .where(
        and(
          eq(flowBirthProfileRecheckReceipts.sourceOutboxEventId, input.sourceOutboxEventId),
          eq(flowBirthProfileRecheckReceipts.flowRunId, candidate.run.id)
        )
      )
      .limit(1)
      .for("update", { of: flowBirthProfileRecheckReceipts });
    if (existingReceipt) continue;
    replayed = false;

    const readiness = isBookingBirthDataReady(candidate.booking, profile);
    const [receipt] = await transaction
      .insert(flowBirthProfileRecheckReceipts)
      .values({
        sourceOutboxEventId: input.sourceOutboxEventId,
        birthDataHistoryId: history.id,
        ownerUserId: candidate.run.ownerUserId,
        flowRunId: candidate.run.id,
        workItemId: candidate.workItem.id,
        birthDataRevision: event.revision,
        outcome: readiness ? "ready" : "not_ready"
      })
      .onConflictDoNothing()
      .returning({ id: flowBirthProfileRecheckReceipts.id });
    if (!receipt) {
      replayed = true;
      continue;
    }

    if (!readiness) {
      sawNotReady = true;
      continue;
    }

    await resolveReadyBirthDataWorkItem(transaction, {
      candidate,
      sourceOutboxEventId: input.sourceOutboxEventId,
      birthDataHistoryId: history.id,
      birthDataRevision: event.revision
    });
    affectedRunCount += 1;
  }

  return {
    sourceOutboxEventId: input.sourceOutboxEventId,
    profileHistoryId: event.birthDataHistoryId,
    outcome: affectedRunCount > 0 ? "ready" : sawNotReady ? "not_ready" : "stale",
    replayed,
    affectedRunCount
  };
}

async function findWaitingBirthDataCandidates(
  transaction: FlowTransaction,
  clientUserId: string
): Promise<readonly RecheckCandidate[]> {
  return transaction
    .select({
      workItem: flowWorkItems,
      token: flowExecutionTokens,
      run: flowRuns,
      version: flowVersions,
      booking: bookings
    })
    .from(flowWorkItems)
    .innerJoin(
      flowExecutionTokens,
      and(
        eq(flowExecutionTokens.id, flowWorkItems.tokenId),
        eq(flowExecutionTokens.flowRunId, flowWorkItems.flowRunId),
        eq(flowExecutionTokens.flowVersionId, flowWorkItems.flowVersionId),
        eq(flowExecutionTokens.ownerUserId, flowWorkItems.ownerUserId)
      )
    )
    .innerJoin(
      flowRuns,
      and(
        eq(flowRuns.id, flowWorkItems.flowRunId),
        eq(flowRuns.flowVersionId, flowWorkItems.flowVersionId),
        eq(flowRuns.ownerUserId, flowWorkItems.ownerUserId)
      )
    )
    .innerJoin(
      flowVersions,
      and(
        eq(flowVersions.id, flowRuns.flowVersionId),
        eq(flowVersions.flowId, flowRuns.flowId),
        eq(flowVersions.ownerUserId, flowRuns.ownerUserId)
      )
    )
    .innerJoin(
      flowRuntimeEvents,
      and(
        eq(flowRuntimeEvents.id, flowRuns.runtimeEventId),
        eq(flowRuntimeEvents.ownerUserId, flowRuns.ownerUserId),
        eq(flowRuntimeEvents.subjectType, "booking")
      )
    )
    .innerJoin(
      bookings,
      and(
        sql`${bookings.id}::text = ${flowRuntimeEvents.subjectId}`,
        eq(bookings.ownerUserId, flowRuns.ownerUserId),
        eq(bookings.clientUserId, clientUserId),
        eq(bookings.state, "confirmed")
      )
    )
    .innerJoin(
      clientAstrologerRelationships,
      and(
        eq(clientAstrologerRelationships.clientUserId, bookings.clientUserId),
        eq(clientAstrologerRelationships.astrologerUserId, bookings.ownerUserId),
        eq(clientAstrologerRelationships.status, "active")
      )
    )
    .where(
      and(
        inArray(flowWorkItems.status, activeWorkItemStatuses),
        eq(flowWorkItems.taskKind, "birth_data_collection"),
        eq(flowRuns.status, "waiting"),
        eq(flowExecutionTokens.state, "waiting_work_item"),
        eq(flowExecutionTokens.nodeKind, "astrologer_work_item"),
        eq(flowRuns.currentNodeId, flowWorkItems.nodeId),
        eq(flowExecutionTokens.nodeId, flowWorkItems.nodeId),
        eq(flowExecutionTokens.nodeActivationSequence, flowWorkItems.nodeActivationSequence)
      )
    )
    .for("update", { of: flowWorkItems });
}

function isBookingBirthDataReady(
  booking: typeof bookings.$inferSelect,
  profile: typeof clientBirthData.$inferSelect
): boolean {
  const requirements = parseBookingClientDataRequirementsSnapshot(
    booking.clientDataRequirementsSnapshot
  );
  if (requirements.schemaVersion !== "booking-client-data-requirements.v1") {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_RUNTIME_STATE_INVALID",
      "Birth-data recheck requires the pinned booking requirements snapshot"
    );
  }
  if (requirements.requiredClientData.includes("chart2")) return false;
  if (!requirements.requiredClientData.includes("chart1")) return true;
  try {
    assertChartBirthDataReady({
      birthDate: profile.birthDate,
      birthTime: profile.birthTime,
      birthTimePrecision: profile.birthTimePrecision as "exact" | "approximate" | "unknown",
      birthTimezone: profile.birthTimezone,
      birthLatitude: profile.birthLatitude,
      birthLongitude: profile.birthLongitude,
      birthTimeDstOccurrence: profile.birthTimeDstOccurrence as "first" | "second" | null
    });
    return true;
  } catch {
    return false;
  }
}

async function resolveReadyBirthDataWorkItem(
  transaction: FlowTransaction,
  input: {
    readonly candidate: RecheckCandidate;
    readonly sourceOutboxEventId: string;
    readonly birthDataHistoryId: string;
    readonly birthDataRevision: number;
  }
): Promise<void> {
  const { candidate } = input;
  let target;
  try {
    const node = resolvePinnedFlowExecutionNode({
      flowVersionId: candidate.run.flowVersionId,
      nodeId: candidate.token.nodeId,
      nodeKind: candidate.token.nodeKind as "astrologer_work_item",
      configSchemaVersion: candidate.token.configSchemaVersion,
      executorContractVersion: candidate.token.executorContractVersion,
      graph: candidate.version.graph,
      capabilityManifest: candidate.version.capabilityManifest
    });
    if (
      node.kind !== "astrologer_work_item" ||
      candidate.token.executorKey !== formatFlowNodeExecutorKey(node)
    ) {
      throw new FlowExecutionIntegrityError(
        "FLOW_TOKEN_NODE_METADATA_MISMATCH",
        "Birth-data recheck work item does not match its pinned node"
      );
    }
    target = resolvePinnedFlowExecutionAdvanceTarget({
      definition: {
        flowVersionId: candidate.run.flowVersionId,
        nodeId: candidate.token.nodeId,
        nodeKind: "astrologer_work_item",
        configSchemaVersion: candidate.token.configSchemaVersion,
        executorContractVersion: candidate.token.executorContractVersion,
        graph: candidate.version.graph,
        capabilityManifest: candidate.version.capabilityManifest
      },
      sourceHandle: "success"
    });
  } catch (error) {
    if (error instanceof FlowExecutionIntegrityError) throw error;
    throw new FlowExecutionIntegrityError(
      "FLOW_PINNED_GRAPH_INVALID",
      "Birth-data recheck cannot resolve the pinned work-item success edge"
    );
  }

  const completedAt = await readDatabaseInstant(transaction);
  const trace = parseFlowRuntimeTraceSummary({
    schemaVersion: "flow-runtime-trace.v1",
    outcome: "advanced",
    nodeKind: "astrologer_work_item",
    reasonCode: "FLOW_BIRTH_PROFILE_RECHECK_READY",
    resultCode: "FLOW_TOKEN_ADVANCED",
    sourceHandle: "success",
    selectedEdgeId: target.edgeId,
    targetNodeId: target.node.id,
    targetNodeKind: target.node.kind,
    sourceOutboxEventId: input.sourceOutboxEventId,
    birthDataHistoryId: input.birthDataHistoryId,
    birthDataRevision: input.birthDataRevision,
    workItemId: candidate.workItem.id,
    fromRevision: candidate.workItem.revision,
    toRevision: candidate.workItem.revision + 1
  });
  const [runEvent] = await transaction
    .insert(flowRunEvents)
    .values({
      ownerUserId: candidate.run.ownerUserId,
      flowRunId: candidate.run.id,
      sequence: candidate.run.traceSequence + 1n,
      eventType: "token_advanced",
      nodeId: candidate.workItem.nodeId,
      attemptId: null,
      commandId: null,
      summary: trace,
      occurredAt: completedAt
    })
    .returning({ id: flowRunEvents.id });
  if (!runEvent) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_RUNTIME_STATE_INVALID",
      "Birth-data recheck could not record its run transition"
    );
  }

  const [resumedToken] = await transaction
    .update(flowExecutionTokens)
    .set({
      nodeId: target.node.id,
      nodeKind: target.node.kind,
      configSchemaVersion: target.node.configSchemaVersion,
      executorContractVersion: target.node.executorContractVersion,
      executorKey: formatFlowNodeExecutorKey(target.node),
      state: "runnable",
      availableAt: completedAt,
      claimedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      claimControlPolicyRevision: null,
      claimPolicyDigest: null,
      claimWorkerSessionId: null,
      claimWorkerRegistrationDigest: null,
      nodeActivationSequence: candidate.token.nodeActivationSequence + 1n,
      attemptCounter: 0n,
      failureDisposition: null,
      failureReasonCode: null,
      terminalAt: null,
      quarantinedAt: null,
      updatedAt: completedAt
    })
    .where(
      and(
        eq(flowExecutionTokens.id, candidate.token.id),
        eq(flowExecutionTokens.ownerUserId, candidate.run.ownerUserId),
        eq(flowExecutionTokens.flowRunId, candidate.run.id),
        eq(flowExecutionTokens.flowVersionId, candidate.run.flowVersionId),
        eq(flowExecutionTokens.state, "waiting_work_item"),
        eq(flowExecutionTokens.nodeActivationSequence, candidate.token.nodeActivationSequence),
        eq(flowExecutionTokens.fencingToken, candidate.token.fencingToken)
      )
    )
    .returning({ id: flowExecutionTokens.id });
  if (!resumedToken) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_RUNTIME_STATE_INVALID",
      "Birth-data recheck token compare-and-swap failed"
    );
  }

  const [resumedRun] = await transaction
    .update(flowRuns)
    .set({
      status: "running",
      currentNodeId: target.node.id,
      traceSequence: candidate.run.traceSequence + 1n,
      updatedAt: completedAt
    })
    .where(
      and(
        eq(flowRuns.id, candidate.run.id),
        eq(flowRuns.ownerUserId, candidate.run.ownerUserId),
        eq(flowRuns.flowVersionId, candidate.run.flowVersionId),
        eq(flowRuns.status, "waiting"),
        eq(flowRuns.traceSequence, candidate.run.traceSequence)
      )
    )
    .returning({ id: flowRuns.id });
  if (!resumedRun) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_RUNTIME_STATE_INVALID",
      "Birth-data recheck run compare-and-swap failed"
    );
  }

  const [completedWorkItem] = await transaction
    .update(flowWorkItems)
    .set({
      status: "completed",
      snoozedUntil: null,
      startedAt: candidate.workItem.startedAt ?? completedAt,
      completedAt,
      completedByUserId: null,
      resultSummary: null,
      revision: candidate.workItem.revision + 1,
      lastCommandId: null,
      lastRunEventId: runEvent.id,
      updatedAt: completedAt
    })
    .where(
      and(
        eq(flowWorkItems.id, candidate.workItem.id),
        eq(flowWorkItems.ownerUserId, candidate.run.ownerUserId),
        eq(flowWorkItems.flowRunId, candidate.run.id),
        eq(flowWorkItems.tokenId, candidate.token.id),
        eq(flowWorkItems.nodeActivationSequence, candidate.workItem.nodeActivationSequence),
        eq(flowWorkItems.revision, candidate.workItem.revision),
        eq(flowWorkItems.status, candidate.workItem.status)
      )
    )
    .returning({ id: flowWorkItems.id });
  if (!completedWorkItem) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_RUNTIME_STATE_INVALID",
      "Birth-data recheck work-item compare-and-swap failed"
    );
  }
}

function sameBirthProfileEvent(payload: unknown, event: z.infer<typeof birthProfileEventSchema>): boolean {
  const parsed = birthProfileEventSchema.safeParse(payload);
  return parsed.success && JSON.stringify(parsed.data) === JSON.stringify(event);
}

async function readDatabaseInstant(transaction: FlowTransaction): Promise<Date> {
  const result = await transaction.execute(sql`
    select (extract(epoch from transaction_timestamp()) * 1000)::text as epoch_milliseconds
  `);
  const instant = parseFlowDatabaseEpochMilliseconds(result.rows[0]?.epoch_milliseconds);
  if (!instant) {
    throw new FlowExecutionIntegrityError(
      "FLOW_TOKEN_RUNTIME_STATE_INVALID",
      "Birth-data recheck database clock is unavailable"
    );
  }
  return instant;
}
