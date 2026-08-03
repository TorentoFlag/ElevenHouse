import type { FlowDefinitionDetailV2 } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { buildLegacyFlowDefinitionExport } from "./flowDefinitionExport";

const legacy = {
  schemaVersion: "flow-definition-detail.v2",
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Legacy-сценарий",
  state: "draft",
  runtimeStatus: "draft",
  approvalMode: "manual_approve",
  revision: 4,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null,
  graphSchemaVersion: "flow-graph.v1",
  origin: null,
  migrationRequired: true,
  draftGraph: {
    schemaVersion: "flow-graph.v1",
    nodes: [
      {
        id: "lead-created",
        category: "trigger",
        kind: "lead_created",
        title: "Новый лид",
        config: { segment: "returning-client" }
      }
    ],
    edges: []
  },
  draftPresentation: null
} satisfies Extract<FlowDefinitionDetailV2, { graphSchemaVersion: "flow-graph.v1" }>;

describe("legacy flow definition export", () => {
  it("serializes the exact validated server detail into a stable JSON artifact", () => {
    const artifact = buildLegacyFlowDefinitionExport(legacy);

    expect(artifact).toMatchObject({
      filename: `flow-${legacy.id}-legacy-v1.json`,
      mimeType: "application/json;charset=utf-8"
    });
    expect(artifact.contents.endsWith("\n")).toBe(true);
    expect(JSON.parse(artifact.contents)).toEqual(legacy);
  });
});
