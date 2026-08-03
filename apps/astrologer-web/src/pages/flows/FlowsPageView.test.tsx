import type {
  FlowDefinitionDetailV2,
  FlowDefinitionSummaryV2,
  FlowDefinitionTemplateDescriptorV2,
  FlowRuntimeAvailability
} from "@elevenhouse/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlowsPageView } from "./FlowsPageView";

const flow: FlowDefinitionSummaryV2 = {
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
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
  migrationRequired: false
};

const availableTemplate: FlowDefinitionTemplateDescriptorV2 = {
  schemaVersion: "flow-definition-template.v2",
  key: "manual-consultation-preparation",
  version: 1,
  name: "Подготовка консультации вручную",
  description: "Создать внутреннюю задачу подготовки и завершить ее вручную.",
  category: "service_delivery",
  availability: "available",
  recommendedApprovalMode: "manual_approve",
  parameters: [],
  requiredCapabilities: [],
  blockerCode: null
};

const definitionOnlyRuntime: FlowRuntimeAvailability = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "legacy_preview"
};

const legacyDetail: FlowDefinitionDetailV2 = {
  schemaVersion: "flow-definition-detail.v2",
  id: flow.id,
  ownerUserId: flow.ownerUserId,
  name: "Legacy-сценарий",
  state: "draft",
  runtimeStatus: "draft",
  approvalMode: "manual_approve",
  revision: 4,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: flow.createdAt,
  updatedAt: flow.updatedAt,
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
};

describe("FlowsPageView", () => {
  it("renders loading, error and empty states from server query state", () => {
    expect(render({ isLoading: true })).toContain("Загружаем воронки");
    expect(render({ isError: true })).toContain("Не удалось загрузить воронки");
    expect(render()).toContain("Создайте первую воронку");
    expect(render({ isError: true, onRetryList: () => undefined })).toContain("Повторить загрузку");
  });

  it("renders lightweight definition facts without prototype metrics", () => {
    const markup = render({ flows: [flow] });

    expect(markup).toContain("Подготовка консультации");
    expect(markup).toContain("Схема V2");
    expect(markup).toContain("Редакция 3");
    expect(markup).not.toContain("Конверсия");
    expect(markup).not.toContain("Выручка");
  });

  it("keeps activation fail-closed when execution is unavailable", () => {
    const markup = render({
      flows: [
        {
          ...flow,
          state: "versioned",
          runtimeStatus: "published",
          latestPublishedVersionId: "33333333-3333-4333-8333-333333333333",
          latestPublishedVersion: 1,
          publishedAt: "2026-07-28T09:00:00.000Z"
        }
      ],
      runtimeAvailability: definitionOnlyRuntime,
      onAutomationToggle: () => undefined
    });

    expect(markup).toContain('aria-label="Исполнение этой версии воронки недоступно"');
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('disabled=""');
  });

  it("renders the server template catalog only while the create dialog is open", () => {
    expect(render({ templates: [availableTemplate] })).not.toContain(availableTemplate.name);

    const markup = render({
      templates: [availableTemplate],
      createDialogOpen: true,
      requestedTemplateKey: availableTemplate.key
    });
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain(availableTemplate.name);
    expect(markup).toContain("Интеграция рекомендует сценарий");
  });

  it("keeps template loading and retryable errors within the open dialog", () => {
    const loading = render({
      createDialogOpen: true,
      templatesLoading: true,
      requestedTemplateKey: "handoff-template"
    });
    expect(loading).toContain("Загружаем каталог сценариев");
    expect(loading).not.toContain("отсутствует в текущем каталоге");

    const failed = render({
      createDialogOpen: true,
      templateError: new Error("Каталог недоступен"),
      onRetryTemplates: () => undefined
    });
    expect(failed).toContain("Каталог недоступен");
    expect(failed).toContain("Повторить загрузку");
  });

  it("renders legacy V1 as read-only migration instead of opening the editor", () => {
    const markup = render({
      selectedFlowId: legacyDetail.id,
      selectedFlow: legacyDetail,
      onMigrate: () => undefined
    });

    expect(markup).toContain("Эту схему нужно мигрировать в V2");
    expect(markup).toContain("Узлы V1");
    expect(markup).toContain("Новый лид");
    expect(markup).toContain("lead_created");
    expect(markup).toContain("returning-client");
    expect(markup).toContain("Скачать JSON");
    expect(markup).toContain("Мигрировать в V2");
    expect(markup).not.toContain("Опубликовать");
  });

  it("shows exact migration blocker evidence without hiding the legacy graph", () => {
    const markup = render({
      selectedFlowId: legacyDetail.id,
      selectedFlow: legacyDetail,
      migrationIssues: [
        {
          code: "unsupported_node",
          path: "nodes.lead-created",
          message: "Legacy lead_created has no lossless V2 mapping."
        }
      ]
    });

    expect(markup).toContain("unsupported_node");
    expect(markup).toContain("nodes.lead-created");
    expect(markup).toContain("Новый лид");
  });
});

function render(overrides: Partial<Parameters<typeof FlowsPageView>[0]> = {}) {
  return renderToStaticMarkup(
    <FlowsPageView
      locale="ru"
      flows={[]}
      templates={[]}
      isLoading={false}
      isError={false}
      {...overrides}
    />
  );
}
