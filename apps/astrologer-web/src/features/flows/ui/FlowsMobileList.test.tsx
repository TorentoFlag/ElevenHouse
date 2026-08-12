// @vitest-environment jsdom

import type { FlowDefinitionSummary } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowsMobileList } from "./FlowsMobileList";

const flow = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  name: "Подготовка консультации",
  state: "draft",
  approvalMode: "manual_approve",
  revision: 2,
  draftBaseVersionId: null,
  latestPublishedVersionId: null,
  latestPublishedVersion: null,
  createdAt: "2026-07-28T08:00:00.000Z",
  updatedAt: "2026-07-28T08:00:00.000Z",
  publishedAt: null,
  activeRunCount: 0,
  graphSchemaVersion: "flow-graph.v2",
  graphNodeKinds: ["booking_confirmed", "birth_data_available", "completed"],
  origin: { schemaVersion: "flow-definition-origin.v1", type: "blank" },
  enrollment: inactiveEnrollment()
} satisfies FlowDefinitionSummary;

describe("FlowsMobileList", () => {
  afterEach(() => cleanup());

  it("keeps the reference hierarchy with honest lifecycle facts and a create command", () => {
    const onCreateFlow = vi.fn();
    render(<FlowsMobileList flows={[flow]} locale="ru" onCreateFlow={onCreateFlow} />);

    expect(screen.getByText("Воронок: 1")).toBeTruthy();
    expect(screen.getByText("Изменена 28.07.2026")).toBeTruthy();
    expect(screen.getByText("Клиентов внутри")).toBeTruthy();
    expect(screen.queryByText("Схема V2")).toBeNull();
    expect(screen.getByTitle("Запись подтверждена").getAttribute("data-tone")).toBe("trigger");
    expect(screen.getByTitle("Данные рождения").getAttribute("data-tone")).toBe("logic");
    expect(screen.queryByText("Конверсия")).toBeNull();
    const createButton = screen.getByRole("button", { name: "Новая воронка" });
    expect(createButton.textContent).toContain("Новая воронка");
    fireEvent.click(createButton);
    expect(onCreateFlow).toHaveBeenCalledOnce();
  });

  it("opens a definition and routes published inactive state through activation review", () => {
    const onOpenFlow = vi.fn();
    const onAutomationAction = vi.fn();
    render(
      <FlowsMobileList
        flows={[
          {
            ...flow,
            state: "versioned",
            latestPublishedVersionId: "44444444-4444-4444-8444-444444444444",
            latestPublishedVersion: 1,
            publishedAt: "2026-07-30T14:45:00.000Z"
          }
        ]}
        locale="ru"
        onOpenFlow={onOpenFlow}
        onAutomationAction={onAutomationAction}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Открыть схему" }));
    expect(onOpenFlow).toHaveBeenCalledWith(flow.id);
    const toggle = screen.getByRole("switch", {
      name: "Проверить и включить автоматизацию"
    });
    expect(toggle).toHaveProperty("disabled", false);
    expect(toggle.textContent).toContain("Выкл.");
    fireEvent.click(toggle);
    expect(onAutomationAction).toHaveBeenCalledWith(flow.id, "review_activation");
    expect(onOpenFlow).toHaveBeenCalledOnce();
    expect(screen.queryByText("Схема V2")).toBeNull();
  });

  it("counts server-authoritative active enrollments without legacy runtime metadata", () => {
    render(
      <FlowsMobileList
        flows={[
          {
            ...flow,
            state: "versioned",
            latestPublishedVersionId: "44444444-4444-4444-8444-444444444444",
            latestPublishedVersion: 1,
            publishedAt: "2026-07-30T14:45:00.000Z",
            enrollment: activeEnrollment()
          }
        ]}
        locale="ru"
      />
    );

    expect(screen.getByText(/активны 1/)).toBeTruthy();
    expect(screen.getByText("Активна")).toBeTruthy();
  });

  it("renders the empty state after the mobile header", () => {
    render(
      <FlowsMobileList
        flows={[]}
        locale="ru"
        emptyMessage="Создайте первую воронку"
        classNames={{ mobileHeader: "mobile-header-hook", emptyState: "empty-state-hook" }}
      />
    );

    const header = document.querySelector(".mobile-header-hook");
    const emptyState = screen.getByText("Создайте первую воронку");
    expect(emptyState.classList.contains("empty-state-hook")).toBe(true);
    expect(header?.nextElementSibling).toBe(emptyState);
  });
});

function inactiveEnrollment(): FlowDefinitionSummary["enrollment"] {
  return {
    schemaVersion: "flow-enrollment-read-authority.v1",
    authority: "enrollment_v1",
    control: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId: "11111111-1111-4111-8111-111111111111",
      state: "inactive",
      definitionRevision: 2,
      enrollmentRevision: 0,
      activeVersionId: null,
      activeActivationEpochId: null,
      activeSince: null,
      lastPausedAt: null
    }
  };
}

function activeEnrollment(): FlowDefinitionSummary["enrollment"] {
  return {
    schemaVersion: "flow-enrollment-read-authority.v1",
    authority: "enrollment_v1",
    control: {
      schemaVersion: "flow-enrollment-control.v1",
      flowId: "11111111-1111-4111-8111-111111111111",
      state: "active",
      definitionRevision: 2,
      enrollmentRevision: 1,
      activeVersionId: "44444444-4444-4444-8444-444444444444",
      activeActivationEpochId: "55555555-5555-4555-8555-555555555555",
      activeSince: "2026-07-30T14:45:00.000Z",
      lastPausedAt: null
    }
  };
}
