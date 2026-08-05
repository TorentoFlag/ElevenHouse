import { describe, expect, it, vi } from "vitest";
import type {
  FlowDefinitionDetailV3,
  FlowDefinitionSummaryV3,
  FlowEnrollmentControl
} from "@elevenhouse/contracts";

import { FlowDefinitionIntegrityError } from "./flow-definition-control-plane";
import {
  getFlowDefinitionV3,
  listFlowDefinitionsV3,
  type FlowDefinitionReadV3Store
} from "./flow-definition-read-v3";

type CurrentFlowDefinitionSummary = Extract<
  FlowDefinitionSummaryV3,
  { readonly graphSchemaVersion: "flow-graph.v2" }
>;
type CurrentFlowDefinitionDetail = Extract<
  FlowDefinitionDetailV3,
  { readonly graphSchemaVersion: "flow-graph.v2" }
>;

const ownerUserId = "22222222-2222-4222-8222-222222222222";
const flowId = "11111111-1111-4111-8111-111111111111";

describe("flow definition V3 reads", () => {
  it("parses list filters and validates the complete page", async () => {
    const item = summary();
    const store = createStore({
      listByOwner: vi.fn(async () => ({ flows: [item], total: 1 }))
    });

    await expect(
      listFlowDefinitionsV3({
        store,
        ownerUserId,
        query: { state: "all", enrollmentState: "inactive", limit: "10", offset: "0" }
      })
    ).resolves.toEqual({ flows: [item], total: 1 });
    expect(store.listByOwner).toHaveBeenCalledWith({
      ownerUserId,
      query: { state: "all", enrollmentState: "inactive", limit: 10, offset: 0 }
    });
  });

  it("returns owner-scoped detail or null", async () => {
    const item = detail();
    const store = createStore({
      getByOwner: vi.fn<FlowDefinitionReadV3Store["getByOwner"]>(async () => item)
    });

    await expect(getFlowDefinitionV3({ store, ownerUserId, flowId })).resolves.toEqual(item);
    expect(store.getByOwner).toHaveBeenCalledWith({ ownerUserId, flowId });

    const missing = createStore({
      getByOwner: vi.fn<FlowDefinitionReadV3Store["getByOwner"]>(async () => null)
    });
    await expect(getFlowDefinitionV3({ store: missing, ownerUserId, flowId })).resolves.toBeNull();
  });

  it("fails closed on corrupt pages and details", async () => {
    const corruptPage = createStore({
      listByOwner: vi.fn(async () => ({ flows: [summary(), summary()], total: 2 }))
    });
    await expect(
      listFlowDefinitionsV3({ store: corruptPage, ownerUserId, query: {} })
    ).rejects.toBeInstanceOf(FlowDefinitionIntegrityError);

    const corruptDetail = createStore({
      getByOwner: vi.fn<FlowDefinitionReadV3Store["getByOwner"]>(async () => ({
        ...detail(),
        enrollment: {
          authority: "enrollment_v1",
          control: { ...inactiveEnrollmentControl(), definitionRevision: 99 }
        }
      } as never))
    });
    await expect(
      getFlowDefinitionV3({ store: corruptDetail, ownerUserId, flowId })
    ).rejects.toBeInstanceOf(FlowDefinitionIntegrityError);
  });
});

function createStore(overrides: Partial<FlowDefinitionReadV3Store> = {}): FlowDefinitionReadV3Store {
  return {
    listByOwner: vi.fn(async () => ({ flows: [], total: 0 })),
    getByOwner: vi.fn(async () => null),
    ...overrides
  };
}

function summary(): CurrentFlowDefinitionSummary {
  return {
    schemaVersion: "flow-definition-summary.v3" as const,
    id: flowId,
    ownerUserId,
    name: "Consultation preparation",
    state: "draft" as const,
    approvalMode: "manual_approve" as const,
    revision: 1,
    draftBaseVersionId: null,
    latestPublishedVersionId: null,
    latestPublishedVersion: null,
    createdAt: "2026-08-02T18:00:00.000Z",
    updatedAt: "2026-08-02T18:00:00.000Z",
    publishedAt: null,
    graphSchemaVersion: "flow-graph.v2" as const,
    origin: { schemaVersion: "flow-definition-origin.v1" as const, type: "blank" as const },
    enrollment: {
      schemaVersion: "flow-enrollment-read-authority.v1" as const,
      authority: "enrollment_v1" as const,
      control: inactiveEnrollmentControl()
    }
  };
}

function detail(): CurrentFlowDefinitionDetail {
  const item = summary();
  return {
    ...item,
    schemaVersion: "flow-definition-detail.v3" as const,
    draftGraph: {
      schemaVersion: "flow-graph.v2" as const,
      nodes: [
        {
          id: "manual",
          kind: "manual_client" as const,
          displayTitle: "Client selected",
          configSchemaVersion: 1 as const,
          executorContractVersion: 1 as const,
          config: {}
        },
        {
          id: "completed",
          kind: "completed" as const,
          displayTitle: "Completed",
          configSchemaVersion: 1 as const,
          executorContractVersion: 1 as const,
          config: { goalKey: "consultation_prepared" }
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
    },
    draftPresentation: null
  };
}

function inactiveEnrollmentControl(): FlowEnrollmentControl {
  return {
    schemaVersion: "flow-enrollment-control.v1",
    flowId,
    state: "inactive",
    definitionRevision: 1,
    enrollmentRevision: 0,
    activeVersionId: null,
    activeActivationEpochId: null,
    activeSince: null,
    lastPausedAt: null
  };
}
