// @vitest-environment jsdom

import type { AvailabilityBackground, CalendarEntry } from "@elevenhouse/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import { CalendarMonthView } from "./CalendarMonthView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => {
  document.body.replaceChildren();
});

const entries: CalendarEntry[] = [
  createEntry("00000000-0000-4000-8000-000000000001", "2026-05-04T21:30:00.000Z", "Анна"),
  createEntry("00000000-0000-4000-8000-000000000002", "2026-05-05T07:00:00.000Z", "Марина"),
  createEntry("00000000-0000-4000-8000-000000000003", "2026-05-05T08:00:00.000Z", "Ольга"),
  createEntry("00000000-0000-4000-8000-000000000004", "2026-05-05T09:00:00.000Z", "Ирина")
];

const availability: AvailabilityBackground[] = [
  {
    startAt: "2026-05-05T10:00:00.000Z",
    endAt: "2026-05-05T11:00:00.000Z"
  }
];

describe("CalendarMonthView", () => {
  it("renders the reference Monday-first month grid with timezone-safe entries and overflow", () => {
    const { container, root } = renderMonth();

    expect(container.querySelector('[data-calendar-month-view="true"]')).not.toBeNull();
    expect(
      Array.from(container.querySelectorAll("[data-calendar-month-weekday]")).map(
        (node) => node.textContent
      )
    ).toEqual(["пн", "вт", "ср", "чт", "пт", "сб", "вс"]);
    expect(container.querySelectorAll('[role="columnheader"]')).toHaveLength(7);
    expect(container.querySelectorAll('[role="row"]')).toHaveLength(6);
    expect(container.querySelectorAll("[role=gridcell]")).toHaveLength(35);
    expect(container.querySelector('[data-calendar-month-date="2026-05-01"]')).not.toBeNull();
    expect(container.querySelector('[data-calendar-month-date="2026-04-30"]')).toBeNull();

    const mayFifth = container.querySelector('[data-calendar-month-date="2026-05-05"]');
    expect(mayFifth?.textContent).toContain("00:30");
    expect(mayFifth?.textContent).toContain("Анна");
    expect(mayFifth?.textContent).toContain("+1 ещё");
    expect(mayFifth?.querySelector('[data-calendar-month-availability="true"]')).not.toBeNull();

    act(() => root.unmount());
  });

  it("moves between local dates with calendar arrow keys", () => {
    const { container, root } = renderMonth();
    const mayFifth = container.querySelector<HTMLButtonElement>(
      '[data-calendar-open-date="2026-05-05"]'
    );
    const maySixth = container.querySelector<HTMLButtonElement>(
      '[data-calendar-open-date="2026-05-06"]'
    );
    const mayTwelfth = container.querySelector<HTMLButtonElement>(
      '[data-calendar-open-date="2026-05-12"]'
    );

    mayFifth?.focus();
    act(() =>
      mayFifth?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    );
    expect(document.activeElement).toBe(maySixth);

    mayFifth?.focus();
    act(() =>
      mayFifth?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    );
    expect(document.activeElement).toBe(mayTwelfth);

    act(() => root.unmount());
  });

  it("opens an exact local day and activates only booking entries", () => {
    const onOpenDate = vi.fn();
    const onSelectEntry = vi.fn();
    const { container, root } = renderMonth({ onOpenDate, onSelectEntry });

    const dayButton = container.querySelector<HTMLButtonElement>(
      '[data-calendar-open-date="2026-05-05"]'
    );
    const bookingButton = container.querySelector<HTMLButtonElement>(
      `[data-calendar-entry-id="${entries[0]?.id}"]`
    );

    expect(dayButton?.getAttribute("aria-label")).toContain("5 мая");
    expect(bookingButton?.getAttribute("aria-label")).toContain("Анна");
    act(() => dayButton?.click());
    act(() => bookingButton?.click());

    expect(onOpenDate).toHaveBeenCalledWith("2026-05-05");
    expect(onSelectEntry).toHaveBeenCalledWith(entries[0]);

    act(() => root.unmount());
  });
});

function renderMonth(overrides?: {
  readonly onOpenDate?: (date: string) => void;
  readonly onSelectEntry?: (entry: CalendarEntry) => void;
}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <CalendarMonthView
        copy={astrologerCopyByLocale.ru.calendar.monthGrid}
        locale="ru"
        timeZone="Europe/Moscow"
        today="2026-05-29"
        range={{
          start: "2026-04-30T21:00:00.000Z",
          end: "2026-05-31T21:00:00.000Z"
        }}
        entries={entries}
        availability={availability}
        onOpenDate={overrides?.onOpenDate ?? vi.fn()}
        onSelectEntry={overrides?.onSelectEntry ?? vi.fn()}
      />
    );
  });

  return { container, root };
}

function createEntry(id: string, startAt: string, title: string): CalendarEntry {
  return {
    id,
    kind: "booking",
    startAt,
    endAt: new Date(Date.parse(startAt) + 60 * 60 * 1_000).toISOString(),
    title,
    subtitle: "Консультация",
    deliveryFormat: "video",
    displayStatus: "confirmed"
  };
}
