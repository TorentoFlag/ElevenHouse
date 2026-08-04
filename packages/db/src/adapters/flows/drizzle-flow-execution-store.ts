import { isDeepStrictEqual } from "node:util";
import { and, asc, eq, gt, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import {
  flowExecutionFailureReasonCodeValues,
  flowExecutionPermanentFailureReasonCodeValues,
  flowExecutionQuarantineFailureReasonCodeValues,
  flowExecutionRetryScheduledFailureReasonCodeValues,
  flowExecutionRetryableFailureReasonCodeValues,
  flowExecutionRetryPolicyV1,
  FlowExecutionIntegrityError,
  formatFlowNodeExecutorKey,
  parseFlowExecutionDecision,
  parseFlowRuntimeTraceSummary,
  resolvePinnedFlowExecutionAdvanceTarget,
  resolvePinnedFlowExecutionNode,
  type FlowExecutionAttemptDetail,
  type FlowExecutionClaim,
  type FlowExecutionFailure,
  type FlowExecutionFailureDisposition,
  type FlowExecutionFailureReasonCode,
  type FlowExecutionOwnerScope,
  type FlowExecutionRunDetail,
  type FlowExecutionStore,
  type FlowExecutionTokenDetail,
  type FlowNodeExecutorKey,
  type FlowRunEventDetail
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowExecutionAttempts,
  flowExecutionTokens,
  flowRunEvents,
  flowRuns,
  flowVersions
} from "../../schema/flows";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";

const MAX_LEASE_DURATION_MS = 5 * 60_000;
const MAX_RECOVERY_BATCH_SIZE = 100;
const MAX_FLOW_EXECUTION_CANARY_OWNERS = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLAIMABLE_TOKEN_STATES = ["runnable", "retry_scheduled"] as const;
const CLAIMABLE_RUN_STATUSES = ["pending", "running", "failed_retryable"] as const;
const EVENT_TYPE_BY_ATTEMPT_OUTCOME: Readonly<Record<string, string>> = {
  advanced: "token_advanced",
  waiting: "token_waiting",
  retry_scheduled: "token_retry_scheduled",
  completed: "run_completed",
  failed: "run_failed",
  lease_expired: "token_lease_expired",
  canceled: "run_canceled"
};
const INTEGRITY_QUARANTINE_REASON_CODES = new Set<FlowExecutionFailureReasonCode>([
  ...flowExecutionQuarantineFailureReasonCodeValues
]);
const FAILURE_REASON_CODES = new Set<string>(flowExecutionFailureReasonCodeValues);
const PERMANENT_FAILURE_REASON_CODES = new Set<string>(
  flowExecutionPermanentFailureReasonCodeValues
);
const RETRYABLE_FAILURE_REASON_CODES = new Set<string>(
  flowExecutionRetryableFailureReasonCodeValues
);
const RETRY_SCHEDULED_FAILURE_REASON_CODES = new Set<string>(
  flowExecutionRetryScheduledFailureReasonCodeValues
);

type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

type PoisonFlowExecutionCandidate = {
  readonly tokenId: string;
  readonly ownerUserId: string;
  readonly runId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly nodeId: string;
  readonly nodeKind: string;
  readonly configSchemaVersion: number;
  readonly executorContractVersion: number;
  readonly state: string;
  readonly nodeActivationSequence: bigint;
  readonly attemptCounter: bigint;
  readonly fencingToken: bigint;
  readonly retryPolicyKey: string;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
  readonly failureDisposition: string | null;
  readonly failureReasonCode: string | null;
  readonly terminalAt: Date | null;
  readonly quarantinedAt: Date | null;
  readonly graph: unknown;
  readonly capabilityManifest: unknown;
};

type ExpiredFlowExecutionToken = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly flowRunId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly nodeId: string;
  readonly nodeKind: string;
  readonly executorKey: string;
  readonly claimedAt: Date;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Date;
  readonly nodeActivationSequence: bigint;
  readonly attemptCounter: bigint;
  readonly fencingToken: bigint;
  readonly retryPolicyKey: string;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
};

export function createDrizzleFlowExecutionStore(database: ElevenHouseDatabase): FlowExecutionStore {
  return {
    claimNext: (input) => claimNext(database, input),
    finalize: (input) => finalize(database, input),
    finalizeFailure: (input) => finalizeFailure(database, input),
    recoverExpired: (input) => recoverExpired(database, input),
    getRunDetail: (input) => getRunDetail(database, input)
  };
}

async function claimNext(
  database: ElevenHouseDatabase,
  input: Parameters<FlowExecutionStore["claimNext"]>[0]
): ReturnType<FlowExecutionStore["claimNext"]> {
  validateClaimInput(input);

  return database.transaction(async (transaction) => {
    const [candidate] = await transaction
      .select({
        tokenId: flowExecutionTokens.id,
        ownerUserId: flowExecutionTokens.ownerUserId,
        runId: flowExecutionTokens.flowRunId,
        flowId: flowRuns.flowId,
        flowVersionId: flowExecutionTokens.flowVersionId,
        nodeId: flowExecutionTokens.nodeId,
        nodeKind: flowExecutionTokens.nodeKind,
        configSchemaVersion: flowExecutionTokens.configSchemaVersion,
        executorContractVersion: flowExecutionTokens.executorContractVersion,
        state: flowExecutionTokens.state,
        nodeActivationSequence: flowExecutionTokens.nodeActivationSequence,
        attemptCounter: flowExecutionTokens.attemptCounter,
        fencingToken: flowExecutionTokens.fencingToken,
        retryPolicyKey: flowExecutionTokens.retryPolicyKey,
        maxAttempts: flowExecutionTokens.maxAttempts,
        retryBaseDelayMs: flowExecutionTokens.retryBaseDelayMs,
        retryMaxDelayMs: flowExecutionTokens.retryMaxDelayMs,
        failureDisposition: flowExecutionTokens.failureDisposition,
        failureReasonCode: flowExecutionTokens.failureReasonCode,
        terminalAt: flowExecutionTokens.terminalAt,
        quarantinedAt: flowExecutionTokens.quarantinedAt,
        graph: flowVersions.graph,
        capabilityManifest: flowVersions.capabilityManifest
      })
      .from(flowExecutionTokens)
      .innerJoin(
        flowRuns,
        and(
          eq(flowRuns.id, flowExecutionTokens.flowRunId),
          eq(flowRuns.flowVersionId, flowExecutionTokens.flowVersionId),
          eq(flowRuns.ownerUserId, flowExecutionTokens.ownerUserId)
        )
      )
      .innerJoin(
        flowVersions,
        and(
          eq(flowVersions.id, flowExecutionTokens.flowVersionId),
          eq(flowVersions.ownerUserId, flowExecutionTokens.ownerUserId)
        )
      )
      .where(
        and(
          inArray(flowExecutionTokens.state, [...CLAIMABLE_TOKEN_STATES]),
          lte(flowExecutionTokens.availableAt, sql`transaction_timestamp()`),
          inArray(flowExecutionTokens.executorKey, [...input.executorKeys]),
          input.ownerScope.kind === "all"
            ? undefined
            : inArray(flowExecutionTokens.ownerUserId, [...input.ownerScope.ownerUserIds]),
          inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
        )
      )
      .orderBy(
        asc(flowExecutionTokens.availableAt),
        asc(flowExecutionTokens.createdAt),
        asc(flowExecutionTokens.id)
      )
      .limit(1)
      .for("update", { of: flowExecutionTokens, skipLocked: true });

    if (!candidate) return null;

    if (!isClaimCandidateRuntimeStateValid(candidate)) {
      return quarantinePoisonCandidate(transaction, candidate, "FLOW_TOKEN_RUNTIME_STATE_INVALID");
    }

    try {
      resolvePinnedFlowExecutionNode({
        flowVersionId: candidate.flowVersionId,
        nodeId: candidate.nodeId,
        nodeKind: candidate.nodeKind as FlowExecutionClaim["nodeKind"],
        configSchemaVersion: candidate.configSchemaVersion,
        executorContractVersion: candidate.executorContractVersion,
        graph: candidate.graph,
        capabilityManifest: candidate.capabilityManifest
      });
    } catch (error) {
      if (!(error instanceof FlowExecutionIntegrityError)) throw error;
      return quarantinePoisonCandidate(transaction, candidate, error.code);
    }

    const claimedAt = await readPostLockDatabaseInstant(transaction);
    const [claimed] = await transaction
      .update(flowExecutionTokens)
      .set({
        state: "claimed",
        claimedAt,
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: sql`${claimedAt}::timestamptz + (${input.leaseDurationMs} * interval '1 millisecond')`,
        attemptCounter: sql`${flowExecutionTokens.attemptCounter} + 1`,
        fencingToken: sql`${flowExecutionTokens.fencingToken} + 1`,
        failureDisposition: null,
        failureReasonCode: null,
        quarantinedAt: null,
        updatedAt: claimedAt
      })
      .where(
        and(
          eq(flowExecutionTokens.id, candidate.tokenId),
          inArray(flowExecutionTokens.state, [...CLAIMABLE_TOKEN_STATES])
        )
      )
      .returning({
        claimedAt: flowExecutionTokens.claimedAt,
        leaseExpiresAt: flowExecutionTokens.leaseExpiresAt,
        attemptCounter: flowExecutionTokens.attemptCounter,
        fencingToken: flowExecutionTokens.fencingToken
      });

    if (!claimed?.claimedAt || !claimed.leaseExpiresAt) {
      throw new Error("Claimed flow token did not persist complete lease state");
    }

    const [run] = await transaction
      .update(flowRuns)
      .set({
        status: "running",
        currentNodeId: candidate.nodeId,
        updatedAt: claimedAt
      })
      .where(
        and(
          eq(flowRuns.id, candidate.runId),
          eq(flowRuns.ownerUserId, candidate.ownerUserId),
          eq(flowRuns.flowVersionId, candidate.flowVersionId),
          inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
        )
      )
      .returning({ id: flowRuns.id });

    if (!run) throw new Error("Flow run became unavailable while claiming its token");

    return {
      status: "claimed",
      claim: {
        ...candidate,
        nodeKind: candidate.nodeKind as FlowExecutionClaim["nodeKind"],
        leaseOwner: input.leaseOwner,
        attemptNumber: claimed.attemptCounter,
        fencingToken: claimed.fencingToken,
        claimedAt: claimed.claimedAt.toISOString(),
        leaseExpiresAt: claimed.leaseExpiresAt.toISOString()
      }
    };
  });
}

async function quarantinePoisonCandidate(
  transaction: FlowTransaction,
  candidate: PoisonFlowExecutionCandidate,
  reasonCode: FlowExecutionFailureReasonCode
) {
  const quarantinedAt = await readPostLockDatabaseInstant(transaction);
  const trace = parseFlowRuntimeTraceSummary({
    schemaVersion: "flow-runtime-trace.v1",
    outcome: "failed",
    nodeKind: candidate.nodeKind,
    reasonCode,
    resultCode: "FLOW_EXECUTION_FAILED_TERMINAL"
  });
  const [token] = await transaction
    .update(flowExecutionTokens)
    .set({
      state: "failed",
      claimedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      failureDisposition: "quarantined",
      failureReasonCode: reasonCode,
      terminalAt: quarantinedAt,
      quarantinedAt,
      updatedAt: quarantinedAt
    })
    .where(
      and(
        eq(flowExecutionTokens.id, candidate.tokenId),
        eq(flowExecutionTokens.ownerUserId, candidate.ownerUserId),
        eq(flowExecutionTokens.flowRunId, candidate.runId),
        inArray(flowExecutionTokens.state, [...CLAIMABLE_TOKEN_STATES])
      )
    )
    .returning({ quarantinedAt: flowExecutionTokens.quarantinedAt });
  if (!token?.quarantinedAt) {
    throw new Error("Locked poison flow token could not be quarantined");
  }

  const [run] = await transaction
    .update(flowRuns)
    .set({
      status: "failed_terminal",
      currentNodeId: candidate.nodeId,
      traceSequence: sql`${flowRuns.traceSequence} + 1`,
      completedAt: token.quarantinedAt,
      updatedAt: token.quarantinedAt
    })
    .where(
      and(
        eq(flowRuns.id, candidate.runId),
        eq(flowRuns.ownerUserId, candidate.ownerUserId),
        eq(flowRuns.flowId, candidate.flowId),
        eq(flowRuns.flowVersionId, candidate.flowVersionId),
        inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
      )
    )
    .returning({ traceSequence: flowRuns.traceSequence });
  if (!run) throw new Error("Flow run became unavailable while quarantining its poison token");

  await transaction.insert(flowRunEvents).values({
    ownerUserId: candidate.ownerUserId,
    flowRunId: candidate.runId,
    sequence: run.traceSequence,
    eventType: "run_failed",
    nodeId: candidate.nodeId,
    attemptId: null,
    summary: trace,
    occurredAt: token.quarantinedAt
  });

  return {
    status: "quarantined" as const,
    tokenId: candidate.tokenId,
    runId: candidate.runId,
    attemptId: null,
    traceSequence: run.traceSequence,
    reasonCode
  };
}

async function finalize(
  database: ElevenHouseDatabase,
  input: Parameters<FlowExecutionStore["finalize"]>[0]
): ReturnType<FlowExecutionStore["finalize"]> {
  const decision = parseFlowExecutionDecision(input.decision);
  if (decision.sourceNodeId !== input.claim.nodeId) {
    throw new Error("Flow execution decision does not belong to the claimed node");
  }
  if (decision.trace.nodeKind !== input.claim.nodeKind) {
    throw new Error("FLOW_RUNTIME_TRACE_INVALID: trace does not match the claimed transition");
  }

  return database.transaction(async (transaction) => {
    const [token] = await transaction
      .select({
        id: flowExecutionTokens.id,
        executorKey: flowExecutionTokens.executorKey,
        claimedAt: flowExecutionTokens.claimedAt,
        leaseExpiresAt: flowExecutionTokens.leaseExpiresAt,
        nodeActivationSequence: flowExecutionTokens.nodeActivationSequence,
        attemptNumber: flowExecutionTokens.attemptCounter,
        fencingToken: flowExecutionTokens.fencingToken,
        leaseOwner: flowExecutionTokens.leaseOwner,
        graph: flowVersions.graph,
        capabilityManifest: flowVersions.capabilityManifest
      })
      .from(flowExecutionTokens)
      .innerJoin(
        flowVersions,
        and(
          eq(flowVersions.id, flowExecutionTokens.flowVersionId),
          eq(flowVersions.ownerUserId, flowExecutionTokens.ownerUserId)
        )
      )
      .where(
        and(
          eq(flowExecutionTokens.id, input.claim.tokenId),
          eq(flowExecutionTokens.ownerUserId, input.claim.ownerUserId),
          eq(flowExecutionTokens.flowRunId, input.claim.runId),
          eq(flowExecutionTokens.flowVersionId, input.claim.flowVersionId),
          eq(flowExecutionTokens.nodeId, input.claim.nodeId),
          eq(flowExecutionTokens.nodeKind, input.claim.nodeKind),
          eq(flowExecutionTokens.configSchemaVersion, input.claim.configSchemaVersion),
          eq(flowExecutionTokens.executorContractVersion, input.claim.executorContractVersion),
          eq(flowExecutionTokens.nodeActivationSequence, input.claim.nodeActivationSequence),
          eq(
            flowExecutionTokens.executorKey,
            `${input.claim.nodeKind}:${input.claim.configSchemaVersion}:${input.claim.executorContractVersion}`
          ),
          eq(flowExecutionTokens.state, "claimed"),
          eq(flowExecutionTokens.leaseOwner, input.claim.leaseOwner),
          eq(flowExecutionTokens.fencingToken, input.claim.fencingToken)
        )
      )
      .limit(1)
      .for("update", { of: flowExecutionTokens });

    if (!token) return { status: "stale" } as const;
    if (!token.claimedAt || !token.leaseOwner || !token.leaseExpiresAt) {
      throw new Error("Claimed flow token is missing database-owned audit state");
    }
    const transitionAt = await readPostLockDatabaseInstant(transaction);
    if (token.leaseExpiresAt.getTime() <= transitionAt.getTime()) {
      return { status: "stale" } as const;
    }

    const persistedDefinition = {
      flowVersionId: input.claim.flowVersionId,
      nodeId: input.claim.nodeId,
      nodeKind: input.claim.nodeKind,
      configSchemaVersion: input.claim.configSchemaVersion,
      executorContractVersion: input.claim.executorContractVersion,
      graph: token.graph,
      capabilityManifest: token.capabilityManifest
    };
    const persistedNode = resolvePinnedFlowExecutionNode(persistedDefinition);
    let advanceTarget: ReturnType<typeof resolvePinnedFlowExecutionAdvanceTarget> | null = null;
    let transitionResultCode = decision.resultCode;
    let transitionTrace = decision.trace;

    switch (decision.kind) {
      case "terminal":
        if (
          persistedNode.kind !== "completed" ||
          decision.resultCode !== persistedNode.config.goalKey
        ) {
          throw new Error(
            "FLOW_RUNTIME_TRACE_INVALID: terminal decision does not match persisted completed node"
          );
        }
        transitionResultCode = persistedNode.config.goalKey;
        transitionTrace = {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "terminal",
          nodeKind: persistedNode.kind,
          reasonCode: "FLOW_GOAL_REACHED",
          resultCode: persistedNode.config.goalKey
        };
        break;
      case "advance":
        advanceTarget = resolvePinnedFlowExecutionAdvanceTarget({
          definition: persistedDefinition,
          sourceHandle: decision.sourceHandle
        });
        if (
          advanceTarget.edgeId !== decision.selectedEdgeId ||
          advanceTarget.node.id !== decision.targetNodeId ||
          advanceTarget.node.kind !== decision.targetNodeKind
        ) {
          throw new Error(
            "FLOW_RUNTIME_TRACE_INVALID: decision target does not match persisted graph"
          );
        }
        break;
      default:
        assertNeverFlowExecutionDecision(decision);
    }

    const [transitionedToken] = await transaction
      .update(flowExecutionTokens)
      .set(
        decision.kind === "terminal"
          ? {
              state: "completed",
              claimedAt: null,
              leaseOwner: null,
              leaseExpiresAt: null,
              terminalAt: transitionAt,
              updatedAt: transitionAt
            }
          : {
              nodeId: advanceTarget?.node.id,
              nodeKind: advanceTarget?.node.kind,
              configSchemaVersion: advanceTarget?.node.configSchemaVersion,
              executorContractVersion: advanceTarget?.node.executorContractVersion,
              executorKey: advanceTarget
                ? formatFlowNodeExecutorKey(advanceTarget.node)
                : undefined,
              state: "runnable",
              availableAt: transitionAt,
              claimedAt: null,
              leaseOwner: null,
              leaseExpiresAt: null,
              nodeActivationSequence: sql`${flowExecutionTokens.nodeActivationSequence} + 1`,
              attemptCounter: 0n,
              failureDisposition: null,
              failureReasonCode: null,
              terminalAt: null,
              quarantinedAt: null,
              updatedAt: transitionAt
            }
      )
      .where(
        and(
          eq(flowExecutionTokens.id, token.id),
          eq(flowExecutionTokens.state, "claimed"),
          eq(flowExecutionTokens.leaseOwner, input.claim.leaseOwner),
          eq(flowExecutionTokens.nodeActivationSequence, token.nodeActivationSequence),
          eq(flowExecutionTokens.fencingToken, input.claim.fencingToken)
        )
      )
      .returning({ id: flowExecutionTokens.id });
    if (!transitionedToken) return { status: "stale" } as const;

    const [run] = await transaction
      .update(flowRuns)
      .set({
        status: decision.kind === "terminal" ? "completed" : "running",
        currentNodeId: decision.kind === "terminal" ? input.claim.nodeId : advanceTarget?.node.id,
        traceSequence: sql`${flowRuns.traceSequence} + 1`,
        completedAt: decision.kind === "terminal" ? transitionAt : null,
        updatedAt: transitionAt
      })
      .where(
        and(
          eq(flowRuns.id, input.claim.runId),
          eq(flowRuns.ownerUserId, input.claim.ownerUserId),
          eq(flowRuns.flowId, input.claim.flowId),
          eq(flowRuns.flowVersionId, input.claim.flowVersionId),
          inArray(flowRuns.status, ["pending", "running"])
        )
      )
      .returning({ traceSequence: flowRuns.traceSequence });

    if (!run) throw new Error("Flow run became unavailable while finalizing its token");

    const [attempt] = await transaction
      .insert(flowExecutionAttempts)
      .values({
        ownerUserId: input.claim.ownerUserId,
        flowRunId: input.claim.runId,
        tokenId: input.claim.tokenId,
        flowVersionId: input.claim.flowVersionId,
        nodeId: input.claim.nodeId,
        executorKey: token.executorKey,
        nodeActivationSequence: token.nodeActivationSequence,
        attemptNumber: token.attemptNumber,
        fencingToken: token.fencingToken,
        leaseOwner: token.leaseOwner,
        outcome: decision.kind === "terminal" ? "completed" : "advanced",
        resultCode: transitionResultCode,
        traceSummary: transitionTrace,
        startedAt: token.claimedAt,
        completedAt: transitionAt,
        createdAt: transitionAt
      })
      .returning({ id: flowExecutionAttempts.id });

    if (!attempt) throw new Error("Flow execution attempt was not persisted");

    await transaction.insert(flowRunEvents).values({
      ownerUserId: input.claim.ownerUserId,
      flowRunId: input.claim.runId,
      sequence: run.traceSequence,
      eventType: decision.kind === "terminal" ? "run_completed" : "token_advanced",
      nodeId: input.claim.nodeId,
      attemptId: attempt.id,
      summary: transitionTrace,
      occurredAt: transitionAt
    });

    return { status: "applied", attemptId: attempt.id, traceSequence: run.traceSequence };
  });
}

async function finalizeFailure(
  database: ElevenHouseDatabase,
  input: Parameters<FlowExecutionStore["finalizeFailure"]>[0]
): ReturnType<FlowExecutionStore["finalizeFailure"]> {
  assertExecutionFailure(input.failure);

  return database.transaction(async (transaction) => {
    const [token] = await transaction
      .select({
        executorKey: flowExecutionTokens.executorKey,
        claimedAt: flowExecutionTokens.claimedAt,
        leaseExpiresAt: flowExecutionTokens.leaseExpiresAt,
        nodeActivationSequence: flowExecutionTokens.nodeActivationSequence,
        attemptNumber: flowExecutionTokens.attemptCounter,
        fencingToken: flowExecutionTokens.fencingToken,
        leaseOwner: flowExecutionTokens.leaseOwner,
        retryPolicyKey: flowExecutionTokens.retryPolicyKey,
        maxAttempts: flowExecutionTokens.maxAttempts,
        retryBaseDelayMs: flowExecutionTokens.retryBaseDelayMs,
        retryMaxDelayMs: flowExecutionTokens.retryMaxDelayMs
      })
      .from(flowExecutionTokens)
      .innerJoin(
        flowRuns,
        and(
          eq(flowRuns.id, flowExecutionTokens.flowRunId),
          eq(flowRuns.ownerUserId, flowExecutionTokens.ownerUserId),
          eq(flowRuns.flowVersionId, flowExecutionTokens.flowVersionId)
        )
      )
      .where(
        and(
          eq(flowExecutionTokens.id, input.claim.tokenId),
          eq(flowExecutionTokens.ownerUserId, input.claim.ownerUserId),
          eq(flowExecutionTokens.flowRunId, input.claim.runId),
          eq(flowExecutionTokens.flowVersionId, input.claim.flowVersionId),
          eq(flowExecutionTokens.nodeId, input.claim.nodeId),
          eq(flowExecutionTokens.nodeKind, input.claim.nodeKind),
          eq(flowExecutionTokens.configSchemaVersion, input.claim.configSchemaVersion),
          eq(flowExecutionTokens.executorContractVersion, input.claim.executorContractVersion),
          eq(flowExecutionTokens.nodeActivationSequence, input.claim.nodeActivationSequence),
          eq(
            flowExecutionTokens.executorKey,
            `${input.claim.nodeKind}:${input.claim.configSchemaVersion}:${input.claim.executorContractVersion}`
          ),
          eq(flowExecutionTokens.state, "claimed"),
          eq(flowExecutionTokens.leaseOwner, input.claim.leaseOwner),
          eq(flowExecutionTokens.fencingToken, input.claim.fencingToken),
          eq(flowRuns.flowId, input.claim.flowId),
          inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
        )
      )
      .limit(1)
      .for("update", { of: flowExecutionTokens });

    if (!token) return { status: "stale" } as const;
    if (!token.claimedAt || !token.leaseOwner || !token.leaseExpiresAt) {
      throw new Error("Claimed flow token is missing database-owned audit state");
    }
    const dispositionAt = await readPostLockDatabaseInstant(transaction);
    if (token.leaseExpiresAt.getTime() <= dispositionAt.getTime()) {
      return { status: "stale" } as const;
    }
    assertPersistedRetryPolicy(token);

    const disposition = chooseFailureDisposition({
      failure: input.failure,
      attemptNumber: token.attemptNumber,
      maxAttempts: token.maxAttempts
    });
    const terminal = disposition !== "retry_scheduled";
    const resultCode = terminal
      ? input.failure.classification === "retryable"
        ? "FLOW_EXECUTION_RETRY_EXHAUSTED"
        : "FLOW_EXECUTION_FAILED_TERMINAL"
      : "FLOW_EXECUTION_RETRY_SCHEDULED";
    const trace = parseFlowRuntimeTraceSummary({
      schemaVersion: "flow-runtime-trace.v1",
      outcome: terminal ? "failed" : "retry_scheduled",
      nodeKind: input.claim.nodeKind,
      reasonCode: input.failure.reasonCode,
      resultCode
    });

    const [updatedToken] = terminal
      ? await transaction
          .update(flowExecutionTokens)
          .set({
            state: "failed",
            claimedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            failureDisposition: disposition,
            failureReasonCode: input.failure.reasonCode,
            terminalAt: dispositionAt,
            quarantinedAt: disposition === "quarantined" ? dispositionAt : null,
            updatedAt: dispositionAt
          })
          .where(
            and(
              eq(flowExecutionTokens.id, input.claim.tokenId),
              eq(flowExecutionTokens.state, "claimed"),
              eq(flowExecutionTokens.leaseOwner, input.claim.leaseOwner),
              eq(flowExecutionTokens.nodeActivationSequence, input.claim.nodeActivationSequence),
              eq(flowExecutionTokens.fencingToken, input.claim.fencingToken)
            )
          )
          .returning({
            dispositionAt: flowExecutionTokens.updatedAt,
            availableAt: flowExecutionTokens.availableAt
          })
      : await transaction
          .update(flowExecutionTokens)
          .set({
            state: "retry_scheduled",
            availableAt: retryAvailableAtSql({ ...token, transitionAt: dispositionAt }),
            claimedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            failureDisposition: "retry_scheduled",
            failureReasonCode: input.failure.reasonCode,
            terminalAt: null,
            quarantinedAt: null,
            updatedAt: dispositionAt
          })
          .where(
            and(
              eq(flowExecutionTokens.id, input.claim.tokenId),
              eq(flowExecutionTokens.state, "claimed"),
              eq(flowExecutionTokens.leaseOwner, input.claim.leaseOwner),
              eq(flowExecutionTokens.nodeActivationSequence, input.claim.nodeActivationSequence),
              eq(flowExecutionTokens.fencingToken, input.claim.fencingToken)
            )
          )
          .returning({
            dispositionAt: flowExecutionTokens.updatedAt,
            availableAt: flowExecutionTokens.availableAt
          });
    if (!updatedToken) return { status: "stale" } as const;

    const [run] = await transaction
      .update(flowRuns)
      .set({
        status: terminal ? "failed_terminal" : "failed_retryable",
        currentNodeId: input.claim.nodeId,
        traceSequence: sql`${flowRuns.traceSequence} + 1`,
        completedAt: terminal ? updatedToken.dispositionAt : null,
        updatedAt: updatedToken.dispositionAt
      })
      .where(
        and(
          eq(flowRuns.id, input.claim.runId),
          eq(flowRuns.ownerUserId, input.claim.ownerUserId),
          eq(flowRuns.flowId, input.claim.flowId),
          eq(flowRuns.flowVersionId, input.claim.flowVersionId),
          inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
        )
      )
      .returning({ traceSequence: flowRuns.traceSequence });
    if (!run) throw new Error("Flow run became unavailable while finalizing its failed token");

    const [attempt] = await transaction
      .insert(flowExecutionAttempts)
      .values({
        ownerUserId: input.claim.ownerUserId,
        flowRunId: input.claim.runId,
        tokenId: input.claim.tokenId,
        flowVersionId: input.claim.flowVersionId,
        nodeId: input.claim.nodeId,
        executorKey: token.executorKey,
        nodeActivationSequence: token.nodeActivationSequence,
        attemptNumber: token.attemptNumber,
        fencingToken: token.fencingToken,
        leaseOwner: token.leaseOwner,
        outcome: terminal ? "failed" : "retry_scheduled",
        resultCode,
        traceSummary: trace,
        startedAt: token.claimedAt,
        completedAt: updatedToken.dispositionAt,
        createdAt: updatedToken.dispositionAt
      })
      .returning({ id: flowExecutionAttempts.id });
    if (!attempt) throw new Error("Failed flow execution attempt was not persisted");

    await transaction.insert(flowRunEvents).values({
      ownerUserId: input.claim.ownerUserId,
      flowRunId: input.claim.runId,
      sequence: run.traceSequence,
      eventType: terminal ? "run_failed" : "token_retry_scheduled",
      nodeId: input.claim.nodeId,
      attemptId: attempt.id,
      summary: trace,
      occurredAt: updatedToken.dispositionAt
    });

    return {
      status: "applied" as const,
      disposition,
      attemptId: attempt.id,
      traceSequence: run.traceSequence,
      availableAt: terminal ? null : updatedToken.availableAt.toISOString()
    };
  });
}

async function recoverExpired(
  database: ElevenHouseDatabase,
  input: Parameters<FlowExecutionStore["recoverExpired"]>[0]
): ReturnType<FlowExecutionStore["recoverExpired"]> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_RECOVERY_BATCH_SIZE) {
    throw new Error(`Flow recovery limit must be between 1 and ${MAX_RECOVERY_BATCH_SIZE}`);
  }
  let recoveredCount = 0;
  let retryScheduledCount = 0;
  let failedTerminalCount = 0;
  let quarantinedCount = 0;

  for (let index = 0; index < input.limit; index += 1) {
    const result = await recoverOneExpired(database);
    if (!result) break;
    recoveredCount += 1;
    if (result === "retry_scheduled") retryScheduledCount += 1;
    else if (result === "failed_terminal") failedTerminalCount += 1;
    else quarantinedCount += 1;
  }

  return { recoveredCount, retryScheduledCount, failedTerminalCount, quarantinedCount };
}

async function recoverOneExpired(
  database: ElevenHouseDatabase
): Promise<"retry_scheduled" | "failed_terminal" | "quarantined" | null> {
  return database.transaction(async (transaction) => {
    const [token] = await transaction
      .select({
        id: flowExecutionTokens.id,
        ownerUserId: flowExecutionTokens.ownerUserId,
        flowRunId: flowExecutionTokens.flowRunId,
        flowId: flowRuns.flowId,
        flowVersionId: flowExecutionTokens.flowVersionId,
        nodeId: flowExecutionTokens.nodeId,
        nodeKind: flowExecutionTokens.nodeKind,
        executorKey: flowExecutionTokens.executorKey,
        claimedAt: flowExecutionTokens.claimedAt,
        leaseOwner: flowExecutionTokens.leaseOwner,
        leaseExpiresAt: flowExecutionTokens.leaseExpiresAt,
        nodeActivationSequence: flowExecutionTokens.nodeActivationSequence,
        attemptCounter: flowExecutionTokens.attemptCounter,
        fencingToken: flowExecutionTokens.fencingToken,
        retryPolicyKey: flowExecutionTokens.retryPolicyKey,
        maxAttempts: flowExecutionTokens.maxAttempts,
        retryBaseDelayMs: flowExecutionTokens.retryBaseDelayMs,
        retryMaxDelayMs: flowExecutionTokens.retryMaxDelayMs
      })
      .from(flowExecutionTokens)
      .innerJoin(
        flowRuns,
        and(
          eq(flowRuns.id, flowExecutionTokens.flowRunId),
          eq(flowRuns.ownerUserId, flowExecutionTokens.ownerUserId),
          eq(flowRuns.flowVersionId, flowExecutionTokens.flowVersionId)
        )
      )
      .where(
        and(
          eq(flowExecutionTokens.state, "claimed"),
          isNotNull(flowExecutionTokens.leaseExpiresAt),
          or(
            lte(flowExecutionTokens.leaseExpiresAt, sql`clock_timestamp()`),
            gt(flowExecutionTokens.claimedAt, sql`clock_timestamp()`)
          ),
          inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
        )
      )
      .orderBy(asc(flowExecutionTokens.leaseExpiresAt), asc(flowExecutionTokens.id))
      .limit(1)
      .for("update", { of: flowExecutionTokens, skipLocked: true });

    if (!token) return null;
    if (!token.claimedAt || !token.leaseOwner || !token.leaseExpiresAt) {
      throw new Error("Expired flow token has incomplete lease state");
    }
    const recoveredAt = await readPostLockDatabaseInstant(transaction);
    const expiredToken = token as ExpiredFlowExecutionToken;
    if (!isExpiredClaimRuntimeStateValid(expiredToken, recoveredAt)) {
      return quarantineInvalidExpiredClaim(transaction, expiredToken, recoveredAt);
    }

    const retryScheduled = expiredToken.attemptCounter < BigInt(expiredToken.maxAttempts);
    const disposition = retryScheduled ? "retry_scheduled" : "failed_terminal";
    const summary = parseFlowRuntimeTraceSummary(
      retryScheduled
        ? {
            schemaVersion: "flow-runtime-trace.v1",
            outcome: "lease_expired",
            nodeKind: expiredToken.nodeKind,
            reasonCode: "FLOW_TOKEN_LEASE_EXPIRED",
            resultCode: "FLOW_TOKEN_LEASE_EXPIRED"
          }
        : {
            schemaVersion: "flow-runtime-trace.v1",
            outcome: "failed",
            nodeKind: expiredToken.nodeKind,
            reasonCode: "FLOW_TOKEN_LEASE_EXPIRED",
            resultCode: "FLOW_EXECUTION_RETRY_EXHAUSTED"
          }
    );

    const [recovered] = retryScheduled
      ? await transaction
          .update(flowExecutionTokens)
          .set({
            state: "retry_scheduled",
            availableAt: retryAvailableAtSql({
              attemptNumber: expiredToken.attemptCounter,
              retryBaseDelayMs: expiredToken.retryBaseDelayMs,
              retryMaxDelayMs: expiredToken.retryMaxDelayMs,
              transitionAt: recoveredAt
            }),
            claimedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            fencingToken: sql`${flowExecutionTokens.fencingToken} + 1`,
            failureDisposition: "retry_scheduled",
            failureReasonCode: "FLOW_TOKEN_LEASE_EXPIRED",
            terminalAt: null,
            quarantinedAt: null,
            updatedAt: recoveredAt
          })
          .where(
            and(
              eq(flowExecutionTokens.id, expiredToken.id),
              eq(flowExecutionTokens.state, "claimed"),
              eq(flowExecutionTokens.leaseOwner, expiredToken.leaseOwner),
              eq(flowExecutionTokens.fencingToken, expiredToken.fencingToken)
            )
          )
          .returning({ recoveredAt: flowExecutionTokens.updatedAt })
      : await transaction
          .update(flowExecutionTokens)
          .set({
            state: "failed",
            claimedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            fencingToken: sql`${flowExecutionTokens.fencingToken} + 1`,
            failureDisposition: "failed_terminal",
            failureReasonCode: "FLOW_TOKEN_LEASE_EXPIRED",
            terminalAt: recoveredAt,
            quarantinedAt: null,
            updatedAt: recoveredAt
          })
          .where(
            and(
              eq(flowExecutionTokens.id, expiredToken.id),
              eq(flowExecutionTokens.state, "claimed"),
              eq(flowExecutionTokens.leaseOwner, expiredToken.leaseOwner),
              eq(flowExecutionTokens.fencingToken, expiredToken.fencingToken)
            )
          )
          .returning({ recoveredAt: flowExecutionTokens.updatedAt });
    if (!recovered) throw new Error("Locked expired flow token could not be recovered");

    const [run] = await transaction
      .update(flowRuns)
      .set({
        status: retryScheduled ? "failed_retryable" : "failed_terminal",
        traceSequence: sql`${flowRuns.traceSequence} + 1`,
        completedAt: retryScheduled ? null : recovered.recoveredAt,
        updatedAt: recovered.recoveredAt
      })
      .where(
        and(
          eq(flowRuns.id, expiredToken.flowRunId),
          eq(flowRuns.ownerUserId, expiredToken.ownerUserId),
          eq(flowRuns.flowVersionId, expiredToken.flowVersionId),
          inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
        )
      )
      .returning({ traceSequence: flowRuns.traceSequence });
    if (!run) throw new Error("Flow run became unavailable while recovering its token");

    const [attempt] = await transaction
      .insert(flowExecutionAttempts)
      .values({
        ownerUserId: expiredToken.ownerUserId,
        flowRunId: expiredToken.flowRunId,
        tokenId: expiredToken.id,
        flowVersionId: expiredToken.flowVersionId,
        nodeId: expiredToken.nodeId,
        executorKey: expiredToken.executorKey,
        nodeActivationSequence: expiredToken.nodeActivationSequence,
        attemptNumber: expiredToken.attemptCounter,
        fencingToken: expiredToken.fencingToken,
        leaseOwner: expiredToken.leaseOwner,
        outcome: retryScheduled ? "lease_expired" : "failed",
        resultCode: retryScheduled ? "FLOW_TOKEN_LEASE_EXPIRED" : "FLOW_EXECUTION_RETRY_EXHAUSTED",
        traceSummary: summary,
        startedAt: expiredToken.claimedAt,
        completedAt: recovered.recoveredAt,
        createdAt: recovered.recoveredAt
      })
      .returning({ id: flowExecutionAttempts.id });
    if (!attempt) throw new Error("Expired flow execution attempt was not persisted");

    await transaction.insert(flowRunEvents).values({
      ownerUserId: expiredToken.ownerUserId,
      flowRunId: expiredToken.flowRunId,
      sequence: run.traceSequence,
      eventType: retryScheduled ? "token_lease_expired" : "run_failed",
      nodeId: expiredToken.nodeId,
      attemptId: attempt.id,
      summary,
      occurredAt: recovered.recoveredAt
    });

    return disposition;
  });
}

async function getRunDetail(
  database: ElevenHouseDatabase,
  input: Parameters<FlowExecutionStore["getRunDetail"]>[0]
): ReturnType<FlowExecutionStore["getRunDetail"]> {
  return database.transaction(
    async (transaction) => {
      const [run] = await transaction
        .select({
          runId: flowRuns.id,
          ownerUserId: flowRuns.ownerUserId,
          flowId: flowRuns.flowId,
          flowVersionId: flowRuns.flowVersionId,
          graphSchemaVersion: flowVersions.graphSchemaVersion,
          status: flowRuns.status,
          currentNodeId: flowRuns.currentNodeId,
          traceSequence: flowRuns.traceSequence
        })
        .from(flowRuns)
        .innerJoin(
          flowVersions,
          and(
            eq(flowVersions.id, flowRuns.flowVersionId),
            eq(flowVersions.ownerUserId, flowRuns.ownerUserId)
          )
        )
        .where(and(eq(flowRuns.id, input.runId), eq(flowRuns.ownerUserId, input.ownerUserId)))
        .limit(1);

      if (!run || run.graphSchemaVersion !== "flow-graph.v2") return null;

      const token = await transaction
        .select()
        .from(flowExecutionTokens)
        .where(
          and(
            eq(flowExecutionTokens.flowRunId, input.runId),
            eq(flowExecutionTokens.ownerUserId, input.ownerUserId)
          )
        )
        .limit(1);
      const attempts = await transaction
        .select()
        .from(flowExecutionAttempts)
        .where(
          and(
            eq(flowExecutionAttempts.flowRunId, input.runId),
            eq(flowExecutionAttempts.ownerUserId, input.ownerUserId)
          )
        );
      const events = await transaction
        .select()
        .from(flowRunEvents)
        .where(
          and(
            eq(flowRunEvents.flowRunId, input.runId),
            eq(flowRunEvents.ownerUserId, input.ownerUserId)
          )
        )
        .orderBy(asc(flowRunEvents.sequence), asc(flowRunEvents.id));

      const persistedToken = token[0];
      if (!persistedToken) throw new Error("V2 flow run is missing its execution token");
      if ((events.at(-1)?.sequence ?? 0n) !== run.traceSequence) {
        throw new Error("Flow run trace sequence does not match its append-only events");
      }
      const attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
      const orderedAttempts = events.flatMap((event) => {
        if (!event.attemptId) return [];
        const attempt = attemptsById.get(event.attemptId);
        if (!attempt) throw new Error("Flow run event references a missing execution attempt");
        assertCausalExecutionPair(attempt, event);
        return [attempt];
      });
      if (orderedAttempts.length !== attempts.length) {
        throw new Error("Flow execution attempt is missing its causal run event");
      }

      return {
        ...run,
        graphSchemaVersion: "flow-graph.v2",
        token: toTokenDetail(persistedToken),
        attempts: orderedAttempts.map(toAttemptDetail),
        events: events.map(toEventDetail)
      } satisfies FlowExecutionRunDetail;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}

function assertExecutionFailure(failure: FlowExecutionFailure): void {
  if (!FAILURE_REASON_CODES.has(failure.reasonCode)) {
    throw new Error("Flow execution failure reason is not accepted by node finalization");
  }
  if (
    (failure.classification === "retryable" &&
      !RETRYABLE_FAILURE_REASON_CODES.has(failure.reasonCode)) ||
    (failure.classification === "permanent" &&
      !PERMANENT_FAILURE_REASON_CODES.has(failure.reasonCode))
  ) {
    throw new Error("Flow execution failure classification does not match its reason");
  }
}

function chooseFailureDisposition(input: {
  readonly failure: FlowExecutionFailure;
  readonly attemptNumber: bigint;
  readonly maxAttempts: number;
}): FlowExecutionFailureDisposition {
  if (input.failure.classification === "permanent") {
    return INTEGRITY_QUARANTINE_REASON_CODES.has(input.failure.reasonCode)
      ? "quarantined"
      : "failed_terminal";
  }

  const effectiveMaxAttempts =
    input.failure.reasonCode === "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE"
      ? Math.min(input.maxAttempts, 2)
      : input.maxAttempts;
  return input.attemptNumber < BigInt(effectiveMaxAttempts) ? "retry_scheduled" : "failed_terminal";
}

function assertPersistedRetryPolicy(input: {
  readonly retryPolicyKey: string;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
}): void {
  if (!isPersistedRetryPolicySupported(input)) {
    throw new Error("Flow execution token contains an unsupported retry policy snapshot");
  }
}

function isPersistedRetryPolicySupported(input: {
  readonly retryPolicyKey: string;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
}): boolean {
  return (
    input.retryPolicyKey === flowExecutionRetryPolicyV1.key &&
    input.maxAttempts === flowExecutionRetryPolicyV1.maxAttempts &&
    input.retryBaseDelayMs === flowExecutionRetryPolicyV1.baseDelayMs &&
    input.retryMaxDelayMs === flowExecutionRetryPolicyV1.maxDelayMs
  );
}

function isClaimCandidateRuntimeStateValid(candidate: PoisonFlowExecutionCandidate): boolean {
  if (
    !isPersistedRetryPolicySupported(candidate) ||
    (candidate.state !== "runnable" && candidate.state !== "retry_scheduled") ||
    candidate.attemptCounter < 0n ||
    candidate.attemptCounter >= BigInt(candidate.maxAttempts) ||
    candidate.fencingToken < candidate.attemptCounter ||
    candidate.terminalAt !== null ||
    candidate.quarantinedAt !== null
  ) {
    return false;
  }

  if (candidate.state === "runnable") {
    return candidate.failureDisposition === null && candidate.failureReasonCode === null;
  }
  return (
    candidate.attemptCounter > 0n &&
    candidate.failureDisposition === "retry_scheduled" &&
    candidate.failureReasonCode !== null &&
    RETRY_SCHEDULED_FAILURE_REASON_CODES.has(candidate.failureReasonCode)
  );
}

function isExpiredClaimRuntimeStateValid(
  token: ExpiredFlowExecutionToken,
  recoveredAt: Date
): boolean {
  return (
    isPersistedRetryPolicySupported(token) &&
    token.attemptCounter > 0n &&
    token.attemptCounter <= BigInt(token.maxAttempts) &&
    token.fencingToken >= token.attemptCounter &&
    token.claimedAt.getTime() <= token.leaseExpiresAt.getTime() &&
    token.claimedAt.getTime() <= recoveredAt.getTime() &&
    token.leaseExpiresAt.getTime() <= recoveredAt.getTime()
  );
}

async function readPostLockDatabaseInstant(transaction: FlowTransaction): Promise<Date> {
  const result = await transaction.execute(
    sql<{ transitionEpochMs: string }>`
      select (extract(epoch from clock_timestamp()) * 1000)::text as "transitionEpochMs"
    `
  );
  const clock = result.rows[0];
  const transitionAt = parseFlowDatabaseEpochMilliseconds(clock?.transitionEpochMs);
  if (!transitionAt) {
    throw new Error("Database did not return a valid post-lock flow transition timestamp");
  }
  return transitionAt;
}

async function quarantineInvalidExpiredClaim(
  transaction: FlowTransaction,
  token: ExpiredFlowExecutionToken,
  quarantinedAt: Date
): Promise<"quarantined"> {
  const reasonCode = "FLOW_TOKEN_RUNTIME_STATE_INVALID" as const;
  const summary = parseFlowRuntimeTraceSummary({
    schemaVersion: "flow-runtime-trace.v1",
    outcome: "failed",
    nodeKind: token.nodeKind,
    reasonCode,
    resultCode: "FLOW_EXECUTION_FAILED_TERMINAL"
  });

  const [quarantinedToken] = await transaction
    .update(flowExecutionTokens)
    .set({
      state: "failed",
      claimedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      fencingToken: sql`greatest(
        ${flowExecutionTokens.fencingToken} + 1,
        ${flowExecutionTokens.attemptCounter},
        1
      )`,
      failureDisposition: "quarantined",
      failureReasonCode: reasonCode,
      terminalAt: quarantinedAt,
      quarantinedAt,
      updatedAt: quarantinedAt
    })
    .where(
      and(
        eq(flowExecutionTokens.id, token.id),
        eq(flowExecutionTokens.ownerUserId, token.ownerUserId),
        eq(flowExecutionTokens.flowRunId, token.flowRunId),
        eq(flowExecutionTokens.state, "claimed"),
        eq(flowExecutionTokens.leaseOwner, token.leaseOwner),
        eq(flowExecutionTokens.fencingToken, token.fencingToken)
      )
    )
    .returning({ id: flowExecutionTokens.id });
  if (!quarantinedToken) {
    throw new Error("Locked invalid expired flow token could not be quarantined");
  }

  const [run] = await transaction
    .update(flowRuns)
    .set({
      status: "failed_terminal",
      currentNodeId: token.nodeId,
      traceSequence: sql`${flowRuns.traceSequence} + 1`,
      completedAt: quarantinedAt,
      updatedAt: quarantinedAt
    })
    .where(
      and(
        eq(flowRuns.id, token.flowRunId),
        eq(flowRuns.ownerUserId, token.ownerUserId),
        eq(flowRuns.flowId, token.flowId),
        eq(flowRuns.flowVersionId, token.flowVersionId),
        inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
      )
    )
    .returning({ traceSequence: flowRuns.traceSequence });
  if (!run) throw new Error("Flow run became unavailable while quarantining its invalid token");

  await transaction.insert(flowRunEvents).values({
    ownerUserId: token.ownerUserId,
    flowRunId: token.flowRunId,
    sequence: run.traceSequence,
    eventType: "run_failed",
    nodeId: token.nodeId,
    attemptId: null,
    summary,
    occurredAt: quarantinedAt
  });

  return "quarantined";
}

function retryAvailableAtSql(input: {
  readonly attemptNumber: bigint;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
  readonly transitionAt: Date;
}) {
  const exponent = Math.max(0, Math.min(Number(input.attemptNumber) - 1, 19));
  const cappedDelayMs = Math.min(input.retryMaxDelayMs, input.retryBaseDelayMs * 2 ** exponent);
  const minimumDelayMs = Math.max(1, Math.floor(cappedDelayMs / 2));
  const jitterWidthMs = cappedDelayMs - minimumDelayMs + 1;
  return sql`${input.transitionAt}::timestamptz + (
    ${minimumDelayMs} + floor(random() * ${jitterWidthMs})
  ) * interval '1 millisecond'`;
}

function validateClaimInput(input: Parameters<FlowExecutionStore["claimNext"]>[0]): void {
  if (!input.leaseOwner.trim() || input.leaseOwner.length > 180) {
    throw new Error("Flow execution lease owner must contain 1 to 180 characters");
  }
  if (
    !Number.isInteger(input.leaseDurationMs) ||
    input.leaseDurationMs < 1 ||
    input.leaseDurationMs > MAX_LEASE_DURATION_MS
  ) {
    throw new Error(
      `Flow execution lease duration must be between 1 and ${MAX_LEASE_DURATION_MS} ms`
    );
  }
  if (input.executorKeys.length < 1 || input.executorKeys.length > 200) {
    throw new Error("Flow execution claim requires 1 to 200 executor keys");
  }
  if (new Set(input.executorKeys).size !== input.executorKeys.length) {
    throw new Error("Flow execution claim executor keys must be unique");
  }
  validateOwnerScope(input.ownerScope);
}

function validateOwnerScope(ownerScope: FlowExecutionOwnerScope): void {
  if (ownerScope.kind === "all") return;
  if (ownerScope.kind !== "allowlist") {
    throw new Error("Flow execution owner scope is unsupported");
  }
  if (
    ownerScope.ownerUserIds.length < 1 ||
    ownerScope.ownerUserIds.length > MAX_FLOW_EXECUTION_CANARY_OWNERS
  ) {
    throw new Error(
      `Flow execution canary owner scope requires 1 to ${MAX_FLOW_EXECUTION_CANARY_OWNERS} owners`
    );
  }
  if (
    ownerScope.ownerUserIds.some((ownerUserId) => !UUID_PATTERN.test(ownerUserId)) ||
    new Set(ownerScope.ownerUserIds.map((ownerUserId) => ownerUserId.toLowerCase())).size !==
      ownerScope.ownerUserIds.length
  ) {
    throw new Error("Flow execution canary owner ids must be unique UUIDs");
  }
}

function toTokenDetail(row: typeof flowExecutionTokens.$inferSelect): FlowExecutionTokenDetail {
  assertPersistedRetryPolicy(row);
  return {
    id: row.id,
    nodeId: row.nodeId,
    executorKey: row.executorKey as FlowNodeExecutorKey,
    state: row.state,
    nodeActivationSequence: row.nodeActivationSequence,
    attemptCounter: row.attemptCounter,
    fencingToken: row.fencingToken,
    retryPolicy: {
      key: flowExecutionRetryPolicyV1.key,
      maxAttempts: row.maxAttempts,
      baseDelayMs: row.retryBaseDelayMs,
      maxDelayMs: row.retryMaxDelayMs
    },
    failureDisposition: row.failureDisposition as FlowExecutionFailureDisposition | null,
    failureReasonCode: row.failureReasonCode as FlowExecutionFailureReasonCode | null,
    availableAt: row.availableAt.toISOString(),
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt?.toISOString() ?? null,
    terminalAt: row.terminalAt?.toISOString() ?? null,
    quarantinedAt: row.quarantinedAt?.toISOString() ?? null
  };
}

function toAttemptDetail(
  row: typeof flowExecutionAttempts.$inferSelect
): FlowExecutionAttemptDetail {
  return {
    id: row.id,
    nodeId: row.nodeId,
    executorKey: row.executorKey as FlowNodeExecutorKey,
    nodeActivationSequence: row.nodeActivationSequence,
    attemptNumber: row.attemptNumber,
    fencingToken: row.fencingToken,
    leaseOwner: row.leaseOwner,
    outcome: row.outcome,
    resultCode: row.resultCode,
    traceSummary: row.traceSummary,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString()
  };
}

function toEventDetail(row: typeof flowRunEvents.$inferSelect): FlowRunEventDetail {
  return {
    id: row.id,
    sequence: row.sequence,
    eventType: row.eventType,
    nodeId: row.nodeId,
    attemptId: row.attemptId,
    summary: row.summary,
    occurredAt: row.occurredAt.toISOString()
  };
}

function assertNeverFlowExecutionDecision(decision: never): never {
  void decision;
  throw new Error("FLOW_RUNTIME_TRACE_INVALID: unsupported execution decision");
}

function assertCausalExecutionPair(
  attempt: typeof flowExecutionAttempts.$inferSelect,
  event: typeof flowRunEvents.$inferSelect
): void {
  if (
    event.nodeId !== attempt.nodeId ||
    event.eventType !== EVENT_TYPE_BY_ATTEMPT_OUTCOME[attempt.outcome] ||
    !isDeepStrictEqual(event.summary, attempt.traceSummary)
  ) {
    throw new Error("Flow causal event does not match its execution attempt");
  }
}
