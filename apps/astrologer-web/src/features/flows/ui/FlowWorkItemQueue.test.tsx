// @vitest-environment jsdom

import type { FlowWorkItem, FlowWorkItemQueueEntry } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FlowWorkItemQueue } from "./FlowWorkItemQueue";

describe("FlowWorkItemQueue", () => {
  afterEach(() => cleanup());

  it("renders actionable queue entries and delegates commands with the authoritative work item", () => {
    const pending = queueEntry({
      id: pendingId,
      status: "pending",
      title: "Подготовить консультацию",
      priority: "high",
      dueAt: "2026-08-05T10:30:00.000Z"
    });
    const inProgress = queueEntry({
      id: inProgressId,
      status: "in_progress",
      title: "Сверить вопросы клиента",
      startedAt: "2026-08-05T07:30:00.000Z",
      revision: 2
    });
    const onStart = vi.fn();
    const onSnooze = vi.fn();
    const onComplete = vi.fn();

    render(
      <FlowWorkItemQueue
        items={[pending, inProgress]}
        total={17}
        asOf="2026-08-05T08:00:00.000Z"
        locale="ru"
        timeZone="Europe/Moscow"
        onStart={onStart}
        onSnooze={onSnooze}
        onComplete={onComplete}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole("region", { name: "Задачи из воронок" })).toBeTruthy();
    expect(screen.getByText("17")).toBeTruthy();
    const pendingRow = screen.getByRole("article", { name: "Подготовить консультацию" });
    expect(within(pendingRow).getByText("К выполнению")).toBeTruthy();
    expect(within(pendingRow).getByText("Срок: 5 авг., 13:30")).toBeTruthy();
    expect(within(pendingRow).getByText("Подготовка консультации")).toBeTruthy();
    expect(within(pendingRow).getByText(/Наталья Орлова/)).toBeTruthy();
    expect(within(pendingRow).getByText("Проверить карту и вопросы клиента.")).toBeTruthy();

    fireEvent.click(within(pendingRow).getByRole("button", { name: "Начать" }));
    fireEvent.click(within(pendingRow).getByRole("button", { name: "Отложить" }));

    const inProgressRow = screen.getByRole("article", { name: "Сверить вопросы клиента" });
    expect(within(inProgressRow).getByText("В работе")).toBeTruthy();
    fireEvent.click(within(inProgressRow).getByRole("button", { name: "Завершить" }));

    expect(onStart).toHaveBeenCalledWith(pending);
    expect(onSnooze).toHaveBeenCalledWith(pending);
    expect(onComplete).toHaveBeenCalledWith(inProgress);
    expect(screen.queryByText(/подтверд/i)).toBeNull();
  });

  it("renders a loading skeleton instead of a false empty state", () => {
    render(
      <FlowWorkItemQueue
        items={[]}
        total={0}
        asOf="2026-08-05T08:00:00.000Z"
        locale="ru"
        timeZone="Europe/Moscow"
        isLoading
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onComplete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    const queue = screen.getByRole("region", { name: "Задачи из воронок" });
    expect(queue.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("Загружаем задачи");
    expect(screen.getAllByTestId("flow-work-item-skeleton")).toHaveLength(3);
    expect(screen.queryByText("Активных задач нет")).toBeNull();
  });

  it("retains stale rows after a list error, disables commands, and exposes retry", () => {
    const staleEntry = queueEntry();
    const onStart = vi.fn();
    const onRetry = vi.fn();

    render(
      <FlowWorkItemQueue
        items={[staleEntry]}
        total={1}
        asOf="2026-08-05T08:00:00.000Z"
        locale="ru"
        timeZone="Europe/Moscow"
        isError
        onStart={onStart}
        onSnooze={vi.fn()}
        onComplete={vi.fn()}
        onRetry={onRetry}
      />
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Не удалось обновить задачи");
    expect(alert.textContent).toContain("Показаны ранее загруженные данные");
    const row = screen.getByRole("article", { name: staleEntry.workItem.title });
    expect(within(row).getByRole("button", { name: "Начать" })).toHaveProperty("disabled", true);
    expect(within(row).getByRole("button", { name: "Отложить" })).toHaveProperty("disabled", true);
    fireEvent.click(within(alert).getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.queryByText("Активных задач нет")).toBeNull();
  });

  it("renders an honest empty state only after a successful read", () => {
    render(
      <FlowWorkItemQueue
        items={[]}
        total={0}
        asOf="2026-08-05T08:00:00.000Z"
        locale="ru"
        timeZone="Europe/Moscow"
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onComplete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText("Активных задач нет")).toBeTruthy();
    expect(
      screen.getByText("Новые задачи появятся здесь, когда воронка передаст работу вам.")
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("fails closed for an integrity error without rendering joined context or identifiers", () => {
    const integrityEntry = queueEntry(
      { title: "Проверить подготовку" },
      {
        status: "integrity_error",
        code: "FLOW_WORK_ITEM_CONTEXT_INTEGRITY_ERROR"
      }
    );
    const onRetry = vi.fn();

    render(
      <FlowWorkItemQueue
        items={[integrityEntry]}
        total={1}
        asOf="2026-08-05T08:00:00.000Z"
        locale="ru"
        timeZone="Europe/Moscow"
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onComplete={vi.fn()}
        onRetry={onRetry}
      />
    );

    const row = screen.getByRole("article", { name: "Проверить подготовку" });
    expect(within(row).getByText("Контекст задачи недоступен")).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "Начать" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Отложить" })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Обновить очередь" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText("Подготовка консультации")).toBeNull();
    expect(screen.queryByText("Наталья Орлова")).toBeNull();
    expect(document.body.textContent).not.toContain("66666666-6666-4666-8666-666666666666");
    expect(document.body.textContent).not.toContain(integrityEntry.workItem.flowRunId);
  });

  it("shows projection catch-up as a retryable state without exposing mixed Booking dates", () => {
    const pendingContextEntry = queueEntry(
      { title: "Подготовить материалы" },
      {
        status: "context_pending",
        code: "FLOW_WORK_ITEM_BOOKING_CONTEXT_PENDING",
        bookingId: "77777777-7777-4777-8777-777777777777",
        appliedRevision: 1,
        aggregateRevision: 2
      }
    );
    const onRetry = vi.fn();

    render(
      <FlowWorkItemQueue
        items={[pendingContextEntry]}
        total={1}
        asOf="2026-08-05T08:00:00.000Z"
        locale="ru"
        timeZone="Europe/Moscow"
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onComplete={vi.fn()}
        onRetry={onRetry}
      />
    );

    const row = screen.getByRole("article", { name: "Подготовить материалы" });
    expect(within(row).getByText("Обновляем задачу после изменения записи")).toBeTruthy();
    expect(within(row).getByText("Действия появятся после синхронизации расписания.")).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "Начать" })).toBeNull();
    expect(within(row).queryByText("Натальная консультация")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Обновить очередь" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not invent a client name when the current display name is absent", () => {
    const entry = queueEntry({}, availableContext(null));

    render(
      <FlowWorkItemQueue
        items={[entry]}
        total={1}
        asOf="2026-08-05T08:00:00.000Z"
        locale="ru"
        timeZone="Europe/Moscow"
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onComplete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText("Натальная консультация")).toBeTruthy();
    expect(document.body.textContent).not.toContain("88888888-8888-4888-8888-888888888888");
    expect(screen.queryByText("Клиент")).toBeNull();
  });

  it("keeps snoozed recovery and terminal entries read-only", () => {
    const snoozed = queueEntry({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Дождаться автоматического возврата",
      status: "snoozed",
      snoozedUntil: "2026-08-05T07:59:59.000Z",
      revision: 2
    });
    const completed = queueEntry({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Завершённая подготовка",
      status: "completed",
      startedAt: "2026-08-05T07:00:00.000Z",
      completedAt: "2026-08-05T07:45:00.000Z",
      completedByUserId: ownerUserId,
      revision: 3
    });

    render(
      <FlowWorkItemQueue
        items={[snoozed, completed]}
        total={2}
        asOf="2026-08-05T08:00:00.000Z"
        locale="ru"
        timeZone="Europe/Moscow"
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onComplete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    const snoozedRow = screen.getByRole("article", {
      name: "Дождаться автоматического возврата"
    });
    expect(within(snoozedRow).getByText("Отложено")).toBeTruthy();
    expect(within(snoozedRow).getByText("Возобновляется автоматически")).toBeTruthy();
    expect(within(snoozedRow).queryByRole("button")).toBeNull();
    expect(within(snoozedRow).queryByText(/продолжить/i)).toBeNull();

    const completedRow = screen.getByRole("article", { name: "Завершённая подготовка" });
    expect(within(completedRow).getByText("Завершено")).toBeTruthy();
    expect(within(completedRow).queryByRole("button")).toBeNull();
  });

  it("exposes row busy and stale-command states without dispatching another command", () => {
    const pending = queueEntry();
    const onStart = vi.fn();
    const { rerender } = render(
      <FlowWorkItemQueue
        items={[pending]}
        total={1}
        asOf="2026-08-05T08:00:00.000Z"
        locale="ru"
        timeZone="Europe/Moscow"
        commandStateByWorkItemId={{
          [pending.workItem.id]: { status: "pending", operation: "start" }
        }}
        onStart={onStart}
        onSnooze={vi.fn()}
        onComplete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    let row = screen.getByRole("article", { name: pending.workItem.title });
    expect(row.getAttribute("aria-busy")).toBe("true");
    const busyButton = within(row).getByRole("button", { name: "Начинаем" });
    expect(busyButton).toHaveProperty("disabled", true);
    expect(within(row).getByRole("button", { name: "Отложить" })).toHaveProperty("disabled", true);
    fireEvent.click(busyButton);
    expect(onStart).not.toHaveBeenCalled();

    rerender(
      <FlowWorkItemQueue
        items={[pending]}
        total={1}
        asOf="2026-08-05T08:00:00.000Z"
        locale="ru"
        timeZone="Europe/Moscow"
        commandStateByWorkItemId={{
          [pending.workItem.id]: {
            status: "error",
            operation: "start",
            userMessage: "Состояние задачи изменилось. Обновите очередь.",
            refetchRequired: true
          }
        }}
        onStart={onStart}
        onSnooze={vi.fn()}
        onComplete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    row = screen.getByRole("article", { name: pending.workItem.title });
    expect(within(row).getByRole("alert").textContent).toContain("Состояние задачи изменилось");
    expect(within(row).getByRole("button", { name: "Начать" })).toHaveProperty("disabled", true);
  });

  it("localizes the queue and exposes a background refresh status", () => {
    render(
      <FlowWorkItemQueue
        items={[queueEntry({ title: "Prepare consultation" })]}
        total={1}
        asOf="2026-08-05T08:00:00.000Z"
        locale="en"
        timeZone="America/New_York"
        isFetching
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onComplete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole("region", { name: "Flow tasks" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Refreshing tasks");
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
  });

  it("accepts a surface-owned navigation action in the queue header", () => {
    render(
      <FlowWorkItemQueue
        items={[]}
        total={0}
        asOf="2026-08-05T08:00:00.000Z"
        locale="ru"
        timeZone="Europe/Moscow"
        headerAction={<a href="/flows">Все воронки</a>}
        onStart={vi.fn()}
        onSnooze={vi.fn()}
        onComplete={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole("link", { name: "Все воронки" })).toHaveProperty("pathname", "/flows");
  });
});

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const pendingId = "22222222-2222-4222-8222-222222222222";
const inProgressId = "33333333-3333-4333-8333-333333333333";

function queueEntry(
  overrides: Partial<FlowWorkItem> = {},
  context: FlowWorkItemQueueEntry["context"] = availableContext()
): FlowWorkItemQueueEntry {
  return {
    workItem: {
      id: pendingId,
      flowRunId: "44444444-4444-4444-8444-444444444444",
      flowVersionId: "55555555-5555-4555-8555-555555555555",
      nodeId: "prepare_consultation",
      status: "pending",
      taskKind: "consultation_preparation",
      title: "Подготовить консультацию",
      instructions: "Проверить карту и вопросы клиента.",
      assigneeUserId: ownerUserId,
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
      canceledAt: null,
      ...overrides
    },
    context
  };
}

function availableContext(
  currentDisplayName: string | null = "Наталья Орлова"
): Extract<FlowWorkItemQueueEntry["context"], { status: "available" }> {
  return {
    status: "available",
    subjectType: "booking",
    completionRequirements: { resultSummary: "required" },
    flow: {
      id: "66666666-6666-4666-8666-666666666666",
      currentName: "Подготовка консультации"
    },
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
      currentDisplayName
    },
    product: {
      id: "99999999-9999-4999-8999-999999999999",
      titleSnapshot: "Натальная консультация"
    }
  };
}
