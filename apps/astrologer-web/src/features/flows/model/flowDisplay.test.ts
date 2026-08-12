import type { FlowDefinitionSummary } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  flowApprovalModeLabel,
  flowDefinitionStateLabel,
  flowNodeKindLabel,
  flowAutomationStateLabel,
  flowSourceHandleLabel,
  filterFlowDefinitionsForGallery,
  summarizeFlowDefinitions
} from "./flowDisplay";

const flow = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Подготовка консультации",
  state: "draft",
  approvalMode: "manual_approve",
  revision: 1,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null,
  activeRunCount: 0,
  graphSchemaVersion: "flow-graph.v2",
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
  enrollment: enrollment("inactive")
} satisfies FlowDefinitionSummary;

describe("flow display model", () => {
  it("filters the gallery by lifecycle tab and keeps archived flows out of All", () => {
    const activeVersionId = "44444444-4444-4444-8444-444444444444";
    const flows = [
      flow,
      {
        ...flow,
        id: "33333333-3333-4333-8333-333333333333",
        name: "Активная цепочка",
        state: "versioned",
        latestPublishedVersionId: activeVersionId,
        latestPublishedVersion: 1,
        publishedAt: "2026-07-28T09:00:00.000Z",
        enrollment: enrollment("active", activeVersionId)
      },
      {
        ...flow,
        id: "55555555-5555-4555-8555-555555555555",
        name: "Архивная цепочка",
        state: "archived"
      }
    ] satisfies readonly FlowDefinitionSummary[];

    expect(filterFlowDefinitionsForGallery(flows, { tab: "all", search: "" }).map(({ name }) => name)).toEqual([
      "Подготовка консультации",
      "Активная цепочка"
    ]);
    expect(
      filterFlowDefinitionsForGallery(flows, { tab: "active", search: "" }).map(({ name }) => name)
    ).toEqual(["Активная цепочка"]);
    expect(
      filterFlowDefinitionsForGallery(flows, { tab: "archived", search: "" }).map(({ name }) => name)
    ).toEqual(["Архивная цепочка"]);
  });

  it("filters the gallery by normalized title search", () => {
    const flows = [
      flow,
      {
        ...flow,
        id: "33333333-3333-4333-8333-333333333333",
        name: "Оплата прогрева"
      }
    ] satisfies readonly FlowDefinitionSummary[];

    expect(filterFlowDefinitionsForGallery(flows, { tab: "all", search: "  оплат " })).toEqual([
      flows[1]
    ]);
  });

  it("summarizes definition lifecycle separately from runtime status", () => {
    expect(
      summarizeFlowDefinitions([
        flow,
        {
          ...flow,
          id: "33333333-3333-4333-8333-333333333333",
          state: "versioned",
          latestPublishedVersionId: "44444444-4444-4444-8444-444444444444",
          latestPublishedVersion: 1,
          publishedAt: "2026-07-28T09:00:00.000Z",
          enrollment: enrollment("paused")
        }
      ])
    ).toEqual({ total: 2, editableDrafts: 1, versioned: 1, archived: 0, active: 0, paused: 1 });
  });

  it("localizes lifecycle, runtime and approval labels", () => {
    expect(flowDefinitionStateLabel("versioned", "ru")).toBe("Опубликована");
    expect(flowDefinitionStateLabel("versioned", "en")).toBe("Published");
    expect(flowAutomationStateLabel({ ...flow, enrollment: enrollment("paused") }, "ru")).toBe(
      "На паузе"
    );
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

function enrollment(
  state: "inactive" | "active" | "paused",
  activeVersionId: string | null = null
): FlowDefinitionSummary["enrollment"] {
  return {
    schemaVersion: "flow-enrollment-read-authority.v1",
    authority: "enrollment_v1",
    control: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId: "11111111-1111-4111-8111-111111111111",
      state,
      definitionRevision: 1,
      enrollmentRevision: state === "inactive" ? 0 : 2,
      activeVersionId,
      activeActivationEpochId: state === "active" ? "55555555-5555-4555-8555-555555555555" : null,
      activeSince: state === "active" ? "2026-07-28T10:00:00.000Z" : null,
      lastPausedAt: state === "paused" ? "2026-07-28T10:00:00.000Z" : null
    }
  };
}
