import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { FlowGraph } from "@elevenhouse/contracts";
import type { ElevenHouseDatabase } from "../../runtime";
import { flowVersions, flows } from "../../schema";
import { createDrizzleFlowStore } from "./index";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const otherOwnerUserId = "00000000-0000-4000-8000-000000000099";
const flowId = "00000000-0000-4000-8000-000000000002";
const versionId = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-07-26T10:00:00.000Z");

const graph: FlowGraph = {
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "lead-created",
      category: "trigger",
      kind: "lead_created",
      title: "Новый лид",
      config: {}
    },
    {
      id: "draft-reply",
      category: "ai",
      kind: "reply_draft",
      approvalMode: "manual_approve",
      title: "Черновик ответа",
      config: {}
    }
  ],
  edges: [{ id: "edge-1", fromNodeId: "lead-created", toNodeId: "draft-reply" }]
};

describe("createDrizzleFlowStore", () => {
  it("creates draft flows with injected owner/time and maps row dates to contract records", async () => {
    const fake = createFakeDatabase({
      insertRows: [flowRow()]
    });

    const created = await createDrizzleFlowStore(fake.database).createDraft({
      ownerUserId,
      name: "Welcome funnel",
      approvalMode: "manual_approve",
      graph,
      now: now.toISOString()
    });

    expect(fake.inserts).toEqual([
      {
        table: flows,
        value: {
          ownerUserId,
          name: "Welcome funnel",
          status: "draft",
          approvalMode: "manual_approve",
          draftGraph: graph,
          createdAt: now,
          updatedAt: now
        }
      }
    ]);
    expect(created).toMatchObject({
      id: flowId,
      ownerUserId,
      status: "draft",
      publishedVersionId: null,
      publishedVersion: null,
      createdAt: now.toISOString()
    });
  });

  it("updates only owned draft rows", async () => {
    const fake = createFakeDatabase({
      updateRows: [flowRow({ name: "Updated funnel" })]
    });

    await expect(
      createDrizzleFlowStore(fake.database).updateDraft({
        ownerUserId,
        flowId,
        patch: { name: "Updated funnel" },
        now: now.toISOString()
      })
    ).resolves.toMatchObject({ name: "Updated funnel" });

    expect(fake.updates).toEqual([
      {
        table: flows,
        value: {
          name: "Updated funnel",
          updatedAt: now
        }
      }
    ]);
    expect(renderWhere(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining('"status" = $3'),
      params: [ownerUserId, flowId, "draft"]
    });
  });

  it("publishes a flow by inserting an immutable next version in one transaction", async () => {
    const fake = createFakeDatabase({
      transactionSelectRows: [[flowRow()], [{ value: 1 }]],
      transactionInsertRows: [versionRow({ version: 2 })],
      transactionUpdateRows: [flowRow({ status: "published", publishedVersionId: versionId })]
    });

    const published = await createDrizzleFlowStore(fake.database).publishDraft({
      ownerUserId,
      flowId,
      now: now.toISOString()
    });

    expect(fake.transactions).toBe(1);
    expect(fake.inserts).toContainEqual({
      table: flowVersions,
      value: {
        flowId,
        ownerUserId,
        version: 2,
        approvalMode: "manual_approve",
        graph,
        publishedAt: now
      }
    });
    expect(fake.updates).toContainEqual({
      table: flows,
      value: {
        status: "published",
        publishedVersionId: versionId,
        publishedAt: now,
        updatedAt: now
      }
    });
    expect(published).toMatchObject({
      flow: {
        id: flowId,
        status: "published",
        publishedVersionId: versionId,
        publishedVersion: 2
      },
      version: {
        id: versionId,
        flowId,
        version: 2,
        status: "published"
      }
    });
  });

  it("loads the current published immutable version by owner and flow", async () => {
    const fake = createFakeDatabase({
      selectRows: [[{ publishedVersionId: versionId }], [versionRow()]]
    });

    await expect(
      createDrizzleFlowStore(fake.database).findPublishedVersionByFlowId({
        ownerUserId,
        flowId
      })
    ).resolves.toMatchObject({
      id: versionId,
      flowId,
      version: 1,
      graph
    });

    expect(renderWhere(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining('"owner_user_id" = $1'),
      params: [ownerUserId, flowId]
    });
    expect(renderWhere(fake.wheres[1])).toMatchObject({
      sql: expect.stringContaining('"owner_user_id" = $1'),
      params: [ownerUserId, flowId, versionId]
    });
  });

  it("transitions only owned flows from allowed source statuses", async () => {
    const fake = createFakeDatabase({
      updateRows: [
        flowRow({
          status: "active",
          publishedVersionId: versionId,
          publishedAt: now
        })
      ],
      selectRows: [[versionRow()]]
    });

    await expect(
      createDrizzleFlowStore(fake.database).transitionStatus({
        ownerUserId,
        flowId,
        fromStatuses: ["published", "paused"],
        toStatus: "active",
        now: now.toISOString()
      })
    ).resolves.toMatchObject({
      id: flowId,
      status: "active",
      publishedVersion: 1
    });

    expect(fake.updates).toEqual([
      {
        table: flows,
        value: {
          status: "active",
          updatedAt: now
        }
      }
    ]);
    expect(renderWhere(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining('"owner_user_id" = $1'),
      params: [ownerUserId, flowId, "published", "paused"]
    });
  });

  it("loads active owner flows by trigger kind from the published immutable graph", async () => {
    const bookingVersionId = "00000000-0000-4000-8000-000000000004";
    const bookingGraph: FlowGraph = {
      ...graph,
      nodes: [
        {
          id: "booking-confirmed",
          category: "trigger",
          kind: "booking_confirmed",
          title: "Запись подтверждена",
          config: {}
        },
        ...graph.nodes.slice(1)
      ]
    };
    const fake = createFakeDatabase({
      selectRows: [
        [
          flowRow({
            status: "active",
            publishedVersionId: versionId,
            publishedAt: now
          }),
          flowRow({
            id: "00000000-0000-4000-8000-000000000005",
            status: "active",
            publishedVersionId: bookingVersionId,
            publishedAt: now
          })
        ],
        [versionRow(), versionRow({ id: bookingVersionId, graph: bookingGraph })]
      ]
    });

    await expect(
      createDrizzleFlowStore(fake.database).listActiveByTriggerKind({
        ownerUserId,
        triggerKind: "lead_created"
      })
    ).resolves.toMatchObject([{ id: flowId, status: "active", publishedVersion: 1 }]);

    expect(renderWhere(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining('"owner_user_id" = $1'),
      params: [ownerUserId, "active"]
    });
  });

  it("does not expose rows from another owner", async () => {
    const fake = createFakeDatabase({
      selectRows: [[flowRow()]],
      countRows: [{ value: 1 }]
    });

    await createDrizzleFlowStore(fake.database).listByOwner({
      ownerUserId: otherOwnerUserId,
      status: "all",
      limit: 20,
      offset: 0
    });

    expect(renderWhere(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining('"owner_user_id" = $1'),
      params: [otherOwnerUserId]
    });
  });
});

type TestFlowRow = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly status: string;
  readonly approvalMode: string;
  readonly draftGraph: FlowGraph;
  readonly publishedVersionId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publishedAt: Date | null;
};

type TestVersionRow = {
  readonly id: string;
  readonly flowId: string;
  readonly ownerUserId: string;
  readonly version: number;
  readonly approvalMode: string;
  readonly graph: FlowGraph;
  readonly publishedAt: Date;
};

function flowRow(overrides: Partial<TestFlowRow> = {}): TestFlowRow {
  return { ...baseFlowRow, ...overrides };
}

function versionRow(overrides: Partial<TestVersionRow> = {}): TestVersionRow {
  return { ...baseVersionRow, ...overrides };
}

const baseFlowRow: TestFlowRow = {
  id: flowId,
  ownerUserId,
  name: "Welcome funnel",
  status: "draft",
  approvalMode: "manual_approve",
  draftGraph: graph,
  publishedVersionId: null,
  createdAt: now,
  updatedAt: now,
  publishedAt: null
};

const baseVersionRow: TestVersionRow = {
  id: versionId,
  flowId,
  ownerUserId,
  version: 1,
  approvalMode: "manual_approve",
  graph,
  publishedAt: now
};

type FakeDatabaseInput = {
  readonly selectRows?: readonly (readonly Record<string, unknown>[])[];
  readonly countRows?: readonly Record<string, unknown>[];
  readonly insertRows?: readonly Record<string, unknown>[];
  readonly updateRows?: readonly Record<string, unknown>[];
  readonly transactionSelectRows?: readonly (readonly Record<string, unknown>[])[];
  readonly transactionInsertRows?: readonly Record<string, unknown>[];
  readonly transactionUpdateRows?: readonly Record<string, unknown>[];
};

function createFakeDatabase(input: FakeDatabaseInput) {
  const wheres: SQL[] = [];
  const inserts: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  const updates: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  let selectIndex = 0;
  let insertIndex = 0;
  let updateIndex = 0;
  let transactionSelectIndex = 0;
  let transactionInsertIndex = 0;
  let transactionUpdateIndex = 0;
  let transactions = 0;

  const createExecutor = (isTransaction: boolean) => ({
    select: () => ({
      from: () => ({
        where: (where: SQL) => {
          wheres.push(where);
          const take = (): Promise<readonly Record<string, unknown>[]> =>
            Promise.resolve(takeSelectRows());
          return {
            orderBy: () => ({
              limit: () =>
                makeThenableSelectResult({
                  offset: take,
                  then: (
                    resolve: (value: readonly Record<string, unknown>[]) => unknown,
                    reject?: (reason: unknown) => unknown
                  ) => take().then(resolve, reject)
                })
            }),
            limit: take,
            then: (
              resolve: (value: readonly Record<string, unknown>[]) => unknown,
              reject?: (reason: unknown) => unknown
            ) => take().then(resolve, reject)
          };
        }
      })
    }),
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          inserts.push({ table, value });
          return takeReturningRow(isTransaction ? "transactionInsert" : "insert");
        }
      })
    }),
    update: (table: unknown) => ({
      set: (value: Record<string, unknown>) => ({
        where: (where: SQL) => {
          wheres.push(where);
          return {
            returning: async () => {
              updates.push({ table, value });
              return takeReturningRow(isTransaction ? "transactionUpdate" : "update");
            }
          };
        }
      })
    })
  });

  function takeSelectRows() {
    if (transactionSelectIndex < (input.transactionSelectRows?.length ?? 0)) {
      const rows = input.transactionSelectRows?.[transactionSelectIndex] ?? [];
      transactionSelectIndex += 1;
      return rows;
    }
    const rows = input.selectRows?.[selectIndex] ?? input.countRows ?? [];
    selectIndex += 1;
    return rows;
  }

  function takeReturningRow(kind: "insert" | "update" | "transactionInsert" | "transactionUpdate") {
    if (kind === "transactionInsert") {
      const row = input.transactionInsertRows?.[transactionInsertIndex];
      transactionInsertIndex += 1;
      return row ? [row] : [];
    }
    if (kind === "transactionUpdate") {
      const row = input.transactionUpdateRows?.[transactionUpdateIndex];
      transactionUpdateIndex += 1;
      return row ? [row] : [];
    }
    if (kind === "insert") {
      const row = input.insertRows?.[insertIndex];
      insertIndex += 1;
      return row ? [row] : [];
    }
    const row = input.updateRows?.[updateIndex];
    updateIndex += 1;
    return row ? [row] : [];
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
    get transactions() {
      return transactions;
    }
  };
}

function makeThenableSelectResult<T extends object>(value: T): T {
  return value;
}

function renderWhere(where: SQL | undefined) {
  if (!where) throw new Error("Expected a Drizzle where clause");
  return new PgDialect().sqlToQuery(where);
}
