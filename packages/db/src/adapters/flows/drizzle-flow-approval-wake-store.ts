import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import {
  FlowExecutionIntegrityError,
  formatFlowNodeExecutorKey,
  parseFlowRuntimeTraceSummary,
  resolvePinnedFlowExecutionAdvanceTarget,
  resolvePinnedFlowExecutionNode,
  type FlowApprovalWakeStore
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowApprovals,
  flowExecutionTokens,
  flowRunEvents,
  flowRuns,
  flowVersions
} from "../../schema/flows";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";

type Tx = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type ApprovalWakeCandidate = {
  readonly approvalId: string;
  readonly ownerUserId: string;
  readonly flowRunId: string;
  readonly flowVersionId: string;
};
type ApprovalWakeResult = "woken" | "expired" | "stale" | "integrity_failure";
type LockedRun = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly flowVersionId: string;
  readonly status: string;
  readonly currentNodeId: string | null;
  readonly traceSequence: bigint;
  readonly graphSchemaVersion: string | null;
  readonly graph: unknown;
  readonly capabilityManifest: unknown;
};

/**
 * The same approval -> token -> run locking order is used by the manual decision
 * command. A deadline can therefore race a human decision without ever taking
 * two outgoing edges from the same token activation.
 */
export function createDrizzleFlowApprovalWakeStore(
  database: ElevenHouseDatabase
): FlowApprovalWakeStore {
  return {
    wakeDue: async ({ limit }) => {
      const asOf = await now(database);
      const candidates = await database
        .select({
          approvalId: flowApprovals.id,
          ownerUserId: flowApprovals.ownerUserId,
          flowRunId: flowApprovals.flowRunId,
          flowVersionId: flowRuns.flowVersionId
        })
        .from(flowApprovals)
        .innerJoin(
          flowRuns,
          and(
            eq(flowRuns.id, flowApprovals.flowRunId),
            eq(flowRuns.ownerUserId, flowApprovals.ownerUserId)
          )
        )
        .where(
          or(
            and(
              inArray(flowApprovals.status, ["pending", "snoozed"]),
              isNotNull(flowApprovals.expiresAt),
              lte(flowApprovals.expiresAt, asOf)
            ),
            and(
              eq(flowApprovals.status, "snoozed"),
              lte(flowApprovals.snoozedUntil, asOf),
              or(isNull(flowApprovals.expiresAt), gt(flowApprovals.expiresAt, asOf))
            )
          )
        )
        .orderBy(
          asc(flowApprovals.expiresAt),
          asc(flowApprovals.snoozedUntil),
          asc(flowApprovals.id)
        )
        .limit(limit + 1);

      let wokenCount = 0;
      let expiredCount = 0;
      let staleCount = 0;
      let integrityFailureCount = 0;
      for (const candidate of candidates.slice(0, limit)) {
        try {
          const result = await database.transaction((tx) => wakeOne(tx, candidate));
          if (result === "woken") wokenCount += 1;
          if (result === "expired") expiredCount += 1;
          if (result === "stale") staleCount += 1;
          if (result === "integrity_failure") integrityFailureCount += 1;
        } catch {
          integrityFailureCount += 1;
        }
      }
      return {
        asOf: asOf.toISOString(),
        wokenCount,
        expiredCount,
        staleCount,
        integrityFailureCount,
        hasMore: candidates.length > limit
      };
    }
  };
}

async function wakeOne(tx: Tx, candidate: ApprovalWakeCandidate): Promise<ApprovalWakeResult> {
  const approval = await lockApproval(tx, candidate);
  if (!approval) return "stale";
  const token = approval.executionTokenId
    ? await lockToken(tx, candidate, approval.executionTokenId)
    : null;
  const run = token ? await lockRun(tx, candidate) : null;
  if (!token || !run || !isCoherentWaitingRuntime(approval, token, run, candidate)) {
    return "integrity_failure";
  }

  const at = await now(tx);
  const expired = approval.expiresAt !== null && approval.expiresAt <= at;
  const woken =
    approval.status === "snoozed" &&
    approval.snoozedUntil !== null &&
    approval.snoozedUntil <= at &&
    !expired;
  if (!expired && !woken) return "stale";

  if (expired) return expireApproval(tx, candidate, approval, token, run, at);
  return wakeApproval(tx, candidate, approval, token, run, at);
}

async function wakeApproval(
  tx: Tx,
  candidate: ApprovalWakeCandidate,
  approval: typeof flowApprovals.$inferSelect,
  token: typeof flowExecutionTokens.$inferSelect,
  run: LockedRun,
  at: Date
): Promise<ApprovalWakeResult> {
  const trace = parseFlowRuntimeTraceSummary({
    schemaVersion: "flow-runtime-trace.v1",
    outcome: "available",
    nodeKind: token.nodeKind,
    reasonCode: "FLOW_APPROVAL_SNOOZE_ELAPSED",
    resultCode: "FLOW_APPROVAL_AVAILABLE"
  });
  const [sequencedRun] = await tx
    .update(flowRuns)
    .set({ traceSequence: run.traceSequence + 1n, updatedAt: at })
    .where(
      and(
        eq(flowRuns.id, run.id),
        eq(flowRuns.ownerUserId, candidate.ownerUserId),
        eq(flowRuns.flowVersionId, candidate.flowVersionId),
        eq(flowRuns.status, "waiting"),
        eq(flowRuns.traceSequence, run.traceSequence)
      )
    )
    .returning({ sequence: flowRuns.traceSequence });
  if (!sequencedRun) return "stale";
  const [event] = await tx
    .insert(flowRunEvents)
    .values({
      ownerUserId: candidate.ownerUserId,
      flowRunId: candidate.flowRunId,
      sequence: sequencedRun.sequence,
      eventType: "approval_available",
      nodeId: run.currentNodeId,
      attemptId: null,
      commandId: null,
      summary: trace,
      occurredAt: at
    })
    .returning({ id: flowRunEvents.id });
  if (!event) throw new Error("FLOW_APPROVAL_WAKE_EVENT_NOT_PERSISTED");
  const [updated] = await tx
    .update(flowApprovals)
    .set({
      status: "pending",
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      snoozedUntil: null,
      revision: approval.revision + 1,
      lastCommandId: null,
      lastRunEventId: event.id
    })
    .where(approvalCasPredicate(approval, candidate))
    .returning({ id: flowApprovals.id });
  return updated ? "woken" : "stale";
}

async function expireApproval(
  tx: Tx,
  candidate: ApprovalWakeCandidate,
  approval: typeof flowApprovals.$inferSelect,
  token: typeof flowExecutionTokens.$inferSelect,
  run: LockedRun,
  at: Date
): Promise<ApprovalWakeResult> {
  let advanceTarget;
  try {
    if (!isApprovalNodeKind(token.nodeKind)) return "integrity_failure";
    const pinnedNode = resolvePinnedFlowExecutionNode({
      flowVersionId: candidate.flowVersionId,
      nodeId: token.nodeId,
      nodeKind: token.nodeKind,
      configSchemaVersion: token.configSchemaVersion,
      executorContractVersion: token.executorContractVersion,
      graph: run.graph,
      capabilityManifest: run.capabilityManifest
    });
    if (
      !isApprovalNodeKind(pinnedNode.kind) ||
      token.executorKey !== formatFlowNodeExecutorKey(pinnedNode)
    ) {
      return "integrity_failure";
    }
    advanceTarget = resolvePinnedFlowExecutionAdvanceTarget({
      definition: {
        flowVersionId: candidate.flowVersionId,
        nodeId: token.nodeId,
        nodeKind: token.nodeKind,
        configSchemaVersion: token.configSchemaVersion,
        executorContractVersion: token.executorContractVersion,
        graph: run.graph,
        capabilityManifest: run.capabilityManifest
      },
      sourceHandle: "timeout"
    });
  } catch (error) {
    if (error instanceof FlowExecutionIntegrityError) return "integrity_failure";
    throw error;
  }
  const trace = parseFlowRuntimeTraceSummary({
    schemaVersion: "flow-runtime-trace.v1",
    outcome: "advanced",
    nodeKind: token.nodeKind,
    reasonCode: "FLOW_APPROVAL_EXPIRED",
    resultCode: "FLOW_TOKEN_ADVANCED",
    sourceHandle: "timeout",
    selectedEdgeId: advanceTarget.edgeId,
    targetNodeId: advanceTarget.node.id,
    targetNodeKind: advanceTarget.node.kind
  });
  const [resumedToken] = await tx
    .update(flowExecutionTokens)
    .set({
      nodeId: advanceTarget.node.id,
      nodeKind: advanceTarget.node.kind,
      configSchemaVersion: advanceTarget.node.configSchemaVersion,
      executorContractVersion: advanceTarget.node.executorContractVersion,
      executorKey: formatFlowNodeExecutorKey(advanceTarget.node),
      state: "runnable",
      availableAt: at,
      claimedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      claimControlPolicyRevision: null,
      claimPolicyDigest: null,
      claimWorkerSessionId: null,
      claimWorkerRegistrationDigest: null,
      nodeActivationSequence: token.nodeActivationSequence + 1n,
      attemptCounter: 0n,
      failureDisposition: null,
      failureReasonCode: null,
      terminalAt: null,
      quarantinedAt: null,
      updatedAt: at
    })
    .where(
      and(
        eq(flowExecutionTokens.id, token.id),
        eq(flowExecutionTokens.ownerUserId, candidate.ownerUserId),
        eq(flowExecutionTokens.flowRunId, candidate.flowRunId),
        eq(flowExecutionTokens.flowVersionId, candidate.flowVersionId),
        eq(flowExecutionTokens.state, "waiting_approval"),
        eq(flowExecutionTokens.nodeActivationSequence, token.nodeActivationSequence),
        eq(flowExecutionTokens.fencingToken, token.fencingToken)
      )
    )
    .returning({ id: flowExecutionTokens.id });
  if (!resumedToken) return "stale";
  const [resumedRun] = await tx
    .update(flowRuns)
    .set({
      status: "running",
      currentNodeId: advanceTarget.node.id,
      traceSequence: run.traceSequence + 1n,
      updatedAt: at
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
    .returning({ sequence: flowRuns.traceSequence });
  if (!resumedRun) throw new Error("FLOW_APPROVAL_EXPIRY_RUN_CAS_FAILED");
  const [event] = await tx
    .insert(flowRunEvents)
    .values({
      ownerUserId: candidate.ownerUserId,
      flowRunId: candidate.flowRunId,
      sequence: resumedRun.sequence,
      eventType: "approval_expired",
      nodeId: token.nodeId,
      attemptId: null,
      commandId: null,
      summary: trace,
      occurredAt: at
    })
    .returning({ id: flowRunEvents.id });
  if (!event) throw new Error("FLOW_APPROVAL_EXPIRY_EVENT_NOT_PERSISTED");
  const [expiredApproval] = await tx
    .update(flowApprovals)
    .set({
      status: "expired",
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: at,
      snoozedUntil: null,
      revision: approval.revision + 1,
      lastCommandId: null,
      lastRunEventId: event.id
    })
    .where(approvalCasPredicate(approval, candidate))
    .returning({ id: flowApprovals.id });
  if (!expiredApproval) throw new Error("FLOW_APPROVAL_EXPIRY_CAS_FAILED");
  return "expired";
}

async function lockApproval(tx: Tx, candidate: ApprovalWakeCandidate) {
  const [approval] = await tx
    .select()
    .from(flowApprovals)
    .where(
      and(
        eq(flowApprovals.id, candidate.approvalId),
        eq(flowApprovals.ownerUserId, candidate.ownerUserId),
        eq(flowApprovals.flowRunId, candidate.flowRunId)
      )
    )
    .limit(1)
    .for("update", { of: flowApprovals });
  return approval ?? null;
}

async function lockToken(tx: Tx, candidate: ApprovalWakeCandidate, tokenId: string) {
  const [token] = await tx
    .select()
    .from(flowExecutionTokens)
    .where(
      and(
        eq(flowExecutionTokens.id, tokenId),
        eq(flowExecutionTokens.ownerUserId, candidate.ownerUserId),
        eq(flowExecutionTokens.flowRunId, candidate.flowRunId),
        eq(flowExecutionTokens.flowVersionId, candidate.flowVersionId)
      )
    )
    .limit(1)
    .for("update", { of: flowExecutionTokens });
  return token ?? null;
}

async function lockRun(tx: Tx, candidate: ApprovalWakeCandidate): Promise<LockedRun | null> {
  const [run] = await tx
    .select({
      id: flowRuns.id,
      ownerUserId: flowRuns.ownerUserId,
      flowVersionId: flowRuns.flowVersionId,
      status: flowRuns.status,
      currentNodeId: flowRuns.currentNodeId,
      traceSequence: flowRuns.traceSequence,
      graphSchemaVersion: flowVersions.graphSchemaVersion,
      graph: flowVersions.graph,
      capabilityManifest: flowVersions.capabilityManifest
    })
    .from(flowRuns)
    .innerJoin(
      flowVersions,
      and(
        eq(flowVersions.id, flowRuns.flowVersionId),
        eq(flowVersions.flowId, flowRuns.flowId),
        eq(flowVersions.ownerUserId, flowRuns.ownerUserId)
      )
    )
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

function isCoherentWaitingRuntime(
  approval: typeof flowApprovals.$inferSelect,
  token: typeof flowExecutionTokens.$inferSelect,
  run: LockedRun,
  candidate: ApprovalWakeCandidate
): boolean {
  return (
    run.graphSchemaVersion === "flow-graph.v2" &&
    run.status === "waiting" &&
    run.currentNodeId === token.nodeId &&
    token.state === "waiting_approval" &&
    isApprovalNodeKind(token.nodeKind) &&
    approval.executionTokenId === token.id &&
    approval.nodeActivationSequence === token.nodeActivationSequence &&
    approval.flowRunId === candidate.flowRunId
  );
}

function isApprovalNodeKind(value: string): value is "astrologer_approval" | "natal_chart_ai_draft" {
  return value === "astrologer_approval" || value === "natal_chart_ai_draft";
}

function approvalCasPredicate(
  approval: typeof flowApprovals.$inferSelect,
  candidate: ApprovalWakeCandidate
) {
  return and(
    eq(flowApprovals.id, approval.id),
    eq(flowApprovals.ownerUserId, candidate.ownerUserId),
    eq(flowApprovals.flowRunId, candidate.flowRunId),
    eq(flowApprovals.status, approval.status),
    eq(flowApprovals.revision, approval.revision)
  );
}

async function now(db: ElevenHouseDatabase | Tx): Promise<Date> {
  const result = await db.execute<{ now_epoch_ms: string }>(sql`
    select (extract(epoch from clock_timestamp()) * 1000)::text as now_epoch_ms
  `);
  const value = parseFlowDatabaseEpochMilliseconds(result.rows[0]?.now_epoch_ms);
  if (!value) throw new Error("FLOW_APPROVAL_WAKE_DATABASE_CLOCK_UNAVAILABLE");
  return value;
}
