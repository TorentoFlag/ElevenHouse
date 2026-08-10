// @vitest-environment jsdom

import type { FlowDefinitionDetail, FlowRuntimeAvailability } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowBuilder } from "./FlowBuilder";

const flow = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Подготовка консультации",
  state: "draft",
  approvalMode: "manual_approve",
  revision: 4,
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
      definitionRevision: 4,
      enrollmentRevision: 0,
      activeVersionId: null,
      activeActivationEpochId: null,
      activeSince: null,
      lastPausedAt: null
    }
  },
  draftGraph: {
    schemaVersion: "flow-graph.v2",
    nodes: [
      {
        id: "manual-client",
        kind: "manual_client",
        displayTitle: "Клиент выбран вручную",
        configSchemaVersion: 1,
        executorContractVersion: 1,
        config: {}
      }
    ],
    edges: []
  },
  draftPresentation: {
    schemaVersion: "flow-presentation.v1",
    nodes: [{ nodeId: "manual-client", position: { x: 80, y: 120 } }],
    viewport: { x: 0, y: 0, zoom: 1 }
  }
} satisfies FlowDefinitionDetail;

const definitionOnlyRuntime = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "durable_execution"
} satisfies FlowRuntimeAvailability;

describe("FlowBuilder", () => {
  afterEach(() => cleanup());

  it("renders only supported V2 palette kinds and a typed inspector", () => {
    renderBuilder();

    expect(screen.getByRole("heading", { name: flow.name })).toBeTruthy();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" && element.textContent?.startsWith("Черновик") === true
      )
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Логика" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Работа астролога" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Результаты" })).toBeTruthy();
    expect(screen.queryByText("AI-узлы")).toBeNull();
    expect(screen.getByText("Отправить сообщение")).toBeTruthy();
    expect(screen.queryByText("birth_data_available")).toBeNull();
    expect(screen.queryByLabelText("Конфигурация")).toBeNull();
    expect(screen.getByLabelText("Название узла")).toBeTruthy();
  });

  it("keeps edits local and saves graph plus presentation with optimistic revision", () => {
    const onSaveDraft = vi.fn();
    renderBuilder({ onSaveDraft });

    fireEvent.change(screen.getByLabelText("Название узла"), {
      target: { value: "Выбрать клиента" }
    });
    expect(onSaveDraft).not.toHaveBeenCalled();
    expect(screen.getByText("Есть несохранённые изменения")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onSaveDraft).toHaveBeenCalledWith({
      flowId: flow.id,
      expectedRevision: 4,
      graph: expect.objectContaining({
        nodes: [expect.objectContaining({ id: "manual-client", displayTitle: "Выбрать клиента" })]
      }),
      presentation: flow.draftPresentation
    });
  });

  it("adds a node only through the selected free semantic handle", () => {
    renderBuilder();

    fireEvent.click(
      screen.getByRole("button", { name: "Добавить узел: Данные рождения заполнены?" })
    );

    expect((screen.getByLabelText("Название узла") as HTMLInputElement).value).toBe(
      "Данные рождения заполнены?"
    );
    expect(screen.getByLabelText("Связи воронки").textContent).toContain(
      "Клиент выбран вручную — Далее → Данные рождения заполнены?"
    );
    expect(screen.getByText("Есть несохранённые изменения")).toBeTruthy();
  });

  it("publishes the exact local draft and tells the controller whether a save is required", () => {
    const onPublish = vi.fn();
    renderBuilder({ onPublish });

    fireEvent.change(screen.getByLabelText("Название узла"), {
      target: { value: "Выбрать клиента" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        flowId: flow.id,
        expectedRevision: 4,
        saveBeforePublish: true,
        graph: expect.objectContaining({
          nodes: [expect.objectContaining({ displayTitle: "Выбрать клиента" })]
        })
      })
    );
  });

  it("renders exact server validation evidence and focuses the affected node", () => {
    renderBuilder({
      validationIssues: [
        {
          code: "missing_required_source_handle",
          severity: "error",
          blocking: true,
          path: "nodes.manual-client.next",
          message: "Node manual_client requires exactly one next edge."
        }
      ]
    });

    const issue = screen.getByRole("alert", { name: "Проверка схемы" });
    expect(issue.textContent).toContain("Добавьте обязательное продолжение");
    expect(issue.textContent).toContain("missing_required_source_handle");
    expect(issue.textContent).toContain("nodes.manual-client.next");
    fireEvent.click(screen.getByRole("button", { name: "Показать узел с проблемой" }));
    expect(screen.getByLabelText("Название узла")).toBeTruthy();
  });

  it("locks every structural editing surface while a definition command is pending", () => {
    renderBuilder({ isSaving: true });

    expect(screen.getByLabelText("Название узла")).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Добавить узел: Данные рождения заполнены?" })
    ).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: /Сместить вправо/ })).toBeNull();
  });

  it("edits the DAG through mobile sheets without exposing a linear reorder control", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 760px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });

    try {
      renderBuilder();

      expect(screen.getByRole("region", { name: "Мобильная схема воронки" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Добавить шаг" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Настроить узел: Клиент выбран вручную" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Сместить вправо/ })).toBeNull();
      expect(screen.queryByLabelText("Название узла")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Добавить шаг" }));
      expect(screen.getByRole("dialog", { name: "Добавить шаг" })).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Добавить узел: Данные рождения заполнены?" })
      ).toBeTruthy();

      fireEvent.click(
        screen.getByRole("button", { name: "Добавить узел: Данные рождения заполнены?" })
      );
      expect(screen.queryByRole("dialog", { name: "Добавить шаг" })).toBeNull();

      fireEvent.click(
        screen.getByRole("button", { name: "Настроить узел: Клиент выбран вручную" })
      );
      expect(screen.getByRole("dialog", { name: "Настроить узел" })).toBeTruthy();
      expect(screen.getByLabelText("Название узла")).toBeTruthy();
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia
      });
    }
  });

  it("preserves a local candidate when a newer server revision arrives", () => {
    const onSaveDraft = vi.fn();
    const rendered = renderBuilder({ onSaveDraft });

    fireEvent.change(screen.getByLabelText("Название узла"), {
      target: { value: "Локальное название" }
    });
    rendered.rerender(
      <FlowBuilder
        flow={{
          ...flow,
          revision: 7,
          draftGraph: {
            ...flow.draftGraph,
            nodes: [{ ...flow.draftGraph.nodes[0]!, displayTitle: "Серверное название" }]
          }
        }}
        locale="ru"
        onBack={vi.fn()}
        onSaveDraft={onSaveDraft}
        onPublish={vi.fn()}
      />
    );

    expect((screen.getByLabelText("Название узла") as HTMLInputElement).value).toBe(
      "Локальное название"
    );
    expect(screen.getByRole("alert").textContent).toContain("редакция 7");

    fireEvent.click(screen.getByRole("button", { name: "Повторить поверх редакции 7" }));
    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 7,
        graph: expect.objectContaining({
          nodes: [expect.objectContaining({ displayTitle: "Локальное название" })]
        })
      })
    );
  });

  it("does not duplicate a revision conflict with the generic command error", () => {
    renderBuilder({
      revisionConflict: {
        operation: "save",
        expectedRevision: 4,
        currentRevision: 7
      },
      saveError: new Error("Черновик изменился в другой вкладке")
    });

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain("редакция 7");
    expect(screen.queryByText("Черновик изменился в другой вкладке")).toBeNull();
  });

  it("keeps local edits and surfaces a failed server-version reload", async () => {
    const onReloadServer = vi.fn().mockRejectedValue(new Error("Серверная версия недоступна"));
    const rendered = renderBuilder();

    fireEvent.change(screen.getByLabelText("Название узла"), {
      target: { value: "Локальное название" }
    });
    rendered.rerender(
      <FlowBuilder
        flow={{ ...flow, revision: 7 }}
        locale="ru"
        onBack={vi.fn()}
        onSaveDraft={vi.fn()}
        onPublish={vi.fn()}
        onReloadServer={onReloadServer}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Загрузить серверную версию" }));

    await waitFor(() => {
      expect(screen.getByText("Серверная версия недоступна")).toBeTruthy();
    });
    expect((screen.getByLabelText("Название узла") as HTMLInputElement).value).toBe(
      "Локальное название"
    );
  });

  it("requires explicit confirmation before leaving with unsaved edits", () => {
    const onBack = vi.fn();
    renderBuilder({ onBack });

    fireEvent.change(screen.getByLabelText("Название узла"), {
      target: { value: "Локальное название" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Все воронки" }));

    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Несохранённые изменения" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Остаться" }));
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Несохранённые изменения" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Все воронки" }));
    fireEvent.click(screen.getByRole("button", { name: "Выйти без сохранения" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("guards a browser unload while the local draft is dirty", () => {
    renderBuilder();
    fireEvent.change(screen.getByLabelText("Название узла"), {
      target: { value: "Локальное название" }
    });

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps a published definition immutable and offers an explicit next draft", () => {
    const onCreateNextDraft = vi.fn();
    const versioned = {
      ...flow,
      state: "versioned",
      revision: 5,
      latestPublishedVersionId: "33333333-3333-4333-8333-333333333333",
      latestPublishedVersion: 1,
      publishedAt: "2026-07-28T08:30:00.000Z"
    } satisfies FlowDefinitionDetail;
    renderBuilder({ flow: versioned, onCreateNextDraft });

    expect(screen.getByLabelText("Название узла")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Создать новую версию" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Опубликовать" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Создать новую версию" }));
    expect(onCreateNextDraft).toHaveBeenCalledWith({
      flowId: flow.id,
      expectedRevision: 5,
      baseVersionId: versioned.latestPublishedVersionId
    });
  });

  it("does not offer a new draft for an archived definition", () => {
    const archived = {
      ...flow,
      state: "archived",
      revision: 6,
      latestPublishedVersionId: "33333333-3333-4333-8333-333333333333",
      latestPublishedVersion: 1,
      publishedAt: "2026-07-28T08:30:00.000Z"
    } satisfies FlowDefinitionDetail;

    renderBuilder({ flow: archived, onCreateNextDraft: vi.fn() });

    expect(screen.queryByRole("button", { name: "Создать новую версию" })).toBeNull();
  });

  it("offers a real manual run only for the active published manual version", () => {
    const onCreateManualRun = vi.fn();
    const activeManual = activeManualVersion();
    const runtime = {
      mode: "enabled",
      executionAvailable: true,
      reasonCode: null,
      historySemantics: "durable_execution"
    } satisfies FlowRuntimeAvailability;

    renderBuilder({ flow: activeManual, runtimeAvailability: runtime, onCreateManualRun });

    fireEvent.click(screen.getByRole("button", { name: "Запустить для клиента" }));
    expect(onCreateManualRun).toHaveBeenCalledWith(flow.id);
    expect(screen.queryByRole("button", { name: "Тестовый прогон" })).toBeNull();
  });

  it("does not enable a manual run when runtime evidence is fail-closed", () => {
    const onCreateManualRun = vi.fn();

    renderBuilder({
      flow: activeManualVersion(),
      runtimeAvailability: definitionOnlyRuntime,
      onCreateManualRun
    });

    const run = screen.getByRole("button", { name: "Запустить для клиента" });
    expect(run).toHaveProperty("disabled", true);
    fireEvent.click(run);
    expect(onCreateManualRun).not.toHaveBeenCalled();
  });
});

function activeManualVersion(): FlowDefinitionDetail {
  return {
    ...flow,
    state: "versioned",
    revision: 5,
    latestPublishedVersionId: "33333333-3333-4333-8333-333333333333",
    latestPublishedVersion: 1,
    publishedAt: "2026-07-28T08:30:00.000Z",
    enrollment: {
      ...flow.enrollment,
      control: {
        ...flow.enrollment.control,
        state: "active",
        definitionRevision: 5,
        enrollmentRevision: 1,
        activeVersionId: "33333333-3333-4333-8333-333333333333",
        activeActivationEpochId: "44444444-4444-4444-8444-444444444444",
        activeSince: "2026-07-28T08:30:00.000Z"
      }
    }
  };
}

function renderBuilder(overrides: Partial<Parameters<typeof FlowBuilder>[0]> = {}) {
  return render(
    <FlowBuilder
      flow={flow}
      locale="ru"
      onBack={vi.fn()}
      onSaveDraft={vi.fn()}
      onPublish={vi.fn()}
      {...overrides}
    />
  );
}
