import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { FlowRunSnapshot } from "@elevenhouse/contracts";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowApprovals,
  flowRuntimeEvents,
  flowRuns,
  flowStepRuns,
  flowSuppressions
} from "../../schema/flows";
import { createDrizzleFlowRuntimeStore } from "./drizzle-flow-runtime-store";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const otherOwnerUserId = "99999999-9999-4999-8999-999999999999";
const flowId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
const runId = "55555555-5555-4555-8555-555555555555";
const stepRunId = "66666666-6666-4666-8666-666666666666";
const approvalId = "77777777-7777-4777-8777-777777777777";
const now = new Date("2026-07-30T10:00:00.000Z");

describe("createDrizzleFlowRuntimeStore", () => {
  it("looks up a duplicate runtime event by owner and dedupe key before creating another event", async () => {
    const fake = createFakeDatabase({ selectRows: [[runtimeEventRow()]] });

    await expect(
      createDrizzleFlowRuntimeStore(fake.database).findEventByDedupeKey({
        ownerUserId,
        dedupeKey: "manual:client-1:flow-1"
      })
    ).resolves.toMatchObject({ id: eventId, ownerUserId });

    expect(renderWhere(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining('"owner_user_id" = $1'),
      params: [ownerUserId, "manual:client-1:flow-1"]
    });
  });

  it("creates runs, step runs and approvals in a transaction", async () => {
    const fake = createFakeDatabase({
      transactionInsertRows: [runRow(), stepRunRow({ status: "approval_required" }), approvalRow()]
    });

    await expect(
      createDrizzleFlowRuntimeStore(fake.database).createRun({
        ownerUserId,
        flowId,
        flowVersionId: versionId,
        runtimeEventId: eventId,
        sourceEventId: "manual:client-1:flow-1",
        status: "approval_required",
        snapshot: snapshot(),
        currentNodeId: "draft-reply",
        now: now.toISOString(),
        stepRuns: [
          {
            nodeId: "draft-reply",
            status: "approval_required",
            inputSnapshot: {},
            outputSnapshot: null,
            errorCode: null,
            errorMessage: null
          }
        ],
        approvals: [
          {
            stepNodeId: "draft-reply",
            kind: "ai_output",
            title: "Черновик ответа",
            preview: "Черновик ответа"
          }
        ]
      })
    ).resolves.toMatchObject({
      run: { id: runId },
      stepRuns: [{ id: stepRunId }],
      approvals: [{ id: approvalId }]
    });

    expect(fake.transactions).toBe(1);
    expect(fake.inserts.map((insert) => insert.table)).toEqual([
      flowRuns,
      flowStepRuns,
      flowApprovals
    ]);
  });

  it("recovers duplicate event insert conflicts by creating the missing run in the same transaction", async () => {
    const fake = createFakeDatabase({
      transactionInsertRows: [
        null,
        runRow(),
        stepRunRow({ status: "approval_required" }),
        approvalRow()
      ],
      selectRows: [[runtimeEventRow()], []]
    });

    await expect(
      createDrizzleFlowRuntimeStore(fake.database).createRunForEventDedupe({
        event: {
          ownerUserId,
          source: "manual",
          sourceEventId: "manual:client-1:flow-1",
          dedupeKey: "manual:client-1:flow-1",
          subjectType: "client",
          subjectId: "client-1",
          occurredAt: now.toISOString(),
          payload: {}
        },
        run: {
          flowId,
          flowVersionId: versionId,
          status: "approval_required",
          snapshot: snapshot(),
          currentNodeId: "draft-reply",
          now: now.toISOString(),
          stepRuns: [
            {
              nodeId: "draft-reply",
              status: "approval_required",
              inputSnapshot: {},
              outputSnapshot: null,
              errorCode: null,
              errorMessage: null
            }
          ],
          approvals: [
            {
              stepNodeId: "draft-reply",
              kind: "ai_output",
              title: "Черновик ответа",
              preview: "Черновик ответа"
            }
          ]
        }
      })
    ).resolves.toMatchObject({
      status: "created",
      event: { id: eventId },
      run: { id: runId },
      approvals: [{ id: approvalId }]
    });

    expect(fake.transactions).toBe(1);
    expect(fake.onConflictTargets).toHaveLength(2);
    expect(fake.inserts.map((insert) => insert.table)).toEqual([
      flowRuntimeEvents,
      flowRuns,
      flowStepRuns,
      flowApprovals
    ]);
  });

  it("creates suppressed runs and suppression records in the same dedupe transaction", async () => {
    const fake = createFakeDatabase({
      transactionInsertRows: [
        runtimeEventRow(),
        runRow({ status: "suppressed", currentNodeId: null, completedAt: now }),
        suppressionRow()
      ]
    });

    await expect(
      createDrizzleFlowRuntimeStore(fake.database).createRunForEventDedupe({
        event: {
          ownerUserId,
          source: "manual",
          sourceEventId: "manual:client-1:flow-1",
          dedupeKey: "manual:client-1:flow-1",
          subjectType: "client",
          subjectId: "client-1",
          occurredAt: now.toISOString(),
          payload: {}
        },
        run: {
          flowId,
          flowVersionId: versionId,
          status: "suppressed",
          snapshot: snapshot(),
          currentNodeId: null,
          now: now.toISOString(),
          stepRuns: [],
          approvals: []
        },
        suppression: {
          reason: "QUIET_HOURS_HOLD",
          details: { flowId }
        }
      })
    ).resolves.toMatchObject({
      status: "created",
      run: { id: runId, status: "suppressed" },
      suppression: { id: "88888888-8888-4888-8888-888888888888", reason: "QUIET_HOURS_HOLD" }
    });

    expect(fake.transactions).toBe(1);
    expect(fake.inserts.map((insert) => insert.table)).toEqual([
      flowRuntimeEvents,
      flowRuns,
      flowSuppressions
    ]);
  });

  it("replays an existing suppressed run with its suppression reason", async () => {
    const fake = createFakeDatabase({
      transactionInsertRows: [null],
      selectRows: [
        [runtimeEventRow()],
        [
          {
            ...runRow(),
            status: "suppressed",
            currentNodeId: null,
            completedAt: now,
            sourceEventId: "manual:client-1:flow-1"
          }
        ],
        [suppressionRow()]
      ]
    });

    await expect(
      createDrizzleFlowRuntimeStore(fake.database).createRunForEventDedupe({
        event: {
          ownerUserId,
          source: "manual",
          sourceEventId: "manual:client-1:flow-1",
          dedupeKey: "manual:client-1:flow-1",
          subjectType: "client",
          subjectId: "client-1",
          occurredAt: now.toISOString(),
          payload: {}
        },
        run: {
          flowId,
          flowVersionId: versionId,
          status: "approval_required",
          snapshot: snapshot(),
          currentNodeId: "draft-reply",
          now: now.toISOString(),
          stepRuns: [],
          approvals: []
        }
      })
    ).resolves.toMatchObject({
      status: "duplicate",
      run: { id: runId, status: "suppressed" },
      suppression: { reason: "QUIET_HOURS_HOLD" }
    });

    expect(fake.inserts.map((insert) => insert.table)).toEqual([flowRuntimeEvents]);
  });

  it("lists runs with owner and flow filters", async () => {
    const fake = createFakeDatabase({
      selectRows: [[{ ...runRow(), sourceEventId: "manual:client-1:flow-1" }]],
      countRows: [{ value: 1 }]
    });

    await createDrizzleFlowRuntimeStore(fake.database).listRuns({
      ownerUserId,
      flowId,
      status: "all",
      limit: 20,
      offset: 0
    });

    expect(renderWhere(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining('"owner_user_id" = $1'),
      params: [ownerUserId, flowId]
    });
  });

  it("finds a run by owner and run id", async () => {
    const fake = createFakeDatabase({
      selectRows: [[{ ...runRow(), sourceEventId: "manual:client-1:flow-1" }]]
    });

    await expect(
      createDrizzleFlowRuntimeStore(fake.database).findRunById({ ownerUserId, runId })
    ).resolves.toMatchObject({ id: runId, ownerUserId });

    expect(renderWhere(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining('"owner_user_id" = $1'),
      params: [ownerUserId, runId]
    });
  });

  it("cancels a non-terminal run inside the owner scope", async () => {
    const fake = createFakeDatabase({
      updateRows: [{ id: runId }],
      selectRows: [
        [
          {
            ...runRow({ status: "canceled", currentNodeId: null, completedAt: now }),
            sourceEventId: "manual:client-1:flow-1"
          }
        ]
      ]
    });

    await expect(
      createDrizzleFlowRuntimeStore(fake.database).cancelRun({
        ownerUserId,
        runId,
        now: now.toISOString()
      })
    ).resolves.toMatchObject({ id: runId, status: "canceled", currentNodeId: null });

    expect(renderWhere(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining('"owner_user_id" = $1'),
      params: expect.arrayContaining([ownerUserId, runId])
    });
    expect(fake.updates).toEqual([
      {
        table: flowRuns,
        value: expect.objectContaining({
          status: "canceled",
          currentNodeId: null,
          completedAt: now
        })
      },
      {
        table: flowApprovals,
        value: expect.objectContaining({
          status: "expired",
          decisionNote: "Flow run canceled",
          decidedAt: now,
          snoozedUntil: null
        })
      }
    ]);
  });

  it("does not decide approvals attached to terminal runs", async () => {
    const fake = createFakeDatabase({ updateRows: [] });

    await expect(
      createDrizzleFlowRuntimeStore(fake.database).decideApproval({
        ownerUserId,
        approvalId,
        decidedByUserId: ownerUserId,
        decision: "approved",
        note: "ok",
        now: now.toISOString()
      })
    ).resolves.toBeNull();

    expect(renderWhere(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining("exists"),
      params: expect.arrayContaining([ownerUserId, approvalId, "pending"])
    });
  });

  it("decides approvals only inside the owner scope", async () => {
    const fake = createFakeDatabase({ updateRows: [approvalRow({ status: "approved" })] });

    await createDrizzleFlowRuntimeStore(fake.database).decideApproval({
      ownerUserId: otherOwnerUserId,
      approvalId,
      decidedByUserId: otherOwnerUserId,
      decision: "approved",
      note: "ok",
      now: now.toISOString()
    });

    expect(renderWhere(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining('"owner_user_id" = $1'),
      params: expect.arrayContaining([otherOwnerUserId, approvalId, "pending"])
    });
  });

  it("requires delivery attempts to carry an idempotency key", async () => {
    const store = createDrizzleFlowRuntimeStore(createFakeDatabase({}).database);

    await expect(
      store.createDeliveryAttempt({
        ownerUserId,
        flowRunId: runId,
        flowStepRunId: stepRunId,
        idempotencyKey: " ",
        attemptNumber: 1,
        status: "pending",
        createdAt: now.toISOString()
      })
    ).rejects.toThrow("Flow delivery attempts require an idempotency key.");
  });
});

function runtimeEventRow() {
  return {
    id: eventId,
    ownerUserId,
    source: "manual",
    sourceEventId: "manual:client-1:flow-1",
    dedupeKey: "manual:client-1:flow-1",
    subjectType: "client",
    subjectId: "client-1",
    occurredAt: now,
    payload: {},
    createdAt: now
  } as const;
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    ownerUserId,
    flowId,
    flowVersionId: versionId,
    runtimeEventId: eventId,
    sourceEventId: "manual:client-1:flow-1",
    status: "approval_required",
    snapshot: snapshot(),
    currentNodeId: "draft-reply",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...overrides
  };
}

function stepRunRow(overrides: Record<string, unknown> = {}) {
  return {
    id: stepRunId,
    ownerUserId,
    flowRunId: runId,
    nodeId: "draft-reply",
    status: "approval_required",
    inputSnapshot: {},
    outputSnapshot: null,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...overrides
  };
}

function approvalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: approvalId,
    ownerUserId,
    flowRunId: runId,
    flowStepRunId: stepRunId,
    status: "pending",
    kind: "ai_output",
    title: "Черновик ответа",
    preview: "Черновик ответа",
    decisionNote: null,
    decidedByUserId: null,
    snoozedUntil: null,
    createdAt: now,
    decidedAt: null,
    ...overrides
  };
}

function suppressionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    ownerUserId,
    flowId,
    runtimeEventId: eventId,
    flowRunId: runId,
    reason: "QUIET_HOURS_HOLD",
    details: { flowId },
    createdAt: now,
    ...overrides
  };
}

function snapshot(): FlowRunSnapshot {
  return {
    schemaVersion: "flow-run-snapshot.v2",
    enrollment: {
      activationEpochId: "88888888-8888-4888-8888-888888888888",
      triggerNodeId: "booking-confirmed",
      occurrenceKey: "99999999-9999-4999-8999-999999999999",
      policyKey: "once_per_occurrence",
      policyRevision: 1,
      rolloutPolicyRevision: 1,
      eventOccurredAt: now.toISOString(),
      enrolledAt: now.toISOString()
    },
    subject: {
      type: "booking",
      bookingId: "99999999-9999-4999-8999-999999999999",
      clientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      productId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      startAt: "2026-08-01T10:00:00.000Z",
      endAt: "2026-08-01T11:00:00.000Z"
    },
    executionAuthority: {
      basis: "current_entitlement",
      referenceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    }
  };
}

type FakeDatabaseInput = {
  readonly selectRows?: readonly (readonly Record<string, unknown>[])[];
  readonly countRows?: readonly Record<string, unknown>[];
  readonly insertRows?: readonly (Record<string, unknown> | null)[];
  readonly updateRows?: readonly Record<string, unknown>[];
  readonly transactionInsertRows?: readonly (Record<string, unknown> | null)[];
};

function createFakeDatabase(input: FakeDatabaseInput) {
  const wheres: SQL[] = [];
  const inserts: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  const updates: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  const onConflictTargets: unknown[] = [];
  let selectIndex = 0;
  let insertIndex = 0;
  let updateIndex = 0;
  let transactionInsertIndex = 0;
  let transactions = 0;

  const createExecutor = (isTransaction: boolean) => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: (where: SQL) => selectResult(where)
        }),
        where: (where: SQL) => selectResult(where)
      })
    }),
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown> | readonly Record<string, unknown>[]) => {
        const returning = async () => {
          const values = Array.isArray(value) ? value : [value];
          for (const item of values) inserts.push({ table, value: item });
          if (isTransaction) {
            const row = input.transactionInsertRows?.[transactionInsertIndex];
            transactionInsertIndex += 1;
            return row ? [row] : [];
          }
          const row = input.insertRows?.[insertIndex];
          insertIndex += 1;
          return row ? [row] : [];
        };
        return {
          onConflictDoNothing: (config: { readonly target?: unknown }) => {
            onConflictTargets.push(config.target);
            return { returning };
          },
          returning
        };
      }
    }),
    update: (table: unknown) => ({
      set: (value: Record<string, unknown>) => ({
        where: (where: SQL) => {
          wheres.push(where);
          return {
            returning: async () => {
              updates.push({ table, value });
              const row = input.updateRows?.[updateIndex];
              updateIndex += 1;
              return row ? [row] : [];
            }
          };
        }
      })
    })
  });

  function selectResult(where: SQL) {
    wheres.push(where);
    const take = (): Promise<readonly Record<string, unknown>[]> => {
      const rows = input.selectRows?.[selectIndex] ?? input.countRows ?? [];
      selectIndex += 1;
      return Promise.resolve(rows);
    };
    return {
      orderBy: () => ({
        limit: () => ({
          offset: take
        })
      }),
      limit: take,
      then: (
        resolve: (value: readonly Record<string, unknown>[]) => unknown,
        reject?: (reason: unknown) => unknown
      ) => take().then(resolve, reject)
    };
  }

  const database = {
    ...createExecutor(false),
    transaction: async (operation: (transaction: unknown) => unknown) => {
      transactions += 1;
      return operation(createExecutor(true));
    }
  } as unknown as ElevenHouseDatabase;

  return {
    database,
    wheres,
    inserts,
    updates,
    onConflictTargets,
    get transactions() {
      return transactions;
    }
  };
}

function renderWhere(where: SQL | undefined) {
  if (!where) throw new Error("Expected a Drizzle where clause");
  return new PgDialect().sqlToQuery(where);
}
