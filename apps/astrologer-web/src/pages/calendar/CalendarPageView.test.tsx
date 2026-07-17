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

  it("defines the FullCalendar v7 theme palette instead of browser-default grid colors", () => {
    const css = readFileSync(new URL("./CalendarPage.module.css", import.meta.url), "utf8");

    expect(css).toContain("--fc-classic-border: var(--calendar-line-strong)");
    expect(css).toContain("--fc-classic-background: transparent");
    expect(css).toContain("--fc-classic-now: var(--calendar-accent)");
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
});

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
      isCommandPending: false,
      onRetry: vi.fn(),
      onRetryAvailability: vi.fn(),
      onRetryManualBookingResources: vi.fn(),
      onSetView: vi.fn(),
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
