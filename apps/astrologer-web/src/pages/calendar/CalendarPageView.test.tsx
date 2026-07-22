import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { CalendarPageView, type CalendarPageViewProps } from "./CalendarPageView";

vi.mock("../../features/calendar/components/FullCalendarRenderer", () => ({
  FullCalendarRenderer: ({ view }: { readonly view: string }) => (
    <div data-testid="calendar-grid" data-view={view} />
  )
}));

describe("CalendarPageView", () => {
  it("is mounted by the route page instead of the temporary button scaffold", () => {
    const source = readFileSync(new URL("./CalendarPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('import { CalendarPageView } from "./CalendarPageView"');
    expect(source).toContain("<CalendarPageView");
    expect(source).not.toContain("<ol aria-label={copy.title}>");
  });

  it("renders the server-backed calendar grid and weekly summary", () => {
    const markup = renderToStaticMarkup(<CalendarPageView {...baseProps()} />);

    expect(markup).toContain('data-testid="calendar-grid"');
    expect(markup).toContain('data-view="week"');
    expect(markup).toContain("2 сессии");
    expect(markup).toContain("2 ч");
    expect(markup).toContain("Скрыть панель");
  });

  it("adds the reference weekly workload block without prototype finance totals", () => {
    const markup = renderToStaticMarkup(<CalendarPageView {...baseProps()} />);
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");

    expect(markup).toContain("Загрузка по дням");
    expect(markup).toContain('data-calendar-summary-day="Пт"');
    expect(markup).toContain('aria-label="Пт · 2 ч"');
    expect(markup).toContain("Всё время — в вашем часовом поясе: Europe/Moscow.");
    expect(markup).not.toContain("получено");
    expect(markup).not.toContain("ожидается");
    expect(css).toMatch(/\.summaryPanel\s*\{[^}]*width:\s*340px[^}]*flex:\s*0 0 340px/s);
  });

  it("keeps the mobile agenda as a data fallback while showing the reference grid on mobile", () => {
    const markup = renderToStaticMarkup(<CalendarPageView {...baseProps()} />);
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");

    expect(markup).toContain('data-mobile-calendar-agenda="true"');
    expect(markup).toContain("13–19 июля 2026 г.");
    expect(markup).toContain("Марина К.");
    expect(css).toMatch(/\.mobileAgenda\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.mobileAgenda\s*\{[^}]*display:\s*none/s
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.calendarCanvas\s*\{[^}]*display:\s*block/s
    );
  });

  it("stacks the mobile summary below the scrollable reference calendar grid", () => {
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");
    const mobileCss = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(mobileCss).toMatch(/\.body\s*\{[^}]*flex-direction:\s*column[^}]*overflow-y:\s*auto/s);
    expect(mobileCss).toMatch(/\.summaryPanel\s*\{[^}]*display:\s*flex[^}]*width:\s*100%/s);
    expect(mobileCss).toMatch(/\.workspace\s*\{[^}]*flex:\s*0 0 620px[^}]*overflow:\s*auto/s);
  });

  it("keeps previous, today and next period navigation available at the mobile viewport", () => {
    const markup = renderToStaticMarkup(<CalendarPageView {...baseProps()} />);
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");

    expect(markup).toContain('data-mobile-calendar-navigation="true"');
    expect(css).toMatch(/\.mobileNavigation\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*\.mobileNavigation\s*\{[^}]*display:\s*flex/s
    );
  });

  it("keeps the mobile toolbar inside the app workspace without horizontal clipping", () => {
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");
    const mobileCss = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(mobileCss).toMatch(/\.calendarPage\s*\{[^}]*margin:\s*-16px/s);
    expect(mobileCss).toMatch(/\.toolbar\s*\{[^}]*gap:\s*4px[^}]*padding:\s*10px/s);
  });

  it("keeps mobile calendar and availability controls at least 44px tall", () => {
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");
    const mobileCss = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(mobileCss).toMatch(/\.viewButton\s*\{[^}]*min-height:\s*44px/s);
    expect(mobileCss).toMatch(/\.ghostButton[\s\S]*\.brandButton\s*\{[^}]*min-height:\s*44px/s);
    expect(mobileCss).toMatch(/\.editorField select[\s\S]*height:\s*44px/s);
    expect(mobileCss).toMatch(/\.removeButton\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
    expect(mobileCss).toMatch(
      /\.inlineButton[\s\S]*\.saveAvailabilityButton\s*\{[^}]*min-height:\s*44px/s
    );
  });

  it("uses the app-owned reference month grid on desktop and the agenda on mobile", () => {
    const props = baseProps();
    const markup = renderToStaticMarkup(
      <CalendarPageView
        {...props}
        calendar={{
          ...props.calendar,
          view: "month",
          anchorDate: "2026-05-29",
          rangeLabel: "май 2026 г.",
          range: {
            start: "2026-04-30T21:00:00.000Z",
            end: "2026-05-31T21:00:00.000Z",
            timeZone: "Europe/Moscow"
          }
        }}
      />
    );
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");

    expect(markup).toContain('data-calendar-month-view="true"');
    expect(markup).toContain('data-mobile-calendar-agenda="true"');
    expect(markup).not.toContain('data-full-calendar-renderer="true"');
    expect(css).toMatch(/\.monthGrid\s*\{[^}]*gap:\s*6px/s);
    expect(css).toMatch(/\.monthDateCell[\s\S]*min-height:\s*84px/s);
    expect(css).toMatch(/\.monthDateCell[\s\S]*border-radius:\s*12px/s);
  });

  it("keeps the grid mounted while a range refetch is in progress", () => {
    const markup = renderToStaticMarkup(
      <CalendarPageView {...baseProps()} calendar={{ ...baseProps().calendar, isFetching: true }} />
    );

    expect(markup).toContain('data-testid="calendar-grid"');
    expect(markup).toContain('aria-busy="true"');
  });

  it("keeps an empty calendar grid interactive instead of covering it with an empty-state card", () => {
    const props = baseProps();
    const markup = renderToStaticMarkup(
      <CalendarPageView
        {...props}
        calendar={{ ...props.calendar, entries: [] }}
      />
    );

    expect(markup).toContain('data-testid="calendar-grid"');
    expect(markup).not.toContain("На этот период записей нет");
  });

  it("renders an accessible retry state instead of a blank workspace", () => {
    const markup = renderToStaticMarkup(
      <CalendarPageView
        {...baseProps()}
        calendar={{ ...baseProps().calendar, isError: true, entries: [] }}
      />
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Не удалось загрузить календарь");
    expect(markup).toContain("Повторить");
  });

  it("announces stale-slot conflicts assertively without replacing the current calendar", () => {
    const props = baseProps();
    const markup = renderToStaticMarkup(
      <CalendarPageView
        {...props}
        calendar={{ ...props.calendar, conflictMessage: props.copy.conflictMessage }}
      />
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain(props.copy.conflictMessage);
    expect(markup).toContain('data-testid="calendar-grid"');
  });

  it("defines the FullCalendar v7 theme palette instead of browser-default grid colors", () => {
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");

    expect(css).toContain("--fc-classic-border: var(--calendar-line-strong)");
    expect(css).toContain("--fc-classic-background: transparent");
    expect(css).toContain("--fc-classic-now: var(--calendar-accent)");
  });

  it("matches the desktop reference header, time gutter and hourly-line geometry", () => {
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.eh-calendar-day-header\)\s*\{[^}]*height:\s*52px/s);
    expect(css).toMatch(/\.eh-calendar-slot-header\)\s*\{[^}]*width:\s*60px/s);
    expect(css).toMatch(/\.eh-calendar-slot-lane\)\s*\{[^}]*height:\s*56px/s);
    expect(css).toMatch(
      /\.eh-calendar-slot-lane--minor\)\s*\{[^}]*border-top-color:\s*transparent/s
    );
  });

  it("keeps right-side calendar panels viewport-contained with internal scrolling", () => {
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /\.calendarPage\s*\{[^}]*height:\s*calc\(100dvh - var\(--astrologer-app-header-height, 68px\)\)/s
    );
    expect(css).toMatch(/\.summaryPanel\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.availabilityPanel\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.summaryPanel\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  });

  it("clips desktop event content inside its day column like the reference", () => {
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /\.calendarCanvas :global\(\.eh-calendar-event\)\s*\{[^}]*overflow:\s*hidden/s
    );
    expect(css).toMatch(/\.calendarCanvas :global\(\.eh-calendar-event-content\)\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(
      /\.calendarCanvas :global\(\.eh-calendar-event-subtitle\)\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s
    );
  });

  it("uses reference-like status treatments for booking and blocked calendar cards", () => {
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /\.calendarCanvas :global\(\.eh-calendar-event--confirmed\)\s*\{[^}]*background:\s*rgb\(86 57 164 \/ 0\.34\)/s
    );
    expect(css).toMatch(
      /\.calendarCanvas :global\(\.eh-calendar-event--blocked\)\s*\{[^}]*repeating-linear-gradient/s
    );
    expect(css).toMatch(
      /\.calendarCanvas :global\(\.eh-calendar-event--blocked\)\s*\{[^}]*border-style:\s*dashed/s
    );
  });

  it("keeps empty summary workload bars muted while highlighting the current day", () => {
    const props = baseProps();
    const markup = renderToStaticMarkup(
      <CalendarPageView
        {...props}
        calendar={{
          ...props.calendar,
          today: "2026-07-15",
          entries: [],
          summary: { bookingCount: 0, bookedMinutes: 0, byDisplayStatus: {} }
        }}
      />
    );

    expect(markup).toContain('data-calendar-summary-tone="today"');
    expect(markup).toContain('data-calendar-summary-tone="empty"');
    expect(markup).not.toContain('data-calendar-summary-tone="active"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it("hides the summary toggle whenever the reference state has no week summary panel", () => {
    const props = baseProps();
    const availabilityMarkup = renderToStaticMarkup(
      <CalendarPageView
        {...props}
        calendar={{ ...props.calendar, isAvailabilityMode: true }}
      />
    );
    const monthMarkup = renderToStaticMarkup(
      <CalendarPageView {...props} calendar={{ ...props.calendar, view: "month" }} />
    );

    expect(availabilityMarkup).not.toContain('data-summary-toggle="true"');
    expect(monthMarkup).not.toContain('data-summary-toggle="true"');
  });

  it("compresses secondary toolbar actions before they overflow narrow desktop", () => {
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /@media \(max-width: 1250px\)\s*\{[^}]*\.ghostButton\[data-summary-toggle="true"\],[^}]*\.brandButton\s*\{[^}]*width:\s*44px[^}]*font-size:\s*0/s
    );
  });

  it("keeps the mobile availability sheet opaque over the agenda", () => {
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /@media \(max-width: 760px\)\s*\{[\s\S]*\.availabilityPanel\s*\{[^}]*background:\s*rgb\(10 9 29\)/s
    );
  });

  it("replaces the summary with the production availability editor in availability mode", () => {
    const props = baseProps();
    const markup = renderToStaticMarkup(
      <CalendarPageView
        {...props}
        calendar={{ ...props.calendar, isAvailabilityMode: true }}
      />
    );

    expect(markup).toContain("Настройка доступности");
    expect(markup).toContain("Шаг начала записи");
    expect(markup).toContain("Рабочие часы");
    expect(markup).toContain("Исключения по датам");
    expect(markup).toContain("Услуги для записи");
    expect(markup).not.toContain("2 сессии");
    expect(markup).not.toContain("Правила переноса");
    expect(markup).not.toContain("На этот период записей нет");
  });

  it("names availability form fields so Chrome does not flag anonymous controls", () => {
    const props = baseProps();
    const markup = renderToStaticMarkup(
      <CalendarPageView
        {...props}
        calendar={{ ...props.calendar, isAvailabilityMode: true }}
      />
    );

    expect(markup).toContain('name="startIntervalMinutes"');
    expect(markup).toContain('name="minimumNoticeMinutes"');
    expect(markup).toContain('name="bufferBeforeMinutes"');
    expect(markup).toContain('name="bufferAfterMinutes"');
    expect(markup).toContain('name="bookingHorizonDays"');
    expect(markup).toContain('name="maximumBookingsPerDay"');
    expect(markup).toContain('name="dateOverrideDate"');
  });

  it("replaces the summary with server-backed booking details for the selected entry", () => {
    const props = baseProps();
    const selectedEntry = props.calendar.entries[0];
    const markup = renderToStaticMarkup(
      <CalendarPageView
        {...props}
        calendar={{
          ...props.calendar,
          dialog: "booking_detail",
          selectedEntryId: selectedEntry?.id ?? null,
          selectedEntry: selectedEntry ?? null,
          selectedBooking: bookingFixture,
          isBookingDetailLoading: false,
          isBookingDetailError: false
        }}
      />
    );

    expect(markup).toContain('aria-label="Детали записи"');
    expect(markup).toContain('data-mobile-sheet-backdrop="true"');
    expect(markup).toContain("Марина К.");
    expect(markup).not.toContain("2 сессии");
  });
});

const bookingFixture = {
  id: "4fa66e6e-cb18-4d2b-81c5-4fd84bd334ae",
  reservationId: "6fc48a44-cc13-4307-9531-17a0bd95b85a",
  clientUserId: "e0b69d64-2f20-4368-a8d0-acb676f1a574",
  productId: "45f17dc4-3160-48bd-9743-081dc32d64b9",
  state: "confirmed" as const,
  startAt: "2026-07-17T08:00:00.000Z",
  endAt: "2026-07-17T09:00:00.000Z",
  productTitle: "Натальный разбор",
  durationMinutes: 60,
  deliveryFormat: "video" as const,
  priceMinor: 490_000,
  currency: "RUB" as const,
  timeZone: "Europe/Moscow",
  policySnapshot: {
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
    minimumNoticeMinutes: 360
  },
  createdAt: "2026-07-10T09:00:00.000Z",
  updatedAt: "2026-07-10T09:00:00.000Z"
};

function baseProps(): CalendarPageViewProps {
  return {
    copy: astrologerCopyByLocale.ru.calendar,
    locale: "ru",
    calendar: {
      view: "week",
      anchorDate: "2026-07-17",
      selectedEntryId: null,
      isAvailabilityMode: false,
      isSummaryPanelOpen: true,
      dialog: null,
      manualBookingStartAt: null,
      conflictMessage: null,
      timeZone: "Europe/Moscow",
      today: "2026-07-20",
      range: {
        start: "2026-07-12T21:00:00.000Z",
        end: "2026-07-19T21:00:00.000Z",
        timeZone: "Europe/Moscow"
      },
      rangeLabel: "13–19 июля 2026 г.",
      entries: [
        {
          id: "4fa66e6e-cb18-4d2b-81c5-4fd84bd334ae",
          kind: "booking",
          startAt: "2026-07-17T08:00:00.000Z",
          endAt: "2026-07-17T09:00:00.000Z",
          title: "Марина К.",
          subtitle: "Натальный разбор",
          deliveryFormat: "video",
          displayStatus: "confirmed"
        },
        {
          id: "24489ad8-758a-43a0-94d2-52f512f808dc",
          kind: "booking",
          startAt: "2026-07-17T10:30:00.000Z",
          endAt: "2026-07-17T11:30:00.000Z",
          title: "Дмитрий Л.",
          subtitle: "Синастрия",
          deliveryFormat: "video",
          displayStatus: "confirmed"
        }
      ],
      availability: [],
      summary: {
        bookingCount: 2,
        bookedMinutes: 120,
        byDisplayStatus: { confirmed: 2 }
      },
      schedule: null,
      selectedEntry: null,
      selectedBooking: null,
      isLoading: false,
      isFetching: false,
      isError: false,
      isAvailabilityLoading: false,
      isAvailabilityError: false,
      availabilityProducts: [],
      isAvailabilityProductsLoading: false,
      isAvailabilityProductsError: false,
      isBookingCreating: false,
      isBookingDetailLoading: false,
      isBookingDetailError: false,
      isCommandPending: false,
      onRetry: vi.fn(),
      onRetryAvailability: vi.fn(),
      onRetryManualBookingResources: vi.fn(),
      onRetryBookingDetail: vi.fn(),
      onSetView: vi.fn(),
      onOpenDate: vi.fn(),
      onPrevious: vi.fn(),
      onNext: vi.fn(),
      onToday: vi.fn(),
      onSetSummaryPanelOpen: vi.fn(),
      onSetAvailabilityMode: vi.fn(),
      onSelectEntry: vi.fn(),
      onOpenManualBooking: vi.fn(),
      onCloseDialog: vi.fn(),
      onCreateBlock: vi.fn(),
      onReleaseBlock: vi.fn(),
      onSaveSchedule: vi.fn(),
      onCreateManualBooking: vi.fn()
    }
  };
}
