import {
  flowDefinitionDetailV2Schema,
  flowDefinitionSummaryV2Schema,
  type FlowDefinitionDetailV2
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";

import { FlowDefinitionIntegrityError } from "./flow-definition-control-plane";
import {
  getFlowDefinitionV2,
  listFlowDefinitionsV2,
  type FlowDefinitionQueryStore
} from "./flow-definition-query";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const flowId = "22222222-2222-4222-8222-222222222222";

const summary = flowDefinitionSummaryV2Schema.parse({
  schemaVersion: "flow-definition-summary.v2",
  id: flowId,
  ownerUserId,
  name: "Consultation preparation",
  state: "draft",
  runtimeStatus: "draft",
  approvalMode: "manual_approve",
  revision: 1,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: "2026-08-03T08:00:00.000Z",
  updatedAt: "2026-08-03T08:00:00.000Z",
  publishedAt: null,
  graphSchemaVersion: "flow-graph.v2",
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" }
});

const detail = flowDefinitionDetailV2Schema.parse({
  ...summary,
  schemaVersion: "flow-definition-detail.v2",
  draftGraph: {
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "manual",
        kind: "manual_client",
        displayTitle: "Client selected manually",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      },
      {
        id: "completed",
        kind: "completed",
        displayTitle: "Preparation completed",
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
  },
  draftPresentation: null
});

describe("flow definition v2 queries", () => {
  it("parses bounded filters and lists only the requested owner", async () => {
    const store = createStore();

    await expect(
      listFlowDefinitionsV2({
        store,
        ownerUserId,
        query: { state: "draft", runtimeStatus: "all" }
      })
    ).resolves.toEqual({ flows: [summary], total: 1 });
    expect(store.listByOwner).toHaveBeenCalledWith({
      ownerUserId,
      query: { state: "draft", runtimeStatus: "all", limit: 50, offset: 0 }
    });
  });

  it("rejects the ambiguous legacy status filter before querying storage", async () => {
    const store = createStore();

    await expect(
      listFlowDefinitionsV2({
        store,
        ownerUserId,
        query: { status: "draft" } as never
      })
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(store.listByOwner).not.toHaveBeenCalled();
  });

  it("gets one owner-scoped detail and preserves no-leak not-found semantics", async () => {
    const store = createStore({ detail });

    await expect(getFlowDefinitionV2({ store, ownerUserId, flowId })).resolves.toEqual(detail);
    expect(store.getByOwner).toHaveBeenCalledWith({ ownerUserId, flowId });

    vi.mocked(store.getByOwner).mockResolvedValueOnce(null);
    await expect(
      getFlowDefinitionV2({ store, ownerUserId: "33333333-3333-4333-8333-333333333333", flowId })
    ).resolves.toBeNull();
  });

  it("turns malformed persisted query data into an observable integrity failure", async () => {
    const store = createStore();
    vi.mocked(store.listByOwner).mockResolvedValueOnce({
      flows: [{ ...summary, graphSchemaVersion: "flow-graph.legacy" }],
      total: 1
    } as never);

    await expect(listFlowDefinitionsV2({ store, ownerUserId, query: {} })).rejects.toBeInstanceOf(
      FlowDefinitionIntegrityError
    );
  });
});

function createStore(
  input: { detail?: FlowDefinitionDetailV2 | null } = {}
): FlowDefinitionQueryStore {
  return {
    listByOwner: vi.fn(async () => ({ flows: [summary], total: 1 })),
    getByOwner: vi.fn(async () => input.detail ?? null)
  };
}
