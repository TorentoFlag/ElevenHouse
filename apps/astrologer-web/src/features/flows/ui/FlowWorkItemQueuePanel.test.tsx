// @vitest-environment jsdom

import type { FlowWorkItem, FlowWorkItemQueueEntry } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FlowWorkItemQueuePanel } from "./FlowWorkItemQueuePanel";

const mocks = vi.hoisted(() => ({
  controller: vi.fn(),
  navigate: vi.fn()
}));

vi.mock("../model/useFlowWorkItemQueueController", () => ({
  useFlowWorkItemQueueController: mocks.controller
}));
vi.mock("react-router", () => ({
  Link: ({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { readonly to: string }) => (
    <a {...props} href={to} />
  ),
  useNavigate: () => mocks.navigate
}));

describe("FlowWorkItemQueuePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.controller.mockReturnValue(controller());
  });

  afterEach(() => cleanup());

  it("renders the server queue with the persisted profile timezone", () => {
    render(<FlowWorkItemQueuePanel locale="ru" />);

    expect(mocks.controller).toHaveBeenCalledWith({ locale: "ru", limit: 50 });
    expect(screen.getByRole("region", { name: "Задачи из воронок" })).toBeTruthy();
    expect(screen.getByText("Активных задач нет")).toBeTruthy();
  });

  it("can stay out of the gallery surface after a successful empty read", () => {
    render(<FlowWorkItemQueuePanel locale="ru" hideWhenEmpty />);

    expect(screen.queryByRole("region", { name: "Задачи из воронок" })).toBeNull();
  });

  it("composes a compact dashboard projection without duplicating queue behavior", () => {
    render(
      <FlowWorkItemQueuePanel
        locale="en"
        limit={5}
        className="dashboard-projection"
        headerAction={<a href="/flows">All flows</a>}
      />
    );

    expect(mocks.controller).toHaveBeenCalledWith({ locale: "en", limit: 5 });
    expect(
      screen
        .getByRole("region", { name: "Flow tasks" })
        .parentElement?.classList.contains("dashboard-projection")
    ).toBe(true);
    expect(screen.getByRole("link", { name: "All flows" })).toHaveProperty("pathname", "/flows");
  });

  it("fails closed and routes to profile settings when timezone authority is absent", () => {
    mocks.controller.mockReturnValue(
      controller({ profileState: "profile_required", timeZone: null })
    );
    render(<FlowWorkItemQueuePanel locale="ru" />);

    expect(screen.queryByText("Активных задач нет")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Настроить профиль" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/settings");
  });

  it("offers a retry for a failed profile timezone query", () => {
    const retryProfile = vi.fn();
    mocks.controller.mockReturnValue(
      controller({ profileState: "error", timeZone: null, retryProfile })
    );
    render(<FlowWorkItemQueuePanel locale="en" />);

    expect(screen.getByRole("alert").textContent).toContain("timezone");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retryProfile).toHaveBeenCalledOnce();
  });

  it("wires the selected work item into the snooze dialog", () => {
    mocks.controller.mockReturnValue(controller({ snoozeTarget: workItemEntry }));
    render(<FlowWorkItemQueuePanel locale="ru" />);

    expect(screen.getByRole("dialog", { name: "Отложить задачу" })).toBeTruthy();
    expect(screen.getByText(workItem.title)).toBeTruthy();
  });

  it("wires pinned completion requirements into the completion dialog", () => {
    mocks.controller.mockReturnValue(controller({ completionTarget: workItemEntry }));
    render(<FlowWorkItemQueuePanel locale="ru" />);

    expect(screen.getByRole("dialog", { name: "Завершить задачу" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Результат выполнения" })).toHaveProperty(
      "required",
      true
    );
  });
});

const workItem: FlowWorkItem = {
  id: "22222222-2222-4222-8222-222222222222",
  flowRunId: "44444444-4444-4444-8444-444444444444",
  flowVersionId: "55555555-5555-4555-8555-555555555555",
  nodeId: "prepare_consultation",
  status: "pending",
  taskKind: "consultation_preparation",
  title: "Подготовить консультацию",
  instructions: "Проверить карту и вопросы клиента.",
  assigneeUserId: "11111111-1111-4111-8111-111111111111",
  priority: "normal",
  dueAt: null,
  availableAt: "2026-08-05T07:00:00.000Z",
  snoozedUntil: null,
  revision: 1,
  resultSummary: null,
  createdAt: "2026-08-05T07:00:00.000Z",
  updatedAt: "2026-08-05T07:00:00.000Z",
  startedAt: null,
  completedAt: null,
  completedByUserId: null,
  expiredAt: null,
  canceledAt: null
};

const workItemEntry: FlowWorkItemQueueEntry = {
  workItem: { ...workItem, status: "in_progress", revision: 2, startedAt: workItem.updatedAt },
  context: {
    status: "available",
    subjectType: "booking",
    completionRequirements: { resultSummary: "required" },
    flow: { id: "66666666-6666-4666-8666-666666666666", currentName: "После записи" },
    booking: {
      id: "77777777-7777-4777-8777-777777777777",
      lifecycleRevision: 1,
      state: "confirmed",
      currentStartAt: "2026-08-06T10:00:00.000Z",
      currentEndAt: "2026-08-06T11:00:00.000Z",
      timeZoneSnapshot: "Europe/Moscow"
    },
    client: {
      userId: "88888888-8888-4888-8888-888888888888",
      currentDisplayName: "Наталья Орлова"
    },
    product: {
      id: "99999999-9999-4999-8999-999999999999",
      titleSnapshot: "Натальная консультация"
    }
  }
};

function controller(overrides: Record<string, unknown> = {}) {
  return {
    profileState: "ready",
    timeZone: "Europe/Moscow",
    retryProfile: vi.fn(),
    items: [],
    total: 0,
    asOf: null,
    isLoading: false,
    isError: false,
    isFetching: false,
    commandStateByWorkItemId: {},
    start: vi.fn(),
    openSnooze: vi.fn(),
    openComplete: vi.fn(),
    retry: vi.fn(),
    snoozeTarget: null,
    snoozePending: false,
    snoozeError: null,
    closeSnooze: vi.fn(),
    confirmSnooze: vi.fn(),
    completionTarget: null,
    completionPending: false,
    completionError: null,
    closeComplete: vi.fn(),
    confirmComplete: vi.fn(),
    ...overrides
  };
}
