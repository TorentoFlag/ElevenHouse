import { and, eq, sql } from "drizzle-orm";

import {
  decideFlowApprovalResponseSchema,
  flowApprovalSchema,
  type FlowApproval
} from "@elevenhouse/contracts";
import {
  FlowExecutionIntegrityError,
  FlowRuntimeCommandBusyError,
  FlowRuntimeCommandIntegrityError,
  FlowRuntimeIdempotencyConflictError,
  FlowRuntimeIdempotencyExpiredError,
  formatFlowNodeExecutorKey,
  parseFlowRuntimeTraceSummary,
  resolvePinnedFlowExecutionAdvanceTarget,
  resolvePinnedFlowExecutionNode,
  type FlowApprovalCommand,
  type FlowApprovalCommandOutcome,
  type FlowApprovalCommandResult,
  type FlowApprovalStore
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowApprovals,
  flowExecutionTokens,
  flowRunEvents,
  flowRuns,
  flowRuntimeCommandOutcomes,
  flowRuntimeCommands,
  flowVersions
} from "../../schema/flows";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";

type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type LockedApproval = typeof flowApprovals.$inferSelect;
type LockedToken = typeof flowExecutionTokens.$inferSelect;
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
type ApprovalTarget = {
  readonly flowRunId: string;
  readonly flowVersionId: string;
  readonly tokenId: string | null;
};
type CommandAttempt =
  | { readonly kind: "created"; readonly result: FlowApprovalCommandResult }
  | { readonly kind: "replay" };

const transactionTimestamp = sql`transaction_timestamp()`;
const replayUntil = sql`transaction_timestamp() + interval '24 hours'`;
const commandLockTimeout = "1000ms";
const commandStatementTimeout = "5000ms";

/**
 * Approval commands deliberately lock approval -> token -> run. Keeping that
 * order identical for decision and future expiry handling prevents a decision
 * racing a timeout from producing two outgoing edges for one activation.
 */
export function createDrizzleFlowApprovalStore(database: ElevenHouseDatabase): FlowApprovalStore {
  return { execute: ({ command }) => executePersistedApprovalCommand(database, command) };
}

async function executePersistedApprovalCommand(
  database: ElevenHouseDatabase,
  command: FlowApprovalCommand
): Promise<FlowApprovalCommandResult> {
  let attempt: CommandAttempt;
  try {
    attempt = await database.transaction<CommandAttempt>(async (transaction) => {
      await transaction.execute(sql`
        select
          set_config('lock_timeout', ${commandLockTimeout}, true),
          set_config('statement_timeout', ${commandStatementTimeout}, true)
      `);
      const target = await resolveOwnedApprovalTarget(transaction, command);
      const [inserted] = await transaction
        .insert(flowRuntimeCommands)
        .values({
          apiSurface: command.apiSurface,
          actorUserId: command.actorUserId,
          ownerUserId: command.ownerUserId,
          routeTemplate: command.routeTemplate,
          resourceId: command.resourceId,
          flowRunId: target?.flowRunId ?? null,
          commandScope: command.scope,
          idempotencyKey: command.idempotencyKey,
          requestHash: command.requestHash,
          replayUntil,
          createdAt: transactionTimestamp,
          updatedAt: transactionTimestamp
        })
        .onConflictDoNothing({
          target: [
            flowRuntimeCommands.apiSurface,
            flowRuntimeCommands.actorUserId,
            flowRuntimeCommands.ownerUserId,
            flowRuntimeCommands.routeTemplate,
            flowRuntimeCommands.resourceId,
            flowRuntimeCommands.idempotencyKey
          ]
        })
        .returning({ id: flowRuntimeCommands.id });
      if (!inserted) return { kind: "replay" };

      const outcome = target
        ? await applyLockedApprovalCommand(transaction, command, inserted.id, target)
        : approvalNotFoundOutcome();
      const completedAt = await readPostLockDatabaseInstant(transaction);
      await transaction.insert(flowRuntimeCommandOutcomes).values({
        commandId: inserted.id,
        responseStatus: outcome.response.statusCode,
        responseBody: outcome.response.body,
        createdAt: completedAt
      });
      const [completed] = await transaction
        .update(flowRuntimeCommands)
        .set({
          state: outcome.kind === "succeeded" ? "succeeded" : "failed",
          completedAt,
          updatedAt: completedAt
        })
        .where(
          and(eq(flowRuntimeCommands.id, inserted.id), eq(flowRuntimeCommands.state, "processing"))
        )
        .returning({ id: flowRuntimeCommands.id });
      if (!completed) throw new FlowRuntimeCommandIntegrityError();
      return { kind: "created", result: { kind: "created", outcome } };
    });
  } catch (error) {
    if (isPostgresCommandTimeout(error)) throw new FlowRuntimeCommandBusyError();
    throw error;
  }
  return attempt.kind === "created" ? attempt.result : replayPersistedCommand(database, command);
}

async function resolveOwnedApprovalTarget(
  transaction: FlowTransaction,
  command: FlowApprovalCommand
): Promise<ApprovalTarget | null> {
  const [row] = await transaction
    .select({
      flowRunId: flowApprovals.flowRunId,
      flowVersionId: flowRuns.flowVersionId,
      tokenId: flowApprovals.executionTokenId
    })
    .from(flowApprovals)
    .innerJoin(
      flowRuns,
      and(eq(flowRuns.id, flowApprovals.flowRunId), eq(flowRuns.ownerUserId, flowApprovals.ownerUserId))
    )
    .where(and(eq(flowApprovals.id, command.resourceId), eq(flowApprovals.ownerUserId, command.ownerUserId)))
    .limit(1);
  return row ?? null;
}

async function applyLockedApprovalCommand(
  transaction: FlowTransaction,
  command: FlowApprovalCommand,
  commandId: string,
  target: ApprovalTarget
): Promise<FlowApprovalCommandOutcome> {
  const approval = await lockApproval(transaction, command, target);
  if (!approval) return approvalNotFoundOutcome();
  const now = await readPostLockDatabaseInstant(transaction);
  if (approval.revision !== command.request.body.expectedRevision) {
    return revisionConflictOutcome(approval.revision);
  }
  if (approval.status !== "pending") return transitionNotAllowedOutcome(approval.status);
  if (approval.expiresAt !== null && approval.expiresAt <= now) {
    // Expiry must be advanced by the dedicated worker sweep; a decision never
    // silently chooses an edge after its deadline.
    return transitionNotAllowedOutcome("expired");
  }

  if (command.request.body.decision === "snoozed") {
    const snoozedUntil = new Date(command.request.body.snoozedUntil!);
    if (snoozedUntil <= now) return snoozeNotFutureOutcome();
    const [snoozed] = await transaction
      .update(flowApprovals)
      .set({
        status: "snoozed",
        decisionNote: command.request.body.note ?? null,
        decidedByUserId: command.actorUserId,
        snoozedUntil,
        revision: approval.revision + 1,
        lastCommandId: commandId,
        lastRunEventId: null,
        decidedAt: now
      })
      .where(approvalCasPredicate(approval, command))
      .returning();
    if (!snoozed) throw new FlowRuntimeCommandIntegrityError();
    return succeededOutcome(toFlowApproval(snoozed));
  }

  const token = target.tokenId === null ? null : await lockToken(transaction, command, target);
  const run = token ? await lockRun(transaction, command, target) : null;
  if (!token || !run || !isCoherentWaitingRuntime(approval, token, run, target)) {
    return runtimeUnavailableOutcome();
  }
  let advanceTarget;
  try {
    if (!isApprovalNodeKind(token.nodeKind)) return runtimeUnavailableOutcome();
    const pinnedNode = resolvePinnedFlowExecutionNode({
      flowVersionId: target.flowVersionId,
      nodeId: token.nodeId,
      nodeKind: token.nodeKind,
      configSchemaVersion: token.configSchemaVersion,
      executorContractVersion: token.executorContractVersion,
      graph: run.graph,
      capabilityManifest: run.capabilityManifest
    });
    if (!isApprovalNodeKind(pinnedNode.kind) || token.executorKey !== formatFlowNodeExecutorKey(pinnedNode)) {
      return runtimeUnavailableOutcome();
    }
    advanceTarget = resolvePinnedFlowExecutionAdvanceTarget({
      definition: {
        flowVersionId: target.flowVersionId,
        nodeId: token.nodeId,
        nodeKind: token.nodeKind,
        configSchemaVersion: token.configSchemaVersion,
        executorContractVersion: token.executorContractVersion,
        graph: run.graph,
        capabilityManifest: run.capabilityManifest
      },
      sourceHandle: command.request.body.decision
    });
  } catch (error) {
    if (error instanceof FlowExecutionIntegrityError) return runtimeUnavailableOutcome();
    throw error;
  }
  const trace = parseFlowRuntimeTraceSummary({
    schemaVersion: "flow-runtime-trace.v1",
    outcome: "advanced",
    nodeKind: token.nodeKind,
    reasonCode: "FLOW_APPROVAL_DECIDED",
    resultCode: "FLOW_TOKEN_ADVANCED",
    sourceHandle: command.request.body.decision,
    selectedEdgeId: advanceTarget.edgeId,
    targetNodeId: advanceTarget.node.id,
    targetNodeKind: advanceTarget.node.kind
  });
  const [resumedToken] = await transaction
    .update(flowExecutionTokens)
    .set({
      nodeId: advanceTarget.node.id,
      nodeKind: advanceTarget.node.kind,
      configSchemaVersion: advanceTarget.node.configSchemaVersion,
      executorContractVersion: advanceTarget.node.executorContractVersion,
      executorKey: formatFlowNodeExecutorKey(advanceTarget.node),
      state: "runnable",
      availableAt: now,
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
      updatedAt: now
    })
    .where(
      and(
        eq(flowExecutionTokens.id, token.id),
        eq(flowExecutionTokens.ownerUserId, command.ownerUserId),
        eq(flowExecutionTokens.flowRunId, target.flowRunId),
        eq(flowExecutionTokens.flowVersionId, target.flowVersionId),
        eq(flowExecutionTokens.state, "waiting_approval"),
        eq(flowExecutionTokens.nodeActivationSequence, token.nodeActivationSequence),
        eq(flowExecutionTokens.fencingToken, token.fencingToken)
      )
    )
    .returning({ id: flowExecutionTokens.id });
  if (!resumedToken) throw new FlowRuntimeCommandIntegrityError();
  const [resumedRun] = await transaction
    .update(flowRuns)
    .set({ status: "running", currentNodeId: advanceTarget.node.id, traceSequence: run.traceSequence + 1n, updatedAt: now })
    .where(
      and(
        eq(flowRuns.id, run.id),
        eq(flowRuns.ownerUserId, command.ownerUserId),
        eq(flowRuns.flowVersionId, target.flowVersionId),
        eq(flowRuns.status, "waiting"),
        eq(flowRuns.traceSequence, run.traceSequence)
      )
    )
    .returning({ traceSequence: flowRuns.traceSequence });
  if (!resumedRun) throw new FlowRuntimeCommandIntegrityError();
  const [event] = await transaction
    .insert(flowRunEvents)
    .values({
      ownerUserId: command.ownerUserId,
      flowRunId: target.flowRunId,
      sequence: resumedRun.traceSequence,
      eventType: "token_advanced",
      nodeId: approval.executionTokenId === null ? null : token.nodeId,
      attemptId: null,
      commandId,
      summary: trace,
      occurredAt: now
    })
    .returning({ id: flowRunEvents.id });
  if (!event) throw new FlowRuntimeCommandIntegrityError();
  const [decided] = await transaction
    .update(flowApprovals)
    .set({
      status: command.request.body.decision,
      decisionNote: command.request.body.note ?? null,
      decidedByUserId: command.actorUserId,
      snoozedUntil: null,
      revision: approval.revision + 1,
      lastCommandId: null,
      lastRunEventId: event.id,
      decidedAt: now
    })
    .where(approvalCasPredicate(approval, command))
    .returning();
  if (!decided) throw new FlowRuntimeCommandIntegrityError();
  return succeededOutcome(toFlowApproval(decided));
}

async function lockApproval(transaction: FlowTransaction, command: FlowApprovalCommand, target: ApprovalTarget): Promise<LockedApproval | null> {
  const [approval] = await transaction
    .select()
    .from(flowApprovals)
    .where(and(eq(flowApprovals.id, command.resourceId), eq(flowApprovals.ownerUserId, command.ownerUserId), eq(flowApprovals.flowRunId, target.flowRunId)))
    .limit(1)
    .for("update", { of: flowApprovals });
  return approval ?? null;
}

async function lockToken(transaction: FlowTransaction, command: FlowApprovalCommand, target: ApprovalTarget): Promise<LockedToken | null> {
  const [token] = await transaction
    .select()
    .from(flowExecutionTokens)
    .where(and(eq(flowExecutionTokens.id, target.tokenId!), eq(flowExecutionTokens.ownerUserId, command.ownerUserId), eq(flowExecutionTokens.flowRunId, target.flowRunId), eq(flowExecutionTokens.flowVersionId, target.flowVersionId)))
    .limit(1)
    .for("update", { of: flowExecutionTokens });
  return token ?? null;
}

async function lockRun(transaction: FlowTransaction, command: FlowApprovalCommand, target: ApprovalTarget): Promise<LockedRun | null> {
  const [run] = await transaction
    .select({ id: flowRuns.id, ownerUserId: flowRuns.ownerUserId, flowVersionId: flowRuns.flowVersionId, status: flowRuns.status, currentNodeId: flowRuns.currentNodeId, traceSequence: flowRuns.traceSequence, graphSchemaVersion: flowVersions.graphSchemaVersion, graph: flowVersions.graph, capabilityManifest: flowVersions.capabilityManifest })
    .from(flowRuns)
    .innerJoin(flowVersions, and(eq(flowVersions.id, flowRuns.flowVersionId), eq(flowVersions.flowId, flowRuns.flowId), eq(flowVersions.ownerUserId, flowRuns.ownerUserId)))
    .where(and(eq(flowRuns.id, target.flowRunId), eq(flowRuns.ownerUserId, command.ownerUserId), eq(flowRuns.flowVersionId, target.flowVersionId)))
    .limit(1)
    .for("update", { of: flowRuns });
  return run ?? null;
}

function isCoherentWaitingRuntime(approval: LockedApproval, token: LockedToken, run: LockedRun, target: ApprovalTarget): boolean {
  return run.graphSchemaVersion === "flow-graph.v2" && run.status === "waiting" && run.currentNodeId === token.nodeId && token.state === "waiting_approval" && isApprovalNodeKind(token.nodeKind) && token.id === approval.executionTokenId && token.nodeActivationSequence === approval.nodeActivationSequence && token.id === target.tokenId && approval.flowRunId === target.flowRunId;
}

function isApprovalNodeKind(value: string): value is "astrologer_approval" | "natal_chart_ai_draft" {
  return value === "astrologer_approval" || value === "natal_chart_ai_draft";
}

function approvalCasPredicate(approval: LockedApproval, command: FlowApprovalCommand) {
  return and(eq(flowApprovals.id, approval.id), eq(flowApprovals.ownerUserId, command.ownerUserId), eq(flowApprovals.flowRunId, approval.flowRunId), eq(flowApprovals.revision, approval.revision), eq(flowApprovals.status, approval.status));
}

async function replayPersistedCommand(database: ElevenHouseDatabase, command: FlowApprovalCommand): Promise<FlowApprovalCommandResult> {
  const [row] = await database
    .select({ commandScope: flowRuntimeCommands.commandScope, requestHash: flowRuntimeCommands.requestHash, state: flowRuntimeCommands.state, replayExpired: sql<boolean>`${flowRuntimeCommands.replayUntil} <= transaction_timestamp()`, responseStatus: flowRuntimeCommandOutcomes.responseStatus, responseBody: flowRuntimeCommandOutcomes.responseBody })
    .from(flowRuntimeCommands)
    .leftJoin(flowRuntimeCommandOutcomes, eq(flowRuntimeCommandOutcomes.commandId, flowRuntimeCommands.id))
    .where(commandIdentityPredicate(command))
    .limit(1);
  if (!row) throw new FlowRuntimeCommandIntegrityError();
  if (row.commandScope !== command.scope || row.requestHash !== command.requestHash) throw new FlowRuntimeIdempotencyConflictError();
  if (row.replayExpired) throw new FlowRuntimeIdempotencyExpiredError();
  if (!row.responseBody || row.responseStatus === null) throw new FlowRuntimeCommandIntegrityError();
  if (row.state === "succeeded" && row.responseStatus === 200) {
    const body = decideFlowApprovalResponseSchema.safeParse(row.responseBody);
    if (body.success && body.data.approval.id === command.resourceId) return { kind: "replayed", outcome: { kind: "succeeded", response: { statusCode: 200, body: body.data } } };
  }
  if (row.state === "failed" && (row.responseStatus === 404 || row.responseStatus === 409)) {
    return { kind: "replayed", outcome: { kind: "rejected", response: { statusCode: row.responseStatus, body: row.responseBody as never } } };
  }
  throw new FlowRuntimeCommandIntegrityError();
}

function commandIdentityPredicate(command: FlowApprovalCommand) {
  return and(eq(flowRuntimeCommands.apiSurface, command.apiSurface), eq(flowRuntimeCommands.actorUserId, command.actorUserId), eq(flowRuntimeCommands.ownerUserId, command.ownerUserId), eq(flowRuntimeCommands.routeTemplate, command.routeTemplate), eq(flowRuntimeCommands.resourceId, command.resourceId), eq(flowRuntimeCommands.idempotencyKey, command.idempotencyKey));
}

async function readPostLockDatabaseInstant(transaction: FlowTransaction): Promise<Date> {
  const result = await transaction.execute<{ now_epoch_ms: string }>(sql`select (extract(epoch from clock_timestamp()) * 1000)::text as now_epoch_ms`);
  const value = result.rows[0]?.now_epoch_ms;
  const parsed = value ? parseFlowDatabaseEpochMilliseconds(value) : null;
  if (!parsed) throw new FlowRuntimeCommandIntegrityError();
  return parsed;
}

function toFlowApproval(row: LockedApproval): FlowApproval {
  return flowApprovalSchema.parse({
    id: row.id,
    flowRunId: row.flowRunId,
    stepRunId: row.flowStepRunId,
    status: row.status,
    kind: row.kind,
    title: row.title,
    preview: row.preview,
    artifact:
      row.aiCalculationId === null
        ? null
        : {
            calculationId: row.aiCalculationId,
            interpretationId: row.aiInterpretationId!,
            sourceChecksum: row.aiSourceChecksum!,
            contentChecksum: row.aiContentChecksum!,
            outputText: row.aiOutputText!
          },
    revision: row.revision,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null
  });
}

function succeededOutcome(approval: FlowApproval): FlowApprovalCommandOutcome {
  return { kind: "succeeded", response: { statusCode: 200, body: decideFlowApprovalResponseSchema.parse({ approval }) } };
}
function approvalNotFoundOutcome(): FlowApprovalCommandOutcome { return { kind: "rejected", response: { statusCode: 404, body: { code: "FLOW_APPROVAL_NOT_FOUND" } } }; }
function revisionConflictOutcome(currentRevision: number): FlowApprovalCommandOutcome { return { kind: "rejected", response: { statusCode: 409, body: { code: "FLOW_APPROVAL_REVISION_CONFLICT", currentRevision } } }; }
function transitionNotAllowedOutcome(status: string): FlowApprovalCommandOutcome { return { kind: "rejected", response: { statusCode: 409, body: { code: "FLOW_APPROVAL_TRANSITION_NOT_ALLOWED", status } } }; }
function snoozeNotFutureOutcome(): FlowApprovalCommandOutcome { return { kind: "rejected", response: { statusCode: 409, body: { code: "FLOW_APPROVAL_SNOOZE_NOT_FUTURE" } } }; }
function runtimeUnavailableOutcome(): FlowApprovalCommandOutcome { return { kind: "rejected", response: { statusCode: 409, body: { code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" } } }; }
function isPostgresCommandTimeout(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && ((error as { code?: unknown }).code === "55P03" || (error as { code?: unknown }).code === "57014"); }
