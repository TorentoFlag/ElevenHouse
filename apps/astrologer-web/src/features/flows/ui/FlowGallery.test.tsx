// @vitest-environment jsdom

import type { FlowDefinitionSummaryV3 } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowGallery } from "./FlowGallery";

const flow = {
  schemaVersion: "flow-definition-summary.v3",
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
  enrollment: inactiveEnrollment(3)
} satisfies FlowDefinitionSummaryV3;

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

  it("keeps the empty state inside the gallery below its stable header", () => {
    render(
      <FlowGallery
        flows={[]}
        locale="ru"
        emptyMessage="Создайте первую воронку"
        classNames={{ galleryGrid: "gallery-grid-hook", emptyState: "empty-state-hook" }}
      />
    );

    const emptyState = screen.getByText("Создайте первую воронку");
    expect(emptyState.classList.contains("empty-state-hook")).toBe(true);
    expect(emptyState.closest(".gallery-grid-hook")).toBeTruthy();
  });
});

function inactiveEnrollment(
  definitionRevision: number
): FlowDefinitionSummaryV3["enrollment"] {
  return {
    schemaVersion: "flow-enrollment-read-authority.v1",
    authority: "enrollment_v1",
    control: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId: "11111111-1111-4111-8111-111111111111",
      state: "inactive",
      definitionRevision,
      enrollmentRevision: 0,
      activeVersionId: null,
      activeActivationEpochId: null,
      activeSince: null,
      lastPausedAt: null
    }
  };
}
