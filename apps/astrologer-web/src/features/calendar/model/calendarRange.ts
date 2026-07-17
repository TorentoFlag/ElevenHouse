import type { CalendarRangeQuery, CalendarView } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { Temporal } from "temporal-polyfill";

export type CalendarRangeInput = {
  readonly view: CalendarView;
  readonly anchorDate: string;
  readonly timeZone: string;
};

export function createCalendarRange(input: CalendarRangeInput): CalendarRangeQuery {
  const anchor = Temporal.PlainDate.from(input.anchorDate);
  const start = getRangeStart(anchor, input.view);
  const end = getRangeEnd(start, input.view);

  return {
    start: toOffsetDateTime(start, input.timeZone),
    end: toOffsetDateTime(end, input.timeZone),
    timeZone: input.timeZone
  };
}

export function moveCalendarAnchor(
  anchorDate: string,
  view: CalendarView,
  direction: -1 | 1
): string {
  const anchor = Temporal.PlainDate.from(anchorDate);
  const duration =
    view === "day" ? { days: direction } : view === "week" ? { weeks: direction } : { months: direction };

  return anchor.add(duration).toString();
}

export function getTodayInTimeZone(timeZone: string): string {
  return Temporal.Now.zonedDateTimeISO(timeZone).toPlainDate().toString();
}

export function formatCalendarRangeLabel(
  input: CalendarRangeInput & { readonly locale: SupportedLocale }
): string {
  const anchor = Temporal.PlainDate.from(input.anchorDate);
  const locale = input.locale === "ru" ? "ru-RU" : "en-US";

  if (input.view === "month") {
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: input.timeZone
    }).format(toDate(anchor, input.timeZone));
  }

  const start = getRangeStart(anchor, input.view);
  const endInclusive = getRangeEnd(start, input.view).subtract({ days: 1 });
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: input.timeZone
  });
  const label =
    input.view === "day"
      ? formatter.format(toDate(start, input.timeZone))
      : formatter.formatRange(
          toDate(start, input.timeZone),
          toDate(endInclusive, input.timeZone)
        );

  return label.replaceAll("\u202f", " ");
}

function getRangeStart(anchor: Temporal.PlainDate, view: CalendarView): Temporal.PlainDate {
  if (view === "day") return anchor;
  if (view === "week") return anchor.subtract({ days: anchor.dayOfWeek - 1 });
  return anchor.with({ day: 1 });
}

function getRangeEnd(start: Temporal.PlainDate, view: CalendarView): Temporal.PlainDate {
  if (view === "day") return start.add({ days: 1 });
  if (view === "week") return start.add({ weeks: 1 });
  return start.add({ months: 1 });
}

function toOffsetDateTime(date: Temporal.PlainDate, timeZone: string): string {
  return date
    .toZonedDateTime({ timeZone, plainTime: "00:00" })
    .toString({ timeZoneName: "never" });
}

function toDate(date: Temporal.PlainDate, timeZone: string): Date {
  return new Date(
    date.toZonedDateTime({ timeZone, plainTime: "12:00" }).toInstant().epochMilliseconds
  );
}
