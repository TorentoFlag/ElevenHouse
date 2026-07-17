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
      isBookingDetailLoading: false,
      isBookingDetailError: false,
      isCommandPending: false,
      onRetry: vi.fn(),
      onRetryAvailability: vi.fn(),
      onRetryManualBookingResources: vi.fn(),
      onRetryBookingDetail: vi.fn(),
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
