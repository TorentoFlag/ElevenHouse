import { describe, expect, it } from "vitest";

import {
  archiveFlowDefinitionV2,
  deleteFlowDefinitionV2,
  duplicateFlowDefinitionV2,
  restoreFlowDefinitionV2,
  type FlowDefinitionControlStore
} from "./flow-definition-control-plane";
import type { FlowDefinitionV2, FlowGraphV2 } from "@elevenhouse/contracts";

const ownerUserId = "22222222-2222-4222-8222-222222222222";
const flowId = "11111111-1111-4111-8111-111111111111";
const otherFlowId = "33333333-3333-4333-8333-333333333333";

const graph: FlowGraphV2 = {
  schemaVersion: "flow-graph.v2",
  nodes: [
    {
      id: "manual",
      kind: "manual_client",
      displayTitle: "Клиент выбран вручную",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: {}
    },
    {
      id: "completed",
      kind: "completed",
      displayTitle: "Готово",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "done" }
    }
  ],
  edges: [
    {
      id: "manual-completed",
      sourceNodeId: "manual",
      targetNodeId: "completed",
      sourceHandle: "next"
    }
  ]
};

describe("flow definition lifecycle control plane", () => {
  it("archives with revision CAS and normalized command time", async () => {
    let captured: unknown;
    const store = lifecycleStore({
      archiveDefinition: async (input) => {
        captured = input;
        return definition({ state: "archived", revision: 4, updatedAt: input.now });
      }
    });

    await expect(
      archiveFlowDefinitionV2({
        store,
        ownerUserId,
        flowId,
        request: { expectedRevision: 3 },
        now: "2026-08-02T20:02:00+00:00"
      })
    ).resolves.toMatchObject({ state: "archived", revision: 4 });
    expect(captured).toMatchObject({
      ownerUserId,
      flowId,
      expectedRevision: 3,
      now: "2026-08-02T20:02:00.000Z"
    });
  });

  it("restores archived drafts and published definitions without activating enrollment", async () => {
    const draftStore = lifecycleStore({
      restoreDefinition: async () => definition({ state: "draft", revision: 2 })
    });
    await expect(
      restoreFlowDefinitionV2({
        store: draftStore,
        ownerUserId,
        flowId,
        request: { expectedRevision: 1 },
        now: "2026-08-02T20:03:00.000Z"
      })
    ).resolves.toMatchObject({ state: "draft", revision: 2 });

    const versionedStore = lifecycleStore({
      restoreDefinition: async () =>
        definition({
          state: "versioned",
          revision: 5,
          latestPublishedVersionId: "44444444-4444-4444-8444-444444444444",
          latestPublishedVersion: 1,
          publishedAt: "2026-08-02T20:00:00.000Z"
        })
    });
    await expect(
      restoreFlowDefinitionV2({
        store: versionedStore,
        ownerUserId,
        flowId,
        request: { expectedRevision: 4 },
        now: "2026-08-02T20:04:00.000Z"
      })
    ).resolves.toMatchObject({ state: "versioned", revision: 5 });
  });

  it("duplicates as a new draft without version pointers", async () => {
    const store = lifecycleStore({
      duplicateDefinition: async (input) =>
        definition({
          id: otherFlowId,
          name: input.name ?? "Копия",
          state: "draft",
          revision: 1
        })
    });

    await expect(
      duplicateFlowDefinitionV2({
        store,
        ownerUserId,
        flowId,
        request: { expectedRevision: 3, name: "Копия" },
        now: "2026-08-02T20:05:00.000Z"
      })
    ).resolves.toMatchObject({
      id: otherFlowId,
      name: "Копия",
      state: "draft",
      revision: 1,
      latestPublishedVersionId: null,
      latestPublishedVersion: null
    });
  });

  it("deletes through the store and validates the response shape", async () => {
    const store = lifecycleStore({
      deleteDefinition: async () => ({ deleted: true })
    });

    await expect(
      deleteFlowDefinitionV2({
        store,
        ownerUserId,
        flowId,
        request: { expectedRevision: 1 }
      })
    ).resolves.toEqual({ deleted: true });
  });
});

function lifecycleStore(
  overrides: Partial<FlowDefinitionControlStore>
): FlowDefinitionControlStore {
  return {
    executeCreate: async () => raise("executeCreate not expected"),
    executeDraftUpdate: async () => raise("executeDraftUpdate not expected"),
    executePublish: async () => raise("executePublish not expected"),
    executeCreateNextDraft: async () => raise("executeCreateNextDraft not expected"),
    archiveDefinition: async () => raise("archiveDefinition not expected"),
    restoreDefinition: async () => raise("restoreDefinition not expected"),
    duplicateDefinition: async () => raise("duplicateDefinition not expected"),
    deleteDefinition: async () => raise("deleteDefinition not expected"),
    ...overrides
  };
}

function definition(overrides: Partial<FlowDefinitionV2> = {}): FlowDefinitionV2 {
  return {
    schemaVersion: "flow-definition.v2",
    id: flowId,
    ownerUserId,
    name: "Подготовка",
    origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
    state: "draft",
    approvalMode: "manual_approve",
    revision: 1,
    draftBaseVersionId: null,
    draftGraph: graph,
    draftPresentation: null,
    latestPublishedVersionId: null,
    latestPublishedVersion: null,
    createdAt: "2026-08-02T20:00:00.000Z",
    updatedAt: "2026-08-02T20:00:00.000Z",
    publishedAt: null,
    ...overrides
  };
}

function raise(message: string): never {
  throw new Error(message);
}
