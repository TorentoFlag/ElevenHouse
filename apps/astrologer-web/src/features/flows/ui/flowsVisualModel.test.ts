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
  draftBaseVersionId: "33333333-3333-4333-8333-333333333333",
  latestPublishedVersionId: "33333333-3333-4333-8333-333333333333",
  latestPublishedVersion: 1,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null,
  activeRunCount: 2,
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
      automationStatusLabel: "Не запущена",
      automationControlLabel: "Выкл.",
      approvalModeLabel: "Ручное",
      graphSchemaLabel: "Схема V2",
      graphSummary: "Узлы: Запись подтверждена · Данные рождения · Натальная карта",
      graphNodeKinds: ["booking_confirmed", "birth_data_available", "natal_chart_request", "completed"],
      originLabel: "Из шаблона",
      revisionLabel: "Редакция 3",
      publishedVersionLabel: "Версия 1",
      updatedAtLabel: "Изменена 28.07.2026",
      draftChangesLabel: "Есть правки",
      activeRunCountLabel: "Клиентов внутри: 2"
    });
  });

  it("derives the user-facing lifecycle status from definition and enrollment state", () => {
    const inactivePublished = {
      ...flow,
      state: "versioned",
      draftBaseVersionId: null
    } satisfies FlowDefinitionSummary;
    const activePublished = {
      ...inactivePublished,
      enrollment: {
        ...inactivePublished.enrollment,
        control: {
          ...inactivePublished.enrollment.control,
          state: "active",
          enrollmentRevision: 1,
          activeVersionId: inactivePublished.latestPublishedVersionId,
          activeActivationEpochId: "55555555-5555-4555-8555-555555555555",
          activeSince: "2026-07-28T09:00:00.000Z"
        }
      }
    } satisfies FlowDefinitionSummary;

    expect(buildFlowGalleryCard(inactivePublished, "ru").definitionStateLabel).toBe("Отключена");
    expect(buildFlowGalleryCard(inactivePublished, "en").definitionStateLabel).toBe("Disabled");
    expect(buildFlowGalleryCard(activePublished, "ru").definitionStateLabel).toBe("Активна");
    expect(buildFlowGalleryCard(activePublished, "en").definitionStateLabel).toBe("Active");
    expect(buildFlowGalleryCard({ ...flow, state: "archived" }, "ru").definitionStateLabel).toBe(
      "В архиве"
    );
  });

  it("defines an explicit visual tone and localized label for every supported node kind", () => {
    const expectedVisuals = {
      booking_confirmed: ["trigger", "Запись подтверждена", "Booking confirmed"],
      manual_client: ["trigger", "Клиент выбран", "Client selected"],
      product_purchased: ["trigger", "Куплен продукт", "Product purchased"],
      first_inbound_message: ["trigger", "Первое сообщение", "First message"],
      client_lifecycle_changed: ["trigger", "Статус клиента", "Client status"],
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
