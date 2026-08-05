// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FlowPauseConfirmationDialog } from "./FlowPauseConfirmationDialog";

describe("FlowPauseConfirmationDialog", () => {
  afterEach(() => cleanup());

  it("keeps pause disabled while the exact enrollment snapshot is loading", () => {
    render(
      <FlowPauseConfirmationDialog
        open
        locale="ru"
        mode="pause_enrollment"
        flowName="Подготовка консультации"
        loading
        pending={false}
        onClose={vi.fn()}
        onRefetch={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText("Обновляем состояние автоматизации.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Поставить на паузу" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("confirms a persisted enrollment pause explicitly", () => {
    const onConfirm = vi.fn();
    render(
      <FlowPauseConfirmationDialog
        open
        locale="ru"
        mode="pause_enrollment"
        flowName="Подготовка консультации"
        pending={false}
        onClose={vi.fn()}
        onRefetch={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Новые события перестанут запускать активную версию.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Поставить на паузу" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("allows only refetch after conflict and exposes manual same-attempt retry after outage", () => {
    const onConfirm = vi.fn();
    const onRefetch = vi.fn();
    const { rerender } = render(
      <FlowPauseConfirmationDialog
        open
        locale="ru"
        mode="pause_enrollment"
        flowName="Подготовка консультации"
        pending={false}
        refetchRequired
        error={new Error("Состояние изменилось.")}
        onClose={vi.fn()}
        onRefetch={onRefetch}
        onConfirm={onConfirm}
      />
    );

    expect(screen.queryByRole("button", { name: "Поставить на паузу" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Обновить состояние" }));
    expect(onRefetch).toHaveBeenCalledOnce();

    rerender(
      <FlowPauseConfirmationDialog
        open
        locale="ru"
        mode="pause_enrollment"
        flowName="Подготовка консультации"
        pending={false}
        retrySameAttempt
        error={new Error("Сервис временно недоступен.")}
        onClose={vi.fn()}
        onRefetch={onRefetch}
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Повторить паузу" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
