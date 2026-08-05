// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FlowWorkItemSnoozeDialog } from "./FlowWorkItemSnoozeDialog";

const now = new Date("2026-08-05T08:15:30.000Z");

describe("FlowWorkItemSnoozeDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders localized quick options, timezone, and focuses the default selection", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Отложить задачу" })).toBeTruthy();
    expect(screen.getByText("Подготовить консультацию")).toBeTruthy();
    expect(screen.getByText(/Europe\/Moscow/)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "На 1 час" }).getAttribute("aria-checked")).toBe(
      "true"
    );
    expect(screen.getByRole("radio", { name: "Завтра в 09:00" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Выбрать дату и время" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "На 1 час" }));
    expect(screen.queryByLabelText("Дата и время возврата")).toBeNull();
  });

  it("confirms the default one-hour instant", () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });

    fireEvent.click(screen.getByRole("button", { name: "Отложить задачу" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith("2026-08-05T09:15:30.000Z");
  });

  it("resolves tomorrow at 09:00 in the profile timezone", () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });

    fireEvent.click(screen.getByRole("radio", { name: "Завтра в 09:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Отложить задачу" }));

    expect(onConfirm).toHaveBeenCalledWith("2026-08-06T06:00:00.000Z");
  });

  it("uses a native datetime picker and submits its validated instant", () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });

    fireEvent.click(screen.getByRole("radio", { name: "Выбрать дату и время" }));
    const input = screen.getByLabelText("Дата и время возврата");
    expect(input.getAttribute("type")).toBe("datetime-local");

    fireEvent.change(input, { target: { value: "2026-08-07T10:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Отложить задачу" }));

    expect(onConfirm).toHaveBeenCalledWith("2026-08-07T07:30:00.000Z");
  });

  it("shows localized DST validation and disables confirmation", () => {
    renderDialog({
      locale: "en",
      timeZone: "Europe/Berlin",
      now: new Date("2024-10-26T12:00:00.000Z")
    });

    fireEvent.click(screen.getByRole("radio", { name: "Choose date and time" }));
    fireEvent.change(screen.getByLabelText("Return date and time"), {
      target: { value: "2024-10-27T02:30" }
    });

    expect(screen.getByRole("alert").textContent).toContain("This local time occurs twice");
    expect(screen.getByRole("button", { name: "Snooze task" })).toHaveProperty("disabled", true);
  });

  it("announces a safe command error without replacing picker validation", () => {
    renderDialog({ error: "Состояние задачи изменилось. Обновите очередь." });

    expect(screen.getByRole("alert").textContent).toContain(
      "Состояние задачи изменилось. Обновите очередь."
    );
    expect(screen.getByRole("status").textContent).toContain("Задача вернётся");
  });

  it("locks controls and ignores Escape, backdrop, and close actions while pending", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    renderDialog({ pending: true, onClose, onConfirm });

    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.parentElement;
    expect(backdrop).toBeTruthy();

    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.mouseDown(backdrop!);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    fireEvent.click(screen.getByRole("button", { name: "Откладываем" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "На 1 час" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Отмена" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("status").textContent).toContain("Сохраняем время возврата");
  });

  it("delegates close when idle and renders nothing when closed", () => {
    const onClose = vi.fn();
    const { rerender } = renderDialog({ onClose });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    rerender(
      <FlowWorkItemSnoozeDialog
        open={false}
        locale="ru"
        timeZone="Europe/Moscow"
        workItemTitle="Подготовить консультацию"
        pending={false}
        now={now}
        onClose={onClose}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

type DialogProps = Partial<React.ComponentProps<typeof FlowWorkItemSnoozeDialog>>;

function renderDialog(overrides: DialogProps = {}) {
  return render(
    <FlowWorkItemSnoozeDialog
      open
      locale="ru"
      timeZone="Europe/Moscow"
      workItemTitle="Подготовить консультацию"
      pending={false}
      now={now}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      {...overrides}
    />
  );
}
