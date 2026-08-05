// @vitest-environment jsdom

import type { FlowWorkItemQueueEntry } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

import { FlowWorkItemCompleteDialog } from "./FlowWorkItemCompleteDialog";

describe("FlowWorkItemCompleteDialog", () => {
  afterEach(() => cleanup());

  it("shows operational context and requires the pinned result summary", () => {
    const onConfirm = vi.fn();
    renderDialog("required", "ru", onConfirm);

    expect(screen.getByRole("dialog", { name: "Завершить задачу" })).toBeTruthy();
    expect(screen.getByText("Проверить карту и вопросы клиента.")).toBeTruthy();
    expect(screen.getByText(/Подготовка консультации/)).toBeTruthy();
    expect(screen.getByText(/Наталья Орлова/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Открыть воронку" }).getAttribute("href")).toBe(
      "/flows?flowId=66666666-6666-4666-8666-666666666666"
    );
    expect(screen.getByRole("link", { name: "Открыть запись" }).getAttribute("href")).toBe(
      "/calendar?bookingId=77777777-7777-4777-8777-777777777777&startAt=2026-08-06T10%3A00%3A00.000Z"
    );
    const textarea = screen.getByRole("textbox", { name: "Результат выполнения" });
    expect(textarea).toHaveProperty("required", true);
    const submit = screen.getByRole("button", { name: "Завершить задачу" });
    expect(submit).toHaveProperty("disabled", true);

    fireEvent.change(textarea, { target: { value: "  Карта и вопросы проверены  " } });
    fireEvent.click(submit);
    expect(onConfirm).toHaveBeenCalledWith("Карта и вопросы проверены");
  });

  it("submits an optional empty summary without inventing a value", () => {
    const onConfirm = vi.fn();
    renderDialog("optional", "en", onConfirm);

    fireEvent.click(screen.getByRole("button", { name: "Complete task" }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });
});

function renderDialog(
  requirement: "optional" | "required",
  locale: "ru" | "en",
  onConfirm: (resultSummary: string | undefined) => void
) {
  return render(
    <MemoryRouter>
      <FlowWorkItemCompleteDialog
        entry={entry(requirement)}
        locale={locale}
        pending={false}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    </MemoryRouter>
  );
}

function entry(resultSummary: "optional" | "required"): FlowWorkItemQueueEntry {
  return {
    workItem: {
      id: "22222222-2222-4222-8222-222222222222",
      flowRunId: "44444444-4444-4444-8444-444444444444",
      flowVersionId: "55555555-5555-4555-8555-555555555555",
      nodeId: "prepare_consultation",
      status: "in_progress",
      taskKind: "consultation_preparation",
      title: "Подготовить консультацию",
      instructions: "Проверить карту и вопросы клиента.",
      assigneeUserId: "11111111-1111-4111-8111-111111111111",
      priority: "normal",
      dueAt: "2026-08-06T09:00:00.000Z",
      availableAt: "2026-08-05T07:00:00.000Z",
      snoozedUntil: null,
      revision: 2,
      resultSummary: null,
      createdAt: "2026-08-05T07:00:00.000Z",
      updatedAt: "2026-08-05T07:30:00.000Z",
      startedAt: "2026-08-05T07:30:00.000Z",
      completedAt: null,
      completedByUserId: null,
      expiredAt: null,
      canceledAt: null
    },
    context: {
      status: "available",
      subjectType: "booking",
      completionRequirements: { resultSummary },
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
        currentDisplayName: "Наталья Орлова"
      },
      product: {
        id: "99999999-9999-4999-8999-999999999999",
        titleSnapshot: "Натальная консультация"
      }
    }
  };
}
