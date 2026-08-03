// @vitest-environment jsdom

import type { FlowDefinitionSummaryV2, FlowRuntimeAvailability } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowsMobileList } from "./FlowsMobileList";

const flow = {
  schemaVersion: "flow-definition-summary.v2",
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Подготовка консультации",
  state: "draft",
  runtimeStatus: "draft",
  approvalMode: "manual_approve",
  revision: 2,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null,
  graphSchemaVersion: "flow-graph.v2",
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
  migrationRequired: false
} satisfies FlowDefinitionSummaryV2;

const definitionOnlyRuntime = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "legacy_preview"
} satisfies FlowRuntimeAvailability;

describe("FlowsMobileList", () => {
  afterEach(() => cleanup());

  it("keeps the reference hierarchy with honest lifecycle facts and a create command", () => {
    const onCreateFlow = vi.fn();
    render(<FlowsMobileList flows={[flow]} locale="ru" onCreateFlow={onCreateFlow} />);

    expect(screen.getByText("Воронок: 1")).toBeTruthy();
    expect(screen.getByText("Редакция 2")).toBeTruthy();
    expect(screen.getByText("Схема V2")).toBeTruthy();
    expect(screen.queryByText("Конверсия")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Создать воронку" }));
    expect(onCreateFlow).toHaveBeenCalledOnce();
  });

  it("opens a definition and keeps unsupported activation disabled", () => {
    const onOpenFlow = vi.fn();
    const onAutomationToggle = vi.fn();
    render(
      <FlowsMobileList
        flows={[
          {
            ...flow,
            state: "versioned",
            runtimeStatus: "published",
            latestPublishedVersionId: "44444444-4444-4444-8444-444444444444",
            latestPublishedVersion: 1,
            publishedAt: "2026-07-30T14:45:00.000Z"
          }
        ]}
        locale="ru"
        runtimeAvailability={definitionOnlyRuntime}
        onOpenFlow={onOpenFlow}
        onAutomationToggle={onAutomationToggle}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Открыть схему" }));
    expect(onOpenFlow).toHaveBeenCalledWith(flow.id);
    const toggle = screen.getByRole("switch", {
      name: "Исполнение этой версии воронки недоступно"
    });
    expect(toggle).toHaveProperty("disabled", true);
    fireEvent.click(toggle);
    expect(onAutomationToggle).not.toHaveBeenCalled();
  });

  it("does not claim persisted active status is executable in definition-only mode", () => {
    render(
      <FlowsMobileList
        flows={[{ ...flow, runtimeStatus: "active" }]}
        locale="ru"
        runtimeAvailability={definitionOnlyRuntime}
      />
    );

    expect(screen.getByText("Воронок: 1").textContent).not.toContain("активны");
    expect(screen.getByText("Исполнение недоступно")).toBeTruthy();
  });
});
