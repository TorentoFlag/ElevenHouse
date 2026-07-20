// @vitest-environment jsdom

import type { CalendarEntry, ManualBooking } from "@elevenhouse/contracts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import { BookingDetailPanel } from "./BookingDetailPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => {
  document.body.replaceChildren();
});

const entry: CalendarEntry = {
  id: "4fa66e6e-cb18-4d2b-81c5-4fd84bd334ae",
  kind: "booking",
  startAt: "2026-05-29T08:00:00.000Z",
  endAt: "2026-05-29T09:00:00.000Z",
  title: "Марина К.",
  subtitle: "Натальный разбор",
  deliveryFormat: "video",
  displayStatus: "confirmed"
};

const booking: ManualBooking = {
  id: entry.id,
  reservationId: "6fc48a44-cc13-4307-9531-17a0bd95b85a",
  clientUserId: "e0b69d64-2f20-4368-a8d0-acb676f1a574",
  productId: "45f17dc4-3160-48bd-9743-081dc32d64b9",
  state: "confirmed",
  startAt: entry.startAt,
  endAt: entry.endAt,
  productTitle: "Натальный разбор",
  durationMinutes: 60,
  deliveryFormat: "video",
  priceMinor: 490_000,
  currency: "RUB",
  timeZone: "Europe/Moscow",
  policySnapshot: {
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
    minimumNoticeMinutes: 360
  },
  createdAt: "2026-05-20T09:00:00.000Z",
  updatedAt: "2026-05-20T09:00:00.000Z"
};

describe("BookingDetailPanel", () => {
  it("renders the server-backed first-slice snapshot and omits unsupported actions", () => {
    const markup = renderToStaticMarkup(
      <BookingDetailPanel
        copy={astrologerCopyByLocale.ru.calendar.bookingDetail}
        locale="ru"
        timeZone="Europe/Moscow"
        entry={entry}
        booking={booking}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain('aria-label="Детали записи"');
    expect(markup).toContain("Подтверждена");
    expect(markup).toContain("Марина К.");
    expect(markup).toContain("Натальный разбор");
    expect(markup).toContain("4 900 ₽");
    expect(markup).toContain("Пт, 29 мая");
    expect(markup).toContain("11:00–12:00 · 60 мин");
    expect(markup).toContain("Видеозвонок");
    expect(markup).toContain("Услуга и стоимость");
    expect(markup).not.toContain("Войти в сессию");
    expect(markup).not.toContain("Перенести");
    expect(markup).not.toContain("Отменить");
    expect(markup).not.toContain("неявку");
  });

  it("keeps the panel closable while the detail query is loading", () => {
    const markup = renderToStaticMarkup(
      <BookingDetailPanel
        copy={astrologerCopyByLocale.ru.calendar.bookingDetail}
        locale="ru"
        timeZone="Europe/Moscow"
        entry={entry}
        booking={null}
        isLoading
        isError={false}
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("Загружаем детали записи");
    expect(markup).toContain('aria-label="Закрыть детали записи"');
  });

  it("renders an accessible retry state", () => {
    const markup = renderToStaticMarkup(
      <BookingDetailPanel
        copy={astrologerCopyByLocale.ru.calendar.bookingDetail}
        locale="ru"
        timeZone="Europe/Moscow"
        entry={entry}
        booking={null}
        isLoading={false}
        isError
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Не удалось загрузить детали записи");
    expect(markup).toContain("Повторить");
  });

  it("updates the return target for each selected event and restores the latest one", () => {
    const container = document.createElement("div");
    const firstEvent = document.createElement("button");
    const secondEvent = document.createElement("button");
    document.body.append(firstEvent, secondEvent, container);
    const root = createRoot(container);

    firstEvent.focus();
    act(() => {
      root.render(
        <BookingDetailPanel
          copy={astrologerCopyByLocale.ru.calendar.bookingDetail}
          locale="ru"
          timeZone="Europe/Moscow"
          entry={entry}
          booking={booking}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });
    expect(document.activeElement).toBe(
      container.querySelector('[aria-label="Закрыть детали записи"]')
    );

    secondEvent.focus();
    act(() => {
      root.render(
        <BookingDetailPanel
          copy={astrologerCopyByLocale.ru.calendar.bookingDetail}
          locale="ru"
          timeZone="Europe/Moscow"
          entry={{ ...entry, id: "5fba09a4-eb10-42bd-b6cb-ee8e74152d2f" }}
          booking={{ ...booking, id: "5fba09a4-eb10-42bd-b6cb-ee8e74152d2f" }}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });
    expect(document.activeElement).toBe(
      container.querySelector('[aria-label="Закрыть детали записи"]')
    );

    act(() => root.unmount());
    expect(document.activeElement).toBe(secondEvent);
  });

  it("invokes retry through the panel retry contract", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onRetry = vi.fn();

    act(() => {
      root.render(
        <BookingDetailPanel
          copy={astrologerCopyByLocale.ru.calendar.bookingDetail}
          locale="ru"
          timeZone="Europe/Moscow"
          entry={entry}
          booking={null}
          isLoading={false}
          isError
          onRetry={onRetry}
          onClose={vi.fn()}
        />
      );
    });
    const retryButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Повторить"
    );
    expect(retryButton).toBeDefined();
    act(() => retryButton?.click());

    expect(onRetry).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("closes with Escape and traps focus inside the mobile detail sheet", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onClose = vi.fn();

    act(() => {
      root.render(
        <BookingDetailPanel
          copy={astrologerCopyByLocale.ru.calendar.bookingDetail}
          locale="ru"
          timeZone="Europe/Moscow"
          entry={entry}
          booking={booking}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
          onClose={onClose}
        />
      );
    });

    const panel = container.querySelector<HTMLElement>('[data-mobile-sheet="true"]');
    const closeButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Закрыть детали записи"]'
    );
    expect(panel?.getAttribute("role")).toBe("dialog");
    expect(panel?.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(closeButton);

    act(() => {
      closeButton?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(closeButton);

    act(() => {
      panel?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("uses the measured reference geometry and preserves the price and mobile touch target", () => {
    const css = readFileSync(
      resolve("apps/astrologer-web/src/pages/calendar/CalendarPage.module.css"),
      "utf8"
    );

    expect(css).toMatch(/\.bookingDetailPanel\s*\{[^}]*width:\s*340px/s);
    expect(css).toMatch(/\.bookingDetailHeader\s*\{[^}]*padding:\s*16px 20px/s);
    expect(css).toMatch(/\.bookingDetailContent\s*\{[^}]*padding:\s*20px/s);
    expect(css).toMatch(/\.bookingDetailCloseButton\s*\{[^}]*width:\s*44px/s);
    expect(css).toMatch(/\.bookingDetailPrice\s*\{[^}]*flex:\s*0 0 auto/s);
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.bookingDetailPanel\s*\{[^}]*inset:\s*auto 0 0/s
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.bookingDetailPanel\s*\{[^}]*max-height:\s*82dvh/s
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.bookingDetailPanel\s*\{[^}]*border-radius:\s*20px 20px 0 0/s
    );
  });
});
