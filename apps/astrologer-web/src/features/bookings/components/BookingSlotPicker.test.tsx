// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingSlotPicker, type BookingSlotPickerCopy } from "./BookingSlotPicker";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => {
  document.body.replaceChildren();
});

const copy: BookingSlotPickerCopy = {
  pickerLabel: "Календарь доступных дат",
  previousMonthLabel: "Предыдущий месяц",
  nextMonthLabel: "Следующий месяц",
  timeSlotsLabel: (date) => `Доступное время на ${date}`,
  availableDateLabel: (date, count) => `${date}, ${count} слота`,
  unavailableDateLabel: (date) => `${date}, нет доступного времени`,
  selectedDateLabel: "Выбранный день",
  slotCountLabel: (count) => `${count} слота`,
  noSlotsForDateLabel: "На выбранный день нет доступного времени"
};

describe("BookingSlotPicker", () => {
  it("renders a custom accessible date and time picker without native selects", () => {
    const markup = renderToStaticMarkup(
      <BookingSlotPicker
        copy={copy}
        locale="ru"
        timeZone="Europe/Moscow"
        slots={slots}
        value="2026-07-20T07:00:00Z"
        disabled={false}
        onChange={vi.fn()}
      />
    );

    expect(markup).toContain('aria-label="Календарь доступных дат"');
    expect(markup).toContain("2 слота");
    expect(markup).toContain("10:00");
    expect(markup).toContain("10:30");
    expect(markup).not.toContain("<select");
  });

  it("selects the first server slot for a newly chosen available date", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onChange = vi.fn();
    document.body.append(container);

    act(() => {
      root.render(
        <BookingSlotPicker
          copy={copy}
          locale="ru"
          timeZone="Europe/Moscow"
          slots={slots}
          value="2026-07-20T07:00:00Z"
          disabled={false}
          onChange={onChange}
        />
      );
    });

    const nextDateButton = [...container.querySelectorAll("button")].find(
      (button) => button.getAttribute("data-date-key") === "2026-07-21"
    );
    expect(nextDateButton).toBeTruthy();

    act(() => {
      nextDateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith("2026-07-21T08:00:00Z");

    act(() => root.unmount());
  });
});

const slots = [
  {
    value: "2026-07-20T07:00:00Z",
    endAt: "2026-07-20T08:00:00Z",
    dateKey: "2026-07-20",
    dateLabel: "пн, 20 июля",
    timeLabel: "10:00"
  },
  {
    value: "2026-07-20T07:30:00Z",
    endAt: "2026-07-20T08:30:00Z",
    dateKey: "2026-07-20",
    dateLabel: "пн, 20 июля",
    timeLabel: "10:30"
  },
  {
    value: "2026-07-21T08:00:00Z",
    endAt: "2026-07-21T09:00:00Z",
    dateKey: "2026-07-21",
    dateLabel: "вт, 21 июля",
    timeLabel: "11:00"
  }
];
