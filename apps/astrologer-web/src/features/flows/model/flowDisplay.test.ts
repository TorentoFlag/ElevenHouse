import type { FlowDefinitionSummaryV2 } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  flowApprovalModeLabel,
  flowDefinitionStateLabel,
  flowNodeKindLabel,
  flowRuntimeStatusLabel,
  flowSourceHandleLabel,
  summarizeFlowDefinitions
} from "./flowDisplay";

const flow = {
  schemaVersion: "flow-definition-summary.v2",
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Подготовка консультации",
  state: "draft",
  runtimeStatus: "draft",
  approvalMode: "manual_approve",
  revision: 1,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null,
  graphSchemaVersion: "flow-graph.v2",
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
  migrationRequired: false
} satisfies FlowDefinitionSummaryV2;

describe("flow display model", () => {
  it("summarizes definition lifecycle separately from runtime status", () => {
    expect(
      summarizeFlowDefinitions([
        flow,
        {
          ...flow,
          id: "33333333-3333-4333-8333-333333333333",
          state: "versioned",
          runtimeStatus: "paused",
          latestPublishedVersionId: "44444444-4444-4444-8444-444444444444",
          latestPublishedVersion: 1,
          publishedAt: "2026-07-28T09:00:00.000Z"
        }
      ])
    ).toEqual({ total: 2, editableDrafts: 1, versioned: 1, archived: 0, active: 0, paused: 1 });
  });

  it("localizes lifecycle, runtime and approval labels", () => {
    expect(flowDefinitionStateLabel("versioned", "ru")).toBe("Опубликована");
    expect(flowDefinitionStateLabel("versioned", "en")).toBe("Published");
    expect(flowRuntimeStatusLabel("paused", "ru")).toBe("На паузе");
    expect(flowApprovalModeLabel("manual_approve", "en")).toBe("Approval required");
    expect(flowApprovalModeLabel("auto_send", "ru")).toBe("Автодоставка настроена");
  });

  it("localizes strict V2 node kinds and semantic handles", () => {
    expect(flowNodeKindLabel("birth_data_available", "ru")).toBe("Данные рождения");
    expect(flowNodeKindLabel("astrologer_work_item", "en")).toBe("Astrologer task");
    expect(flowSourceHandleLabel("approved", "ru")).toBe("Подтверждено");
    expect(flowSourceHandleLabel("false", "en")).toBe("No");
  });
});
