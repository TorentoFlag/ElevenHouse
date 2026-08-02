// @vitest-environment jsdom

import type {
  FlowRunResponse,
  FlowRuntimeAvailability,
  SimulateFlowRunResponse
} from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowRuntimePanel } from "./FlowRuntimePanel";

const flowId = "11111111-1111-4111-8111-111111111111";
const flowVersionId = "33333333-3333-4333-8333-333333333333";

const definitionOnlyRuntime = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "legacy_preview"
} satisfies FlowRuntimeAvailability;

const mixedRuntime = {
  mode: "canary",
  executionAvailable: true,
  reasonCode: null,
  historySemantics: "mixed"
} satisfies FlowRuntimeAvailability;

const simulation = {
  flowId,
  flowVersionId,
  plannedSteps: [
    { nodeId: "lead_created", status: "planned", reason: null },
    { nodeId: "draft_reply", status: "approval_required", reason: "Ожидает подтверждения" },
    { nodeId: "send_result", status: "blocked", reason: "Нет согласия на канал" }
  ],
  warnings: ["Автоматическая отправка отключена"]
} satisfies SimulateFlowRunResponse;

const run = {
  id: "44444444-4444-4444-8444-444444444444",
  flowId,
  flowVersionId,
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  sourceEventId: "manual:test",
  status: "suppressed",
  snapshot: {
    schemaVersion: "flow-run-snapshot.v1",
    flowVersionId,
    sourceEventId: "manual:test",
    subjectType: "manual",
    subjectId: flowId,
    occurredAt: "2026-07-28T08:00:00.000Z",
    timeZone: "Europe/Moscow",
    consent: {},
    channels: {},
    payload: { reason: "Частотный лимит" }
  },
  currentNodeId: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  completedAt: "2026-07-28T08:00:00.000Z"
} satisfies FlowRunResponse;

describe("FlowRuntimePanel", () => {
  afterEach(() => cleanup());

  it("does not present a legacy simulation plan as executable runtime", () => {
    render(
      <FlowRuntimePanel
        runs={[]}
        simulation={simulation}
        runtimeAvailability={definitionOnlyRuntime}
        onSimulate={vi.fn()}
        onCreateManualRun={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Тестовый прогон" })).toBeTruthy();
    expect(screen.queryByText("План выполнения")).toBeNull();
    expect(screen.queryByText("lead_created")).toBeNull();
    expect(screen.queryByText("Автоматическая отправка отключена")).toBeNull();
  });

  it("renders persisted run history and failure or suppression reason text", () => {
    render(
      <FlowRuntimePanel
        runs={[run]}
        simulation={null}
        runtimeAvailability={definitionOnlyRuntime}
        onSimulate={vi.fn()}
      />
    );

    expect(screen.getByText("История запусков")).toBeTruthy();
    expect(screen.getByText("Архивный предпросмотр")).toBeTruthy();
    expect(screen.getByText("manual:test")).toBeTruthy();
    expect(screen.getByText("Частотный лимит")).toBeTruthy();
    expect(screen.getByText("Фактическое выполнение действий не подтверждено.")).toBeTruthy();
  });

  it("keeps definition-only runtime commands disabled without invoking callbacks", () => {
    const onSimulate = vi.fn();
    const onCreateManualRun = vi.fn();

    render(
      <FlowRuntimePanel
        runs={[]}
        simulation={null}
        runtimeAvailability={definitionOnlyRuntime}
        onSimulate={onSimulate}
        onCreateManualRun={onCreateManualRun}
      />
    );

    expect(screen.getByText("Запусков пока нет")).toBeTruthy();
    expect(
      screen.getByText(
        "Исполнение воронки пока недоступно. Сценарий можно редактировать и публиковать."
      )
    ).toBeTruthy();
    const simulationButton = screen.getByRole("button", { name: "Тестовый прогон" });
    const manualRunButton = screen.getByRole("button", { name: "Создать запуск" });
    expect(simulationButton).toHaveProperty("disabled", true);
    expect(manualRunButton).toHaveProperty("disabled", true);

    fireEvent.click(simulationButton);
    fireEvent.click(manualRunButton);

    expect(onSimulate).not.toHaveBeenCalled();
    expect(onCreateManualRun).not.toHaveBeenCalled();
  });

  it("marks a completed legacy preview as non-execution history", () => {
    const completedPreview = {
      ...run,
      status: "completed",
      snapshot: { ...run.snapshot, payload: {} }
    } satisfies FlowRunResponse;

    render(
      <FlowRuntimePanel
        runs={[completedPreview]}
        simulation={null}
        runtimeAvailability={definitionOnlyRuntime}
      />
    );

    expect(screen.getByText("Архивный предпросмотр")).toBeTruthy();
    expect(screen.getByText("Фактическое выполнение действий не подтверждено.")).toBeTruthy();
    expect(screen.queryByText("Завершен")).toBeNull();
  });

  it("does not present mixed-provenance runs as durable completion", () => {
    const completedRun = {
      ...run,
      status: "completed",
      snapshot: { ...run.snapshot, payload: {} }
    } satisfies FlowRunResponse;

    render(
      <FlowRuntimePanel
        runs={[completedRun]}
        simulation={null}
        runtimeAvailability={mixedRuntime}
      />
    );

    expect(screen.getByText("Переходная история")).toBeTruthy();
    expect(screen.getByText("Тип исполнения запуска не подтвержден.")).toBeTruthy();
    expect(screen.queryByText("Завершен")).toBeNull();
  });

  it("fails closed when completed history has no server runtime provenance", () => {
    const completedRun = {
      ...run,
      status: "completed",
      snapshot: { ...run.snapshot, payload: {} }
    } satisfies FlowRunResponse;

    render(<FlowRuntimePanel runs={[completedRun]} simulation={null} />);

    expect(screen.getByText("Неподтвержденная история")).toBeTruthy();
    expect(screen.getByText("Источник исполнения не подтвержден сервером.")).toBeTruthy();
    expect(screen.queryByText("Завершен")).toBeNull();
  });

  it("shows loading state instead of a false empty history", () => {
    render(<FlowRuntimePanel runs={[]} simulation={null} onSimulate={vi.fn()} isLoadingRuns />);

    expect(screen.getByText("Загружаем запуски")).toBeTruthy();
    expect(screen.queryByText("Запусков пока нет")).toBeNull();
  });

  it("shows unavailable runtime state instead of stale transport errors", () => {
    render(
      <FlowRuntimePanel
        runs={[]}
        simulation={null}
        error={new Error("HTTP request failed with status 404")}
        unavailableReason="Опубликуйте воронку"
      />
    );

    expect(screen.getByText("Опубликуйте воронку")).toBeTruthy();
    expect(screen.queryByText("HTTP request failed with status 404")).toBeNull();
  });
});
