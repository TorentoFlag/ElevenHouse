import { and, asc, count, eq, lte, or, sql } from "drizzle-orm";

import {
  flowWorkItemMutationResponseSchema,
  flowWorkItemCommandRejectionResponseSchema,
  flowWorkItemSchema,
  listFlowWorkItemsResponseSchema,
  type FlowWorkItem,
  type FlowWorkItemQueueEntry,
  type ListFlowWorkItemsResponse
} from "@elevenhouse/contracts";
import {
  FlowExecutionIntegrityError,
  FlowRuntimeCommandBusyError,
  FlowRuntimeCommandIntegrityError,
  FlowRuntimeIdempotencyConflictError,
  FlowRuntimeIdempotencyExpiredError,
  formatFlowNodeExecutorKey,
  parseFlowRuntimeTraceSummary,
  resolveFlowWorkItemNodePolicy,
  resolvePinnedFlowExecutionAdvanceTarget,
  resolvePinnedFlowExecutionNode,
  type FlowWorkItemCommand,
  type FlowWorkItemCommandOutcome,
  type FlowWorkItemCommandResult,
  type FlowWorkItemStore
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import { clientProfiles } from "../../schema/clients";
import {
  flowExecutionTokens,
  flowBookingLifecycleHeads,
  flowRunEvents,
  flowRuns,
  flowRuntimeEvents,
  flowRuntimeCommandOutcomes,
  flowRuntimeCommands,
  flowVersions,
  flowWorkItems,
  flows
} from "../../schema/flows";
import { bookings } from "../../schema/scheduling";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";
import {
  projectFlowWorkItemQueueEntry,
  resolveFlowWorkItemBookingFreshness
} from "./flow-work-item-queue-projection";

type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type LockedToken = typeof flowExecutionTokens.$inferSelect;
type LockedWorkItem = typeof flowWorkItems.$inferSelect;
type FlowWorkItemRow = Pick<
  LockedWorkItem,
  | "id"
  | "flowRunId"
  | "flowVersionId"
  | "nodeId"
  | "status"
  | "taskKind"
  | "title"
  | "instructions"
  | "assigneeUserId"
  | "priority"
  | "dueAt"
  | "availableAt"
  | "snoozedUntil"
  | "revision"
  | "resultSummary"
  | "createdAt"
  | "updatedAt"
  | "startedAt"
  | "completedAt"
  | "completedByUserId"
  | "expiredAt"
  | "canceledAt"
>;
type FlowWorkItemQueueRow = FlowWorkItemRow & {
  readonly contextFlowId: string;
  readonly contextFlowCurrentName: string;
  readonly contextFlowVersionGraph: unknown;
  readonly contextFlowVersionCapabilityManifest: unknown;
  readonly contextTokenNodeKind: string;
  readonly contextTokenConfigSchemaVersion: number;
  readonly contextTokenExecutorContractVersion: number;
  readonly contextTokenExecutorKey: string;
  readonly contextRunSnapshot: unknown;
  readonly contextEventSubjectType: string;
  readonly contextEventSubjectId: string;
  readonly contextDuePolicyKind: string;
  readonly contextDueLeadTimeMinutes: number | null;
  readonly contextDueBookingLifecycleRevision: number | null;
  readonly contextBookingId: string | null;
  readonly contextBookingClientUserId: string | null;
  readonly contextBookingProductId: string | null;
  readonly contextBookingLifecycleRevision: number | null;
  readonly contextBookingState: string | null;
  readonly contextBookingStartAt: Date | null;
  readonly contextBookingEndAt: Date | null;
  readonly contextBookingTimeZoneSnapshot: string | null;
  readonly contextBookingProductTitleSnapshot: string | null;
  readonly contextLifecycleHeadBookingId: string | null;
  readonly contextLifecycleHeadAppliedRevision: number | null;
  readonly contextLifecycleHeadState: string | null;
  readonly contextLifecycleHeadStartAt: Date | null;
  readonly contextLifecycleHeadEndAt: Date | null;
  readonly contextLifecycleHeadTimeZone: string | null;
  readonly contextClientCurrentDisplayName: string | null;
};

type LockedRun = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly flowVersionId: string;
  readonly status: string;
  readonly currentNodeId: string | null;
  readonly traceSequence: bigint;
  readonly graphSchemaVersion: string | null;
  readonly snapshot: unknown;
  readonly graph: unknown;
  readonly capabilityManifest: unknown;
};

type WorkItemTarget = {
  readonly flowRunId: string;
  readonly flowVersionId: string;
  readonly tokenId: string;
  readonly bookingId: string | null;
};

type LockedBookingProjection = {
  readonly booking: typeof bookings.$inferSelect;
  readonly head: typeof flowBookingLifecycleHeads.$inferSelect | null;
};

type CommandAttempt =
  | { readonly kind: "created"; readonly result: FlowWorkItemCommandResult }
  | { readonly kind: "replay" };

const transactionTimestamp = sql`transaction_timestamp()`;
const replayUntil = sql`transaction_timestamp() + interval '24 hours'`;
const commandLockTimeout = "1000ms";
const commandStatementTimeout = "5000ms";
const activeWorkItemStatuses = ["pending", "in_progress", "snoozed"] as const;
const workItemStatusRank = sql`case ${flowWorkItems.status}
  when 'in_progress' then 0
  when 'pending' then 1
  when 'snoozed' then 2
  else 3
end`;
const workItemPriorityRank = sql`case ${flowWorkItems.priority}
  when 'urgent' then 0
  when 'high' then 1
  when 'normal' then 2
  when 'low' then 3
  else 4
end`;
const flowWorkItemQueueSelection = {
  id: flowWorkItems.id,
  flowRunId: flowWorkItems.flowRunId,
  flowVersionId: flowWorkItems.flowVersionId,
  nodeId: flowWorkItems.nodeId,
  status: flowWorkItems.status,
  taskKind: flowWorkItems.taskKind,
  title: flowWorkItems.title,
  instructions: flowWorkItems.instructions,
  assigneeUserId: flowWorkItems.assigneeUserId,
  priority: flowWorkItems.priority,
  dueAt: flowWorkItems.dueAt,
  availableAt: flowWorkItems.availableAt,
  snoozedUntil: flowWorkItems.snoozedUntil,
  revision: flowWorkItems.revision,
  resultSummary: flowWorkItems.resultSummary,
  createdAt: flowWorkItems.createdAt,
  updatedAt: flowWorkItems.updatedAt,
  startedAt: flowWorkItems.startedAt,
  completedAt: flowWorkItems.completedAt,
  completedByUserId: flowWorkItems.completedByUserId,
  expiredAt: flowWorkItems.expiredAt,
  canceledAt: flowWorkItems.canceledAt,
  contextFlowId: flowRuns.flowId,
  contextFlowCurrentName: flows.name,
  contextFlowVersionGraph: flowVersions.graph,
  contextFlowVersionCapabilityManifest: flowVersions.capabilityManifest,
  contextTokenNodeKind: flowExecutionTokens.nodeKind,
  contextTokenConfigSchemaVersion: flowExecutionTokens.configSchemaVersion,
  contextTokenExecutorContractVersion: flowExecutionTokens.executorContractVersion,
  contextTokenExecutorKey: flowExecutionTokens.executorKey,
  contextRunSnapshot: flowRuns.snapshot,
  contextEventSubjectType: flowRuntimeEvents.subjectType,
  contextEventSubjectId: flowRuntimeEvents.subjectId,
  contextDuePolicyKind: flowWorkItems.duePolicyKind,
  contextDueLeadTimeMinutes: flowWorkItems.dueLeadTimeMinutes,
  contextDueBookingLifecycleRevision: flowWorkItems.dueBookingLifecycleRevision,
  contextBookingId: bookings.id,
  contextBookingClientUserId: bookings.clientUserId,
  contextBookingProductId: bookings.productId,
  contextBookingLifecycleRevision: bookings.lifecycleRevision,
  contextBookingState: bookings.state,
  contextBookingStartAt: bookings.serviceStartAt,
  contextBookingEndAt: bookings.serviceEndAt,
  contextBookingTimeZoneSnapshot: bookings.timeZoneSnapshot,
  contextBookingProductTitleSnapshot: bookings.productTitleSnapshot,
  contextLifecycleHeadBookingId: flowBookingLifecycleHeads.bookingId,
  contextLifecycleHeadAppliedRevision: flowBookingLifecycleHeads.appliedRevision,
  contextLifecycleHeadState: flowBookingLifecycleHeads.state,
  contextLifecycleHeadStartAt: flowBookingLifecycleHeads.currentStartAt,
  contextLifecycleHeadEndAt: flowBookingLifecycleHeads.currentEndAt,
  contextLifecycleHeadTimeZone: flowBookingLifecycleHeads.currentTimeZone,
  contextClientCurrentDisplayName: clientProfiles.displayNameSnapshot
} as const;

export function createDrizzleFlowWorkItemStore(database: ElevenHouseDatabase): FlowWorkItemStore {
  return {
    list: (input) => listPersistedWorkItems(database, input),
    execute: ({ command }) => executePersistedWorkItemCommand(database, command)
  };
}

async function listPersistedWorkItems(
  database: ElevenHouseDatabase,
  input: Parameters<FlowWorkItemStore["list"]>[0]
): Promise<ListFlowWorkItemsResponse> {
  return database.transaction(
    async (transaction) => {
      const predicate = workItemListPredicate(input.ownerUserId, input.query.status);
      const rows = await transaction
        .select(flowWorkItemQueueSelection)
        .from(flowWorkItems)
        .innerJoin(
          flowRuns,
          and(
            eq(flowRuns.id, flowWorkItems.flowRunId),
            eq(flowRuns.flowVersionId, flowWorkItems.flowVersionId),
            eq(flowRuns.ownerUserId, flowWorkItems.ownerUserId)
          )
        )
        .innerJoin(
          flows,
          and(eq(flows.id, flowRuns.flowId), eq(flows.ownerUserId, flowRuns.ownerUserId))
        )
        .innerJoin(
          flowVersions,
          and(
            eq(flowVersions.id, flowWorkItems.flowVersionId),
            eq(flowVersions.flowId, flowRuns.flowId),
            eq(flowVersions.ownerUserId, flowWorkItems.ownerUserId)
          )
        )
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
          flowRuntimeEvents,
          and(
            eq(flowRuntimeEvents.id, flowRuns.runtimeEventId),
            eq(flowRuntimeEvents.ownerUserId, flowRuns.ownerUserId)
          )
        )
        .leftJoin(
          bookings,
          and(
            eq(flowRuntimeEvents.subjectType, "booking"),
            sql`${bookings.id}::text = ${flowRuntimeEvents.subjectId}`,
            eq(bookings.ownerUserId, flowWorkItems.ownerUserId)
          )
        )
        .leftJoin(
          flowBookingLifecycleHeads,
          and(
            eq(flowBookingLifecycleHeads.bookingId, bookings.id),
            eq(flowBookingLifecycleHeads.ownerUserId, flowWorkItems.ownerUserId)
          )
        )
        .leftJoin(
          clientProfiles,
          sql`${clientProfiles.userId}::text = case
            when ${flowRuntimeEvents.subjectType} = 'client' then ${flowRuntimeEvents.subjectId}
            else ${bookings.clientUserId}::text
          end`
        )
        .where(predicate)
        .orderBy(
          workItemStatusRank,
          workItemPriorityRank,
          sql`coalesce(${flowWorkItems.dueAt}, ${flowWorkItems.availableAt})`,
          asc(flowWorkItems.createdAt),
          asc(flowWorkItems.id)
        )
        .limit(input.query.limit)
        .offset(input.query.offset);
      const [totalRow] = await transaction
        .select({ total: count() })
        .from(flowWorkItems)
        .where(predicate);
      const asOf = await readQueueDatabaseInstant(transaction);

      return listFlowWorkItemsResponseSchema.parse({
        items: rows.map(toFlowWorkItemQueueEntry),
        total: totalRow?.total ?? 0,
        asOf: asOf.toISOString()
      });
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}

function workItemListPredicate(
  ownerUserId: string,
  status: Parameters<FlowWorkItemStore["list"]>[0]["query"]["status"]
) {
  const statusPredicate =
    status === "active"
      ? or(
          eq(flowWorkItems.status, "in_progress"),
          and(
            eq(flowWorkItems.status, "pending"),
            lte(flowWorkItems.availableAt, transactionTimestamp)
          ),
          and(
            eq(flowWorkItems.status, "snoozed"),
            lte(flowWorkItems.snoozedUntil, transactionTimestamp)
          )
        )
      : eq(flowWorkItems.status, status);
  return and(eq(flowWorkItems.ownerUserId, ownerUserId), statusPredicate);
}

function toFlowWorkItemQueueEntry(row: FlowWorkItemQueueRow): FlowWorkItemQueueEntry {
  const workItem = toFlowWorkItem(row);
  return projectFlowWorkItemQueueEntry({
    workItem,
    flow: { id: row.contextFlowId, currentName: row.contextFlowCurrentName },
    definition: {
      flowVersionId: workItem.flowVersionId,
      nodeId: workItem.nodeId,
      nodeKind: row.contextTokenNodeKind,
      configSchemaVersion: row.contextTokenConfigSchemaVersion,
      executorContractVersion: row.contextTokenExecutorContractVersion,
      executorKey: row.contextTokenExecutorKey,
      graph: row.contextFlowVersionGraph,
      capabilityManifest: row.contextFlowVersionCapabilityManifest
    },
    runSnapshot: row.contextRunSnapshot,
    event: {
      subjectType: row.contextEventSubjectType,
      subjectId: row.contextEventSubjectId
    },
    deadlineBasis: {
      duePolicyKind: row.contextDuePolicyKind,
      dueLeadTimeMinutes: row.contextDueLeadTimeMinutes,
      dueBookingLifecycleRevision: row.contextDueBookingLifecycleRevision
    },
    booking:
      row.contextBookingId === null ||
      row.contextBookingClientUserId === null ||
      row.contextBookingProductId === null ||
      row.contextBookingLifecycleRevision === null ||
      row.contextBookingState === null ||
      row.contextBookingStartAt === null ||
      row.contextBookingEndAt === null ||
      row.contextBookingTimeZoneSnapshot === null ||
      row.contextBookingProductTitleSnapshot === null
        ? null
        : {
            id: row.contextBookingId,
            clientUserId: row.contextBookingClientUserId,
            productId: row.contextBookingProductId,
            lifecycleRevision: row.contextBookingLifecycleRevision,
            state: row.contextBookingState,
            currentStartAt: row.contextBookingStartAt,
            currentEndAt: row.contextBookingEndAt,
            timeZoneSnapshot: row.contextBookingTimeZoneSnapshot,
            productTitleSnapshot: row.contextBookingProductTitleSnapshot
          },
    bookingLifecycleHead:
      row.contextLifecycleHeadBookingId === null ||
      row.contextLifecycleHeadAppliedRevision === null ||
      row.contextLifecycleHeadState === null
        ? null
        : {
            bookingId: row.contextLifecycleHeadBookingId,
            appliedRevision: row.contextLifecycleHeadAppliedRevision,
            state: row.contextLifecycleHeadState,
            currentStartAt: row.contextLifecycleHeadStartAt,
            currentEndAt: row.contextLifecycleHeadEndAt,
            currentTimeZone: row.contextLifecycleHeadTimeZone
          },
    clientCurrentDisplayName: row.contextClientCurrentDisplayName
  });
}

async function executePersistedWorkItemCommand(
  database: ElevenHouseDatabase,
  command: FlowWorkItemCommand
): Promise<FlowWorkItemCommandResult> {
  let attempt: CommandAttempt;
  try {
    attempt = await database.transaction<CommandAttempt>(async (transaction) => {
      await transaction.execute(sql`
        select
          set_config('lock_timeout', ${commandLockTimeout}, true),
          set_config('statement_timeout', ${commandStatementTimeout}, true)
      `);
      const target = await resolveOwnedWorkItemTarget(transaction, command);
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
        ? await applyLockedWorkItemCommand(transaction, command, inserted.id, target)
        : workItemNotFoundOutcome();
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

      return {
        kind: "created",
        result: { kind: "created", outcome }
      };
    });
  } catch (error) {
    if (isPostgresCommandTimeout(error)) throw new FlowRuntimeCommandBusyError();
    throw error;
  }

  return attempt.kind === "created" ? attempt.result : replayPersistedCommand(database, command);
}

async function resolveOwnedWorkItemTarget(
  transaction: FlowTransaction,
  command: FlowWorkItemCommand
): Promise<WorkItemTarget | null> {
  const [row] = await transaction
    .select({
      flowRunId: flowWorkItems.flowRunId,
      flowVersionId: flowWorkItems.flowVersionId,
      tokenId: flowWorkItems.tokenId,
      runtimeEventSource: flowRuntimeEvents.source,
      runtimeEventSubjectType: flowRuntimeEvents.subjectType,
      runtimeEventSubjectId: flowRuntimeEvents.subjectId
    })
    .from(flowWorkItems)
    .innerJoin(
      flowRuns,
      and(
        eq(flowRuns.id, flowWorkItems.flowRunId),
        eq(flowRuns.flowVersionId, flowWorkItems.flowVersionId),
        eq(flowRuns.ownerUserId, flowWorkItems.ownerUserId)
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
        eq(flowWorkItems.id, command.resourceId),
        eq(flowWorkItems.ownerUserId, command.ownerUserId)
      )
    )
    .limit(1);
  if (!row) return null;
  return {
    flowRunId: row.flowRunId,
    flowVersionId: row.flowVersionId,
    tokenId: row.tokenId,
    bookingId:
      row.runtimeEventSource === "booking" && row.runtimeEventSubjectType === "booking"
        ? row.runtimeEventSubjectId
        : null
  };
}

async function applyLockedWorkItemCommand(
  transaction: FlowTransaction,
  command: FlowWorkItemCommand,
  commandId: string,
  target: WorkItemTarget
): Promise<FlowWorkItemCommandOutcome> {
  const bookingProjection =
    target.bookingId === null ? null : await lockBookingProjection(transaction, command, target);
  if (target.bookingId !== null && !bookingProjection) return runtimeUnavailableOutcome();

  const token = await lockToken(transaction, command, target);
  const run = token ? await lockRun(transaction, command, target) : null;
  const workItem = run ? await lockWorkItem(transaction, command) : null;
  if (!token || !run || !workItem) return runtimeUnavailableOutcome();

  const expectedRevision = command.request.body.expectedRevision;
  if (
    !activeWorkItemStatuses.includes(workItem.status as (typeof activeWorkItemStatuses)[number])
  ) {
    if (workItem.revision !== expectedRevision) {
      return revisionConflictOutcome(workItem.revision);
    }
    if (
      bookingProjection &&
      command.request.body.expectedBookingLifecycleRevision !==
        bookingProjection.booking.lifecycleRevision
    ) {
      return bookingContextChangedOutcome(bookingProjection.booking.lifecycleRevision);
    }
    if (!bookingProjection && command.request.body.expectedBookingLifecycleRevision !== undefined) {
      return runtimeUnavailableOutcome();
    }
    return transitionNotAllowedOutcome(workItem.status);
  }

  const nodePolicy = resolveLockedWorkItemNodePolicy(token, run, target);
  if (!nodePolicy) return runtimeUnavailableOutcome();
  if (bookingProjection) {
    const freshness = resolveFlowWorkItemBookingFreshness({
      workItem: {
        status: workItem.status as FlowWorkItem["status"],
        dueAt: workItem.dueAt?.toISOString() ?? null
      },
      runSnapshot: run.snapshot,
      deadlineBasis: {
        duePolicyKind: workItem.duePolicyKind,
        dueLeadTimeMinutes: workItem.dueLeadTimeMinutes,
        dueBookingLifecycleRevision: workItem.dueBookingLifecycleRevision
      },
      duePolicy: nodePolicy.duePolicy,
      booking: {
        id: bookingProjection.booking.id,
        clientUserId: bookingProjection.booking.clientUserId,
        productId: bookingProjection.booking.productId,
        lifecycleRevision: bookingProjection.booking.lifecycleRevision,
        state: bookingProjection.booking.state,
        currentStartAt: bookingProjection.booking.serviceStartAt,
        currentEndAt: bookingProjection.booking.serviceEndAt,
        timeZoneSnapshot: bookingProjection.booking.timeZoneSnapshot,
        productTitleSnapshot: bookingProjection.booking.productTitleSnapshot
      },
      bookingLifecycleHead: bookingProjection.head
        ? {
            bookingId: bookingProjection.head.bookingId,
            appliedRevision: bookingProjection.head.appliedRevision,
            state: bookingProjection.head.state,
            currentStartAt: bookingProjection.head.currentStartAt,
            currentEndAt: bookingProjection.head.currentEndAt,
            currentTimeZone: bookingProjection.head.currentTimeZone
          }
        : null
    });
    if (freshness.kind === "pending") return bookingContextPendingOutcome(freshness);
    if (freshness.kind === "integrity_error") throw new FlowRuntimeCommandIntegrityError();
    if (command.request.body.expectedBookingLifecycleRevision !== freshness.lifecycleRevision) {
      return bookingContextChangedOutcome(freshness.lifecycleRevision);
    }
  } else if (command.request.body.expectedBookingLifecycleRevision !== undefined) {
    return runtimeUnavailableOutcome();
  }

  if (workItem.revision !== expectedRevision) {
    return revisionConflictOutcome(workItem.revision);
  }
  if (!isCoherentWaitingRuntime(workItem, token, run, target)) {
    return runtimeUnavailableOutcome();
  }

  const now = await readPostLockDatabaseInstant(transaction);
  if (command.scope === "flows.work-items.start.v1") {
    if (workItem.status !== "pending") {
      return transitionNotAllowedOutcome(workItem.status);
    }
    const [started] = await transaction
      .update(flowWorkItems)
      .set({
        status: "in_progress",
        snoozedUntil: null,
        startedAt: workItem.startedAt ?? now,
        revision: workItem.revision + 1,
        lastCommandId: commandId,
        lastRunEventId: null,
        updatedAt: now
      })
      .where(workItemCasPredicate(workItem, command))
      .returning();
    if (!started) throw new FlowRuntimeCommandIntegrityError();
    return succeededOutcome(toFlowWorkItem(started));
  }

  if (command.scope === "flows.work-items.snooze.v1") {
    const snoozedUntil = new Date(command.request.body.snoozedUntil);
    if (snoozedUntil <= now) return snoozeNotFutureOutcome();
    const [snoozed] = await transaction
      .update(flowWorkItems)
      .set({
        status: "snoozed",
        availableAt: snoozedUntil,
        snoozedUntil,
        revision: workItem.revision + 1,
        lastCommandId: commandId,
        lastRunEventId: null,
        updatedAt: now
      })
      .where(workItemCasPredicate(workItem, command))
      .returning();
    if (!snoozed) throw new FlowRuntimeCommandIntegrityError();
    return succeededOutcome(toFlowWorkItem(snoozed));
  }

  if (workItem.status !== "in_progress") {
    return transitionNotAllowedOutcome(workItem.status);
  }

  return completeLockedWorkItem(transaction, command, commandId, target, token, run, workItem, now);
}

async function completeLockedWorkItem(
  transaction: FlowTransaction,
  command: Extract<FlowWorkItemCommand, { readonly scope: "flows.work-items.complete.v1" }>,
  commandId: string,
  target: WorkItemTarget,
  token: LockedToken,
  run: LockedRun,
  workItem: LockedWorkItem,
  completedAt: Date
): Promise<FlowWorkItemCommandOutcome> {
  let advanceTarget;
  try {
    const pinnedNode = resolvePinnedFlowExecutionNode({
      flowVersionId: target.flowVersionId,
      nodeId: token.nodeId,
      nodeKind: token.nodeKind as "astrologer_work_item",
      configSchemaVersion: token.configSchemaVersion,
      executorContractVersion: token.executorContractVersion,
      graph: run.graph,
      capabilityManifest: run.capabilityManifest
    });
    if (
      pinnedNode.kind !== "astrologer_work_item" ||
      token.executorKey !== formatFlowNodeExecutorKey(pinnedNode)
    ) {
      return runtimeUnavailableOutcome();
    }
    if (
      resolveFlowWorkItemNodePolicy(pinnedNode).completionRequirements.resultSummary ===
        "required" &&
      command.request.body.resultSummary === undefined
    ) {
      return resultSummaryRequiredOutcome();
    }
    advanceTarget = resolvePinnedFlowExecutionAdvanceTarget({
      definition: {
        flowVersionId: target.flowVersionId,
        nodeId: token.nodeId,
        nodeKind: token.nodeKind as "astrologer_work_item",
        configSchemaVersion: token.configSchemaVersion,
        executorContractVersion: token.executorContractVersion,
        graph: run.graph,
        capabilityManifest: run.capabilityManifest
      },
      sourceHandle: "success"
    });
  } catch (error) {
    if (error instanceof FlowExecutionIntegrityError) return runtimeUnavailableOutcome();
    throw error;
  }

  const trace = parseFlowRuntimeTraceSummary({
    schemaVersion: "flow-runtime-trace.v1",
    outcome: "advanced",
    nodeKind: "astrologer_work_item",
    reasonCode: "FLOW_WORK_ITEM_COMPLETED",
    resultCode: "FLOW_TOKEN_ADVANCED",
    sourceHandle: "success",
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
      availableAt: completedAt,
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
      updatedAt: completedAt
    })
    .where(
      and(
        eq(flowExecutionTokens.id, token.id),
        eq(flowExecutionTokens.ownerUserId, command.ownerUserId),
        eq(flowExecutionTokens.flowRunId, target.flowRunId),
        eq(flowExecutionTokens.flowVersionId, target.flowVersionId),
        eq(flowExecutionTokens.state, "waiting_work_item"),
        eq(flowExecutionTokens.nodeActivationSequence, token.nodeActivationSequence),
        eq(flowExecutionTokens.fencingToken, token.fencingToken)
      )
    )
    .returning({ id: flowExecutionTokens.id });
  if (!resumedToken) throw new FlowRuntimeCommandIntegrityError();

  const [resumedRun] = await transaction
    .update(flowRuns)
    .set({
      status: "running",
      currentNodeId: advanceTarget.node.id,
      traceSequence: run.traceSequence + 1n,
      updatedAt: completedAt
    })
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

  const [completedWorkItem] = await transaction
    .update(flowWorkItems)
    .set({
      status: "completed",
      snoozedUntil: null,
      startedAt: workItem.startedAt ?? completedAt,
      completedAt,
      completedByUserId: command.actorUserId,
      resultSummary: command.request.body.resultSummary ?? null,
      revision: workItem.revision + 1,
      lastCommandId: commandId,
      lastRunEventId: null,
      updatedAt: completedAt
    })
    .where(workItemCasPredicate(workItem, command))
    .returning();
  if (!completedWorkItem) throw new FlowRuntimeCommandIntegrityError();

  await transaction.insert(flowRunEvents).values({
    ownerUserId: command.ownerUserId,
    flowRunId: target.flowRunId,
    sequence: resumedRun.traceSequence,
    eventType: "token_advanced",
    nodeId: workItem.nodeId,
    attemptId: null,
    commandId,
    summary: trace,
    occurredAt: completedAt
  });

  return succeededOutcome(toFlowWorkItem(completedWorkItem));
}

async function lockBookingProjection(
  transaction: FlowTransaction,
  command: FlowWorkItemCommand,
  target: WorkItemTarget
): Promise<LockedBookingProjection | null> {
  if (target.bookingId === null) return null;
  await transaction.execute(sql`
    select pg_advisory_xact_lock(
      hashtextextended('flow-booking-lifecycle:' || ${target.bookingId}, 0)
    )
  `);
  const [booking] = await transaction
    .select()
    .from(bookings)
    .where(
      and(
        sql`${bookings.id}::text = ${target.bookingId}`,
        eq(bookings.ownerUserId, command.ownerUserId)
      )
    )
    .limit(1)
    .for("share", { of: bookings });
  if (!booking) return null;

  const [head] = await transaction
    .select()
    .from(flowBookingLifecycleHeads)
    .where(
      and(
        eq(flowBookingLifecycleHeads.bookingId, booking.id),
        eq(flowBookingLifecycleHeads.ownerUserId, command.ownerUserId)
      )
    )
    .limit(1)
    .for("share", { of: flowBookingLifecycleHeads });
  return { booking, head: head ?? null };
}

function resolveLockedWorkItemNodePolicy(
  token: LockedToken,
  run: LockedRun,
  target: WorkItemTarget
): ReturnType<typeof resolveFlowWorkItemNodePolicy> | null {
  try {
    const node = resolvePinnedFlowExecutionNode({
      flowVersionId: target.flowVersionId,
      nodeId: token.nodeId,
      nodeKind: token.nodeKind as "astrologer_work_item",
      configSchemaVersion: token.configSchemaVersion,
      executorContractVersion: token.executorContractVersion,
      graph: run.graph,
      capabilityManifest: run.capabilityManifest
    });
    if (
      node.kind !== "astrologer_work_item" ||
      token.executorKey !== formatFlowNodeExecutorKey(node)
    ) {
      return null;
    }
    return resolveFlowWorkItemNodePolicy(node);
  } catch (error) {
    if (error instanceof FlowExecutionIntegrityError) return null;
    throw error;
  }
}

async function lockToken(
  transaction: FlowTransaction,
  command: FlowWorkItemCommand,
  target: WorkItemTarget
): Promise<LockedToken | null> {
  const [token] = await transaction
    .select()
    .from(flowExecutionTokens)
    .where(
      and(
        eq(flowExecutionTokens.id, target.tokenId),
        eq(flowExecutionTokens.ownerUserId, command.ownerUserId),
        eq(flowExecutionTokens.flowRunId, target.flowRunId),
        eq(flowExecutionTokens.flowVersionId, target.flowVersionId)
      )
    )
    .limit(1)
    .for("update", { of: flowExecutionTokens });
  return token ?? null;
}

async function lockRun(
  transaction: FlowTransaction,
  command: FlowWorkItemCommand,
  target: WorkItemTarget
): Promise<LockedRun | null> {
  const [run] = await transaction
    .select({
      id: flowRuns.id,
      ownerUserId: flowRuns.ownerUserId,
      flowVersionId: flowRuns.flowVersionId,
      status: flowRuns.status,
      currentNodeId: flowRuns.currentNodeId,
      traceSequence: flowRuns.traceSequence,
      graphSchemaVersion: flowVersions.graphSchemaVersion,
      snapshot: flowRuns.snapshot,
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
        eq(flowRuns.id, target.flowRunId),
        eq(flowRuns.ownerUserId, command.ownerUserId),
        eq(flowRuns.flowVersionId, target.flowVersionId)
      )
    )
    .limit(1)
    .for("update", { of: flowRuns });
  return run ?? null;
}

async function lockWorkItem(
  transaction: FlowTransaction,
  command: FlowWorkItemCommand
): Promise<LockedWorkItem | null> {
  const [workItem] = await transaction
    .select()
    .from(flowWorkItems)
    .where(
      and(
        eq(flowWorkItems.id, command.resourceId),
        eq(flowWorkItems.ownerUserId, command.ownerUserId)
      )
    )
    .limit(1)
    .for("update", { of: flowWorkItems });
  return workItem ?? null;
}

function isCoherentWaitingRuntime(
  workItem: LockedWorkItem,
  token: LockedToken,
  run: LockedRun,
  target: WorkItemTarget
): boolean {
  return (
    run.graphSchemaVersion === "flow-graph.v2" &&
    run.status === "waiting" &&
    run.currentNodeId === workItem.nodeId &&
    token.state === "waiting_work_item" &&
    token.nodeKind === "astrologer_work_item" &&
    token.nodeId === workItem.nodeId &&
    token.nodeActivationSequence === workItem.nodeActivationSequence &&
    token.id === workItem.tokenId &&
    token.id === target.tokenId &&
    workItem.flowRunId === target.flowRunId &&
    workItem.flowVersionId === target.flowVersionId &&
    workItem.assigneeUserId === workItem.ownerUserId
  );
}

function workItemCasPredicate(workItem: LockedWorkItem, command: FlowWorkItemCommand) {
  return and(
    eq(flowWorkItems.id, workItem.id),
    eq(flowWorkItems.ownerUserId, command.ownerUserId),
    eq(flowWorkItems.flowRunId, workItem.flowRunId),
    eq(flowWorkItems.tokenId, workItem.tokenId),
    eq(flowWorkItems.nodeActivationSequence, workItem.nodeActivationSequence),
    eq(flowWorkItems.revision, workItem.revision),
    eq(flowWorkItems.status, workItem.status)
  );
}

async function replayPersistedCommand(
  database: ElevenHouseDatabase,
  command: FlowWorkItemCommand
): Promise<FlowWorkItemCommandResult> {
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
  if (!row.responseBody || row.responseStatus === null)
    throw new FlowRuntimeCommandIntegrityError();

  if (row.state === "succeeded" && row.responseStatus === 200) {
    const body = flowWorkItemMutationResponseSchema.safeParse(row.responseBody);
    if (body.success) {
      if (
        body.data.workItem.id !== command.resourceId ||
        row.flowRunId === null ||
        body.data.workItem.flowRunId !== row.flowRunId ||
        (command.scope === "flows.work-items.complete.v1" &&
          !(await hasDurableWorkItemCompletionEvent(database, {
            commandId: row.commandId,
            ownerUserId: command.ownerUserId,
            flowRunId: row.flowRunId,
            nodeId: body.data.workItem.nodeId
          })))
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
    const response = flowWorkItemCommandRejectionResponseSchema.safeParse({
      statusCode: row.responseStatus,
      body: row.responseBody
    });
    if (response.success) {
      return { kind: "replayed", outcome: { kind: "rejected", response: response.data } };
    }
  }
  throw new FlowRuntimeCommandIntegrityError();
}

async function hasDurableWorkItemCompletionEvent(
  database: ElevenHouseDatabase,
  expected: {
    readonly commandId: string;
    readonly ownerUserId: string;
    readonly flowRunId: string;
    readonly nodeId: string;
  }
): Promise<boolean> {
  const events = await database
    .select({
      ownerUserId: flowRunEvents.ownerUserId,
      flowRunId: flowRunEvents.flowRunId,
      eventType: flowRunEvents.eventType,
      nodeId: flowRunEvents.nodeId,
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
      event.eventType === "token_advanced" &&
      event.nodeId === expected.nodeId &&
      trace.reasonCode === "FLOW_WORK_ITEM_COMPLETED" &&
      trace.resultCode === "FLOW_TOKEN_ADVANCED"
    );
  } catch {
    return false;
  }
}

function commandIdentityPredicate(command: FlowWorkItemCommand) {
  return and(
    eq(flowRuntimeCommands.apiSurface, command.apiSurface),
    eq(flowRuntimeCommands.actorUserId, command.actorUserId),
    eq(flowRuntimeCommands.ownerUserId, command.ownerUserId),
    eq(flowRuntimeCommands.routeTemplate, command.routeTemplate),
    eq(flowRuntimeCommands.resourceId, command.resourceId),
    eq(flowRuntimeCommands.idempotencyKey, command.idempotencyKey)
  );
}

async function readPostLockDatabaseInstant(transaction: FlowTransaction): Promise<Date> {
  const result = await transaction.execute<{ now_epoch_ms: string }>(sql`
    select (extract(epoch from clock_timestamp()) * 1000)::text as now_epoch_ms
  `);
  const value = result.rows[0]?.now_epoch_ms;
  const parsed = value ? parseFlowDatabaseEpochMilliseconds(value) : null;
  if (!parsed) throw new FlowRuntimeCommandIntegrityError();
  return parsed;
}

async function readQueueDatabaseInstant(transaction: FlowTransaction): Promise<Date> {
  const result = await transaction.execute<{ as_of_epoch_ms: string }>(sql`
    select (extract(epoch from transaction_timestamp()) * 1000)::text as as_of_epoch_ms
  `);
  const value = result.rows[0]?.as_of_epoch_ms;
  const parsed = value ? parseFlowDatabaseEpochMilliseconds(value) : null;
  if (!parsed) throw new TypeError("Flow work-item queue database clock is unavailable");
  return parsed;
}

function toFlowWorkItem(row: FlowWorkItemRow): FlowWorkItem {
  return flowWorkItemSchema.parse({
    id: row.id,
    flowRunId: row.flowRunId,
    flowVersionId: row.flowVersionId,
    nodeId: row.nodeId,
    status: row.status,
    taskKind: row.taskKind,
    title: row.title,
    instructions: row.instructions,
    assigneeUserId: row.assigneeUserId,
    priority: row.priority,
    dueAt: row.dueAt?.toISOString() ?? null,
    availableAt: row.availableAt.toISOString(),
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    revision: row.revision,
    resultSummary: row.resultSummary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedByUserId: row.completedByUserId,
    expiredAt: row.expiredAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null
  });
}

function succeededOutcome(workItem: FlowWorkItem): FlowWorkItemCommandOutcome {
  return {
    kind: "succeeded",
    response: {
      statusCode: 200,
      body: flowWorkItemMutationResponseSchema.parse({ workItem })
    }
  };
}

function workItemNotFoundOutcome(): FlowWorkItemCommandOutcome {
  return {
    kind: "rejected",
    response: { statusCode: 404, body: { code: "FLOW_WORK_ITEM_NOT_FOUND" } }
  };
}

function revisionConflictOutcome(currentRevision: number): FlowWorkItemCommandOutcome {
  return {
    kind: "rejected",
    response: {
      statusCode: 409,
      body: { code: "FLOW_WORK_ITEM_REVISION_CONFLICT", currentRevision }
    }
  };
}

function transitionNotAllowedOutcome(status: string): FlowWorkItemCommandOutcome {
  return {
    kind: "rejected",
    response: {
      statusCode: 409,
      body: { code: "FLOW_WORK_ITEM_TRANSITION_NOT_ALLOWED", status }
    }
  };
}

function snoozeNotFutureOutcome(): FlowWorkItemCommandOutcome {
  return {
    kind: "rejected",
    response: { statusCode: 409, body: { code: "FLOW_WORK_ITEM_SNOOZE_NOT_FUTURE" } }
  };
}

function resultSummaryRequiredOutcome(): FlowWorkItemCommandOutcome {
  return {
    kind: "rejected",
    response: {
      statusCode: 409,
      body: { code: "FLOW_WORK_ITEM_RESULT_SUMMARY_REQUIRED" }
    }
  };
}

function bookingContextPendingOutcome(input: {
  readonly bookingId: string;
  readonly appliedRevision: number;
  readonly aggregateRevision: number;
}): FlowWorkItemCommandOutcome {
  return {
    kind: "rejected",
    response: {
      statusCode: 409,
      body: {
        code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
        bookingId: input.bookingId,
        appliedRevision: input.appliedRevision,
        aggregateRevision: input.aggregateRevision
      }
    }
  };
}

function bookingContextChangedOutcome(
  currentBookingLifecycleRevision: number
): FlowWorkItemCommandOutcome {
  return {
    kind: "rejected",
    response: {
      statusCode: 409,
      body: {
        code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_CHANGED",
        currentBookingLifecycleRevision
      }
    }
  };
}

function runtimeUnavailableOutcome(): FlowWorkItemCommandOutcome {
  return {
    kind: "rejected",
    response: { statusCode: 409, body: { code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" } }
  };
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
