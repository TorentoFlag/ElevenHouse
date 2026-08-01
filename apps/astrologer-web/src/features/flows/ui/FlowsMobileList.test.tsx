// @vitest-environment jsdom

import type { FlowResponse } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowsMobileList } from "./FlowsMobileList";

const flow = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Запись на консультацию",
  status: "draft",
  approvalMode: "manual_approve",
  draftGraph: {
    schemaVersion: "flow-graph.v1",
    nodes: [{ id: "lead", category: "trigger", kind: "lead_created", title: "Новый лид", config: {} }],
    edges: []
  },
  publishedVersionId: null,
  publishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null
} satisfies FlowResponse;

describe("FlowsMobileList", () => {
  afterEach(() => cleanup());

  it("keeps compact metric labels and short honest values in the mobile hierarchy", () => {
    render(<FlowsMobileList flows={[flow]} />);

    expect(screen.getByRole("heading", { name: /^Воронки/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Открыть схему" })).toBeTruthy();
    expect(screen.getByText("В работе")).toBeTruthy();
    expect(screen.getByText("Ожидают")).toBeTruthy();
    expect(screen.getByText("Завершено")).toBeTruthy();
    expect(screen.getByText("Конверсия")).toBeTruthy();
    expect(screen.getAllByText("-")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Открыть схему" })).toHaveProperty("disabled", true);
  });

  it("reflects an active API flow in the mobile switch state", () => {
    const onAutomationToggle = vi.fn();
    render(
      <FlowsMobileList
        flows={[{
          ...flow,
          status: "active",
          publishedVersionId: "44444444-4444-4444-8444-444444444444",
          publishedVersion: 1,
          publishedAt: "2026-07-30T14:45:00.000Z"
        }]}
        onAutomationToggle={onAutomationToggle}
      />
    );

    const toggle = screen.getByRole("switch", { name: "Автоматизация активна" });

    expect(toggle).toHaveProperty("disabled", false);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(onAutomationToggle).toHaveBeenCalledWith(flow.id, false);
  });
});
