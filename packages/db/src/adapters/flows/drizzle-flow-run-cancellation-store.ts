import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  cancelFlowRunResponseSchema,
  flowRunResponseSchema,
  type FlowExecutableNodeKindV2,
  type FlowRunResponse,
  type FlowRunStatus
} from "@elevenhouse/contracts";
import {
  flowRunCancellationRejectionResponseSchema,
  FlowRuntimeCommandBusyError,
  FlowRuntimeCommandIntegrityError,
  FlowRuntimeIdempotencyConflictError,
  FlowRuntimeIdempotencyExpiredError,
  parseFlowRuntimeTraceSummary,
  resolvePinnedFlowExecutionNode,
  type FlowRunCancellationCommand,
  type FlowRunCancellationCommandOutcome,
  type FlowRunCancellationCommandResult,
  type FlowRunCancellationStore
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowExecutionAttempts,
  flowExecutionTokens,
  flowRunEvents,
  flowRuns,
  flowRuntimeCommandOutcomes,
  flowRuntimeCommands,
  flowRuntimeEvents,
  flowVersions,
  flowWorkItems
} from "../../schema/flows";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";

type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type FlowExecutionTokenRow = typeof flowExecutionTokens.$inferSelect;

type LockedRun = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly sourceEventId: string;
  readonly status: string;
  readonly snapshot: Record<string, unknown>;
  readonly currentNodeId: string | null;
  readonly traceSequence: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly graphSchemaVersion: string | null;
  readonly graph: unknown;
  readonly capabilityManifest: unknown;
};

type CommandAttempt =
  | { readonly kind: "created"; readonly result: FlowRunCancellationCommandResult }
  | { readonly kind: "replay" };

const transactionTimestamp = sql`transaction_timestamp()`;
const replayUntil = sql`transaction_timestamp() + interval '24 hours'`;
const cancellationLockTimeout = "1000ms";
const cancellationStatementTimeout = "5000ms";
const cancelableRunStatuses = ["pending", "running", "waiting", "failed_retryable"] as const;
const terminalRunStatuses = [
  "completed",
  "skipped",
  "failed_terminal",
  "suppressed",
  "expired",
  "canceled"
] as const;

export function createDrizzleFlowRunCancellationStore(
  database: ElevenHouseDatabase
): FlowRunCancellationStore {
  return {
    executeCancel: ({ command }) => executePersistedCancellation(database, command)
  };
}

async function executePersistedCancellation(
  database: ElevenHouseDatabase,
  command: FlowRunCancellationCommand
): Promise<FlowRunCancellationCommandResult> {
  let attempt: CommandAttempt;
  try {
    attempt = await database.transaction<CommandAttempt>(async (transaction) => {
      await transaction.execute(sql`
        select
          set_config('lock_timeout', ${cancellationLockTimeout}, true),
          set_config('statement_timeout', ${cancellationStatementTimeout}, true)
      `);
      const [inserted] = await transaction
        .insert(flowRuntimeCommands)
        .values({
          apiSurface: command.apiSurface,
          actorUserId: command.actorUserId,
          ownerUserId: command.ownerUserId,
          routeTemplate: command.routeTemplate,
          resourceId: command.resourceId,
          flowRunId: command.flowRunId,
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

      const outcome = await cancelLockedRun(transaction, command, inserted.id);
      const commandCompletedAt = await readPostLockDatabaseInstant(transaction);
      await transaction.insert(flowRuntimeCommandOutcomes).values({
        commandId: inserted.id,
        responseStatus: outcome.response.statusCode,
        responseBody: outcome.response.body,
        createdAt: commandCompletedAt
      });
      const [completed] = await transaction
        .update(flowRuntimeCommands)
        .set({
          state: outcome.kind === "succeeded" ? "succeeded" : "failed",
          completedAt: commandCompletedAt,
          updatedAt: commandCompletedAt
        })
        .where(
          and(eq(flowRuntimeCommands.id, inserted.id), eq(flowRuntimeCommands.state, "processing"))
        )
        .returning({ id: flowRuntimeCommands.id });
      if (!completed) throw new FlowRuntimeCommandIntegrityError();

      return {
        kind: "created",
        result: { kind: "created", outcome }
      };
    });
  } catch (error) {
    if (isPostgresCommandTimeout(error)) throw new FlowRuntimeCommandBusyError();
    throw error;
  }

  return attempt.kind === "created"
    ? attempt.result
    : replayPersistedCancellation(database, command);
}

function isPostgresCommandTimeout(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = "code" in current ? current.code : undefined;
    if (code === "55P03" || code === "57014") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

async function cancelLockedRun(
  transaction: FlowTransaction,
  command: FlowRunCancellationCommand,
  commandId: string
): Promise<FlowRunCancellationCommandOutcome> {
  const [token] = await transaction
    .select()
    .from(flowExecutionTokens)
    .where(
      and(
        eq(flowExecutionTokens.ownerUserId, command.ownerUserId),
        eq(flowExecutionTokens.flowRunId, command.resourceId)
      )
    )
    .limit(1)
    .for("update", { of: flowExecutionTokens });

  if (!token) {
    const [ownedRun] = await transaction
      .select({ id: flowRuns.id })
      .from(flowRuns)
      .where(
        and(eq(flowRuns.ownerUserId, command.ownerUserId), eq(flowRuns.id, command.resourceId))
      )
      .limit(1)
      .for("update", { of: flowRuns });
    return ownedRun ? executionUnavailableOutcome() : notFoundOutcome();
  }

  const run = await lockRunAfterToken(transaction, command, token);
  if (!run) throw new FlowRuntimeCommandIntegrityError();
  const activeWorkItem = await lockActiveWorkItemAfterRun(transaction, command);

  if (run.status === "canceled" && token.state === "canceled") {
    if (!(await hasDurableCancellationEvent(transaction, command, run.traceSequence))) {
      return executionUnavailableOutcome();
    }
    return succeededOutcome(toRunResponse(run));
  }

  if (run.status === "canceled" || token.state === "canceled") {
    return executionUnavailableOutcome();
  }

  if (isTerminalRunStatus(run.status)) {
    return cancelNotAllowedOutcome(run.status);
  }

  const canceledAt = await readPostLockDatabaseInstant(transaction);
  const pinnedNodeKind = resolveValidPinnedExecutionNodeKind(run, token);
  if (
    !isCancelableRuntime(run, token) ||
    !hasValidCancellationRuntimeState(token, canceledAt) ||
    !hasCoherentCancellationWorkItem(token, activeWorkItem) ||
    pinnedNodeKind === null ||
    !flowRunResponseSchema.safeParse(toRawRunResponse(run)).success
  ) {
    return executionUnavailableOutcome();
  }

  const summary = parseFlowRuntimeTraceSummary({
    schemaVersion: "flow-runtime-trace.v1",
    outcome: "canceled",
    nodeKind: pinnedNodeKind,
    reasonCode: "FLOW_RUN_CANCELED_BY_OWNER",
    resultCode: "FLOW_RUN_CANCELED"
  });
  const [canceledToken] = await transaction
    .update(flowExecutionTokens)
    .set({
      state: "canceled",
      claimedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      fencingToken: sql`${flowExecutionTokens.fencingToken} + 1`,
      failureDisposition: null,
      failureReasonCode: null,
      terminalAt: canceledAt,
      quarantinedAt: null,
      updatedAt: canceledAt
    })
    .where(
      and(
        eq(flowExecutionTokens.id, token.id),
        eq(flowExecutionTokens.ownerUserId, command.ownerUserId),
        eq(flowExecutionTokens.flowRunId, command.resourceId),
        eq(flowExecutionTokens.state, token.state),
        eq(flowExecutionTokens.fencingToken, token.fencingToken)
      )
    )
    .returning({ canceledAt: flowExecutionTokens.terminalAt });
  if (!canceledToken?.canceledAt) throw new FlowRuntimeCommandIntegrityError();

  if (activeWorkItem) {
    const [canceledWorkItem] = await transaction
      .update(flowWorkItems)
      .set({
        status: "canceled",
        snoozedUntil: null,
        canceledAt: canceledToken.canceledAt,
        revision: activeWorkItem.revision + 1,
        lastCommandId: commandId,
        lastRunEventId: null,
        updatedAt: canceledToken.canceledAt
      })
      .where(
        and(
          eq(flowWorkItems.id, activeWorkItem.id),
          eq(flowWorkItems.ownerUserId, command.ownerUserId),
          eq(flowWorkItems.flowRunId, command.resourceId),
          eq(flowWorkItems.tokenId, token.id),
          eq(flowWorkItems.nodeActivationSequence, token.nodeActivationSequence),
          eq(flowWorkItems.revision, activeWorkItem.revision),
          eq(flowWorkItems.status, activeWorkItem.status)
        )
      )
      .returning({ id: flowWorkItems.id });
    if (!canceledWorkItem) throw new FlowRuntimeCommandIntegrityError();
  }

  const attemptId =
    token.state === "claimed"
      ? await persistCanceledAttempt(transaction, token, summary, canceledToken.canceledAt)
      : null;
  const [canceledRun] = await transaction
    .update(flowRuns)
    .set({
      status: "canceled",
      traceSequence: sql`${flowRuns.traceSequence} + 1`,
      completedAt: canceledToken.canceledAt,
      updatedAt: canceledToken.canceledAt
    })
    .where(
      and(
        eq(flowRuns.id, command.resourceId),
        eq(flowRuns.ownerUserId, command.ownerUserId),
        eq(flowRuns.flowVersionId, token.flowVersionId),
        inArray(flowRuns.status, [...cancelableRunStatuses])
      )
    )
    .returning();
  if (!canceledRun) throw new FlowRuntimeCommandIntegrityError();

  await transaction.insert(flowRunEvents).values({
    ownerUserId: command.ownerUserId,
    flowRunId: command.resourceId,
    sequence: canceledRun.traceSequence,
    eventType: "run_canceled",
    nodeId: token.nodeId,
    attemptId,
    commandId,
    summary,
    occurredAt: canceledToken.canceledAt
  });

  return succeededOutcome(
    toRunResponse({
      ...run,
      status: canceledRun.status,
      currentNodeId: canceledRun.currentNodeId,
      traceSequence: canceledRun.traceSequence,
      updatedAt: canceledRun.updatedAt,
      completedAt: canceledRun.completedAt
    })
  );
}

async function lockRunAfterToken(
  transaction: FlowTransaction,
  command: FlowRunCancellationCommand,
  token: FlowExecutionTokenRow
): Promise<LockedRun | null> {
  const [run] = await transaction
    .select({
      id: flowRuns.id,
      ownerUserId: flowRuns.ownerUserId,
      flowId: flowRuns.flowId,
      flowVersionId: flowRuns.flowVersionId,
      sourceEventId: flowRuntimeEvents.sourceEventId,
      status: flowRuns.status,
      snapshot: flowRuns.snapshot,
      currentNodeId: flowRuns.currentNodeId,
      traceSequence: flowRuns.traceSequence,
      createdAt: flowRuns.createdAt,
      updatedAt: flowRuns.updatedAt,
      completedAt: flowRuns.completedAt,
      graphSchemaVersion: flowVersions.graphSchemaVersion,
      graph: flowVersions.graph,
      capabilityManifest: flowVersions.capabilityManifest
    })
    .from(flowRuns)
    .innerJoin(
      flowVersions,
      and(
        eq(flowVersions.id, flowRuns.flowVersionId),
        eq(flowVersions.ownerUserId, flowRuns.ownerUserId)
      )
    )
    .innerJoin(
      flowRuntimeEvents,
      and(
        eq(flowRuntimeEvents.id, flowRuns.runtimeEventId),
        eq(flowRuntimeEvents.ownerUserId, flowRuns.ownerUserId)
      )
    )
    .where(
      and(
        eq(flowRuns.id, command.resourceId),
        eq(flowRuns.ownerUserId, command.ownerUserId),
        eq(flowRuns.flowVersionId, token.flowVersionId)
      )
    )
    .limit(1)
    .for("update", { of: flowRuns });
  return run ?? null;
}

async function lockActiveWorkItemAfterRun(
  transaction: FlowTransaction,
  command: FlowRunCancellationCommand
): Promise<typeof flowWorkItems.$inferSelect | null> {
  const [workItem] = await transaction
    .select()
    .from(flowWorkItems)
    .where(
      and(
        eq(flowWorkItems.ownerUserId, command.ownerUserId),
        eq(flowWorkItems.flowRunId, command.resourceId),
        inArray(flowWorkItems.status, ["pending", "in_progress", "snoozed"])
      )
    )
    .limit(1)
    .for("update", { of: flowWorkItems });
  return workItem ?? null;
}

async function persistCanceledAttempt(
  transaction: FlowTransaction,
  token: FlowExecutionTokenRow,
  summary: ReturnType<typeof parseFlowRuntimeTraceSummary>,
  canceledAt: Date
): Promise<string> {
  if (
    !token.claimedAt ||
    !token.leaseOwner ||
    !token.leaseExpiresAt ||
    token.attemptCounter < 1n ||
    token.fencingToken < 1n
  ) {
    throw new FlowRuntimeCommandIntegrityError();
  }
  const [attempt] = await transaction
    .insert(flowExecutionAttempts)
    .values({
      ownerUserId: token.ownerUserId,
      flowRunId: token.flowRunId,
      tokenId: token.id,
      flowVersionId: token.flowVersionId,
      nodeId: token.nodeId,
      executorKey: token.executorKey,
      nodeActivationSequence: token.nodeActivationSequence,
      attemptNumber: token.attemptCounter,
      fencingToken: token.fencingToken,
      leaseOwner: token.leaseOwner,
      outcome: "canceled",
      resultCode: "FLOW_RUN_CANCELED",
      traceSummary: summary,
      startedAt: token.claimedAt,
      completedAt: canceledAt,
      createdAt: canceledAt
    })
    .returning({ id: flowExecutionAttempts.id });
  if (!attempt) throw new FlowRuntimeCommandIntegrityError();
  return attempt.id;
}

async function readPostLockDatabaseInstant(transaction: FlowTransaction): Promise<Date> {
  const result = await transaction.execute(
    sql<{ transitionEpochMs: string }>`
      select (extract(epoch from clock_timestamp()) * 1000)::text as "transitionEpochMs"
    `
  );
  const transitionAt = parseFlowDatabaseEpochMilliseconds(result.rows[0]?.transitionEpochMs);
  if (!transitionAt) {
    throw new FlowRuntimeCommandIntegrityError();
  }
  return transitionAt;
}

async function hasDurableCancellationEvent(
  transaction: FlowTransaction,
  command: FlowRunCancellationCommand,
  traceSequence: bigint
): Promise<boolean> {
  const [event] = await transaction
    .select({ id: flowRunEvents.id })
    .from(flowRunEvents)
    .innerJoin(flowRuntimeCommands, eq(flowRuntimeCommands.id, flowRunEvents.commandId))
    .where(
      and(
        eq(flowRunEvents.ownerUserId, command.ownerUserId),
        eq(flowRunEvents.flowRunId, command.resourceId),
        eq(flowRunEvents.sequence, traceSequence),
        eq(flowRunEvents.eventType, "run_canceled"),
        eq(flowRuntimeCommands.apiSurface, command.apiSurface),
        eq(flowRuntimeCommands.ownerUserId, command.ownerUserId),
        eq(flowRuntimeCommands.resourceId, command.resourceId),
        eq(flowRuntimeCommands.routeTemplate, command.routeTemplate),
        eq(flowRuntimeCommands.commandScope, command.scope),
        eq(flowRuntimeCommands.state, "succeeded")
      )
    )
    .orderBy(desc(flowRunEvents.sequence))
    .limit(1);
  return Boolean(event);
}

function isCancelableRuntime(run: LockedRun, token: FlowExecutionTokenRow): boolean {
  return (
    cancelableRunStatuses.includes(run.status as (typeof cancelableRunStatuses)[number]) &&
    (token.state === "runnable" ||
      token.state === "claimed" ||
      token.state === "retry_scheduled" ||
      token.state === "waiting_work_item")
  );
}

function hasCoherentCancellationWorkItem(
  token: FlowExecutionTokenRow,
  workItem: typeof flowWorkItems.$inferSelect | null
): boolean {
  if (token.state !== "waiting_work_item") return workItem === null;
  return (
    workItem !== null &&
    workItem.tokenId === token.id &&
    workItem.flowRunId === token.flowRunId &&
    workItem.flowVersionId === token.flowVersionId &&
    workItem.nodeId === token.nodeId &&
    workItem.nodeActivationSequence === token.nodeActivationSequence
  );
}

function hasValidCancellationRuntimeState(token: FlowExecutionTokenRow, canceledAt: Date): boolean {
  if (token.state !== "claimed") return true;
  return (
    token.claimedAt !== null &&
    token.leaseOwner !== null &&
    token.leaseExpiresAt !== null &&
    token.attemptCounter > 0n &&
    token.attemptCounter <= BigInt(token.maxAttempts) &&
    token.fencingToken >= token.attemptCounter &&
    token.claimedAt.getTime() <= token.leaseExpiresAt.getTime() &&
    token.claimedAt.getTime() <= canceledAt.getTime()
  );
}

function resolveValidPinnedExecutionNodeKind(
  run: LockedRun,
  token: FlowExecutionTokenRow
): FlowExecutableNodeKindV2 | null {
  if (run.graphSchemaVersion !== "flow-graph.v2") return null;
  try {
    return resolvePinnedFlowExecutionNode({
      flowVersionId: run.flowVersionId,
      nodeId: token.nodeId,
      nodeKind: token.nodeKind as FlowExecutableNodeKindV2,
      configSchemaVersion: token.configSchemaVersion,
      executorContractVersion: token.executorContractVersion,
      graph: run.graph,
      capabilityManifest: run.capabilityManifest
    }).kind;
  } catch {
    return null;
  }
}

async function replayPersistedCancellation(
  database: ElevenHouseDatabase,
  command: FlowRunCancellationCommand
): Promise<FlowRunCancellationCommandResult> {
  const [row] = await database
    .select({
      commandId: flowRuntimeCommands.id,
      commandScope: flowRuntimeCommands.commandScope,
      flowRunId: flowRuntimeCommands.flowRunId,
      requestHash: flowRuntimeCommands.requestHash,
      state: flowRuntimeCommands.state,
      replayExpired: sql<boolean>`${flowRuntimeCommands.replayUntil} <= transaction_timestamp()`,
      responseStatus: flowRuntimeCommandOutcomes.responseStatus,
      responseBody: flowRuntimeCommandOutcomes.responseBody
    })
    .from(flowRuntimeCommands)
    .leftJoin(
      flowRuntimeCommandOutcomes,
      eq(flowRuntimeCommandOutcomes.commandId, flowRuntimeCommands.id)
    )
    .where(commandIdentityPredicate(command))
    .limit(1);
  if (!row) throw new FlowRuntimeCommandIntegrityError();
  if (row.commandScope !== command.scope || row.requestHash !== command.requestHash) {
    throw new FlowRuntimeIdempotencyConflictError();
  }
  if (row.replayExpired) throw new FlowRuntimeIdempotencyExpiredError();
  if (!row.responseBody || row.responseStatus === null) {
    throw new FlowRuntimeCommandIntegrityError();
  }

  if (row.state === "succeeded" && row.responseStatus === 200) {
    const body = cancelFlowRunResponseSchema.safeParse(row.responseBody);
    if (body.success) {
      if (
        row.flowRunId === null ||
        body.data.run.id !== command.resourceId ||
        body.data.run.id !== row.flowRunId ||
        body.data.run.ownerUserId !== command.ownerUserId ||
        body.data.run.status !== "canceled" ||
        !(await hasExactCancellationEvent(database, {
          commandId: row.commandId,
          ownerUserId: command.ownerUserId,
          flowRunId: row.flowRunId
        }))
      ) {
        throw new FlowRuntimeCommandIntegrityError();
      }
      return {
        kind: "replayed",
        outcome: { kind: "succeeded", response: { statusCode: 200, body: body.data } }
      };
    }
  }
  if (row.state === "failed") {
    const response = flowRunCancellationRejectionResponseSchema.safeParse({
      statusCode: row.responseStatus,
      body: row.responseBody
    });
    if (response.success) {
      return { kind: "replayed", outcome: { kind: "rejected", response: response.data } };
    }
  }
  throw new FlowRuntimeCommandIntegrityError();
}

async function hasExactCancellationEvent(
  database: ElevenHouseDatabase,
  expected: {
    readonly commandId: string;
    readonly ownerUserId: string;
    readonly flowRunId: string;
  }
): Promise<boolean> {
  const events = await database
    .select({
      ownerUserId: flowRunEvents.ownerUserId,
      flowRunId: flowRunEvents.flowRunId,
      eventType: flowRunEvents.eventType,
      summary: flowRunEvents.summary
    })
    .from(flowRunEvents)
    .where(eq(flowRunEvents.commandId, expected.commandId))
    .limit(2);
  if (events.length !== 1) return false;

  const event = events[0]!;
  try {
    const trace = parseFlowRuntimeTraceSummary(event.summary);
    return (
      event.ownerUserId === expected.ownerUserId &&
      event.flowRunId === expected.flowRunId &&
      event.eventType === "run_canceled" &&
      trace.reasonCode === "FLOW_RUN_CANCELED_BY_OWNER" &&
      trace.resultCode === "FLOW_RUN_CANCELED"
    );
  } catch {
    return false;
  }
}

function commandIdentityPredicate(command: FlowRunCancellationCommand) {
  return and(
    eq(flowRuntimeCommands.apiSurface, command.apiSurface),
    eq(flowRuntimeCommands.actorUserId, command.actorUserId),
    eq(flowRuntimeCommands.ownerUserId, command.ownerUserId),
    eq(flowRuntimeCommands.routeTemplate, command.routeTemplate),
    eq(flowRuntimeCommands.resourceId, command.resourceId),
    eq(flowRuntimeCommands.idempotencyKey, command.idempotencyKey)
  );
}

function toRawRunResponse(run: LockedRun): FlowRunResponse {
  return {
    id: run.id,
    flowId: run.flowId,
    flowVersionId: run.flowVersionId,
    ownerUserId: run.ownerUserId,
    sourceEventId: run.sourceEventId,
    status: run.status as FlowRunStatus,
    snapshot: run.snapshot as FlowRunResponse["snapshot"],
    currentNodeId: run.currentNodeId,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null
  };
}

function toRunResponse(run: LockedRun): FlowRunResponse {
  return flowRunResponseSchema.parse(toRawRunResponse(run));
}

function succeededOutcome(run: FlowRunResponse): FlowRunCancellationCommandOutcome {
  return {
    kind: "succeeded",
    response: {
      statusCode: 200,
      body: cancelFlowRunResponseSchema.parse({ run })
    }
  };
}

function notFoundOutcome(): FlowRunCancellationCommandOutcome {
  return {
    kind: "rejected",
    response: { statusCode: 404, body: { code: "FLOW_RUN_NOT_FOUND" } }
  };
}

function executionUnavailableOutcome(): FlowRunCancellationCommandOutcome {
  return {
    kind: "rejected",
    response: { statusCode: 409, body: { code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" } }
  };
}

function cancelNotAllowedOutcome(status: string): FlowRunCancellationCommandOutcome {
  return {
    kind: "rejected",
    response: {
      statusCode: 409,
      body: { code: "FLOW_RUN_CANCEL_NOT_ALLOWED", status }
    }
  };
}

function isTerminalRunStatus(status: string): boolean {
  return terminalRunStatuses.includes(status as (typeof terminalRunStatuses)[number]);
}
