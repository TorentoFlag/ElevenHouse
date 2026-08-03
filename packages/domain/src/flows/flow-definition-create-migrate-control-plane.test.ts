import { flowGraphSchema, type FlowDefinitionV2 } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  createFlowDefinitionV2,
  FlowDefinitionMigrationBlockedError,
  FlowDefinitionTemplateVersionConflictError,
  migrateFlowDefinitionV2,
  type FlowDefinitionControlRecord,
  type FlowDefinitionControlStore
} from "./flow-definition-control-plane";
import { prepareFlowDefinitionV1Migration } from "./flow-definition-migration";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const flowId = "22222222-2222-4222-8222-222222222222";
const now = "2026-08-02T19:00:00.000Z";
const legacyGraph = flowGraphSchema.parse({
  schemaVersion: "flow-graph.v1",
  nodes: [
    {
      id: "manual-trigger",
      category: "trigger",
      kind: "manual",
      title: "Ручной запуск",
      config: {},
      position: { x: 80, y: 120 }
    }
  ],
  edges: []
});

describe("flow definition V2 create and migration control plane", () => {
  it("creates one server-owned V2 draft through a collection-scoped idempotent command", async () => {
    const executeCreate = vi.fn<FlowDefinitionControlStore["executeCreate"]>(async (input) => {
      const prepared = input.prepare();
      if (prepared.kind === "rejected") {
        return {
          kind: "created",
          outcome: { kind: "rejected", response: prepared.response }
        };
      }
      return {
        kind: "created",
        outcome: {
          kind: "succeeded",
          response: {
            statusCode: 201,
            body: createdDefinition(prepared.value)
          }
        }
      };
    });
    const store = createStore({ executeCreate });

    const result = await createFlowDefinitionV2({
      store,
      actorUserId: ownerUserId,
      ownerUserId,
      request: {
        schemaVersion: "flow-definition-create.v2",
        name: "  Новая воронка  ",
        locale: "ru",
        source: { type: "blank" }
      },
      idempotencyKey: "flow-create-0001",
      now
    });

    expect(result).toMatchObject({
      id: flowId,
      ownerUserId,
      name: "Новая воронка",
      origin: { type: "blank" },
      state: "draft",
      revision: 1,
      latestPublishedVersionId: null
    });
    expect(executeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          routeTemplate: "/flows",
          scope: "flows.definition.create.v2",
          resourceId: ownerUserId,
          expectedRevision: null,
          idempotencyKey: "flow-create-0001",
          requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
        })
      })
    );
  });

  it("persists deterministic template failures before mapping them to typed errors", async () => {
    const executeCreate = vi.fn<FlowDefinitionControlStore["executeCreate"]>(async (input) => {
      const prepared = input.prepare();
      if (prepared.kind !== "rejected") throw new Error("Expected rejected template");
      return {
        kind: "created",
        outcome: { kind: "rejected", response: prepared.response }
      };
    });

    await expect(
      createFlowDefinitionV2({
        store: createStore({ executeCreate }),
        actorUserId: ownerUserId,
        ownerUserId,
        request: {
          schemaVersion: "flow-definition-create.v2",
          name: "Новая воронка",
          locale: "ru",
          source: {
            type: "template",
            templateKey: "manual-consultation-preparation",
            templateVersion: 2,
            parameters: {}
          }
        },
        idempotencyKey: "flow-create-stale-template",
        now
      })
    ).rejects.toBeInstanceOf(FlowDefinitionTemplateVersionConflictError);
    expect(executeCreate).toHaveBeenCalledOnce();
  });

  it("accepts an exact successful create replay with the original timestamps", async () => {
    const executeCreate = vi.fn<FlowDefinitionControlStore["executeCreate"]>(async (input) => {
      const prepared = input.prepare();
      if (prepared.kind !== "accepted") throw new Error("Expected accepted creation");
      return {
        kind: "replayed",
        outcome: {
          kind: "succeeded",
          response: { statusCode: 201, body: createdDefinition(prepared.value) }
        }
      };
    });

    await expect(
      createFlowDefinitionV2({
        store: createStore({ executeCreate }),
        actorUserId: ownerUserId,
        ownerUserId,
        request: {
          schemaVersion: "flow-definition-create.v2",
          name: "Новая воронка",
          locale: "ru",
          source: { type: "blank" }
        },
        idempotencyKey: "flow-create-replayed-later",
        now: "2026-08-02T20:00:00.000Z"
      })
    ).resolves.toMatchObject({ createdAt: now, updatedAt: now });
  });

  it("migrates the exact legacy revision through the same durable command boundary", async () => {
    const current = legacyRecord();
    const executeMigration = vi.fn<FlowDefinitionControlStore["executeMigration"]>(
      async (input) => {
        const prepared = input.prepare(current, null);
        if (prepared.kind === "rejected") {
          return {
            kind: "created",
            outcome: { kind: "rejected", response: prepared.response }
          };
        }
        return {
          kind: "created",
          outcome: {
            kind: "succeeded",
            response: { statusCode: 200, body: prepared.value }
          }
        };
      }
    );

    const result = await migrateFlowDefinitionV2({
      store: createStore({ executeMigration }),
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: {
        schemaVersion: "flow-definition-migrate.v2",
        expectedRevision: 3,
        targetGraphSchemaVersion: "flow-graph.v2"
      },
      idempotencyKey: "flow-migrate-0001",
      now
    });

    expect(result).toMatchObject({
      flow: { id: flowId, state: "draft", revision: 4, origin: { type: "migration" } },
      migration: { sourceRevision: 3, sourceVersionId: null }
    });
    expect(executeMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          routeTemplate: "/flows/:flowId/migrations/v2",
          scope: "flows.definition.migrate.v2",
          resourceId: flowId,
          expectedRevision: 3
        })
      })
    );
  });

  it("maps persisted migration blockers without partial success", async () => {
    const unsupported = legacyRecord({
      draftGraph: flowGraphSchema.parse({
        schemaVersion: "flow-graph.v1",
        nodes: [
          legacyGraph.nodes[0],
          {
            id: "send-message",
            category: "action",
            kind: "send_message",
            title: "Отправить сообщение",
            approvalMode: "manual_approve",
            config: {}
          }
        ],
        edges: [
          {
            id: "manual-to-message",
            fromNodeId: "manual-trigger",
            toNodeId: "send-message"
          }
        ]
      })
    });
    const executeMigration = vi.fn<FlowDefinitionControlStore["executeMigration"]>(
      async (input) => {
        const prepared = input.prepare(unsupported, null);
        if (prepared.kind !== "rejected") throw new Error("Expected migration blockers");
        return {
          kind: "created",
          outcome: { kind: "rejected", response: prepared.response }
        };
      }
    );

    await expect(
      migrateFlowDefinitionV2({
        store: createStore({ executeMigration }),
        actorUserId: ownerUserId,
        ownerUserId,
        flowId,
        request: {
          schemaVersion: "flow-definition-migrate.v2",
          expectedRevision: 3,
          targetGraphSchemaVersion: "flow-graph.v2"
        },
        idempotencyKey: "flow-migrate-blocked",
        now
      })
    ).rejects.toBeInstanceOf(FlowDefinitionMigrationBlockedError);
  });

  it("accepts an exact successful migration replay with the original timestamp", async () => {
    const current = legacyRecord();
    const request = {
      schemaVersion: "flow-definition-migrate.v2",
      expectedRevision: 3,
      targetGraphSchemaVersion: "flow-graph.v2"
    } as const;
    const prepared = prepareFlowDefinitionV1Migration({
      current,
      latestVersion: null,
      request,
      now
    });
    if (prepared.kind !== "accepted") throw new Error("Expected accepted migration");
    const executeMigration = vi.fn<FlowDefinitionControlStore["executeMigration"]>(async () => ({
      kind: "replayed",
      outcome: {
        kind: "succeeded",
        response: { statusCode: 200, body: prepared.value }
      }
    }));

    await expect(
      migrateFlowDefinitionV2({
        store: createStore({ executeMigration }),
        actorUserId: ownerUserId,
        ownerUserId,
        flowId,
        request,
        idempotencyKey: "flow-migrate-replayed-later",
        now: "2026-08-02T20:00:00.000Z"
      })
    ).resolves.toMatchObject({ migration: { migratedAt: now } });
  });
});

function createStore(overrides: Partial<FlowDefinitionControlStore>): FlowDefinitionControlStore {
  const unexpected = async () => {
    throw new Error("Unexpected flow definition store command");
  };
  return {
    executeCreate: unexpected,
    executeDraftUpdate: unexpected,
    executePublish: unexpected,
    executeCreateNextDraft: unexpected,
    executeMigration: unexpected,
    ...overrides
  } as FlowDefinitionControlStore;
}

function createdDefinition(
  prepared: Parameters<FlowDefinitionControlStore["executeCreate"]>[0] extends {
    prepare: () => infer T;
  }
    ? T extends { kind: "accepted"; value: infer V }
      ? V
      : never
    : never
): FlowDefinitionV2 {
  return {
    schemaVersion: "flow-definition.v2",
    id: flowId,
    ownerUserId,
    name: prepared.name,
    origin: prepared.origin,
    state: "draft",
    approvalMode: prepared.approvalMode,
    revision: 1,
    draftBaseVersionId: null,
    draftGraph: prepared.graph,
    draftPresentation: prepared.presentation,
    latestPublishedVersionId: null,
    latestPublishedVersion: null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null
  };
}

function legacyRecord(
  overrides: Partial<FlowDefinitionControlRecord> = {}
): FlowDefinitionControlRecord {
  return {
    id: flowId,
    ownerUserId,
    name: "Legacy flow",
    origin: null,
    state: "draft",
    approvalMode: "manual_approve",
    revision: 3,
    draftBaseVersionId: null,
    draftGraph: legacyGraph,
    draftPresentation: null,
    latestPublishedVersionId: null,
    latestPublishedVersion: null,
    createdAt: "2026-08-02T18:00:00.000Z",
    updatedAt: "2026-08-02T18:05:00.000Z",
    publishedAt: null,
    ...overrides
  };
}
