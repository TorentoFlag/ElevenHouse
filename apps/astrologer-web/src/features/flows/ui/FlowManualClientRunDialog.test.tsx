// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { FlowManualClientRunDialog } from "./FlowManualClientRunDialog";

const client = {
  value: "11111111-1111-4111-8111-111111111111",
  label: "Марина К.",
  subtitle: "Клиент",
  initials: "МК",
  birthDateDisplay: "03.04.1990",
  hasBirthDate: true,
  birthData: null
} satisfies ClientSelectOption;

vi.mock("../../clients/components/ClientSearchCombobox", () => ({
  ClientSearchCombobox: ({ onSelect, disabled }: { onSelect: (value: ClientSelectOption) => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect(client)}>
      Выбрать Марину
    </button>
  )
}));

afterEach(cleanup);

function getButton(name: string) {
  return screen.getByRole("button", { name, hidden: true });
}

describe("FlowManualClientRunDialog", () => {
  it("submits only an existing CRM client and keeps a stable idempotency key for retry", async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ status: "no_match", replayed: false, eventId: "event-1", runs: [] });
    const onClose = vi.fn();

    render(
      <FlowManualClientRunDialog
        flowName="Подготовка к сессии"
        locale="ru"
        pending={false}
        error={null}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    expect(getButton("Запустить")).toHaveProperty("disabled", true);
    fireEvent.click(getButton("Выбрать Марину"));
    fireEvent.click(getButton("Запустить"));

    await screen.findByText("В активной версии этой воронки нет ручного запуска.");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ clientUserId: client.value, idempotencyKey: expect.any(String) })
    );
    const firstKey = onSubmit.mock.calls[0]?.[0]?.idempotencyKey;

    fireEvent.click(getButton("Повторить"));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ clientUserId: client.value, idempotencyKey: firstKey })
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows durable enrollment confirmation instead of a simulated result", async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      status: "enrolled",
      replayed: false,
      eventId: "event-1",
      runs: [
        {
          runId: "22222222-2222-4222-8222-222222222222",
          tokenId: "33333333-3333-4333-8333-333333333333",
          flowId: "44444444-4444-4444-8444-444444444444",
          flowVersionId: "55555555-5555-4555-8555-555555555555",
          activationEpochId: "66666666-6666-4666-8666-666666666666"
        }
      ]
    });

    render(
      <FlowManualClientRunDialog
        flowName="Подготовка к сессии"
        locale="ru"
        pending={false}
        error={null}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(getButton("Выбрать Марину"));
    fireEvent.click(getButton("Запустить"));

    await screen.findByText("Запуск создан и поставлен в обработку.");
    expect(getButton("Готово")).toBeTruthy();
  });
});
