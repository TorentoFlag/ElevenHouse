import {
  flowGraphSchema,
  flowGraphV2Schema,
  publishFlowDefinitionCompatibleResponseSchema,
  type FlowGraphRead,
  type FlowGraphV2,
  type FlowCapabilityManifest,
  type FlowPresentationV1
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  createNextFlowDraftV2,
  FlowDefinitionDraftMutationInvalidError,
  FlowDefinitionIdempotencyKeyInvalidError,
  FlowDefinitionIntegrityError,
  FlowDefinitionMigrationRequiredError,
  FlowDefinitionPublishValidationError,
  parseFlowDefinitionPublishedVersionRecord,
  publishFlowDefinitionV2,
  updateFlowDefinitionDraftV2,
  type FlowDefinitionControlRecord,
  type FlowDefinitionControlStore
} from "./flow-definition-control-plane";
import { compileFlowGraphV2, projectFlowCapabilityManifestV1 } from "./flow-graph-v2-compiler";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const flowId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const now = "2026-08-02T19:00:00.000Z";

const graph = flowGraphV2Schema.parse({
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
      displayTitle: "Подготовка завершена",
      configSchemaVersion: 1,
      executorContractVersion: 1,
      config: { goalKey: "consultation_prepared" }
    }
  ],
  edges: [
    {
      id: "manual-to-completed",
      sourceNodeId: "manual",
      targetNodeId: "completed",
      sourceHandle: "next"
    }
  ]
});

const normalizedGraph = flowGraphV2Schema.parse({
  ...graph,
  nodes: [graph.nodes[1], graph.nodes[0]]
});

const presentation: FlowPresentationV1 = {
  schemaVersion: "flow-presentation.v1",
  nodes: [
    { nodeId: "manual", position: { x: 80, y: 120 } },
    { nodeId: "completed", position: { x: 400, y: 120 } }
  ],
  viewport: { x: 0, y: 0, zoom: 1 }
};

const graphCompilation = compileFlowGraphV2(graph);
if (!graphCompilation.capabilityManifest) throw new Error("Expected publishable graph fixture");
const historicalCapabilityManifest = projectFlowCapabilityManifestV1(
  graphCompilation.capabilityManifest
);

describe("flow definition v2 control plane", () => {
  it("updates an exact draft revision through a canonical idempotent command", async () => {
    const fake = createStore();

    const result = await updateFlowDefinitionDraftV2({
      store: fake.store,
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: { expectedRevision: 3, name: "  Новая подготовка  " },
      idempotencyKey: "flow-update-0001",
      now
    });

    expect(result).toMatchObject({
      schemaVersion: "flow-definition.v2",
      name: "Новая подготовка",
      revision: 4,
      draftGraph: graph
    });
    expect(fake.updateWrites).toBe(1);
    expect(fake.store.executeDraftUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          scope: "flows.definition.update-draft.v2",
          ownerUserId,
          actorUserId: ownerUserId,
          resourceId: flowId,
          expectedRevision: 3,
          idempotencyKey: "flow-update-0001",
          requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
        })
      })
    );
  });

  it("hashes normalized update requests deterministically", async () => {
    const fake = createStore();

    await updateFlowDefinitionDraftV2({
      store: fake.store,
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: { expectedRevision: 3, name: " Новая подготовка " },
      idempotencyKey: "flow-update-0002",
      now
    });
    await updateFlowDefinitionDraftV2({
      store: fake.store,
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: { name: "Новая подготовка", expectedRevision: 3 },
      idempotencyKey: "flow-update-0003",
      now
    });

    const hashes = vi
      .mocked(fake.store.executeDraftUpdate)
      .mock.calls.map(([input]) => input.command.requestHash);
    expect(hashes[0]).toBe(hashes[1]);
  });

  it("fails V1 and inconsistent presentation before a draft write", async () => {
    const legacy = createStore({ draftGraph: legacyGraph() });
    await expect(
      updateFlowDefinitionDraftV2({
        store: legacy.store,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId,
        request: { expectedRevision: 3, name: "Новая подготовка" },
        idempotencyKey: "flow-update-legacy",
        now
      })
    ).rejects.toBeInstanceOf(FlowDefinitionMigrationRequiredError);
    expect(legacy.updateWrites).toBe(0);

    const inconsistent = createStore();
    await expect(
      updateFlowDefinitionDraftV2({
        store: inconsistent.store,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId,
        request: {
          expectedRevision: 3,
          graph: graphWithExtraTerminal()
        },
        idempotencyKey: "flow-update-presentation",
        now
      })
    ).rejects.toBeInstanceOf(FlowDefinitionDraftMutationInvalidError);
    expect(inconsistent.updateWrites).toBe(0);
  });

  it("publishes one immutable normalized snapshot from the exact source revision", async () => {
    const fake = createStore();

    const result = await publishFlowDefinitionV2({
      store: fake.store,
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: { expectedRevision: 3 },
      idempotencyKey: "flow-publish-0001",
      now,
      responseVersion: "current_v3",
      persistenceVersion: "current_v2"
    });

    expect(result).toMatchObject({
      flow: {
        id: flowId,
        state: "versioned",
        revision: 4,
        latestPublishedVersionId: versionId,
        latestPublishedVersion: 1
      },
      version: {
        schemaVersion: "flow-published-version.v3",
        id: versionId,
        flowId,
        sourceRevision: 3,
        graph: {
          nodes: [{ id: "completed" }, { id: "manual" }]
        },
        capabilityManifest: {
          schemaVersion: "flow-capability-manifest.v2",
          executionSemanticsVersion: "flow-interpreter.v1",
          triggerMatcher: {
            kind: "manual_client",
            configSchemaVersion: 1,
            matcherContractVersion: 1,
            eventSchemaVersion: 1
          }
        }
      }
    });
    expect(fake.publishWrites).toBe(1);
    expect(fake.store.executePublish).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          scope: "flows.definition.publish.v2",
          expectedRevision: 3,
          requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
        }),
        persistenceVersion: "current_v2"
      })
    );
  });

  it("rejects a fresh v1 publication response but accepts its exact historical replay", async () => {
    const created = createStore(
      {},
      {
        publicationManifest: historicalCapabilityManifest,
        publishResultKind: "created"
      }
    );
    const replayed = createStore(
      {},
      {
        publicationManifest: historicalCapabilityManifest,
        publishResultKind: "replayed"
      }
    );
    const input = {
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: { expectedRevision: 3 },
      idempotencyKey: "flow-publish-v1-boundary",
      now,
      responseVersion: "current_v3",
      persistenceVersion: "current_v2"
    } as const;

    await expect(
      publishFlowDefinitionV2({ ...input, store: created.store })
    ).rejects.toBeInstanceOf(FlowDefinitionIntegrityError);
    expect(created.publishWrites).toBe(0);
    await expect(
      publishFlowDefinitionV2({ ...input, store: replayed.store })
    ).resolves.toMatchObject({
      version: { capabilityManifest: historicalCapabilityManifest }
    });
  });

  it("allows an exact legacy transport projection without downgrading the prepared snapshot", async () => {
    const fake = createStore();

    await expect(
      publishFlowDefinitionV2({
        store: fake.store,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId,
        request: { expectedRevision: 3 },
        idempotencyKey: "flow-publish-legacy-transport",
        now,
        responseVersion: "legacy_v2",
        persistenceVersion: "current_v2"
      })
    ).resolves.toMatchObject({
      version: {
        schemaVersion: "flow-published-version.v2",
        capabilityManifest: historicalCapabilityManifest
      }
    });
    expect(fake.publishWrites).toBe(1);
  });

  it("rejects current wire publication when the persistence rollout is still legacy", async () => {
    const fake = createStore();

    await expect(
      publishFlowDefinitionV2({
        store: fake.store,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId,
        request: { expectedRevision: 3 },
        idempotencyKey: "flow-publish-invalid-rollout-pair",
        now,
        responseVersion: "current_v3",
        persistenceVersion: "legacy_v1"
      })
    ).rejects.toBeInstanceOf(FlowDefinitionIntegrityError);
    expect(fake.store.executePublish).not.toHaveBeenCalled();
  });

  it("fails closed when persisted v2 publication metadata has an unknown manifest schema", () => {
    expect(() =>
      parseFlowDefinitionPublishedVersionRecord({
        id: versionId,
        flowId,
        version: 1,
        sourceRevision: 3,
        approvalMode: "manual_approve",
        graph: normalizedGraph,
        presentation,
        capabilityManifest: {
          schemaVersion: "flow-capability-manifest.forged",
          executionSemanticsVersion: "flow-interpreter.v1",
          nodeExecutors: [],
          requiredCapabilities: []
        },
        publishedAt: now
      })
    ).toThrow(FlowDefinitionIntegrityError);
  });

  it("parses exact current and historical published-version records without transport fields", () => {
    expect(
      parseFlowDefinitionPublishedVersionRecord({
        id: versionId,
        flowId,
        version: 2,
        sourceRevision: 3,
        approvalMode: "manual_approve",
        graph: normalizedGraph,
        presentation,
        capabilityManifest: graphCompilation.capabilityManifest,
        publishedAt: now
      })
    ).toEqual({
      id: versionId,
      flowId,
      version: 2,
      sourceRevision: 3,
      approvalMode: "manual_approve",
      graph: normalizedGraph,
      presentation,
      capabilityManifest: graphCompilation.capabilityManifest,
      publishedAt: now
    });

    expect(
      parseFlowDefinitionPublishedVersionRecord({
        id: versionId,
        flowId,
        version: 1,
        sourceRevision: null,
        approvalMode: "manual_approve",
        graph: legacyGraph(),
        presentation: null,
        capabilityManifest: null,
        publishedAt: now
      })
    ).toEqual({
      id: versionId,
      flowId,
      version: 1,
      sourceRevision: null,
      approvalMode: "manual_approve",
      graph: legacyGraph(),
      presentation: null,
      capabilityManifest: null,
      publishedAt: now
    });
  });

  it("rejects an unpublishable graph and invalid idempotency key before writes", async () => {
    const invalidGraph: FlowGraphV2 = { ...graph, edges: [] };
    const invalid = createStore({ draftGraph: invalidGraph });

    await expect(
      publishFlowDefinitionV2({
        store: invalid.store,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId,
        request: { expectedRevision: 3 },
        idempotencyKey: "flow-publish-invalid",
        now,
        responseVersion: "current_v3",
        persistenceVersion: "current_v2"
      })
    ).rejects.toBeInstanceOf(FlowDefinitionPublishValidationError);
    expect(invalid.publishWrites).toBe(0);

    const malformedKey = createStore();
    await expect(
      publishFlowDefinitionV2({
        store: malformedKey.store,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId,
        request: { expectedRevision: 3 },
        idempotencyKey: "bad key",
        now,
        responseVersion: "current_v3",
        persistenceVersion: "current_v2"
      })
    ).rejects.toBeInstanceOf(FlowDefinitionIdempotencyKeyInvalidError);
    expect(malformedKey.store.executePublish).not.toHaveBeenCalled();
  });

  it("rejects a stale revision before changing the aggregate", async () => {
    const fake = createStore();

    await expect(
      updateFlowDefinitionDraftV2({
        store: fake.store,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId,
        request: { expectedRevision: 2, name: "Устаревшее изменение" },
        idempotencyKey: "flow-update-stale",
        now
      })
    ).rejects.toMatchObject({
      expectedRevision: 2,
      currentRevision: 3
    });
    expect(fake.updateWrites).toBe(0);
  });

  it("surfaces persisted V2 corruption before returning a stale revision conflict", async () => {
    const fake = createStore({
      draftPresentation: {
        ...presentation,
        nodes: [presentation.nodes[0]!]
      }
    });

    await expect(
      updateFlowDefinitionDraftV2({
        store: fake.store,
        actorUserId: ownerUserId,
        ownerUserId,
        flowId,
        request: { expectedRevision: 2, name: "Устаревшее изменение" },
        idempotencyKey: "flow-update-corrupt-stale",
        now
      })
    ).rejects.toBeInstanceOf(FlowDefinitionIntegrityError);
    expect(fake.updateWrites).toBe(0);
  });

  it("creates an explicit next draft from the immutable latest V2 version", async () => {
    const fake = createStore({
      state: "versioned",
      latestPublishedVersionId: versionId,
      latestPublishedVersion: 1,
      publishedAt: now
    });

    const result = await createNextFlowDraftV2({
      store: fake.store,
      actorUserId: ownerUserId,
      ownerUserId,
      flowId,
      request: { expectedRevision: 3, baseVersionId: versionId },
      idempotencyKey: "flow-next-draft-0001",
      now
    });

    expect(result).toMatchObject({
      state: "draft",
      revision: 4,
      draftBaseVersionId: versionId,
      draftGraph: normalizedGraph,
      draftPresentation: presentation,
      latestPublishedVersionId: versionId,
      latestPublishedVersion: 1
    });
    expect(fake.nextDraftWrites).toBe(1);
    expect(fake.store.executeCreateNextDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          scope: "flows.definition.create-next-draft.v2",
          resourceId: flowId,
          expectedRevision: 3
        })
      })
    );
  });
});

function createStore(
  overrides: Partial<FlowDefinitionControlRecord> = {},
  options: {
    readonly publicationManifest?: FlowCapabilityManifest;
    readonly publishResultKind?: "created" | "replayed";
  } = {}
): {
  readonly store: FlowDefinitionControlStore;
  readonly updateWrites: number;
  readonly publishWrites: number;
  readonly nextDraftWrites: number;
} {
  const current: FlowDefinitionControlRecord = { ...record(), ...overrides };
  let updateWrites = 0;
  let publishWrites = 0;
  let nextDraftWrites = 0;
  const store: FlowDefinitionControlStore = {
    executeCreate: vi.fn(async () => {
      throw new Error("Unexpected create command");
    }),
    executeDraftUpdate: vi.fn(async (input) => {
      const prepared = input.prepare(current);
      if (prepared.kind === "rejected") {
        return {
          kind: "created" as const,
          outcome: { kind: "rejected" as const, response: prepared.response }
        };
      }
      updateWrites += 1;
      return {
        kind: "created" as const,
        outcome: {
          kind: "succeeded" as const,
          response: { statusCode: 200 as const, body: prepared.value }
        }
      };
    }),
    executePublish: vi.fn(async (input) => {
      const prepared = input.prepare(current);
      if (prepared.kind === "rejected") {
        return {
          kind: "created" as const,
          outcome: { kind: "rejected" as const, response: prepared.response }
        };
      }
      const origin = current.origin;
      if (origin === null) throw new Error("V2 publication requires definition origin");
      const publicationManifest =
        options.publicationManifest ??
        (input.responseVersion === "current_v3"
          ? prepared.value.capabilityManifest
          : prepared.value.legacyCapabilityManifest);
      const version = {
        schemaVersion:
          publicationManifest.schemaVersion === "flow-capability-manifest.v1"
            ? ("flow-published-version.v2" as const)
            : ("flow-published-version.v3" as const),
        id: versionId,
        flowId,
        version: 1,
        sourceRevision: prepared.value.sourceRevision,
        status: "published" as const,
        approvalMode: prepared.value.approvalMode,
        graph: prepared.value.graph,
        presentation: prepared.value.presentation,
        capabilityManifest: publicationManifest,
        publishedAt: now
      };
      const body = publishFlowDefinitionCompatibleResponseSchema.parse({
        flow: {
          schemaVersion: "flow-definition.v2" as const,
          ...current,
          origin,
          state: "versioned" as const,
          revision: current.revision + 1,
          draftBaseVersionId: null,
          draftGraph: prepared.value.graph,
          latestPublishedVersionId: versionId,
          latestPublishedVersion: 1,
          updatedAt: now,
          publishedAt: now
        },
        version
      });
      const resultKind = options.publishResultKind ?? ("created" as const);
      if (resultKind === "created") {
        input.assertCreatedResponse(body);
        publishWrites += 1;
      }
      return {
        kind: resultKind,
        outcome: {
          kind: "succeeded" as const,
          response: {
            statusCode: 200 as const,
            body
          }
        }
      };
    }),
    executeCreateNextDraft: vi.fn(async (input) => {
      const prepared = input.prepare(current, {
        id: versionId,
        flowId,
        version: 1,
        sourceRevision: 2,
        approvalMode: current.approvalMode,
        graph: normalizedGraph,
        presentation,
        capabilityManifest: {
          schemaVersion: "flow-capability-manifest.v1",
          executionSemanticsVersion: "flow-interpreter.v1",
          nodeExecutors: [
            { kind: "completed", configSchemaVersion: 1, executorContractVersion: 1 },
            { kind: "manual_client", configSchemaVersion: 1, executorContractVersion: 1 }
          ],
          requiredCapabilities: []
        },
        publishedAt: now
      });
      if (prepared.kind === "rejected") {
        return {
          kind: "created" as const,
          outcome: { kind: "rejected" as const, response: prepared.response }
        };
      }
      nextDraftWrites += 1;
      return {
        kind: "created" as const,
        outcome: {
          kind: "succeeded" as const,
          response: { statusCode: 200 as const, body: prepared.value }
        }
      };
    }),
    executeMigration: vi.fn(async () => {
      throw new Error("Unexpected migration command");
    })
  };

  return {
    store,
    get updateWrites() {
      return updateWrites;
    },
    get publishWrites() {
      return publishWrites;
    },
    get nextDraftWrites() {
      return nextDraftWrites;
    }
  };
}

function record(): FlowDefinitionControlRecord {
  return {
    id: flowId,
    ownerUserId,
    name: "Подготовка к консультации",
    origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
    state: "draft",
    approvalMode: "manual_approve",
    revision: 3,
    draftBaseVersionId: null,
    draftGraph: graph,
    draftPresentation: presentation,
    latestPublishedVersionId: null,
    latestPublishedVersion: null,
    createdAt: "2026-08-02T18:00:00.000Z",
    updatedAt: "2026-08-02T18:05:00.000Z",
    publishedAt: null
  };
}

function legacyGraph(): FlowGraphRead {
  return flowGraphSchema.parse({
    schemaVersion: "flow-graph.v1",
    nodes: [
      {
        id: "manual",
        category: "trigger",
        kind: "manual",
        title: "Ручной запуск",
        config: {}
      }
    ],
    edges: []
  });
}

function graphWithExtraTerminal(): FlowGraphV2 {
  return flowGraphV2Schema.parse({
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        id: "failed",
        kind: "failed",
        displayTitle: "Ошибка",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: { errorCode: "preparation_failed" }
      }
    ]
  });
}
