import type { FlowDefinitionSummaryV2 } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { buildFlowGalleryCard } from "./flowsVisualModel";

const flow = {
  schemaVersion: "flow-definition-summary.v2",
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Подготовка консультации",
  state: "draft",
  runtimeStatus: "draft",
  approvalMode: "manual_approve",
  revision: 3,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null,
  graphSchemaVersion: "flow-graph.v2",
  origin: {
    schemaVersion: "flow-definition-origin.v1",
    type: "template",
    templateKey: "manual-consultation-preparation",
    templateVersion: 1
  },
  migrationRequired: false
} satisfies FlowDefinitionSummaryV2;

describe("flows visual model", () => {
  it("maps a lightweight V2 summary without inventing graph or runtime metrics", () => {
    expect(buildFlowGalleryCard(flow, "ru")).toEqual({
      id: flow.id,
      title: flow.name,
      definitionStateLabel: "Черновик",
      runtimeStatusLabel: "Не опубликована",
      approvalModeLabel: "С подтверждением",
      graphSchemaLabel: "Схема V2",
      originLabel: "Из шаблона",
      revisionLabel: "Редакция 3",
      publishedVersionLabel: "Не опубликована",
      migrationRequired: false
    });
  });

  it("makes legacy migration a first-class visible state", () => {
    const legacy = {
      ...flow,
      graphSchemaVersion: "flow-graph.v1",
      origin: null,
      migrationRequired: true
    } satisfies FlowDefinitionSummaryV2;

    expect(buildFlowGalleryCard(legacy, "en")).toMatchObject({
      graphSchemaLabel: "Legacy V1",
      originLabel: "Legacy definition",
      revisionLabel: "Revision 3",
      migrationRequired: true
    });
  });
});
