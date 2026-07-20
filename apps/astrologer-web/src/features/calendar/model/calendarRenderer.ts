import type {
  AvailabilityBackground,
  CalendarDisplayStatus,
  CalendarEntry,
  CalendarView
} from "@elevenhouse/contracts";

export type CalendarLocale = "ru" | "en";

export type CalendarRendererProps = {
  readonly view: CalendarView;
  readonly locale: CalendarLocale;
  readonly timeZone: string;
  readonly visibleRange: { readonly start: string; readonly end: string };
  readonly entries: readonly CalendarEntry[];
  readonly availability: readonly AvailabilityBackground[];
  readonly onRangeChange: (range: { readonly start: string; readonly end: string }) => void;
  readonly onEntryActivate: (entryId: string) => void;
  readonly onEmptyRangeSelect: (selection: {
    readonly start: string;
    readonly end: string;
  }) => void;
};

export type CalendarRendererEntry = {
  readonly id: string;
  readonly start: string;
  readonly end: string;
  readonly kind: CalendarEntry["kind"];
  readonly title: string;
  readonly subtitle: string | null;
  readonly deliveryFormat: CalendarEntry["deliveryFormat"];
  readonly displayStatus: CalendarDisplayStatus;
  readonly accessibilityLabel: string;
};

export type CalendarRendererModel = {
  readonly entries: readonly CalendarRendererEntry[];
  readonly availability: ReadonlyArray<{ readonly start: string; readonly end: string }>;
};

const statusLabels: Record<CalendarLocale, Record<CalendarDisplayStatus, string>> = {
  ru: {
    confirmed: "Подтверждена",
    blocked: "Недоступно"
  },
  en: {
    confirmed: "Confirmed",
    blocked: "Unavailable"
  }
};

export function createCalendarRendererModel(props: CalendarRendererProps): CalendarRendererModel {
  const timeFormatter = new Intl.DateTimeFormat(props.locale === "ru" ? "ru-RU" : "en-US", {
    timeZone: props.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: props.locale === "en"
  });

  return {
    entries: props.entries.map((entry) => ({
      id: entry.id,
      start: entry.startAt,
      end: entry.endAt,
      kind: entry.kind,
      title: entry.title,
      subtitle: entry.subtitle,
      deliveryFormat: entry.deliveryFormat,
      displayStatus: entry.displayStatus,
      accessibilityLabel: [
        timeFormatter.format(new Date(entry.startAt)),
        entry.title,
        entry.subtitle,
        statusLabels[props.locale][entry.displayStatus]
      ]
        .filter((part): part is string => part !== null)
        .join(", ")
    })),
    availability: props.availability.map((period) => ({
      start: period.startAt,
      end: period.endAt
    }))
  };
}
