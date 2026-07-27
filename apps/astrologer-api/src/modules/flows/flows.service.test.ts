import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { FlowStore } from "@elevenhouse/domain";
import type { FlowGraph } from "@elevenhouse/contracts";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { csrfRequiredMetadataKey } from "../security/route-policy/route-security-metadata";
import { FlowsController } from "./flows.controller";
import { FlowsService } from "./flows.service";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const flowId = "00000000-0000-4000-8000-000000000002";
const versionId = "00000000-0000-4000-8000-000000000003";
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
  });
});

function createService(
  overrides: {
    readonly store?: FlowStore;
    readonly clock?: SystemClock;
  } = {}
) {
  return new FlowsService(
    overrides.store ?? createFlowStore(),
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
