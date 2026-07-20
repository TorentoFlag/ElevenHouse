// @vitest-environment jsdom

import type { AvailabilityBackground, CalendarEntry } from "@elevenhouse/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import { CalendarMobileAgenda } from "./CalendarMobileAgenda";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => {
  document.body.replaceChildren();
});

const entries: CalendarEntry[] = [
  {
    id: "4fa66e6e-cb18-4d2b-81c5-4fd84bd334ae",
    kind: "booking",
    startAt: "2026-05-29T08:00:00.000Z",
    endAt: "2026-05-29T09:00:00.000Z",
    title: "Марина К.",
    subtitle: "Натальный разбор",
    deliveryFormat: "video",
    displayStatus: "confirmed"
  },
  {
    id: "84ae014b-486a-41a8-8489-ea80c520d150",
    kind: "manual_block",
    startAt: "2026-05-29T10:00:00.000Z",
    endAt: "2026-05-29T11:30:00.000Z",
    title: "Личное время",
    subtitle: null,
    deliveryFormat: null,
    displayStatus: "blocked"
  }
];

const availability: AvailabilityBackground[] = [
  {
    startAt: "2026-05-29T07:00:00.000Z",
    endAt: "2026-05-29T16:00:00.000Z"
  }
];

describe("CalendarMobileAgenda", () => {
  it("renders a timezone-safe mobile agenda with server-backed bookings and blocks", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CalendarMobileAgenda
          copy={astrologerCopyByLocale.ru.calendar.mobileAgenda}
          locale="ru"
          timeZone="Europe/Moscow"
          rangeLabel="25–31 мая 2026 г."
          entries={entries}
          availability={availability}
          onSelectEntry={vi.fn()}
          onOpenManualBooking={vi.fn()}
        />
      );
    });

    expect(container.querySelector('[data-mobile-calendar-agenda="true"]')).not.toBeNull();
    expect(container.textContent).toContain("пт, 29 мая");
    expect(container.textContent).toContain("11:00–12:00");
    expect(container.textContent).toContain("Марина К.");
    expect(container.textContent).toContain("Натальный разбор");
    expect(container.textContent).toContain("13:00–14:30");
    expect(container.textContent).toContain("Личное время");
    expect(container.textContent).toContain("Доступно 10:00–19:00");

    act(() => root.unmount());
  });

  it("activates bookings and opens a booking intent only from server-returned availability", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSelectEntry = vi.fn();
    const onOpenManualBooking = vi.fn();

    act(() => {
      root.render(
        <CalendarMobileAgenda
          copy={astrologerCopyByLocale.en.calendar.mobileAgenda}
          locale="en"
          timeZone="Europe/Moscow"
          rangeLabel="May 25–31, 2026"
          entries={entries}
          availability={availability}
          onSelectEntry={onSelectEntry}
          onOpenManualBooking={onOpenManualBooking}
        />
      );
    });

    const bookingButton = container.querySelector<HTMLButtonElement>(
      `[data-calendar-entry-id="${entries[0]?.id}"]`
    );
    const availabilityButton = container.querySelector<HTMLButtonElement>(
      '[data-calendar-availability-start="2026-05-29T07:00:00.000Z"]'
    );
    const block = container.querySelector(`[data-calendar-entry-id="${entries[1]?.id}"]`);

    expect(bookingButton?.getAttribute("aria-label")).toContain("Confirmed");
    expect(availabilityButton?.getAttribute("aria-label")).toBe("Book from 10:00");
    expect(block?.tagName).not.toBe("BUTTON");

    act(() => bookingButton?.click());
    act(() => availabilityButton?.click());

    expect(onSelectEntry).toHaveBeenCalledWith(entries[0]);
    expect(onOpenManualBooking).toHaveBeenCalledWith({
      start: availability[0]?.startAt,
      end: availability[0]?.endAt
    });

    act(() => root.unmount());
  });
});
