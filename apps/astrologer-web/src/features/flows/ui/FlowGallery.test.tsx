// @vitest-environment jsdom

import type { FlowDefinitionSummaryV2, FlowRuntimeAvailability } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowGallery } from "./FlowGallery";

const flow = {
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
} satisfies FlowDefinitionSummaryV2;

const definitionOnlyRuntime = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "legacy_preview"
} satisfies FlowRuntimeAvailability;

describe("FlowGallery", () => {
  afterEach(() => cleanup());

  it("renders only server-backed definition facts from a lightweight summary", () => {
    render(<FlowGallery flows={[flow]} locale="ru" />);

    expect(screen.getByRole("heading", { name: /^Воронки/ })).toBeTruthy();
    expect(screen.getByText("Подготовка консультации")).toBeTruthy();
    expect(screen.getByText("Схема V2")).toBeTruthy();
    expect(screen.getByText("Редакция 3")).toBeTruthy();
    expect(screen.getAllByText("Не опубликована")).toHaveLength(3);
    expect(screen.queryByText("Конверсия")).toBeNull();
    expect(screen.queryByText("В работе")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Открыть схему: Подготовка консультации" })
    ).toHaveProperty("disabled", true);
  });

  it("surfaces legacy migration instead of pretending the graph is editable V2", () => {
    render(
      <FlowGallery
        locale="ru"
        flows={[
          { ...flow, graphSchemaVersion: "flow-graph.v1", origin: null, migrationRequired: true }
        ]}
      />
    );

    expect(screen.getByText("Legacy V1")).toBeTruthy();
    expect(screen.getByText("Требуется миграция")).toBeTruthy();
  });

  it("preserves a fail-closed pause action for a persisted active definition", () => {
    const onAutomationToggle = vi.fn();
    render(
      <FlowGallery
        locale="ru"
        flows={[
          {
            ...flow,
            state: "versioned",
            runtimeStatus: "active",
            latestPublishedVersionId: "44444444-4444-4444-8444-444444444444",
            latestPublishedVersion: 1,
            publishedAt: "2026-07-30T14:45:00.000Z"
          }
        ]}
        runtimeAvailability={definitionOnlyRuntime}
        onAutomationToggle={onAutomationToggle}
      />
    );

    const toggle = screen.getByRole("switch", {
      name: "Исполнение отключено; сохраненную активацию можно поставить на паузу"
    });
    expect(screen.queryByText("Активна")).toBeNull();
    expect(screen.getAllByText("Исполнение недоступно")).toHaveLength(2);
    expect(toggle).toHaveProperty("disabled", false);
    fireEvent.click(toggle);
    expect(onAutomationToggle).toHaveBeenCalledWith(flow.id, false);
  });

  it("enables create and open commands only when callbacks are supplied", () => {
    const onCreateFlow = vi.fn();
    const onOpenFlow = vi.fn();
    render(
      <FlowGallery flows={[flow]} locale="en" onCreateFlow={onCreateFlow} onOpenFlow={onOpenFlow} />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "New flow" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Open flow: Подготовка консультации" }));
    expect(onCreateFlow).toHaveBeenCalledOnce();
    expect(onOpenFlow).toHaveBeenCalledWith(flow.id);
  });
});
