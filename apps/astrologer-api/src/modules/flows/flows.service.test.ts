import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AstrologerClientListItem, ClientStore, FlowRuntimeStore, FlowStore } from "@elevenhouse/domain";
import type { FlowApproval, FlowGraph, FlowRuntimeEvent, FlowRunResponse } from "@elevenhouse/contracts";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { csrfRequiredMetadataKey } from "../security/route-policy/route-security-metadata";
import { FlowsController } from "./flows.controller";
import { FlowApprovalsController } from "./flow-approvals.controller";
import { FlowRunsController } from "./flow-runs.controller";
import { FlowsService } from "./flows.service";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const flowId = "00000000-0000-4000-8000-000000000002";
const versionId = "00000000-0000-4000-8000-000000000003";
const clientUserId = "00000000-0000-4000-8000-000000000009";
const now = "2026-07-26T12:00:00.000Z";

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

describe("FlowsService", () => {
  it("lists built-in templates through the API contract", async () => {
    const response = await createService().listFlowTemplates();

    expect(response.templates.length).toBeGreaterThan(0);
    expect(response.templates[0]).toMatchObject({
      key: expect.any(String),
      graph: expect.objectContaining({ schemaVersion: "flow-graph.v1" })
    });
  });

  it("creates and lists owner-scoped flow drafts", async () => {
    const store = createFlowStore();
    const service = createService({ store });

    const created = await service.createFlow(
      { name: "Welcome funnel", graph },
      request()
    );
    const listed = await service.listFlows({ status: "draft", limit: "10", offset: "0" }, request());

    expect(created).toMatchObject({
      ownerUserId,
      name: "Welcome funnel",
      status: "draft"
    });
    expect(listed.total).toBe(1);
    expect(store.createDraft).toHaveBeenCalledWith({
      ownerUserId,
      name: "Welcome funnel",
      approvalMode: "manual_approve",
      graph,
      now
    });
    expect(store.listByOwner).toHaveBeenCalledWith({
      ownerUserId,
      status: "draft",
      limit: 10,
      offset: 0
    });
  });

  it("updates drafts and publishes immutable versions", async () => {
    const store = createFlowStore();
    const service = createService({ store });

    const updated = await service.updateFlowDraft(flowId, { name: "After purchase" }, request());
    const published = await service.publishFlow(flowId, request());

    expect(updated.name).toBe("After purchase");
    expect(published).toMatchObject({
      flow: {
        id: flowId,
        status: "published",
        publishedVersion: 1
      },
      version: {
        id: versionId,
        status: "published",
        version: 1
      }
    });
    expect(store.updateDraft).toHaveBeenCalledWith({
      ownerUserId,
      flowId,
      patch: { name: "After purchase" },
      now
    });
    expect(store.publishDraft).toHaveBeenCalledWith({ ownerUserId, flowId, now });
  });

  it("activates and pauses published flow automation through CSRF-protected commands", async () => {
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
    const transitionStatus = vi.fn().mockResolvedValueOnce(activeFlow).mockResolvedValueOnce(pausedFlow);
    const findByOwnerAndId = vi
      .fn()
      .mockResolvedValueOnce(
        flow({ status: "published", publishedVersionId: versionId, publishedVersion: 1, publishedAt: now })
      )
      .mockResolvedValueOnce(activeFlow);
    const store = createFlowStore({
      findByOwnerAndId,
      transitionStatus
    } as Partial<FlowStore>);
    const service = createService({ store });

    await expect(service.activateFlow(flowId, request())).resolves.toEqual(activeFlow);
    await expect(service.pauseFlow(flowId, request())).resolves.toEqual(pausedFlow);

    expect(transitionStatus).toHaveBeenNthCalledWith(1, {
      ownerUserId,
      flowId,
      fromStatuses: ["published", "paused"],
      toStatus: "active",
      now
    });
    expect(transitionStatus).toHaveBeenNthCalledWith(2, {
      ownerUserId,
      flowId,
      fromStatuses: ["active"],
      toStatus: "paused",
      now
    });
    expect(Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.activateFlow)).toBe(true);
    expect(Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.pauseFlow)).toBe(true);
  });

  it("maps missing flow and unsafe publish attempts to explicit HTTP errors", async () => {
    const store = createFlowStore({
      findByOwnerAndId: vi.fn(async () => null)
    });
    const service = createService({ store });

    await expect(service.getFlow(flowId, request())).rejects.toBeInstanceOf(NotFoundException);

    const unsafeStore = createFlowStore({
      findByOwnerAndId: vi.fn(async () =>
        flow({
          draftGraph: {
            ...graph,
            nodes: [
              graph.nodes[0]!,
              {
                id: "auto-message",
                category: "action",
                kind: "send_message",
                approvalMode: "auto_send",
                title: "Автоотправка",
                config: {}
              }
            ],
            edges: [{ id: "edge-1", fromNodeId: "lead-created", toNodeId: "auto-message" }]
          }
        })
      )
    });

    await expect(createService({ store: unsafeStore }).publishFlow(flowId, request())).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(unsafeStore.publishDraft).not.toHaveBeenCalled();
  });

  it("requires an astrologer session and validates request bodies", async () => {
    const service = createService();

    await expect(service.listFlows({}, {} as AstrologerSessionRequest)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    await expect(service.createFlow({ name: "", graph }, request())).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("simulates a flow without persisting a run", async () => {
    const runtimeStore = createRuntimeStore();
    const service = createService({
      store: createFlowStore({
        findByOwnerAndId: vi.fn(async () =>
          flow({ status: "active", publishedVersionId: versionId, publishedVersion: 1, publishedAt: now })
        )
      }),
      runtimeStore
    });

    await expect(service.simulateFlow(flowId, runtimeRequest(), request())).resolves.toEqual({
      flowId,
      flowVersionId: versionId,
      plannedSteps: [
        { nodeId: "lead-created", status: "planned", reason: null },
        { nodeId: "draft-reply", status: "approval_required", reason: "manual_approve" }
      ],
      warnings: []
    });

    expect(runtimeStore.createRunForEventDedupe).not.toHaveBeenCalled();
    expect(runtimeStore.createEvent).not.toHaveBeenCalled();
  });

  it("fails closed for client subjects without an owner relationship", async () => {
    const runtimeStore = createRuntimeStore({
      createRunForEventDedupe: vi.fn(async (input) => ({
        status: "created" as const,
        event: runtimeEvent,
        run: { ...run, status: "suppressed" as const, currentNodeId: null, completedAt: now },
        stepRuns: [],
        approvals: [],
        suppression: {
          ...suppression,
          reason: input.suppression?.reason ?? suppression.reason
        }
      }))
    });
    const service = createService({
      store: createFlowStore({
        findByOwnerAndId: vi.fn(async () =>
          flow({ status: "active", publishedVersionId: versionId, publishedVersion: 1, publishedAt: now })
        )
      }),
      runtimeStore,
      clientStore: createClientStore({ related: false })
    });

    await expect(service.simulateFlow(flowId, runtimeRequest(), request())).resolves.toMatchObject({
      warnings: ["OWNER_RELATIONSHIP_REQUIRED"],
      plannedSteps: [
        { nodeId: "lead-created", status: "blocked", reason: "OWNER_RELATIONSHIP_REQUIRED" },
        { nodeId: "draft-reply", status: "blocked", reason: "OWNER_RELATIONSHIP_REQUIRED" }
      ]
    });
    await expect(service.createManualRun(flowId, runtimeRequest(), request())).resolves.toMatchObject({
      status: "suppressed",
      reason: "OWNER_RELATIONSHIP_REQUIRED"
    });

    expect(runtimeStore.createRunForEventDedupe).toHaveBeenCalledWith(
      expect.objectContaining({
        suppression: expect.objectContaining({ reason: "OWNER_RELATIONSHIP_REQUIRED" })
      })
    );
  });

  it("rejects malformed client subject ids before calling the client store", async () => {
    const clientStore = createClientStore();
    const service = createService({
      store: createFlowStore({
        findByOwnerAndId: vi.fn(async () =>
          flow({ status: "active", publishedVersionId: versionId, publishedVersion: 1, publishedAt: now })
        )
      }),
      clientStore
    });

    await expect(
      service.simulateFlow(flowId, { ...runtimeRequest(), subjectId: "client-1" }, request())
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(clientStore.getAstrologerClient).not.toHaveBeenCalled();
  });

  it("maps invalid simulation bodies and missing runtime records to flow API errors", async () => {
    const runtimeStore = createRuntimeStore({
      findRunById: vi.fn(async () => null),
      decideApproval: vi.fn(async () => null)
    });
    const service = createService({ runtimeStore });

    await expect(service.simulateFlow(flowId, { source: "manual" }, request())).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(service.getFlowRun(runId, request())).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.decideFlowApproval(approvalId, { decision: "approved" }, request())
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates manual runs and exposes owner-scoped runtime read models", async () => {
    const runtimeStore = createRuntimeStore();
    const service = createService({
      store: createFlowStore({
        findByOwnerAndId: vi.fn(async () =>
          flow({ status: "active", publishedVersionId: versionId, publishedVersion: 1, publishedAt: now })
        )
      }),
      runtimeStore
    });

    await expect(service.createManualRun(flowId, runtimeRequest(), request())).resolves.toMatchObject({
      status: "created",
      run: { id: runId, status: "approval_required" },
      approvals: [{ id: approvalId, status: "pending" }]
    });
    await expect(service.listFlowRuns(flowId, { status: "all" }, request())).resolves.toEqual({
      runs: [run],
      total: 1
    });
    await expect(service.getFlowRun(runId, request())).resolves.toEqual({ run });
    await expect(service.cancelFlowRun(runId, request())).resolves.toEqual({
      run: { ...run, status: "canceled", currentNodeId: null, completedAt: now }
    });
    await expect(service.listFlowApprovals({ status: "pending" }, request())).resolves.toEqual({
      approvals: [approval],
      total: 1
    });
    await expect(
      service.decideFlowApproval(approvalId, { decision: "approved", note: "ok" }, request())
    ).resolves.toEqual({ approval });

    expect(runtimeStore.listRuns).toHaveBeenCalledWith({
      ownerUserId,
      flowId,
      status: "all",
      limit: 50,
      offset: 0
    });
    expect(runtimeStore.cancelRun).toHaveBeenCalledWith({ ownerUserId, runId, now });
  });

  it("dispatches module runtime events to matching active flows through client relationship gates", async () => {
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
      runtimeStore,
      clientStore: createClientStore({ related: true })
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
    ).resolves.toMatchObject({
      total: 1,
      results: [{ flowId, status: "created", run: { id: runId } }]
    });

    expect(listActiveByTriggerKind).toHaveBeenCalledWith({
      ownerUserId,
      triggerKind: "lead_created"
    });
    expect(runtimeStore.createRunForEventDedupe).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          source: "crm",
          sourceEventId: `crm:lead:client-1:${flowId}`,
          subjectId: clientUserId
        })
      })
    );
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
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.publishFlow)
    ).toBe(true);
    expect(Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.simulateFlow)).toBe(
      true
    );
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowsController.prototype.createManualRun)
    ).toBe(true);
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowRunsController.prototype.cancelFlowRun)
    ).toBe(true);
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, FlowApprovalsController.prototype.decideFlowApproval)
    ).toBe(true);
  });
});

function createService(
  overrides: {
    readonly store?: FlowStore;
    readonly runtimeStore?: FlowRuntimeStore;
    readonly clientStore?: ClientStore;
    readonly clock?: SystemClock;
  } = {}
) {
  return new FlowsService(
    overrides.store ?? createFlowStore(),
    overrides.runtimeStore ?? createRuntimeStore(),
    overrides.clientStore ?? createClientStore(),
    overrides.clock ?? ({ now: () => new Date(now) } as SystemClock)
  );
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
    cancelRun: vi.fn(async () => ({ ...run, status: "canceled" as const, currentNodeId: null, completedAt: now })),
    listRuns: vi.fn(async () => ({ runs: [run], total: 1 })),
    listApprovals: vi.fn(async () => ({ approvals: [approval], total: 1 })),
    decideApproval: vi.fn(async () => approval),
    ...overrides
  };
}

function createClientStore(input: { readonly related?: boolean } = {}): ClientStore {
  const related = input.related ?? true;
  const client: AstrologerClientListItem = {
    clientUserId,
    displayName: "Марина Краснова",
    relationshipStatus: "active",
    firstLinkedAt: now,
    lastLinkedAt: now,
    birthData: null
  };

  return {
    createJoinIntent: vi.fn(async () => raise("Unexpected client join intent call")),
    findJoinIntentByTokenHash: vi.fn(async () => null),
    markJoinIntentClaimed: vi.fn(async () => null),
    ensureRelationship: vi.fn(async () => raise("Unexpected ensure relationship call")),
    upsertClientProfile: vi.fn(async () => undefined),
    upsertClientBirthData: vi.fn(async () => raise("Unexpected upsert birth data call")),
    listClientBirthDataProfiles: vi.fn(async () => []),
    createClientBirthDataProfile: vi.fn(async () => raise("Unexpected create birth data call")),
    updateClientBirthDataProfile: vi.fn(async () => raise("Unexpected update birth data call")),
    listAstrologerClients: vi.fn(async () => ({ clients: related ? [client] : [], total: related ? 1 : 0 })),
    getAstrologerClient: vi.fn(async () => (related ? client : null))
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

function raise(message: string): never {
  throw new Error(message);
}
