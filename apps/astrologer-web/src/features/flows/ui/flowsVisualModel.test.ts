import type { FlowDefinitionSummary, FlowNodeKindV2 } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import {
  buildFlowGalleryCard,
  getFlowNodeVisual,
  type FlowVisualTone
} from "./flowsVisualModel";

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
  graphNodeKinds: ["booking_confirmed", "birth_data_available", "natal_chart_request", "completed"],
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
  it("maps server-backed graph kinds into an operator-readable scenario preview", () => {
    expect(buildFlowGalleryCard(flow, "ru")).toEqual({
      id: flow.id,
      title: flow.name,
      definitionStateLabel: "Черновик",
      automationStatusLabel: "Не опубликована",
      approvalModeLabel: "С подтверждением",
      graphSchemaLabel: "Схема V2",
      graphSummary: "Узлы: Запись подтверждена · Данные рождения · Натальная карта",
      graphNodeKinds: ["booking_confirmed", "birth_data_available", "natal_chart_request", "completed"],
      originLabel: "Из шаблона",
      revisionLabel: "Редакция 3",
      publishedVersionLabel: "Не опубликована"
    });
  });

  it("defines an explicit visual tone and localized label for every supported node kind", () => {
    const expectedTones = {
      booking_confirmed: "trigger",
      manual_client: "trigger",
      birth_data_available: "logic",
      natal_chart_request: "chartAi",
      natal_chart_ai_draft: "chartAi",
      send_message: "communication",
      astrologer_work_item: "human",
      astrologer_approval: "human",
      completed: "result",
      suppressed: "result",
      failed: "error"
    } as const satisfies Record<FlowNodeKindV2, FlowVisualTone>;

    expect(
      Object.fromEntries(
        Object.keys(expectedTones).map((kind) => [
          kind,
          getFlowNodeVisual(kind as FlowNodeKindV2, "ru").tone
        ])
      )
    ).toEqual(expectedTones);
    expect(getFlowNodeVisual("booking_confirmed", "ru").label).toBe("Запись подтверждена");
    expect(getFlowNodeVisual("booking_confirmed", "en").label).toBe("Booking confirmed");
  });

});
