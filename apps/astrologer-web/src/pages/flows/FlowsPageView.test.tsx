import type {
  FlowDefinitionSummary,
  FlowDefinitionTemplateDescriptorV2
} from "@elevenhouse/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlowsPageView } from "./FlowsPageView";

const flow: FlowDefinitionSummary = {
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
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
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
};

const availableTemplate: FlowDefinitionTemplateDescriptorV2 = {
  schemaVersion: "flow-definition-template.v2",
  key: "manual-consultation-preparation",
  version: 2,
  name: "Подготовка консультации вручную",
  description: "Создать внутреннюю задачу подготовки и завершить ее вручную.",
  category: "service_delivery",
  availability: "available",
  recommendedApprovalMode: "manual_approve",
  parameters: [],
  requiredCapabilities: [],
  blockerCode: null
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

  it("places the server-backed work queue before the definition gallery", () => {
    const markup = render({
      flows: [flow],
      workItemQueue: <div data-testid="work-item-queue">Очередь задач</div>
    });

    expect(markup.indexOf("Очередь задач")).toBeLessThan(markup.indexOf("Подготовка консультации"));
  });

  it("places pending approvals before the definition gallery", () => {
    const markup = render({
      flows: [flow],
      approvalQueue: <div data-testid="approval-queue">Подтверждения</div>
    });

    expect(markup.indexOf("Подтверждения")).toBeLessThan(markup.indexOf("Подготовка консультации"));
  });

  it("keeps the independent work queue visible when the definition catalog fails", () => {
    const markup = render({
      isError: true,
      workItemQueue: <div>Очередь задач</div>
    });

    expect(markup).toContain("Очередь задач");
    expect(markup).toContain("Не удалось загрузить воронки");
  });

  it("routes published inactive definitions through explicit activation review", () => {
    const markup = render({
      flows: [
        {
          ...flow,
          state: "versioned",
          latestPublishedVersionId: "33333333-3333-4333-8333-333333333333",
          latestPublishedVersion: 1,
          publishedAt: "2026-07-28T09:00:00.000Z"
        }
      ],
      onAutomationAction: () => undefined
    });

    expect(markup).toContain('aria-label="Проверить и включить автоматизацию"');
    expect(markup).toContain('role="switch"');
    expect(markup).not.toContain("Исполнение этой версии воронки недоступно");
  });

  it("renders the server template catalog only while the create dialog is open", () => {
    expect(render({ templates: [availableTemplate] })).not.toContain(availableTemplate.name);

    const markup = render({
      templates: [availableTemplate],
      createDialogOpen: true,
      requestedTemplateKey: availableTemplate.key
    });
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Новая воронка");
    expect(markup).not.toContain("Собрать с AI");
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
