// @vitest-environment jsdom

import type { FlowRunResponse, SimulateFlowRunResponse } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowRuntimePanel } from "./FlowRuntimePanel";

const flowId = "11111111-1111-4111-8111-111111111111";
const flowVersionId = "33333333-3333-4333-8333-333333333333";

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

  it("renders simulation result with planned step states and warnings", () => {
    render(
      <FlowRuntimePanel
        runs={[]}
        simulation={simulation}
        onSimulate={vi.fn()}
        onCreateManualRun={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Тестовый прогон" })).toBeTruthy();
    expect(screen.getByText("lead_created")).toBeTruthy();
    expect(screen.getAllByText("Ожидает подтверждения")).toHaveLength(2);
    expect(screen.getByText("Нет согласия на канал")).toBeTruthy();
    expect(screen.getByText("Автоматическая отправка отключена")).toBeTruthy();
  });

  it("renders persisted run history and failure or suppression reason text", () => {
    render(<FlowRuntimePanel runs={[run]} simulation={null} onSimulate={vi.fn()} />);

    expect(screen.getByText("История запусков")).toBeTruthy();
    expect(screen.getByText("Подавлен")).toBeTruthy();
    expect(screen.getByText("manual:test")).toBeTruthy();
    expect(screen.getByText("Частотный лимит")).toBeTruthy();
  });

  it("shows an honest empty history state and dispatches runtime commands", () => {
    const onSimulate = vi.fn();
    const onCreateManualRun = vi.fn();

    render(
      <FlowRuntimePanel
        runs={[]}
        simulation={null}
        onSimulate={onSimulate}
        onCreateManualRun={onCreateManualRun}
      />
    );

    expect(screen.getByText("Запусков пока нет")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Тестовый прогон" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать запуск" }));

    expect(onSimulate).toHaveBeenCalledTimes(1);
    expect(onCreateManualRun).toHaveBeenCalledTimes(1);
  });

  it("shows loading state instead of a false empty history", () => {
    render(<FlowRuntimePanel runs={[]} simulation={null} onSimulate={vi.fn()} isLoadingRuns />);

    expect(screen.getByText("Загружаем запуски")).toBeTruthy();
    expect(screen.queryByText("Запусков пока нет")).toBeNull();
  });
});
