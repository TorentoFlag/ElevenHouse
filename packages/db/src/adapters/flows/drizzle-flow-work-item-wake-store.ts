import { and, asc, eq, lte, sql } from "drizzle-orm";

import {
  parseFlowRuntimeTraceSummary,
  type FlowWorkItemWakeStore,
  type FlowWorkItemWakeSweepResult
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowExecutionTokens,
  flowRunEvents,
  flowRuns,
  flowWorkItems
} from "../../schema/flows";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";

type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type WakeCandidate = {
  readonly workItemId: string;
  readonly ownerUserId: string;
  readonly flowRunId: string;
  readonly flowVersionId: string;
  readonly tokenId: string;
};
type WakeCandidateResult = "woken" | "stale" | "integrity_failure";

export function createDrizzleFlowWorkItemWakeStore(
  database: ElevenHouseDatabase
): FlowWorkItemWakeStore {
  return {
    wakeDue: (input) => wakeDuePersistedWorkItems(database, input)
  };
}

async function wakeDuePersistedWorkItems(
  database: ElevenHouseDatabase,
  input: { readonly limit: number }
): Promise<FlowWorkItemWakeSweepResult> {
  const asOf = await readDatabaseInstant(database);
  const candidates = await database
    .select({
      workItemId: flowWorkItems.id,
      ownerUserId: flowWorkItems.ownerUserId,
      flowRunId: flowWorkItems.flowRunId,
      flowVersionId: flowWorkItems.flowVersionId,
      tokenId: flowWorkItems.tokenId
    })
    .from(flowWorkItems)
    .where(
      and(
        eq(flowWorkItems.status, "snoozed"),
        lte(flowWorkItems.snoozedUntil, asOf)
      )
    )
    .orderBy(asc(flowWorkItems.snoozedUntil), asc(flowWorkItems.createdAt), asc(flowWorkItems.id))
    .limit(input.limit + 1);

  let wokenCount = 0;
  let staleCount = 0;
  let integrityFailureCount = 0;
  for (const candidate of candidates.slice(0, input.limit)) {
    const result = await wakeCandidate(database, candidate, asOf);
    if (result === "woken") wokenCount += 1;
    if (result === "stale") staleCount += 1;
    if (result === "integrity_failure") integrityFailureCount += 1;
  }

  return {
    asOf: asOf.toISOString(),
    wokenCount,
    staleCount,
    integrityFailureCount,
    hasMore: candidates.length > input.limit
  };
}

async function wakeCandidate(
  database: ElevenHouseDatabase,
  candidate: WakeCandidate,
  asOf: Date
): Promise<WakeCandidateResult> {
  return database.transaction(async (transaction) => {
    const token = await lockToken(transaction, candidate);
    if (!token) return "stale";
    const run = await lockRun(transaction, candidate);
    if (!run) return "stale";
    const workItem = await lockWorkItem(transaction, candidate);
    if (!workItem || workItem.status !== "snoozed") return "stale";
    if (!workItem.snoozedUntil || workItem.snoozedUntil.getTime() > asOf.getTime()) {
      return "stale";
    }
    if (!isCoherentWaitingRuntime(candidate, workItem, token, run)) {
      return "integrity_failure";
    }

    const transitionAt = await readDatabaseInstant(transaction);
    const trace = parseFlowRuntimeTraceSummary({
      schemaVersion: "flow-runtime-trace.v1",
      outcome: "available",
      nodeKind: "astrologer_work_item",
      reasonCode: "FLOW_WORK_ITEM_SNOOZE_ELAPSED",
      resultCode: "FLOW_WORK_ITEM_AVAILABLE",
      workItemId: workItem.id,
      fromRevision: workItem.revision,
      toRevision: workItem.revision + 1,
      scheduledFor: workItem.snoozedUntil.toISOString()
    });
    const [sequencedRun] = await transaction
      .update(flowRuns)
      .set({
        traceSequence: run.traceSequence + 1n,
        updatedAt: transitionAt
      })
      .where(
        and(
          eq(flowRuns.id, run.id),
          eq(flowRuns.ownerUserId, candidate.ownerUserId),
          eq(flowRuns.flowVersionId, candidate.flowVersionId),
          eq(flowRuns.status, "waiting"),
          eq(flowRuns.traceSequence, run.traceSequence)
        )
      )
      .returning({ traceSequence: flowRuns.traceSequence });
    if (!sequencedRun) throw new Error("FLOW_WORK_ITEM_WAKE_RUNTIME_INTEGRITY_ERROR");

    const [event] = await transaction
      .insert(flowRunEvents)
      .values({
        ownerUserId: candidate.ownerUserId,
        flowRunId: candidate.flowRunId,
        sequence: sequencedRun.traceSequence,
        eventType: "work_item_available",
        nodeId: workItem.nodeId,
        attemptId: null,
        commandId: null,
        summary: trace,
        occurredAt: transitionAt
      })
      .returning({ id: flowRunEvents.id });
    if (!event) throw new Error("FLOW_WORK_ITEM_WAKE_EVENT_NOT_PERSISTED");

    const [woken] = await transaction
      .update(flowWorkItems)
      .set({
        status: "pending",
        availableAt: transitionAt,
        snoozedUntil: null,
        revision: workItem.revision + 1,
        lastCommandId: null,
        lastRunEventId: event.id,
        updatedAt: transitionAt
      })
      .where(
        and(
          eq(flowWorkItems.id, workItem.id),
          eq(flowWorkItems.ownerUserId, candidate.ownerUserId),
          eq(flowWorkItems.flowRunId, candidate.flowRunId),
          eq(flowWorkItems.flowVersionId, candidate.flowVersionId),
          eq(flowWorkItems.tokenId, candidate.tokenId),
          eq(flowWorkItems.status, "snoozed"),
          eq(flowWorkItems.revision, workItem.revision)
        )
      )
      .returning({ id: flowWorkItems.id });
    if (!woken) throw new Error("FLOW_WORK_ITEM_WAKE_CAS_FAILED");
    return "woken";
  });
}

async function lockToken(transaction: FlowTransaction, candidate: WakeCandidate) {
  const [token] = await transaction
    .select()
    .from(flowExecutionTokens)
    .where(
      and(
        eq(flowExecutionTokens.id, candidate.tokenId),
        eq(flowExecutionTokens.ownerUserId, candidate.ownerUserId),
        eq(flowExecutionTokens.flowRunId, candidate.flowRunId),
        eq(flowExecutionTokens.flowVersionId, candidate.flowVersionId)
      )
    )
    .limit(1)
    .for("update", { of: flowExecutionTokens });
  return token ?? null;
}

async function lockRun(transaction: FlowTransaction, candidate: WakeCandidate) {
  const [run] = await transaction
    .select()
    .from(flowRuns)
    .where(
      and(
        eq(flowRuns.id, candidate.flowRunId),
        eq(flowRuns.ownerUserId, candidate.ownerUserId),
        eq(flowRuns.flowVersionId, candidate.flowVersionId)
      )
    )
    .limit(1)
    .for("update", { of: flowRuns });
  return run ?? null;
}

async function lockWorkItem(transaction: FlowTransaction, candidate: WakeCandidate) {
  const [workItem] = await transaction
    .select()
    .from(flowWorkItems)
    .where(
      and(
        eq(flowWorkItems.id, candidate.workItemId),
        eq(flowWorkItems.ownerUserId, candidate.ownerUserId),
        eq(flowWorkItems.flowRunId, candidate.flowRunId),
        eq(flowWorkItems.flowVersionId, candidate.flowVersionId),
        eq(flowWorkItems.tokenId, candidate.tokenId)
      )
    )
    .limit(1)
    .for("update", { of: flowWorkItems });
  return workItem ?? null;
}

function isCoherentWaitingRuntime(
  candidate: WakeCandidate,
  workItem: typeof flowWorkItems.$inferSelect,
  token: typeof flowExecutionTokens.$inferSelect,
  run: typeof flowRuns.$inferSelect
): boolean {
  return (
    run.status === "waiting" &&
    run.currentNodeId === workItem.nodeId &&
    token.state === "waiting_work_item" &&
    token.nodeKind === "astrologer_work_item" &&
    token.nodeId === workItem.nodeId &&
    token.nodeActivationSequence === workItem.nodeActivationSequence &&
    workItem.assigneeUserId === candidate.ownerUserId &&
    workItem.ownerUserId === candidate.ownerUserId &&
    workItem.flowRunId === candidate.flowRunId &&
    workItem.flowVersionId === candidate.flowVersionId &&
    workItem.tokenId === candidate.tokenId
  );
}

async function readDatabaseInstant(
  database: ElevenHouseDatabase | FlowTransaction
): Promise<Date> {
  const result = await database.execute<{ now_epoch_ms: string }>(sql`
    select (extract(epoch from clock_timestamp()) * 1000)::text as now_epoch_ms
  `);
  const instant = parseFlowDatabaseEpochMilliseconds(result.rows[0]?.now_epoch_ms);
  if (!instant) throw new Error("FLOW_WORK_ITEM_WAKE_DATABASE_CLOCK_UNAVAILABLE");
  return instant;
}
