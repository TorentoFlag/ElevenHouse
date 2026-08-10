import type { FlowDefinitionSummary } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { buildFlowGalleryCard } from "./flowsVisualModel";

const flow = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Подготовка консультации",
  state: "draft",
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
  enrollment: {
    schemaVersion: "flow-enrollment-read-authority.v1",
    authority: "enrollment_v1",
    control: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId: "11111111-1111-4111-8111-111111111111",
      state: "inactive",
      definitionRevision: 3,
      enrollmentRevision: 0,
      activeVersionId: null,
      activeActivationEpochId: null,
      activeSince: null,
      lastPausedAt: null
    }
  }
} satisfies FlowDefinitionSummary;

describe("flows visual model", () => {
  it("maps a lightweight summary without inventing graph or runtime metrics", () => {
    expect(buildFlowGalleryCard(flow, "ru")).toEqual({
      id: flow.id,
      title: flow.name,
      definitionStateLabel: "Черновик",
      automationStatusLabel: "Не опубликована",
      approvalModeLabel: "С подтверждением",
      graphSchemaLabel: "Схема V2",
      originLabel: "Из шаблона",
      revisionLabel: "Редакция 3",
      publishedVersionLabel: "Не опубликована"
    });
  });

});
