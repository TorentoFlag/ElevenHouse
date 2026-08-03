import { flowGraphSchema, flowGraphV2Schema } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import type {
  FlowDefinitionControlRecord,
  FlowDefinitionPublishedVersionRecord
} from "./flow-definition-control-plane";
import { prepareFlowDefinitionV1Migration } from "./flow-definition-migration";

const flowId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const createdAt = "2026-08-02T18:00:00.000Z";
const publishedAt = "2026-08-02T18:05:00.000Z";
const migratedAt = "2026-08-02T18:10:00.000Z";
const request = {
  schemaVersion: "flow-definition-migrate.v2",
  expectedRevision: 3,
  targetGraphSchemaVersion: "flow-graph.v2"
} as const;

const manualGraph = flowGraphSchema.parse({
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

describe("flow definition V1 to V2 migration", () => {
  it("losslessly converts the known manual-only legacy draft", () => {
    const result = prepareFlowDefinitionV1Migration({
      current: legacyRecord(),
      latestVersion: null,
      request,
      now: migratedAt
    });

    expect(result).toMatchObject({
      kind: "accepted",
      value: {
        flow: {
          id: flowId,
          origin: {
            type: "migration",
            sourceGraphSchemaVersion: "flow-graph.v1",
            sourceVersionId: null
          },
          state: "draft",
          revision: 4,
          draftBaseVersionId: null,
          draftGraph: {
            schemaVersion: "flow-graph.v2",
            nodes: [expect.objectContaining({ id: "manual-trigger", kind: "manual_client" })],
            edges: []
          },
          draftPresentation: {
            nodes: [{ nodeId: "manual-trigger", position: { x: 80, y: 120 } }]
          }
        },
        migration: {
          sourceVersionId: null,
          sourceRevision: 3,
          sourceGraphHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          migratedAt
        }
      }
    });
  });

  it("keeps a published V1 snapshot immutable and creates a V2 draft from it", () => {
    const result = prepareFlowDefinitionV1Migration({
      current: legacyRecord({
        state: "versioned",
        latestPublishedVersionId: versionId,
        latestPublishedVersion: 1,
        publishedAt
      }),
      latestVersion: legacyVersion(),
      request,
      now: migratedAt
    });

    expect(result).toMatchObject({
      kind: "accepted",
      value: {
        flow: {
          state: "draft",
          revision: 4,
          draftBaseVersionId: versionId,
          latestPublishedVersionId: versionId,
          latestPublishedVersion: 1,
          publishedAt
        },
        migration: { sourceVersionId: versionId }
      }
    });
  });

  it("returns node-level blockers instead of guessing unsupported legacy semantics", () => {
    const graph = flowGraphSchema.parse({
      schemaVersion: "flow-graph.v1",
      nodes: [
        manualGraph.nodes[0],
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
    });

    expect(
      prepareFlowDefinitionV1Migration({
        current: legacyRecord({ draftGraph: graph }),
        latestVersion: null,
        request,
        now: migratedAt
      })
    ).toEqual({
      kind: "rejected",
      response: {
        statusCode: 422,
        body: {
          code: "FLOW_GRAPH_MIGRATION_BLOCKED",
          issues: [
            {
              code: "unsupported_node",
              path: "nodes.send-message",
              message: "Legacy action:send_message has no lossless V2 mapping."
            },
            {
              code: "unsupported_edge",
              path: "edges.manual-to-message",
              message: "Legacy edges cannot be migrated without exact V2 outcome semantics."
            }
          ]
        }
      }
    });
  });

  it("rejects already-V2 and archived definitions while surfacing persisted corruption", () => {
    const v2Graph = flowGraphV2Schema.parse({
      schemaVersion: "flow-graph.v2",
      nodes: [
        {
          id: "manual-trigger",
          kind: "manual_client",
          displayTitle: "Ручной запуск",
          configSchemaVersion: 1,
          executorContractVersion: 1,
          config: {}
        }
      ],
      edges: []
    });
    expect(
      prepareFlowDefinitionV1Migration({
        current: legacyRecord({
          origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
          draftGraph: v2Graph
        }),
        latestVersion: null,
        request,
        now: migratedAt
      })
    ).toMatchObject({
      kind: "rejected",
      response: { statusCode: 409, body: { code: "FLOW_GRAPH_ALREADY_V2" } }
    });
    expect(
      prepareFlowDefinitionV1Migration({
        current: legacyRecord({ state: "archived" }),
        latestVersion: null,
        request,
        now: migratedAt
      })
    ).toEqual({
      kind: "rejected",
      response: {
        statusCode: 409,
        body: { code: "FLOW_DEFINITION_MIGRATION_NOT_ALLOWED", state: "archived" }
      }
    });
    expect(
      prepareFlowDefinitionV1Migration({
        current: legacyRecord({
          state: "versioned",
          latestPublishedVersionId: versionId,
          latestPublishedVersion: 2,
          publishedAt
        }),
        latestVersion: legacyVersion(),
        request,
        now: migratedAt
      })
    ).toEqual({ kind: "integrity_failure" });
  });
});

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
    draftGraph: manualGraph,
    draftPresentation: null,
    latestPublishedVersionId: null,
    latestPublishedVersion: null,
    createdAt,
    updatedAt: publishedAt,
    publishedAt: null,
    ...overrides
  };
}

function legacyVersion(): FlowDefinitionPublishedVersionRecord {
  return {
    id: versionId,
    flowId,
    version: 1,
    sourceRevision: null,
    approvalMode: "manual_approve",
    graph: manualGraph,
    presentation: null,
    capabilityManifest: null,
    publishedAt
  };
}
