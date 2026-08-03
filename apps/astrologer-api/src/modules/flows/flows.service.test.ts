import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  compileFlowGraphV2,
  type FlowDefinitionControlStore,
  type FlowDefinitionQueryStore,
  type FlowRuntimeStore,
  type FlowStore
} from "@elevenhouse/domain";
import type {
  FlowApproval,
  FlowDefinitionDetailV2,
  FlowDefinitionSummaryV2,
  FlowDefinitionV2,
  FlowGraph,
  FlowGraphV2,
  FlowPresentationV1,
  MigrateFlowDefinitionV2Response,
  PublishFlowDefinitionV2Response,
  FlowRuntimeEvent,
  FlowRunResponse
} from "@elevenhouse/contracts";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import {
  csrfRequiredMetadataKey,
  idempotencyRequiredMetadataKey
} from "../security/route-policy/route-security-metadata";
import { FlowsController } from "./flows.controller";
import { FlowApprovalsController } from "./flow-approvals.controller";
import { FlowRunsController } from "./flow-runs.controller";
import { FlowsService } from "./flows.service";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const flowId = "00000000-0000-4000-8000-000000000002";
const versionId = "00000000-0000-4000-8000-000000000003";
const clientUserId = "00000000-0000-4000-8000-000000000009";
const now = "2026-07-26T12:00:00.000Z";
const runtimeAvailability = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "legacy_preview"
} as const;
type CurrentFlowDefinitionSummaryV2 = Extract<
  FlowDefinitionSummaryV2,
  { graphSchemaVersion: "flow-graph.v2" }
>;
type CurrentFlowDefinitionDetailV2 = Extract<
  FlowDefinitionDetailV2,
  { graphSchemaVersion: "flow-graph.v2" }
>;

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

const graphV2: FlowGraphV2 = {
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
};

const graphV2Compilation = compileFlowGraphV2(graphV2);
if (!graphV2Compilation.normalizedGraph || !graphV2Compilation.capabilityManifest) {
  throw new Error("Expected valid V2 graph fixture");
}
const normalizedGraphV2 = graphV2Compilation.normalizedGraph;
const capabilityManifestV1 = graphV2Compilation.capabilityManifest;
const presentationV1: FlowPresentationV1 = {
  schemaVersion: "flow-presentation.v1",
  nodes: [
    { nodeId: "manual", position: { x: 80, y: 120 } },
    { nodeId: "completed", position: { x: 400, y: 120 } }
  ],
  viewport: { x: 0, y: 0, zoom: 1 }
};

describe("FlowsService", () => {
  it("lists built-in templates through the API contract", async () => {
    const response = await createService().listFlowTemplates({ locale: "en" });

    expect(response).toMatchObject({
      schemaVersion: "flow-definition-template-catalog.v2",
      catalogVersion: 1,
      locale: "en"
    });
    expect(response.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "manual-consultation-preparation",
          availability: "available"
        }),
        expect.objectContaining({ key: "session-prep", availability: "legacy_read_only" })
      ])
    );
    expect(response.templates.every((template) => !("graph" in template))).toBe(true);
  });

  it("creates, lists and gets owner-scoped V2 definitions", async () => {
    const store = createFlowStore();
    const definitionStore = createDefinitionControlStore();
    const definitionQueryStore = createDefinitionQueryStore();
    const service = createService({ store, definitionStore, definitionQueryStore });

    const created = await service.createFlow(
      {
        schemaVersion: "flow-definition-create.v2",
        name: "Welcome funnel",
        locale: "ru",
        source: { type: "blank" }
      },
      "flow-create-request-1",
      request()
    );
    const listed = await service.listFlows(
      { state: "draft", runtimeStatus: "all", limit: "10", offset: "0" },
      request()
    );
    const detail = await service.getFlow(flowId, request());

    expect(created).toMatchObject({
      schemaVersion: "flow-definition.v2",
      ownerUserId,
      name: "Welcome funnel",
      state: "draft",
      origin: { type: "blank" }
    });
    expect(listed.total).toBe(1);
    expect(listed.runtime).toEqual(runtimeAvailability);
    expect(detail).toMatchObject({ id: flowId, graphSchemaVersion: "flow-graph.v2" });
    expect(definitionStore.executeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          scope: "flows.definition.create.v2",
          resourceId: ownerUserId,
          idempotencyKey: "flow-create-request-1"
        })
      })
    );
    expect(definitionQueryStore.listByOwner).toHaveBeenCalledWith({
      ownerUserId,
      query: { state: "draft", runtimeStatus: "all", limit: 10, offset: 0 }
    });
    expect(definitionQueryStore.getByOwner).toHaveBeenCalledWith({ ownerUserId, flowId });
    expect(store.createDraft).not.toHaveBeenCalled();
    expect(store.listByOwner).not.toHaveBeenCalled();
  });

  it("routes V2 draft, publish and next-draft commands through the durable control store", async () => {
    const store = createFlowStore();
    const definitionStore = createDefinitionControlStore();
    const service = createService({ store, definitionStore });

    const updated = await service.updateFlowDraft(
      flowId,
      { expectedRevision: 1, name: "After purchase" },
      "flow-update-request-1",
      request()
    );
    const published = await service.publishFlow(
      flowId,
      { expectedRevision: 1 },
      "flow-publish-request-1",
      request()
    );
    const nextDraft = await service.createNextFlowDraft(
      flowId,
      { expectedRevision: 2, baseVersionId: versionId },
      "flow-next-draft-request-1",
      request()
    );

    expect(updated.name).toBe("After purchase");
    expect(updated).toMatchObject({ schemaVersion: "flow-definition.v2", revision: 2 });
    expect(published).toMatchObject({
      flow: {
        id: flowId,
        state: "versioned",
        revision: 2
      },
      version: {
        id: versionId,
        sourceRevision: 1,
        version: 1,
        graph: normalizedGraphV2
      }
    });
    expect(nextDraft).toMatchObject({
      state: "draft",
      revision: 3,
      draftBaseVersionId: versionId,
      latestPublishedVersionId: versionId
    });
    expect(definitionStore.executeDraftUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          scope: "flows.definition.update-draft.v2",
          actorUserId: ownerUserId,
          ownerUserId,
          resourceId: flowId,
          expectedRevision: 1,
          idempotencyKey: "flow-update-request-1"
        })
      })
    );
    expect(definitionStore.executePublish).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          scope: "flows.definition.publish.v2",
          idempotencyKey: "flow-publish-request-1"
        })
      })
    );
    expect(definitionStore.executeCreateNextDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          scope: "flows.definition.create-next-draft.v2",
          idempotencyKey: "flow-next-draft-request-1"
        })
      })
    );
    expect(store.updateDraft).not.toHaveBeenCalled();
    expect(store.publishDraft).not.toHaveBeenCalled();
  });

  it("migrates one legacy definition through an explicit idempotent route command", async () => {
    const definitionStore = createDefinitionControlStore();
    const service = createService({ definitionStore });

    const migrated = await service.migrateFlowDefinition(
      flowId,
      {
        schemaVersion: "flow-definition-migrate.v2",
        expectedRevision: 1,
        targetGraphSchemaVersion: "flow-graph.v2"
      },
      "flow-migrate-request-1",
      request()
    );

    expect(migrated).toMatchObject({
      flow: { id: flowId, origin: { type: "migration" }, revision: 2 },
      migration: { sourceRevision: 1, targetGraphSchemaVersion: "flow-graph.v2" }
    });
    expect(definitionStore.executeMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          scope: "flows.definition.migrate.v2",
          resourceId: flowId,
          idempotencyKey: "flow-migrate-request-1"
        })
      })
    );
  });

  it("validates an owner-scoped v2 definition without persistence writes", async () => {
    const store = createFlowStore();
    const definitionQueryStore = createDefinitionQueryStore();
    const runtimeStore = createRuntimeStore();
    const service = createService({ store, definitionQueryStore, runtimeStore });

    await expect(
      service.validateFlowDefinition(flowId, { graph: graphV2 }, request())
    ).resolves.toMatchObject({
      graphSchemaVersion: "flow-graph.v2",
      publishable: true,
      activatable: false,
      issues: [],
      activationBlockers: ["FLOW_RUNTIME_EXECUTION_UNAVAILABLE"],
      normalizedGraph: expect.objectContaining({ schemaVersion: "flow-graph.v2" }),
      capabilityManifest: expect.objectContaining({
        schemaVersion: "flow-capability-manifest.v1"
      })
    });

    expect(definitionQueryStore.getByOwner).toHaveBeenCalledWith({ ownerUserId, flowId });
    expect(store.createDraft).not.toHaveBeenCalled();
    expect(store.updateDraft).not.toHaveBeenCalled();
    expect(store.publishDraft).not.toHaveBeenCalled();
    expect(store.transitionStatus).not.toHaveBeenCalled();
    expect(runtimeStore.createEvent).not.toHaveBeenCalled();
    expect(runtimeStore.createRunForEventDedupe).not.toHaveBeenCalled();
  });

  it("returns migration and no-leak not-found results from definition validation", async () => {
    const service = createService();

    await expect(
      service.validateFlowDefinition(flowId, { graph }, request())
    ).resolves.toMatchObject({
      graphSchemaVersion: "flow-graph.v1",
      publishable: false,
      activatable: false,
      issues: [expect.objectContaining({ code: "migration_required" })],
      activationBlockers: expect.arrayContaining([
        "FLOW_GRAPH_MIGRATION_REQUIRED",
        "FLOW_RUNTIME_EXECUTION_UNAVAILABLE"
      ])
    });

    const missingQueryStore = createDefinitionQueryStore({
      getByOwner: vi.fn(async () => null)
    });
    await expect(
      createService({ definitionQueryStore: missingQueryStore }).validateFlowDefinition(
        flowId,
        { graph: graphV2 },
        request()
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("maps unavailable activation to conflict and keeps pause available", async () => {
    const activeFlow = flow({
      status: "active",
      publishedVersionId: versionId,
      publishedVersion: 1,
      publishedAt: now
    });
    const pausedFlow = flow({
      status: "paused",
      publishedVersionId: versionId,
      publishedVersion: 1,
      publishedAt: now
    });
    const transitionStatus = vi.fn(async () => pausedFlow);
    const findByOwnerAndId = vi
      .fn()
      .mockResolvedValueOnce(
        flow({
          status: "published",
          publishedVersionId: versionId,
          publishedVersion: 1,
          publishedAt: now
        })
      )
      .mockResolvedValueOnce(activeFlow);
    const store = createFlowStore({
      findByOwnerAndId,
      transitionStatus
    } as Partial<FlowStore>);
    const service = createService({ store });

    await expect(service.activateFlow(flowId, request())).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" })
    });
    await expect(service.pauseFlow(flowId, request())).resolves.toEqual(pausedFlow);

    expect(transitionStatus).toHaveBeenCalledTimes(1);
    expect(transitionStatus).toHaveBeenCalledWith({
      ownerUserId,
      flowId,
      fromStatuses: ["active"],
      toStatus: "paused",
      now
    });
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.activateFlow)
    ).toBe(true);
    expect(Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.pauseFlow)).toBe(
      true
    );
  });

  it("maps missing reads and persisted publish rejections to explicit HTTP errors", async () => {
    const definitionQueryStore = createDefinitionQueryStore({
      getByOwner: vi.fn(async () => null)
    });
    const service = createService({ definitionQueryStore });

    await expect(service.getFlow(flowId, request())).rejects.toBeInstanceOf(NotFoundException);

    const unsafeStore = createFlowStore();
    const definitionStore = createDefinitionControlStore({
      executePublish: vi.fn(async () => ({
        kind: "created" as const,
        outcome: {
          kind: "rejected" as const,
          response: {
            statusCode: 422 as const,
            body: {
              code: "FLOW_GRAPH_NOT_PUBLISHABLE" as const,
              issues: [
                {
                  code: "unterminated_path" as const,
                  severity: "error" as const,
                  blocking: true as const,
                  path: "nodes[manual]",
                  message: "Every reachable path must terminate"
                }
              ]
            }
          }
        }
      }))
    });

    await expect(
      createService({ store: unsafeStore, definitionStore }).publishFlow(
        flowId,
        { expectedRevision: 1 },
        "flow-publish-invalid-1",
        request()
      )
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({ code: "FLOW_GRAPH_NOT_PUBLISHABLE" })
    });
    await expect(
      createService({ store: unsafeStore, definitionStore }).publishFlow(
        flowId,
        { expectedRevision: 1 },
        "flow-publish-invalid-2",
        request()
      )
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(unsafeStore.publishDraft).not.toHaveBeenCalled();
  });

  it("requires an astrologer session and validates request bodies", async () => {
    const service = createService();

    await expect(service.listFlows({}, {} as AstrologerSessionRequest)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    await expect(
      service.createFlow(
        {
          schemaVersion: "flow-definition-create.v2",
          name: "",
          locale: "ru",
          source: { type: "blank" }
        },
        "flow-create-invalid-1",
        request()
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps unavailable simulation to conflict without runtime persistence", async () => {
    const runtimeStore = createRuntimeStore();
    const service = createService({
      store: createFlowStore({
        findByOwnerAndId: vi.fn(async () =>
          flow({
            status: "active",
            publishedVersionId: versionId,
            publishedVersion: 1,
            publishedAt: now
          })
        )
      }),
      runtimeStore
    });

    await expect(service.simulateFlow(flowId, runtimeRequest(), request())).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" })
    });

    expect(runtimeStore.createRunForEventDedupe).not.toHaveBeenCalled();
    expect(runtimeStore.createEvent).not.toHaveBeenCalled();
  });

  it("rejects runtime commands for flows without a published version", async () => {
    const runtimeStore = createRuntimeStore();
    const service = createService({
      store: createFlowStore({
        findByOwnerAndId: vi.fn(async () => flow({ status: "draft", publishedVersionId: null }))
      }),
      runtimeStore
    });

    await expect(service.simulateFlow(flowId, runtimeRequest(), request())).rejects.toMatchObject({
      response: expect.objectContaining({ code: "FLOW_RUNTIME_VERSION_REQUIRED" })
    });
    await expect(
      service.createManualRun(flowId, runtimeRequest(), request())
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "FLOW_RUNTIME_VERSION_REQUIRED" })
    });

    expect(runtimeStore.createRunForEventDedupe).not.toHaveBeenCalled();
    expect(runtimeStore.createEvent).not.toHaveBeenCalled();
  });

  it("does not resolve client gates while execution is unavailable", async () => {
    const runtimeStore = createRuntimeStore();
    const service = createService({
      store: createFlowStore({
        findByOwnerAndId: vi.fn(async () =>
          flow({
            status: "active",
            publishedVersionId: versionId,
            publishedVersion: 1,
            publishedAt: now
          })
        )
      }),
      runtimeStore
    });

    await expect(service.simulateFlow(flowId, runtimeRequest(), request())).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" })
    });
    await expect(
      service.createManualRun(flowId, runtimeRequest(), request())
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" })
    });

    expect(runtimeStore.createRunForEventDedupe).not.toHaveBeenCalled();
  });

  it("maps invalid simulation bodies and missing runtime records to flow API errors", async () => {
    const runtimeStore = createRuntimeStore({
      findRunById: vi.fn(async () => null),
      decideApproval: vi.fn(async () => null)
    });
    const service = createService({ runtimeStore });

    await expect(
      service.simulateFlow(flowId, { source: "manual" }, request())
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getFlowRun(runId, request())).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.decideFlowApproval(approvalId, { decision: "approved" }, request())
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" })
    });
  });

  it("blocks manual execution and approval decisions while keeping runtime reads available", async () => {
    const runtimeStore = createRuntimeStore();
    const service = createService({
      store: createFlowStore({
        findByOwnerAndId: vi.fn(async () =>
          flow({
            status: "active",
            publishedVersionId: versionId,
            publishedVersion: 1,
            publishedAt: now
          })
        )
      }),
      runtimeStore
    });

    await expect(
      service.createManualRun(flowId, runtimeRequest(), request())
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" })
    });
    await expect(service.listFlowRuns(flowId, { status: "all" }, request())).resolves.toEqual({
      runs: [run],
      total: 1,
      runtime: runtimeAvailability
    });
    await expect(service.getFlowRun(runId, request())).resolves.toEqual({
      run,
      runtime: runtimeAvailability
    });
    await expect(service.cancelFlowRun(runId, request())).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" })
    });
    await expect(service.listFlowApprovals({ status: "pending" }, request())).resolves.toEqual({
      approvals: [approval],
      total: 1,
      runtime: runtimeAvailability
    });
    await expect(
      service.decideFlowApproval(approvalId, { decision: "approved", note: "ok" }, request())
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" })
    });

    expect(runtimeStore.listRuns).toHaveBeenCalledWith({
      ownerUserId,
      flowId,
      status: "all",
      limit: 50,
      offset: 0
    });
    expect(runtimeStore.cancelRun).not.toHaveBeenCalled();
  });

  it("consumes matching module events as unavailable without runtime persistence", async () => {
    const listActiveByTriggerKind = vi.fn(async () => [
      flow({
        status: "active",
        publishedVersionId: versionId,
        publishedVersion: 1,
        publishedAt: now
      })
    ]);
    const runtimeStore = createRuntimeStore();
    const service = createService({
      store: createFlowStore({
        listActiveByTriggerKind,
        findByOwnerAndId: vi.fn(async () =>
          flow({
            status: "active",
            publishedVersionId: versionId,
            publishedVersion: 1,
            publishedAt: now
          })
        )
      }),
      runtimeStore
    });

    await expect(
      service.dispatchRuntimeEvent({
        ownerUserId,
        triggerKind: "lead_created",
        source: "crm",
        sourceEventId: "crm:lead:client-1",
        subjectType: "client",
        subjectId: clientUserId,
        occurredAt: now,
        timeZone: "Europe/Moscow",
        payload: { clientUserId }
      })
    ).resolves.toEqual({
      status: "execution_unavailable",
      matchedFlows: 1,
      reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
      total: 0,
      results: []
    });

    expect(listActiveByTriggerKind).toHaveBeenCalledWith({
      ownerUserId,
      triggerKind: "lead_created"
    });
    expect(runtimeStore.createRunForEventDedupe).not.toHaveBeenCalled();
  });
});

describe("FlowsController", () => {
  it("marks durable flow mutations as CSRF-protected", () => {
    expect(Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.createFlow)).toBe(
      true
    );
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.updateFlowDraft)
    ).toBe(true);
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.validateFlowDefinition)
    ).toBe(true);
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.publishFlow)
    ).toBe(true);
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.createNextFlowDraft)
    ).toBe(true);
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.migrateFlowDefinition)
    ).toBe(true);
    expect(
      Reflect.getMetadata(idempotencyRequiredMetadataKey, FlowsController.prototype.createFlow)
    ).toEqual({ scope: "flows.definition.create.v2" });
    expect(
      Reflect.getMetadata(idempotencyRequiredMetadataKey, FlowsController.prototype.updateFlowDraft)
    ).toEqual({ scope: "flows.definition.update-draft.v2" });
    expect(
      Reflect.getMetadata(idempotencyRequiredMetadataKey, FlowsController.prototype.publishFlow)
    ).toEqual({ scope: "flows.definition.publish.v2" });
    expect(
      Reflect.getMetadata(
        idempotencyRequiredMetadataKey,
        FlowsController.prototype.createNextFlowDraft
      )
    ).toEqual({ scope: "flows.definition.create-next-draft.v2" });
    expect(
      Reflect.getMetadata(
        idempotencyRequiredMetadataKey,
        FlowsController.prototype.migrateFlowDefinition
      )
    ).toEqual({ scope: "flows.definition.migrate.v2" });
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.simulateFlow)
    ).toBe(true);
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.createManualRun)
    ).toBe(true);
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowRunsController.prototype.cancelFlowRun)
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        csrfRequiredMetadataKey,
        FlowApprovalsController.prototype.decideFlowApproval
      )
    ).toBe(true);
  });
});

function createService(
  overrides: {
    readonly store?: FlowStore;
    readonly definitionStore?: FlowDefinitionControlStore;
    readonly definitionQueryStore?: FlowDefinitionQueryStore;
    readonly runtimeStore?: FlowRuntimeStore;
    readonly clock?: SystemClock;
  } = {}
) {
  return new FlowsService(
    overrides.store ?? createFlowStore(),
    overrides.definitionStore ?? createDefinitionControlStore(),
    overrides.definitionQueryStore ?? createDefinitionQueryStore(),
    overrides.runtimeStore ?? createRuntimeStore(),
    overrides.clock ?? ({ now: () => new Date(now) } as SystemClock)
  );
}

function createDefinitionControlStore(
  overrides: Partial<FlowDefinitionControlStore> = {}
): FlowDefinitionControlStore {
  return {
    executeCreate: vi.fn(async () => ({
      kind: "created" as const,
      outcome: {
        kind: "succeeded" as const,
        response: { statusCode: 201 as const, body: definitionV2() }
      }
    })),
    executeDraftUpdate: vi.fn(async () => ({
      kind: "created" as const,
      outcome: {
        kind: "succeeded" as const,
        response: {
          statusCode: 200 as const,
          body: definitionV2({ name: "After purchase", revision: 2 })
        }
      }
    })),
    executePublish: vi.fn(async () => ({
      kind: "created" as const,
      outcome: {
        kind: "succeeded" as const,
        response: { statusCode: 200 as const, body: publishedDefinitionV2() }
      }
    })),
    executeCreateNextDraft: vi.fn(async () => ({
      kind: "created" as const,
      outcome: {
        kind: "succeeded" as const,
        response: {
          statusCode: 200 as const,
          body: definitionV2({
            state: "draft",
            revision: 3,
            draftBaseVersionId: versionId,
            latestPublishedVersionId: versionId,
            latestPublishedVersion: 1,
            publishedAt: now
          })
        }
      }
    })),
    executeMigration: vi.fn(async () => ({
      kind: "created" as const,
      outcome: {
        kind: "succeeded" as const,
        response: { statusCode: 200 as const, body: migratedDefinitionV2() }
      }
    })),
    ...overrides
  };
}

function definitionV2(overrides: Partial<FlowDefinitionV2> = {}): FlowDefinitionV2 {
  return {
    schemaVersion: "flow-definition.v2",
    id: flowId,
    ownerUserId,
    name: "Welcome funnel",
    origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
    state: "draft",
    approvalMode: "manual_approve",
    revision: 1,
    draftBaseVersionId: null,
    draftGraph: normalizedGraphV2,
    draftPresentation: presentationV1,
    latestPublishedVersionId: null,
    latestPublishedVersion: null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    ...overrides
  };
}

function migratedDefinitionV2(): MigrateFlowDefinitionV2Response {
  return {
    flow: definitionV2({
      origin: {
        schemaVersion: "flow-definition-origin.v1",
        type: "migration",
        sourceGraphSchemaVersion: "flow-graph.v1",
        sourceVersionId: null
      },
      revision: 2
    }),
    migration: {
      schemaVersion: "flow-definition-migration.v1",
      sourceGraphSchemaVersion: "flow-graph.v1",
      targetGraphSchemaVersion: "flow-graph.v2",
      sourceVersionId: null,
      sourceRevision: 1,
      sourceGraphHash: `sha256:${"0".repeat(64)}`,
      migratedAt: now
    }
  };
}

function definitionSummaryV2(
  overrides: Partial<CurrentFlowDefinitionSummaryV2> = {}
): CurrentFlowDefinitionSummaryV2 {
  return {
    schemaVersion: "flow-definition-summary.v2",
    id: flowId,
    ownerUserId,
    name: "Welcome funnel",
    state: "draft",
    runtimeStatus: "draft",
    approvalMode: "manual_approve",
    revision: 1,
    draftBaseVersionId: null,
    latestPublishedVersionId: null,
    latestPublishedVersion: null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    graphSchemaVersion: "flow-graph.v2",
    origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
    migrationRequired: false,
    ...overrides
  };
}

function definitionDetailV2(
  overrides: Partial<CurrentFlowDefinitionDetailV2> = {}
): CurrentFlowDefinitionDetailV2 {
  return {
    ...definitionSummaryV2(),
    schemaVersion: "flow-definition-detail.v2",
    draftGraph: normalizedGraphV2,
    draftPresentation: presentationV1,
    ...overrides
  };
}

function createDefinitionQueryStore(
  overrides: Partial<FlowDefinitionQueryStore> = {}
): FlowDefinitionQueryStore {
  return {
    listByOwner: vi.fn(async () => ({ flows: [definitionSummaryV2()], total: 1 })),
    getByOwner: vi.fn(async () => definitionDetailV2()),
    ...overrides
  };
}

function publishedDefinitionV2(): PublishFlowDefinitionV2Response {
  return {
    flow: definitionV2({
      state: "versioned",
      revision: 2,
      latestPublishedVersionId: versionId,
      latestPublishedVersion: 1,
      publishedAt: now
    }),
    version: {
      schemaVersion: "flow-published-version.v2",
      id: versionId,
      flowId,
      version: 1,
      sourceRevision: 1,
      status: "published",
      approvalMode: "manual_approve",
      graph: normalizedGraphV2,
      presentation: presentationV1,
      capabilityManifest: capabilityManifestV1,
      publishedAt: now
    }
  };
}

function createFlowStore(overrides: Partial<FlowStore> = {}): FlowStore {
  return {
    createDraft: vi.fn(async (input) =>
      flow({
        ownerUserId: input.ownerUserId,
        name: input.name,
        approvalMode: input.approvalMode,
        draftGraph: input.graph
      })
    ),
    listByOwner: vi.fn(async () => ({ flows: [flow()], total: 1 })),
    findByOwnerAndId: vi.fn(async () => flow()),
    findPublishedVersionByFlowId: vi.fn(async () => ({
      id: versionId,
      flowId,
      version: 1,
      status: "published" as const,
      approvalMode: "manual_approve" as const,
      graph,
      publishedAt: now
    })),
    listActiveByTriggerKind: vi.fn(async () => [flow()]),
    transitionStatus: vi.fn(async (input) => flow({ status: input.toStatus })),
    updateDraft: vi.fn(async (input) => flow({ name: input.patch.name ?? "Welcome funnel" })),
    publishDraft: vi.fn(async () => ({
      flow: flow({ status: "published", publishedVersionId: versionId, publishedVersion: 1 }),
      version: {
        id: versionId,
        flowId,
        version: 1,
        status: "published" as const,
        approvalMode: "manual_approve" as const,
        graph,
        publishedAt: now
      }
    })),
    ...overrides
  };
}

function flow(overrides: Partial<Awaited<ReturnType<FlowStore["createDraft"]>>> = {}) {
  return {
    id: flowId,
    ownerUserId,
    name: "Welcome funnel",
    status: "draft",
    approvalMode: "manual_approve",
    draftGraph: graph,
    publishedVersionId: null,
    publishedVersion: null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    ...overrides
  } as Awaited<ReturnType<FlowStore["createDraft"]>>;
}

function createRuntimeStore(overrides: Partial<FlowRuntimeStore> = {}): FlowRuntimeStore {
  return {
    createEvent: vi.fn(async () => runtimeEvent),
    findEventByDedupeKey: vi.fn(async () => null),
    findRunByEventAndFlow: vi.fn(async () => null),
    createRun: vi.fn(async () => ({ run, stepRuns: [stepRun], approvals: [approval] })),
    createRunForEventDedupe: vi.fn(async () => ({
      status: "created" as const,
      event: runtimeEvent,
      run,
      stepRuns: [stepRun],
      approvals: [approval]
    })),
    createSuppression: vi.fn(async () => suppression),
    findSuppressionByRun: vi.fn(async () => null),
    createDeliveryAttempt: vi.fn(),
    findRunById: vi.fn(async () => run),
    cancelRun: vi.fn(async () => ({
      ...run,
      status: "canceled" as const,
      currentNodeId: null,
      completedAt: now
    })),
    listRuns: vi.fn(async () => ({ runs: [run], total: 1 })),
    listApprovals: vi.fn(async () => ({ approvals: [approval], total: 1 })),
    decideApproval: vi.fn(async () => approval),
    ...overrides
  };
}

const runId = "00000000-0000-4000-8000-000000000004";
const stepRunId = "00000000-0000-4000-8000-000000000005";
const approvalId = "00000000-0000-4000-8000-000000000006";
const eventId = "00000000-0000-4000-8000-000000000007";

const runtimeEvent = {
  id: eventId,
  ownerUserId,
  source: "manual",
  sourceEventId: "manual:client-1:flow-1",
  dedupeKey: "manual:client-1:flow-1",
  subjectType: "client",
  subjectId: clientUserId,
  occurredAt: now,
  payload: {}
} satisfies FlowRuntimeEvent;

const run = {
  id: runId,
  flowId,
  flowVersionId: versionId,
  ownerUserId,
  sourceEventId: "manual:client-1:flow-1",
  status: "approval_required",
  snapshot: {
    schemaVersion: "flow-run-snapshot.v1",
    flowVersionId: versionId,
    sourceEventId: "manual:client-1:flow-1",
    subjectType: "client",
    subjectId: clientUserId,
    occurredAt: now,
    timeZone: "Europe/Moscow",
    consent: {},
    channels: {},
    payload: {}
  },
  currentNodeId: "draft-reply",
  createdAt: now,
  updatedAt: now,
  completedAt: null
} satisfies FlowRunResponse;

const stepRun = {
  id: stepRunId,
  flowRunId: runId,
  nodeId: "draft-reply",
  status: "approval_required",
  inputSnapshot: {},
  outputSnapshot: null,
  errorCode: null,
  errorMessage: null,
  createdAt: now,
  updatedAt: now,
  completedAt: null
} as const;

const approval = {
  id: approvalId,
  flowRunId: runId,
  stepRunId,
  status: "pending",
  kind: "ai_output",
  title: "Черновик ответа",
  preview: "Черновик ответа",
  createdAt: now,
  decidedAt: null
} satisfies FlowApproval;

const suppression = {
  id: "00000000-0000-4000-8000-000000000008",
  ownerUserId,
  flowId,
  runtimeEventId: eventId,
  flowRunId: runId,
  reason: "QUIET_HOURS_HOLD",
  details: { flowId },
  createdAt: now
} as const;

function runtimeRequest() {
  return {
    source: "manual",
    subjectType: "client",
    subjectId: clientUserId,
    occurredAt: now,
    timeZone: "Europe/Moscow",
    payload: {}
  };
}

function request(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: {
        id: ownerUserId,
        status: "active",
        roles: ["astrologer"]
      }
    }
  };
}
