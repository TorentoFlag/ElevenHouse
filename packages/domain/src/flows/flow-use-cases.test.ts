import type { FlowGraph } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";

import { FlowGraphValidationError } from "./flow-validation";
import {
  createFlowDraft,
  listFlows,
  publishFlow,
  updateFlowDraft
} from "./flow-use-cases";
import type { FlowRecord, FlowStore, FlowStorePublishResult } from "./flow-store";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const flowId = "22222222-2222-4222-8222-222222222222";
const now = "2026-07-26T10:00:00.000Z";

const graph = {
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "trigger-booking",
      category: "trigger",
      kind: "booking_confirmed",
      title: "Запись подтверждена",
      config: {}
    },
    {
      id: "task",
      category: "action",
      kind: "create_task",
      title: "Создать задачу",
      approvalMode: "auto_internal",
      config: {}
    }
  ],
  edges: [{ id: "edge-1", fromNodeId: "trigger-booking", toNodeId: "task" }]
} satisfies FlowGraph;

const record = {
  id: flowId,
  ownerUserId,
  name: "Подготовка к сессии",
  status: "draft",
  approvalMode: "manual_approve",
  draftGraph: graph,
  publishedVersionId: null,
  publishedVersion: null,
  createdAt: now,
  updatedAt: now,
  publishedAt: null
} satisfies FlowRecord;

describe("flow use cases", () => {
  it("creates owner-scoped flow drafts through the store", async () => {
    const store = createStore();

    await expect(
      createFlowDraft({
        store,
        ownerUserId,
        input: {
          name: "Подготовка к сессии",
          approvalMode: "manual_approve",
          graph
        },
        now
      })
    ).resolves.toEqual(record);

    expect(store.createDraft).toHaveBeenCalledWith({
      ownerUserId,
      name: "Подготовка к сессии",
      approvalMode: "manual_approve",
      graph,
      now
    });
  });

  it("lists flows with owner scope and parsed pagination", async () => {
    const store = createStore();

    await expect(
      listFlows({ store, ownerUserId, query: { status: "draft", limit: 20, offset: 0 } })
    ).resolves.toEqual({ flows: [record], total: 1 });

    expect(store.listByOwner).toHaveBeenCalledWith({
      ownerUserId,
      status: "draft",
      limit: 20,
      offset: 0
    });
  });

  it("updates only draft flows through the store", async () => {
    const store = createStore();

    await expect(
      updateFlowDraft({
        store,
        ownerUserId,
        flowId,
        patch: { name: "Новое имя" },
        now
      })
    ).resolves.toEqual(record);

    expect(store.updateDraft).toHaveBeenCalledWith({
      ownerUserId,
      flowId,
      patch: { name: "Новое имя" },
      now
    });
  });

  it("publishes valid draft graphs as immutable versions", async () => {
    const store = createStore();

    await expect(publishFlow({ store, ownerUserId, flowId, now })).resolves.toEqual({
      flow: record,
      version: {
        id: "33333333-3333-4333-8333-333333333333",
        flowId,
        version: 1,
        status: "published",
        approvalMode: "manual_approve",
        graph,
        publishedAt: now
      }
    });

    expect(store.publishDraft).toHaveBeenCalledWith({ ownerUserId, flowId, now });
  });

  it("blocks publication before store mutation when draft graph is unsafe", async () => {
    const unsafeRecord = {
      ...record,
      draftGraph: {
        ...graph,
        nodes: [
          graph.nodes[0]!,
          {
            id: "send-message",
            category: "action",
            kind: "send_message",
            title: "Отправить сообщение",
            approvalMode: "auto_send",
            config: {}
          }
        ],
        edges: [{ id: "edge-1", fromNodeId: "trigger-booking", toNodeId: "send-message" }]
      } satisfies FlowGraph
    };
    const store = createStore({
      findByOwnerAndId: vi.fn(async () => unsafeRecord)
    });

    await expect(publishFlow({ store, ownerUserId, flowId, now })).rejects.toThrow(
      FlowGraphValidationError
    );
    expect(store.publishDraft).not.toHaveBeenCalled();
  });
});

function createStore(overrides: Partial<FlowStore> = {}): FlowStore {
  return {
    createDraft: vi.fn(async () => record),
    listByOwner: vi.fn(async () => ({ flows: [record], total: 1 })),
    findByOwnerAndId: vi.fn(async () => record),
    updateDraft: vi.fn(async () => record),
    publishDraft: vi.fn(async () => publishResult),
    ...overrides
  };
}

const publishResult = {
  flow: record,
  version: {
    id: "33333333-3333-4333-8333-333333333333",
    flowId,
    version: 1,
    status: "published",
    approvalMode: "manual_approve",
    graph,
    publishedAt: now
  }
} satisfies FlowStorePublishResult;
