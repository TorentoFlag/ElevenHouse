// @vitest-environment jsdom

import type { FlowResponse } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowBuilder } from "./FlowBuilder";

const flow = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Запись на консультацию",
  status: "draft",
  approvalMode: "manual_approve",
  draftGraph: {
    schemaVersion: "flow-graph.v1",
    nodes: [
      {
        id: "lead_created",
        category: "trigger",
        kind: "lead_created",
        title: "Новый лид",
        config: {},
        position: { x: 80, y: 120 }
      },
      {
        id: "ai_interpretation",
        category: "ai",
        kind: "reply_draft",
        approvalMode: "manual_approve",
        title: "AI-интерпретация",
        config: {},
        position: { x: 360, y: 120 }
      }
    ],
    edges: [
      { id: "lead-to-ai", fromNodeId: "lead_created", toNodeId: "ai_interpretation" }
    ]
  },
  publishedVersionId: null,
  publishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null
} satisfies FlowResponse;

describe("FlowBuilder", () => {
  afterEach(() => cleanup());

  it("renders the selected flow, palette, unavailable test run, and inspector details", () => {
    render(<FlowBuilder flow={flow} onBack={vi.fn()} onUpdateDraft={vi.fn()} onPublish={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Все воронки" })).toBeTruthy();
    expect(screen.getByText("Черновик")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Запись на консультацию" })).toBeTruthy();
    expect(screen.getByText("Триггеры")).toBeTruthy();
    expect(screen.getByText("Действия")).toBeTruthy();
    expect(screen.getByText("AI-узлы")).toBeTruthy();
    expect(screen.getByText("Логика")).toBeTruthy();
    expect(screen.getByText("Человек")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Тестовый прогон" })[0]).toHaveProperty("disabled", true);
    expect(screen.getByText("Запусков пока нет")).toBeTruthy();
    expect(screen.getByText("Ожидает подтверждения")).toBeTruthy();
    expect((screen.getByLabelText("Название узла") as HTMLInputElement).value).toBe("Новый лид");
  });

  it("renders the persisted flow status instead of hard-coded draft copy", () => {
    render(
      <FlowBuilder
        flow={{ ...flow, status: "published" }}
        onBack={vi.fn()}
        onUpdateDraft={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    expect(screen.getByText("Опубликована")).toBeTruthy();
    expect(screen.queryByText("Черновик")).toBeNull();
  });

  it("keeps runtime commands unavailable until the flow has a published version", () => {
    const onSimulate = vi.fn();
    const onCreateManualRun = vi.fn();

    render(
      <FlowBuilder
        flow={flow}
        onBack={vi.fn()}
        onUpdateDraft={vi.fn()}
        onPublish={vi.fn()}
        onSimulate={onSimulate}
        onCreateManualRun={onCreateManualRun}
      />
    );

    const testRunButtons = screen.getAllByRole("button", { name: "Тестовый прогон" });
    expect(testRunButtons).toHaveLength(2);
    expect(testRunButtons[0]).toHaveProperty("disabled", true);
    expect(testRunButtons[1]).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: "Создать запуск" })).toBeNull();
    expect(
      screen.getByText("Опубликуйте воронку, чтобы запускать тесты и ручные запуски.")
    ).toBeTruthy();

    fireEvent.click(testRunButtons[0] ?? raise("Expected header test run button"));
    fireEvent.click(testRunButtons[1] ?? raise("Expected runtime test run button"));

    expect(onSimulate).not.toHaveBeenCalled();
    expect(onCreateManualRun).not.toHaveBeenCalled();
  });

  it("enables runtime commands for a published flow version", () => {
    const onSimulate = vi.fn();
    const onCreateManualRun = vi.fn();
    const publishedFlow = {
      ...flow,
      status: "published",
      publishedVersionId: "33333333-3333-4333-8333-333333333333",
      publishedVersion: 1,
      publishedAt: "2026-07-28T08:30:00.000Z"
    } satisfies FlowResponse;

    render(
      <FlowBuilder
        flow={publishedFlow}
        onBack={vi.fn()}
        onUpdateDraft={vi.fn()}
        onPublish={vi.fn()}
        onSimulate={onSimulate}
        onCreateManualRun={onCreateManualRun}
      />
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Тестовый прогон" })[0] ??
        raise("Expected test button")
    );
    fireEvent.click(screen.getByRole("button", { name: "Создать запуск" }));

    expect(onSimulate).toHaveBeenCalledWith(flow.id);
    expect(onCreateManualRun).toHaveBeenCalledWith(flow.id);
    expect(
      screen.queryByText("Опубликуйте воронку, чтобы запускать тесты и ручные запуски.")
    ).toBeNull();
  });

  it("publishes the selected flow", () => {
    const onPublish = vi.fn();
    render(<FlowBuilder flow={flow} onBack={vi.fn()} onUpdateDraft={vi.fn()} onPublish={onPublish} />);

    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));

    expect(onPublish).toHaveBeenCalledWith(flow.id, flow.draftGraph);
  });

  it("keeps a node title local until blur, then persists the completed draft", () => {
    const onUpdateDraft = vi.fn();
    render(<FlowBuilder flow={flow} onBack={vi.fn()} onUpdateDraft={onUpdateDraft} onPublish={vi.fn()} />);

    const title = screen.getByLabelText("Название узла");
    fireEvent.change(title, { target: { value: "Новый клиент" } });

    expect((title as HTMLInputElement).value).toBe("Новый клиент");
    expect(onUpdateDraft).not.toHaveBeenCalled();

    fireEvent.blur(title);

    expect(onUpdateDraft).toHaveBeenCalledWith(
      flow.id,
      expect.objectContaining({
        nodes: expect.arrayContaining([expect.objectContaining({ id: "lead_created", title: "Новый клиент" })])
      })
    );
  });

  it("publishes the current local draft graph without waiting for a blur save", () => {
    const onUpdateDraft = vi.fn();
    const onPublish = vi.fn();
    render(<FlowBuilder flow={flow} onBack={vi.fn()} onUpdateDraft={onUpdateDraft} onPublish={onPublish} />);

    fireEvent.change(screen.getByLabelText("Название узла"), { target: { value: "Новый клиент" } });
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));

    expect(onUpdateDraft).not.toHaveBeenCalled();
    expect(onPublish).toHaveBeenCalledWith(
      flow.id,
      expect.objectContaining({
        nodes: expect.arrayContaining([expect.objectContaining({ id: "lead_created", title: "Новый клиент" })])
      })
    );
  });

  it("persists an explicit canvas move through the draft callback", () => {
    const onUpdateDraft = vi.fn();
    render(<FlowBuilder flow={flow} onBack={vi.fn()} onUpdateDraft={onUpdateDraft} onPublish={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Сместить вправо: Новый лид" }));

    expect(onUpdateDraft).toHaveBeenCalledWith(
      flow.id,
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: "lead_created", position: { x: 120, y: 120 } })
        ])
      })
    );
  });

  it("shows mutation failures and retries the relevant operation", () => {
    const onUpdateDraft = vi.fn();
    const onPublish = vi.fn();
    render(
      <FlowBuilder
        flow={flow}
        onBack={vi.fn()}
        onUpdateDraft={onUpdateDraft}
        onPublish={onPublish}
        draftUpdateError={new Error("Не удалось сохранить черновик")}
        publishError={new Error("Не удалось опубликовать воронку")}
      />
    );

    expect(screen.getByText("Не удалось сохранить черновик")).toBeTruthy();
    expect(screen.getByText("Не удалось опубликовать воронку")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Повторить сохранение" }));
    fireEvent.click(screen.getByRole("button", { name: "Повторить публикацию" }));

    expect(onUpdateDraft).toHaveBeenCalledWith(flow.id, flow.draftGraph);
    expect(onPublish).toHaveBeenCalledWith(flow.id, flow.draftGraph);
  });
});

function raise(message: string): never {
  throw new Error(message);
}
