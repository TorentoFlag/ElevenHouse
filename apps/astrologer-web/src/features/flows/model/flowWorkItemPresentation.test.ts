import type { FlowWorkItem } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";

import { buildFlowWorkItemPresentation } from "./flowWorkItemPresentation";

describe("buildFlowWorkItemPresentation", () => {
  it("presents a pending task with an explicit start command in the profile timezone", () => {
    expect(
      buildFlowWorkItemPresentation({
        workItem: workItem({
          status: "pending",
          priority: "high",
          dueAt: "2026-08-05T10:30:00.000Z"
        }),
        locale: "ru",
        timeZone: "Europe/Moscow",
        now: new Date("2026-08-05T08:00:00.000Z")
      })
    ).toMatchObject({
      statusLabel: "К выполнению",
      priorityLabel: "Высокий",
      dueState: "scheduled",
      dueLabel: "Срок: 5 авг., 13:30",
      primaryAction: "start",
      secondaryAction: "snooze",
      readOnly: false
    });
  });

  it("marks an in-progress task overdue without changing its completion command", () => {
    expect(
      buildFlowWorkItemPresentation({
        workItem: workItem({
          status: "in_progress",
          priority: "urgent",
          dueAt: "2026-08-05T05:30:00.000Z",
          startedAt: "2026-08-05T04:00:00.000Z"
        }),
        locale: "ru",
        timeZone: "Europe/Moscow",
        now: new Date("2026-08-05T08:00:00.000Z")
      })
    ).toMatchObject({
      statusLabel: "В работе",
      priorityLabel: "Срочный",
      dueState: "overdue",
      dueLabel: "Просрочено: 5 авг., 08:30",
      primaryAction: "complete",
      secondaryAction: "snooze",
      readOnly: false
    });
  });

  it("keeps a future snooze durable and allows changing its wake time", () => {
    expect(
      buildFlowWorkItemPresentation({
        workItem: workItem({
          status: "snoozed",
          snoozedUntil: "2026-08-05T12:00:00.000Z"
        }),
        locale: "ru",
        timeZone: "Europe/Moscow",
        now: new Date("2026-08-05T08:00:00.000Z")
      })
    ).toMatchObject({
      statusLabel: "Отложено",
      snoozeLabel: "До 5 авг., 15:00",
      primaryAction: "none",
      secondaryAction: "snooze",
      readOnly: false
    });
  });

  it("requires an explicit resume command after the snooze instant", () => {
    expect(
      buildFlowWorkItemPresentation({
        workItem: workItem({
          status: "snoozed",
          snoozedUntil: "2026-08-05T07:59:59.000Z"
        }),
        locale: "ru",
        timeZone: "Europe/Moscow",
        now: new Date("2026-08-05T08:00:00.000Z")
      })
    ).toMatchObject({
      primaryAction: "resume",
      secondaryAction: "snooze",
      snoozeLabel: "Можно продолжить",
      readOnly: false
    });
  });

  it.each([
    ["completed", "Завершено"],
    ["expired", "Срок истёк"],
    ["canceled", "Отменено"]
  ] as const)("keeps %s tasks read-only", (status, statusLabel) => {
    const terminalEvidence =
      status === "completed"
        ? {
            startedAt: "2026-08-05T07:00:00.000Z",
            completedAt: "2026-08-05T08:00:00.000Z",
            completedByUserId: userId
          }
        : status === "expired"
          ? { expiredAt: "2026-08-05T08:00:00.000Z" }
          : { canceledAt: "2026-08-05T08:00:00.000Z" };

    expect(
      buildFlowWorkItemPresentation({
        workItem: workItem({ status, ...terminalEvidence }),
        locale: "ru",
        timeZone: "Europe/Moscow",
        now: new Date("2026-08-05T09:00:00.000Z")
      })
    ).toMatchObject({
      statusLabel,
      primaryAction: "none",
      secondaryAction: "none",
      readOnly: true
    });
  });

  it("localizes English copy and uses the supplied timezone rather than the browser timezone", () => {
    expect(
      buildFlowWorkItemPresentation({
        workItem: workItem({
          status: "pending",
          priority: "normal",
          dueAt: "2026-08-05T10:30:00.000Z"
        }),
        locale: "en",
        timeZone: "America/New_York",
        now: new Date("2026-08-05T08:00:00.000Z")
      })
    ).toMatchObject({
      statusLabel: "To do",
      priorityLabel: "Normal",
      dueLabel: "Due: 5 Aug, 06:30"
    });
  });

  it("fails closed when no valid IANA timezone is available", () => {
    expect(() =>
      buildFlowWorkItemPresentation({
        workItem: workItem(),
        locale: "ru",
        timeZone: "UTC+3",
        now: new Date("2026-08-05T08:00:00.000Z")
      })
    ).toThrow("A valid IANA timezone is required to present flow work items");
  });
});

const userId = "11111111-1111-4111-8111-111111111111";

function workItem(overrides: Partial<FlowWorkItem> = {}): FlowWorkItem {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    flowRunId: "33333333-3333-4333-8333-333333333333",
    flowVersionId: "44444444-4444-4444-8444-444444444444",
    nodeId: "prepare_consultation",
    status: "pending",
    taskKind: "consultation_preparation",
    title: "Подготовить консультацию",
    instructions: "Проверить карту и вопросы клиента.",
    assigneeUserId: userId,
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
  };
}
