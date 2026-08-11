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
    const expectedVisuals = {
      booking_confirmed: ["trigger", "Запись подтверждена", "Booking confirmed"],
      manual_client: ["trigger", "Клиент выбран", "Client selected"],
      birth_data_available: ["logic", "Данные рождения", "Birth data"],
      natal_chart_request: ["chartAi", "Натальная карта", "Natal chart"],
      natal_chart_ai_draft: ["chartAi", "AI-черновик", "AI draft"],
      send_message: ["communication", "Сообщение", "Message"],
      astrologer_work_item: ["human", "Задача астрологу", "Astrologer task"],
      astrologer_approval: ["human", "Подтверждение", "Approval"],
      completed: ["result", "Завершено", "Completed"],
      suppressed: ["result", "Пропущено", "Suppressed"],
      failed: ["error", "Ошибка", "Failed"]
    } as const satisfies Record<
      FlowNodeKindV2,
      readonly [FlowVisualTone, string, string]
    >;

    expect(
      Object.fromEntries(
        Object.keys(expectedVisuals).map((kindValue) => {
          const kind = kindValue as FlowNodeKindV2;
          const russian = getFlowNodeVisual(kind, "ru");
          const english = getFlowNodeVisual(kind, "en");
          return [kind, [russian.tone, russian.label, english.label]];
        })
      )
    ).toEqual(expectedVisuals);
  });

});
