// @vitest-environment jsdom

import type { FlowResponse, FlowRuntimeAvailability } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowGallery } from "./FlowGallery";

const flow = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Запись на консультацию",
  status: "draft",
  approvalMode: "manual_approve",
  draftGraph: {
    schemaVersion: "flow-graph.v1",
    nodes: [
      { id: "lead", category: "trigger", kind: "lead_created", title: "Новый лид", config: {} },
      {
        id: "reply",
        category: "ai",
        kind: "reply_draft",
        approvalMode: "manual_approve",
        title: "Черновик ответа",
        config: {}
      }
    ],
    edges: [{ id: "lead-reply", fromNodeId: "lead", toNodeId: "reply" }]
  },
  publishedVersionId: null,
  publishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null
} satisfies FlowResponse;

const definitionOnlyRuntime = {
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE",
  historySemantics: "legacy_preview"
} satisfies FlowRuntimeAvailability;

describe("FlowGallery", () => {
  afterEach(() => cleanup());

  it("renders honest flow cards and marks unavailable gallery actions as disabled", () => {
    render(<FlowGallery flows={[flow]} />);

    expect(screen.getByRole("heading", { name: /^Воронки/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Новая воронка" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Запись на консультацию")).toBeTruthy();
    expect(screen.getByText("Новый лид")).toBeTruthy();
    expect(screen.getByText("Черновик ответа")).toBeTruthy();
    expect(screen.getAllByText("-")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Открыть схему: Запись на консультацию" })).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByRole("switch", { name: "Автоматизация не запущена" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("labels a persisted active flow as unavailable while preserving the pause action", () => {
    const onAutomationToggle = vi.fn();
    render(
      <FlowGallery
        flows={[{
          ...flow,
          status: "active",
          publishedVersionId: "44444444-4444-4444-8444-444444444444",
          publishedVersion: 1,
          publishedAt: "2026-07-30T14:45:00.000Z"
        }]}
        runtimeAvailability={definitionOnlyRuntime}
        onAutomationToggle={onAutomationToggle}
      />
    );

    expect(screen.getByText("Исполнение отключено")).toBeTruthy();
    expect(screen.queryByText("Активна")).toBeNull();
    const toggle = screen.getByRole("switch", {
      name: "Исполнение отключено; сохраненную активацию можно поставить на паузу"
    });

    expect(toggle).toHaveProperty("disabled", false);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(onAutomationToggle).toHaveBeenCalledWith(flow.id, false);
  });

  it("does not activate published or paused flows while runtime is definition-only", () => {
    const onAutomationToggle = vi.fn();
    render(
      <FlowGallery
        flows={[
          flow,
          {
            ...flow,
            id: "33333333-3333-4333-8333-333333333333",
            status: "published",
            publishedVersionId: "44444444-4444-4444-8444-444444444444",
            publishedVersion: 1,
            publishedAt: "2026-07-30T14:45:00.000Z"
          },
          {
            ...flow,
            id: "55555555-5555-4555-8555-555555555555",
            status: "paused",
            publishedVersionId: "66666666-6666-4666-8666-666666666666",
            publishedVersion: 1,
            publishedAt: "2026-07-30T14:45:00.000Z"
          }
        ]}
        runtimeAvailability={definitionOnlyRuntime}
        onAutomationToggle={onAutomationToggle}
      />
    );

    expect(screen.getByRole("switch", { name: "Автоматизация не запущена" })).toHaveProperty(
      "disabled",
      true
    );
    const unavailableToggles = screen.getAllByRole("switch", {
      name: "Исполнение этой версии воронки недоступно"
    });

    expect(unavailableToggles).toHaveLength(2);
    expect(unavailableToggles[0]).toHaveProperty("disabled", true);
    expect(unavailableToggles[1]).toHaveProperty("disabled", true);
    fireEvent.click(unavailableToggles[0]!);
    fireEvent.click(unavailableToggles[1]!);
    expect(onAutomationToggle).not.toHaveBeenCalled();
  });

  it("enables gallery actions only when callbacks are supplied", () => {
    const onCreateFlow = vi.fn();
    const onOpenFlow = vi.fn();
    render(<FlowGallery flows={[flow]} onCreateFlow={onCreateFlow} onOpenFlow={onOpenFlow} />);

    const createButton = screen.getAllByRole("button", { name: "Новая воронка" })[0]!;
    const openButton = screen.getByRole("button", { name: "Открыть схему: Запись на консультацию" });

    expect(createButton).toHaveProperty("disabled", false);
    expect(openButton).toHaveProperty("disabled", false);
    fireEvent.click(createButton);
    fireEvent.click(openButton);
    expect(onCreateFlow).toHaveBeenCalledOnce();
    expect(onOpenFlow).toHaveBeenCalledWith(flow.id);
  });
});
