// @vitest-environment jsdom

import type { FlowDefinitionSummary } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowGallery } from "./FlowGallery";

const flow = {
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
  activeRunCount: 0,
  graphSchemaVersion: "flow-graph.v2",
  graphNodeKinds: ["booking_confirmed", "birth_data_available", "natal_chart_request", "completed"],
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
  enrollment: inactiveEnrollment(3)
} satisfies FlowDefinitionSummary;

describe("FlowGallery", () => {
  afterEach(() => cleanup());

  it("renders only server-backed definition facts and graph preview data", () => {
    render(<FlowGallery flows={[flow]} locale="ru" />);

    expect(screen.getByRole("heading", { name: /^Воронки/ })).toBeTruthy();
    expect(screen.getByText("Подготовка консультации")).toBeTruthy();
    expect(screen.getByTitle("Запись подтверждена")).toBeTruthy();
    expect(screen.getByText("Узлы: Запись подтверждена · Данные рождения · Натальная карта")).toBeTruthy();
    expect(screen.getByText("Изменена 28.07.2026")).toBeTruthy();
    expect(screen.getByText("Клиентов внутри")).toBeTruthy();
    expect(screen.getAllByText("Не опубликована")).toHaveLength(1);
    expect(screen.getByRole("switch").textContent).toContain("Черновик");
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

  it("keeps the card open command separate from the automation switch", () => {
    const onOpenFlow = vi.fn();
    const onAutomationAction = vi.fn();
    const publishedFlow = {
      ...flow,
      state: "versioned",
      latestPublishedVersionId: "44444444-4444-4444-8444-444444444444",
      latestPublishedVersion: 1,
      publishedAt: "2026-07-30T14:45:00.000Z"
    } satisfies FlowDefinitionSummary;

    render(
      <FlowGallery
        flows={[publishedFlow]}
        locale="ru"
        onOpenFlow={onOpenFlow}
        onAutomationAction={onAutomationAction}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Открыть схему: Подготовка консультации" })
    );
    expect(onOpenFlow).toHaveBeenCalledOnce();
    expect(onAutomationAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("switch", { name: "Проверить и включить автоматизацию" }));
    expect(onAutomationAction).toHaveBeenCalledWith(flow.id, "review_activation");
    expect(onOpenFlow).toHaveBeenCalledOnce();

    const toggle = screen.getByRole("switch", {
      name: "Проверить и включить автоматизацию"
    });
    expect(toggle.textContent).toContain("Выкл.");
    expect(screen.queryByText("Исполнение")).toBeNull();
  });

  it("routes lifecycle actions without opening the card", () => {
    const onOpenFlow = vi.fn();
    const onLifecycleAction = vi.fn();
    render(
      <FlowGallery
        flows={[flow]}
        locale="ru"
        onOpenFlow={onOpenFlow}
        onLifecycleAction={onLifecycleAction}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "В архив" }));
    fireEvent.click(screen.getByRole("button", { name: "Дублировать" }));

    expect(onLifecycleAction).toHaveBeenNthCalledWith(1, flow.id, "archive");
    expect(onLifecycleAction).toHaveBeenNthCalledWith(2, flow.id, "duplicate");
    expect(onOpenFlow).not.toHaveBeenCalled();
  });

  it("offers restore instead of archive for archived definitions", () => {
    const onLifecycleAction = vi.fn();
    render(
      <FlowGallery
        flows={[{ ...flow, state: "archived" }]}
        locale="ru"
        onLifecycleAction={onLifecycleAction}
      />
    );

    expect(screen.queryByRole("button", { name: "В архив" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Вернуть" }));
    expect(onLifecycleAction).toHaveBeenCalledWith(flow.id, "restore");
  });

  it("renders the persisted node sequence instead of fabricated funnel metrics", () => {
    render(<FlowGallery flows={[flow]} locale="en" />);

    expect(screen.getByTitle("Booking confirmed")).toBeTruthy();
    expect(screen.getByTitle("Birth data")).toBeTruthy();
    expect(screen.getByTitle("Natal chart")).toBeTruthy();
    expect(screen.queryByText("Conversion")).toBeNull();
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
): FlowDefinitionSummary["enrollment"] {
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
