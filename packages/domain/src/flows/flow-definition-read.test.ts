import { describe, expect, it, vi } from "vitest";
import type {
  FlowDefinitionDetail,
  FlowDefinitionSummary,
  FlowEnrollmentControl,
  FlowRuntimeAvailability
} from "@elevenhouse/contracts";

import { FlowDefinitionIntegrityError } from "./flow-definition-control-plane";
import {
  getFlowDefinition,
  listFlowDefinitions,
  type FlowDefinitionReadStore
} from "./flow-definition-read";

type CurrentFlowDefinitionSummary = Extract<
  FlowDefinitionSummary,
  { readonly graphSchemaVersion: "flow-graph.v2" }
>;
type CurrentFlowDefinitionDetail = Extract<
  FlowDefinitionDetail,
  { readonly graphSchemaVersion: "flow-graph.v2" }
>;

const ownerUserId = "22222222-2222-4222-8222-222222222222";
const flowId = "11111111-1111-4111-8111-111111111111";

describe("flow definition reads", () => {
  it("parses list filters and validates the complete page", async () => {
    const item = summary();
    const store = createStore({
      listByOwner: vi.fn(async () => ({ flows: [item], total: 1 }))
    });

    await expect(
      listFlowDefinitions({
        store,
        ownerUserId,
        query: { state: "all", enrollmentState: "inactive", limit: "10", offset: "0" },
        runtime: definitionOnlyRuntime
      })
    ).resolves.toEqual({ flows: [item], total: 1, runtime: definitionOnlyRuntime });
    expect(store.listByOwner).toHaveBeenCalledWith({
      ownerUserId,
      query: { state: "all", enrollmentState: "inactive", limit: 10, offset: 0 }
    });
  });

  it("returns owner-scoped detail or null", async () => {
    const item = detail();
    const store = createStore({
      getByOwner: vi.fn<FlowDefinitionReadStore["getByOwner"]>(async () => item)
    });

    await expect(getFlowDefinition({ store, ownerUserId, flowId })).resolves.toEqual(item);
    expect(store.getByOwner).toHaveBeenCalledWith({ ownerUserId, flowId });

    const missing = createStore({
      getByOwner: vi.fn<FlowDefinitionReadStore["getByOwner"]>(async () => null)
    });
    await expect(getFlowDefinition({ store: missing, ownerUserId, flowId })).resolves.toBeNull();
  });

  it("fails closed on corrupt pages and details", async () => {
    const corruptPage = createStore({
      listByOwner: vi.fn(async () => ({ flows: [summary(), summary()], total: 2 }))
    });
    await expect(
      listFlowDefinitions({
        store: corruptPage,
        ownerUserId,
        query: {},
        runtime: definitionOnlyRuntime
      })
    ).rejects.toBeInstanceOf(FlowDefinitionIntegrityError);

    const corruptDetail = createStore({
      getByOwner: vi.fn<FlowDefinitionReadStore["getByOwner"]>(
        async () =>
          ({
            ...detail(),
            enrollment: {
              authority: "enrollment_v1",
              control: { ...inactiveEnrollmentControl(), definitionRevision: 99 }
            }
          }) as never
      )
    });
    await expect(
      getFlowDefinition({ store: corruptDetail, ownerUserId, flowId })
    ).rejects.toBeInstanceOf(FlowDefinitionIntegrityError);
  });
});

const definitionOnlyRuntime = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "durable_execution"
} satisfies FlowRuntimeAvailability;

function createStore(
  overrides: Partial<FlowDefinitionReadStore> = {}
): FlowDefinitionReadStore {
  return {
    listByOwner: vi.fn(async () => ({ flows: [], total: 0 })),
    getByOwner: vi.fn(async () => null),
    ...overrides
  };
}

function summary(): CurrentFlowDefinitionSummary {
  return {
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
