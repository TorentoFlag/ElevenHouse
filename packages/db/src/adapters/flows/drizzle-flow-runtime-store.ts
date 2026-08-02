import { and, count, desc, eq, notInArray, sql, type SQL } from "drizzle-orm";
import type {
  FlowApproval,
  FlowApprovalKind,
  FlowApprovalStatus,
  FlowRuntimeEvent,
  FlowRuntimeEventSource,
  FlowRunResponse,
  FlowRunSnapshot,
  FlowRunStatus,
  FlowRunSubjectType,
  FlowStepRunResponse,
  FlowStepRunStatus
} from "@elevenhouse/contracts";
import type {
  CreateFlowRunForEventDedupeInput,
  CreateFlowRunForEventDedupeResult,
  CreateFlowDeliveryAttemptInput,
  CreateFlowSuppressionInput,
  CreateFlowRunInput,
  FlowRuntimeStore,
  FlowSuppressionRecord
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowApprovals,
  flowDeliveryAttempts,
  flowRuntimeEvents,
  flowRuns,
  flowStepRuns,
  flowSuppressions
} from "../../schema";

type FlowRuntimeEventRow = typeof flowRuntimeEvents.$inferSelect;
type FlowRunRow = typeof flowRuns.$inferSelect;
type FlowStepRunRow = typeof flowStepRuns.$inferSelect;
type FlowApprovalRow = typeof flowApprovals.$inferSelect;
type FlowSuppressionRow = typeof flowSuppressions.$inferSelect;
type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type FlowDatabase = ElevenHouseDatabase | FlowTransaction;

type FlowRunSelection = FlowRunRow & {
  readonly sourceEventId: string;
};

const terminalFlowRunStatuses: FlowRunStatus[] = [
  "completed",
  "skipped",
  "failed_terminal",
  "suppressed",
  "expired",
  "canceled"
];

export function createDrizzleFlowRuntimeStore(database: ElevenHouseDatabase): FlowRuntimeStore {
  return {
    createEvent: async (input) => {
      return createOrFindEvent(database, input);
    },
    findEventByDedupeKey: async (input) => {
      const [row] = await database
        .select()
        .from(flowRuntimeEvents)
        .where(
          and(
            eq(flowRuntimeEvents.ownerUserId, input.ownerUserId),
            eq(flowRuntimeEvents.dedupeKey, input.dedupeKey)
          )
        )
        .limit(1);
      return row ? toRuntimeEventRecord(row) : null;
    },
    findRunByEventAndFlow: async (input) => {
      const [row] = await selectRunRows(database, [
        eq(flowRuns.ownerUserId, input.ownerUserId),
        eq(flowRuns.flowId, input.flowId),
        eq(flowRuns.runtimeEventId, input.runtimeEventId)
      ]).limit(1);
      return row ? toRunRecord(row) : null;
    },
    findRunById: async (input) => {
      const row = await findRunSelectionById(database, input);
      return row ? toRunRecord(row) : null;
    },
    cancelRun: async (input) => database.transaction(async (transaction) => {
      const now = new Date(input.now);
      const [updated] = await transaction
        .update(flowRuns)
        .set({
          status: "canceled",
          currentNodeId: null,
          updatedAt: now,
          completedAt: now
        })
        .where(
          and(
            eq(flowRuns.ownerUserId, input.ownerUserId),
            eq(flowRuns.id, input.runId),
            notInArray(flowRuns.status, terminalFlowRunStatuses)
          )
        )
        .returning({ id: flowRuns.id });
      if (!updated) return null;

      await transaction
        .update(flowApprovals)
        .set({
          status: "expired",
          decisionNote: "Flow run canceled",
          decidedAt: now,
          snoozedUntil: null
        })
        .where(
          and(
            eq(flowApprovals.ownerUserId, input.ownerUserId),
            eq(flowApprovals.flowRunId, input.runId),
            eq(flowApprovals.status, "pending")
          )
        )
        .returning({ id: flowApprovals.id });

      const row = await findRunSelectionById(transaction, input);
      return row ? toRunRecord(row) : null;
    }),
    createRun: async (input) =>
      database.transaction(async (transaction) => createRunInTransaction(transaction, input)),
    createRunForEventDedupe: async (input) =>
      database.transaction(async (transaction) => createRunForEventDedupeInTransaction(transaction, input)),
    createSuppression: async (input) => {
      return createOrFindSuppression(database, input);
    },
    findSuppressionByRun: async (input) => {
      const suppression = await findSuppressionByRun(database, input);
      return suppression ? toSuppressionRecord(suppression) : null;
    },
    createDeliveryAttempt: async (input) => {
      assertDeliveryAttemptInput(input);
      await database
        .insert(flowDeliveryAttempts)
        .values({
          ownerUserId: input.ownerUserId,
          flowRunId: input.flowRunId,
          flowStepRunId: input.flowStepRunId,
          idempotencyKey: input.idempotencyKey,
          attemptNumber: input.attemptNumber,
          provider: input.provider ?? null,
          status: input.status,
          providerRequestPayload: input.providerRequestPayload ?? null,
          providerResponsePayload: input.providerResponsePayload ?? null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          attemptedAt: input.attemptedAt ? new Date(input.attemptedAt) : null,
          createdAt: new Date(input.createdAt)
        })
        .returning();
    },
    listRuns: async (input) => {
      const conditions = [
        eq(flowRuns.ownerUserId, input.ownerUserId),
        input.flowId ? eq(flowRuns.flowId, input.flowId) : undefined,
        input.status === "all" ? undefined : eq(flowRuns.status, input.status)
      ].filter((condition): condition is SQL => condition !== undefined);
      const where = and(...conditions);
      const rows = await selectRunRows(database, conditions)
        .orderBy(desc(flowRuns.updatedAt), desc(flowRuns.id))
        .limit(input.limit)
        .offset(input.offset);
      const [totalRow] = await database.select({ value: count() }).from(flowRuns).where(where);
      return {
        runs: rows.map(toRunRecord),
        total: Number(totalRow?.value ?? 0)
      };
    },
    listApprovals: async (input) => {
      const conditions = [
        eq(flowApprovals.ownerUserId, input.ownerUserId),
        input.status === "all" ? undefined : eq(flowApprovals.status, input.status)
      ].filter((condition): condition is SQL => condition !== undefined);
      const where = and(...conditions);
      const rows = await database
        .select()
        .from(flowApprovals)
        .where(where)
        .orderBy(desc(flowApprovals.createdAt), desc(flowApprovals.id))
        .limit(input.limit)
        .offset(input.offset);
      const [totalRow] = await database.select({ value: count() }).from(flowApprovals).where(where);
      return {
        approvals: rows.map(toApprovalRecord),
        total: Number(totalRow?.value ?? 0)
      };
    },
    decideApproval: async (input) => {
      const decidedAt = new Date(input.now);
      const [row] = await database
        .update(flowApprovals)
        .set({
          status: input.decision,
          decisionNote: input.note ?? null,
          decidedByUserId: input.decidedByUserId,
          decidedAt,
          snoozedUntil:
            input.decision === "snoozed"
              ? new Date(input.snoozedUntil ?? decidedAt.getTime() + 24 * 60 * 60 * 1000)
              : null
        })
        .where(
          and(
            eq(flowApprovals.ownerUserId, input.ownerUserId),
            eq(flowApprovals.id, input.approvalId),
            eq(flowApprovals.status, "pending"),
            flowApprovalParentRunIsNonTerminal()
          )
        )
        .returning();
      return row ? toApprovalRecord(row) : null;
    }
  };
}

function flowApprovalParentRunIsNonTerminal(): SQL {
  const terminalStatuses = sql.join(
    terminalFlowRunStatuses.map((status) => sql`${status}`),
    sql`, `
  );

  return sql`exists (
    select 1 from ${flowRuns}
    where ${flowRuns.id} = ${flowApprovals.flowRunId}
      and ${flowRuns.ownerUserId} = ${flowApprovals.ownerUserId}
      and ${flowRuns.status} not in (${terminalStatuses})
  )`;
}

async function createRunInTransaction(transaction: FlowTransaction, input: CreateFlowRunInput) {
  const runRow = await insertFlowRun(transaction, input);
  if (!runRow) {
    throw new Error("Expected flow_runs insert to return a row");
  }
  return createRunChildren(transaction, input, runRow, input.sourceEventId);
}

async function createRunForEventDedupeInTransaction(
  transaction: FlowTransaction,
  input: CreateFlowRunForEventDedupeInput
): Promise<CreateFlowRunForEventDedupeResult> {
  const event = await createOrFindEvent(transaction, input.event);
  const existingRun = await findRunSelection(transaction, {
    ownerUserId: input.event.ownerUserId,
    flowId: input.run.flowId,
    runtimeEventId: event.id
  });
  if (existingRun) {
    const suppression = await findSuppressionRecordForRun(transaction, existingRun);
    return {
      status: "duplicate",
      event,
      run: toRunRecord(existingRun),
      stepRuns: [],
      approvals: [],
      suppression
    };
  }

  const runInput = {
    ...input.run,
    ownerUserId: input.event.ownerUserId,
    runtimeEventId: event.id,
    sourceEventId: event.sourceEventId
  };
  const runRow = await insertFlowRun(transaction, runInput, true);
  if (!runRow) {
    const duplicateRun = await findRunSelection(transaction, {
      ownerUserId: input.event.ownerUserId,
      flowId: input.run.flowId,
      runtimeEventId: event.id
    });
    if (!duplicateRun) {
      throw new Error("Flow run conflict did not return an existing run.");
    }
    const suppression = await findSuppressionRecordForRun(transaction, duplicateRun);
    return {
      status: "duplicate",
      event,
      run: toRunRecord(duplicateRun),
      stepRuns: [],
      approvals: [],
      suppression
    };
  }

  const result = await createRunChildren(transaction, runInput, runRow, event.sourceEventId);
  const suppression = input.suppression
    ? await createOrFindSuppression(transaction, {
        ownerUserId: input.event.ownerUserId,
        flowId: input.run.flowId,
        runtimeEventId: event.id,
        flowRunId: runRow.id,
        reason: input.suppression.reason,
        details: input.suppression.details,
        createdAt: input.run.now
      })
    : null;

  return {
    status: "created",
    event,
    ...result,
    suppression
  };
}

async function createOrFindEvent(
  transaction: FlowDatabase,
  input: CreateFlowRunForEventDedupeInput["event"]
): Promise<FlowRuntimeEvent> {
  const [inserted] = await transaction
    .insert(flowRuntimeEvents)
    .values({
      ownerUserId: input.ownerUserId,
      source: input.source,
      sourceEventId: input.sourceEventId,
      dedupeKey: input.dedupeKey,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      occurredAt: new Date(input.occurredAt),
      payload: input.payload
    })
    .onConflictDoNothing({
      target: [flowRuntimeEvents.ownerUserId, flowRuntimeEvents.dedupeKey]
    })
    .returning();
  if (inserted) return toRuntimeEventRecord(inserted);

  const [existing] = await transaction
    .select()
    .from(flowRuntimeEvents)
    .where(
      and(
        eq(flowRuntimeEvents.ownerUserId, input.ownerUserId),
        eq(flowRuntimeEvents.dedupeKey, input.dedupeKey)
      )
    )
    .limit(1);
  if (!existing) {
    throw new Error("Flow runtime event conflict did not return an existing event.");
  }

  return toRuntimeEventRecord(existing);
}

async function findRunSelection(
  database: FlowDatabase,
  input: { readonly ownerUserId: string; readonly flowId: string; readonly runtimeEventId: string }
): Promise<FlowRunSelection | null> {
  const [row] = await selectRunRows(database, [
    eq(flowRuns.ownerUserId, input.ownerUserId),
    eq(flowRuns.flowId, input.flowId),
    eq(flowRuns.runtimeEventId, input.runtimeEventId)
  ]).limit(1);
  return row ?? null;
}

async function findRunSelectionById(
  database: FlowDatabase,
  input: { readonly ownerUserId: string; readonly runId: string }
): Promise<FlowRunSelection | null> {
  const [row] = await selectRunRows(database, [
    eq(flowRuns.ownerUserId, input.ownerUserId),
    eq(flowRuns.id, input.runId)
  ]).limit(1);
  return row ?? null;
}

async function findSuppressionByRun(
  database: FlowDatabase,
  input: {
    readonly ownerUserId: string;
    readonly flowId: string;
    readonly runtimeEventId: string;
    readonly flowRunId: string;
  }
): Promise<FlowSuppressionRow | null> {
  const [row] = await database
    .select()
    .from(flowSuppressions)
    .where(
      and(
        eq(flowSuppressions.ownerUserId, input.ownerUserId),
        eq(flowSuppressions.flowId, input.flowId),
        eq(flowSuppressions.runtimeEventId, input.runtimeEventId),
        eq(flowSuppressions.flowRunId, input.flowRunId)
      )
    )
    .limit(1);
  return row ?? null;
}

async function findSuppressionRecordForRun(
  database: FlowDatabase,
  run: FlowRunSelection
): Promise<FlowSuppressionRecord | null> {
  if (run.status !== "suppressed") return null;

  const row = await findSuppressionByRun(database, {
    ownerUserId: run.ownerUserId,
    flowId: run.flowId,
    runtimeEventId: run.runtimeEventId,
    flowRunId: run.id
  });
  return row ? toSuppressionRecord(row) : null;
}

async function createOrFindSuppression(
  database: FlowDatabase,
  input: CreateFlowSuppressionInput
): Promise<FlowSuppressionRecord> {
  const [inserted] = await database
    .insert(flowSuppressions)
    .values({
      ownerUserId: input.ownerUserId,
      flowId: input.flowId,
      runtimeEventId: input.runtimeEventId,
      flowRunId: input.flowRunId,
      reason: input.reason,
      details: input.details,
      createdAt: new Date(input.createdAt)
    })
    .onConflictDoNothing({
      target: [
        flowSuppressions.ownerUserId,
        flowSuppressions.flowId,
        flowSuppressions.runtimeEventId,
        flowSuppressions.reason
      ]
    })
    .returning();
  if (inserted) return toSuppressionRecord(inserted);

  const [existing] = await database
    .select()
    .from(flowSuppressions)
    .where(
      and(
        eq(flowSuppressions.ownerUserId, input.ownerUserId),
        eq(flowSuppressions.flowId, input.flowId),
        eq(flowSuppressions.runtimeEventId, input.runtimeEventId),
        eq(flowSuppressions.reason, input.reason)
      )
    )
    .limit(1);
  if (!existing) {
    throw new Error("Flow suppression conflict did not return an existing suppression.");
  }
  return toSuppressionRecord(existing);
}

async function insertFlowRun(
  transaction: FlowTransaction,
  input: CreateFlowRunInput,
  tolerateConflict = false
): Promise<FlowRunRow | null> {
  const now = new Date(input.now);
  const insert = transaction
    .insert(flowRuns)
    .values({
      ownerUserId: input.ownerUserId,
      flowId: input.flowId,
      flowVersionId: input.flowVersionId,
      runtimeEventId: input.runtimeEventId,
      status: input.status,
      snapshot: input.snapshot,
      currentNodeId: input.currentNodeId,
      createdAt: now,
      updatedAt: now,
      completedAt: isTerminalRunStatus(input.status) ? now : null
    });
  const returning = tolerateConflict
    ? insert
        .onConflictDoNothing({
          target: [flowRuns.ownerUserId, flowRuns.flowId, flowRuns.runtimeEventId]
        })
        .returning()
    : insert.returning();
  const rows = await returning;
  if (rows[0]) return rows[0];
  if (tolerateConflict) return null;
  throw new Error("Expected flow_runs insert to return a row");
}

async function createRunChildren(
  transaction: FlowTransaction,
  input: CreateFlowRunInput,
  runRow: FlowRunRow,
  sourceEventId: string
) {
  const now = new Date(input.now);
  const stepRows =
    input.stepRuns.length > 0
      ? await transaction
          .insert(flowStepRuns)
          .values(
            input.stepRuns.map((step) => ({
              ownerUserId: input.ownerUserId,
              flowRunId: runRow.id,
              nodeId: step.nodeId,
              status: step.status,
              inputSnapshot: step.inputSnapshot,
              outputSnapshot: step.outputSnapshot,
              errorCode: step.errorCode,
              errorMessage: step.errorMessage,
              createdAt: now,
              updatedAt: now,
              completedAt:
                step.status === "completed" || step.status === "failed_terminal" ? now : null
            }))
          )
          .returning()
      : [];
  const stepIdByNodeId = new Map(stepRows.map((row) => [row.nodeId, row.id]));

  const approvalRows =
    input.approvals.length > 0
      ? await transaction
          .insert(flowApprovals)
          .values(
            input.approvals.map((approval) => ({
              ownerUserId: input.ownerUserId,
              flowRunId: runRow.id,
              flowStepRunId: approval.stepNodeId ? (stepIdByNodeId.get(approval.stepNodeId) ?? null) : null,
              status: "pending",
              kind: approval.kind,
              title: approval.title,
              preview: approval.preview,
              createdAt: now
            }))
          )
          .returning()
      : [];

  return {
    run: toRunRecord({ ...runRow, sourceEventId }),
    stepRuns: stepRows.map(toStepRunRecord),
    approvals: approvalRows.map(toApprovalRecord)
  };
}

function selectRunRows(database: FlowDatabase, conditions: readonly SQL[]) {
  const where = and(...conditions);
  return database
    .select({
      id: flowRuns.id,
      ownerUserId: flowRuns.ownerUserId,
      flowId: flowRuns.flowId,
      flowVersionId: flowRuns.flowVersionId,
      runtimeEventId: flowRuns.runtimeEventId,
      sourceEventId: flowRuntimeEvents.sourceEventId,
      status: flowRuns.status,
      snapshot: flowRuns.snapshot,
      currentNodeId: flowRuns.currentNodeId,
      createdAt: flowRuns.createdAt,
      updatedAt: flowRuns.updatedAt,
      completedAt: flowRuns.completedAt
    })
    .from(flowRuns)
    .innerJoin(
      flowRuntimeEvents,
      and(
        eq(flowRuntimeEvents.id, flowRuns.runtimeEventId),
        eq(flowRuntimeEvents.ownerUserId, flowRuns.ownerUserId)
      )
    )
    .where(where);
}

function assertDeliveryAttemptInput(input: CreateFlowDeliveryAttemptInput): void {
  if (input.idempotencyKey.trim().length === 0) {
    throw new Error("Flow delivery attempts require an idempotency key.");
  }
}

function isTerminalRunStatus(status: FlowRunStatus): boolean {
  return ["completed", "failed_terminal", "suppressed", "expired", "canceled"].includes(status);
}

function toRuntimeEventRecord(row: FlowRuntimeEventRow): FlowRuntimeEvent {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    source: row.source as FlowRuntimeEventSource,
    sourceEventId: row.sourceEventId,
    dedupeKey: row.dedupeKey,
    subjectType: row.subjectType as FlowRunSubjectType,
    subjectId: row.subjectId,
    occurredAt: row.occurredAt.toISOString(),
    payload: row.payload
  };
}

function toRunRecord(row: FlowRunSelection): FlowRunResponse {
  return {
    id: row.id,
    flowId: row.flowId,
    flowVersionId: row.flowVersionId,
    ownerUserId: row.ownerUserId,
    sourceEventId: row.sourceEventId,
    status: row.status as FlowRunStatus,
    snapshot: row.snapshot as FlowRunSnapshot,
    currentNodeId: row.currentNodeId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null
  };
}

function toStepRunRecord(row: FlowStepRunRow): FlowStepRunResponse {
  return {
    id: row.id,
    flowRunId: row.flowRunId,
    nodeId: row.nodeId,
    status: row.status as FlowStepRunStatus,
    inputSnapshot: row.inputSnapshot,
    outputSnapshot: row.outputSnapshot ?? null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null
  };
}

function toApprovalRecord(row: FlowApprovalRow): FlowApproval {
  return {
    id: row.id,
    flowRunId: row.flowRunId,
    stepRunId: row.flowStepRunId,
    status: row.status as FlowApprovalStatus,
    kind: row.kind as FlowApprovalKind,
    title: row.title,
    preview: row.preview,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null
  };
}

function toSuppressionRecord(row: FlowSuppressionRow): FlowSuppressionRecord {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    flowId: row.flowId,
    runtimeEventId: row.runtimeEventId,
    flowRunId: row.flowRunId,
    reason: row.reason as FlowSuppressionRecord["reason"],
    details: row.details,
    createdAt: row.createdAt.toISOString()
  };
}
