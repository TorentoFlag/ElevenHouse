import type { AvailabilityBackground, CalendarEntry } from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Temporal } from "temporal-polyfill";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import styles from "../CalendarPage.module.css";

type CalendarMonthViewProps = {
  readonly copy: AstrologerCopy["calendar"]["monthGrid"];
  readonly locale: SupportedLocale;
  readonly timeZone: string;
  readonly today: string;
  readonly range: { readonly start: string; readonly end: string };
  readonly entries: readonly CalendarEntry[];
  readonly availability: readonly AvailabilityBackground[];
  readonly onOpenDate: (date: string) => void;
  readonly onSelectEntry: (entry: CalendarEntry) => void;
};

type MonthCell = {
  readonly date: string;
  readonly isInMonth: boolean;
  readonly entries: readonly CalendarEntry[];
  readonly hasAvailability: boolean;
};

const visibleEntryLimit = 3;

export function CalendarMonthView(props: CalendarMonthViewProps) {
  const cells = createMonthCells(props);
  const weeks = chunkMonthCells(cells);
  const weekdayLabels = createWeekdayLabels(props.locale, props.timeZone);

  return (
    <section
      className={styles.monthView}
      data-calendar-month-view="true"
      role="grid"
      aria-label={props.copy.gridLabel}
      aria-colcount={7}
      aria-rowcount={weeks.length + 1}
    >
      <div className={styles.monthWeekdays} role="row">
        {weekdayLabels.map((label) => (
          <span data-calendar-month-weekday="true" key={label} role="columnheader">
            {label}
          </span>
        ))}
      </div>

      <div className={styles.monthGrid} role="rowgroup">
        {weeks.map((week) => (
          <div className={styles.monthWeek} role="row" key={week[0]?.date}>
            {week.map((cell) =>
              cell.isInMonth ? (
                <MonthDateCell key={cell.date} cell={cell} {...props} />
              ) : (
                <div
                  className={styles.monthBlankCell}
                  key={cell.date}
                  role="gridcell"
                  aria-hidden="true"
                />
              )
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function MonthDateCell(props: CalendarMonthViewProps & { readonly cell: MonthCell }) {
  const date = Temporal.PlainDate.from(props.cell.date);
  const dateLabel = formatDateLabel(date, props.locale, props.timeZone);
  const visibleEntries = props.cell.entries.slice(0, visibleEntryLimit);
  const overflowCount = props.cell.entries.length - visibleEntries.length;

  return (
    <div
      className={styles.monthDateCell}
      data-calendar-month-date={props.cell.date}
      data-today={props.cell.date === props.today ? "true" : undefined}
      role="gridcell"
    >
      <div className={styles.monthDateHeader}>
        <button
          className={styles.monthDateButton}
          data-calendar-open-date={props.cell.date}
          type="button"
          aria-label={props.copy.openDateLabel(dateLabel)}
          onKeyDown={moveMonthDateFocus}
          onClick={() => props.onOpenDate(props.cell.date)}
        >
          {date.day}
        </button>
        {props.cell.hasAvailability ? (
          <span
            className={styles.monthAvailabilityDot}
            data-calendar-month-availability="true"
            title={props.copy.availabilityLabel}
            aria-label={props.copy.availabilityLabel}
          />
        ) : null}
      </div>

      <div className={styles.monthEntryList}>
        {visibleEntries.map((entry) => (
          <MonthEntry
            key={entry.id}
            copy={props.copy}
            entry={entry}
            locale={props.locale}
            timeZone={props.timeZone}
            onSelectEntry={props.onSelectEntry}
          />
        ))}
        {overflowCount > 0 ? (
          <span className={styles.monthOverflow}>{props.copy.moreLabel(overflowCount)}</span>
        ) : null}
      </div>
    </div>
  );
}

function moveMonthDateFocus(event: ReactKeyboardEvent<HTMLButtonElement>): void {
  const delta =
    event.key === "ArrowLeft"
      ? -1
      : event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp"
          ? -7
          : event.key === "ArrowDown"
            ? 7
            : 0;
  if (delta === 0) return;

  event.preventDefault();
  const month = event.currentTarget.closest('[data-calendar-month-view="true"]');
  if (!month) return;
  const dateButtons = Array.from(
    month.querySelectorAll<HTMLButtonElement>("[data-calendar-open-date]")
  );
  const currentIndex = dateButtons.indexOf(event.currentTarget);
  const next = dateButtons[currentIndex + delta];
  next?.focus();
}

function chunkMonthCells(cells: readonly MonthCell[]): readonly (readonly MonthCell[])[] {
  const weeks: MonthCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

function MonthEntry(props: {
  readonly copy: CalendarMonthViewProps["copy"];
  readonly entry: CalendarEntry;
  readonly locale: SupportedLocale;
  readonly timeZone: string;
  readonly onSelectEntry: (entry: CalendarEntry) => void;
}) {
  const time = formatTime(props.entry.startAt, props.locale, props.timeZone);
  const status =
    props.entry.kind === "booking" ? props.copy.confirmedLabel : props.copy.blockedLabel;
  const label = [time, props.entry.title, props.entry.subtitle, status]
    .filter((part): part is string => Boolean(part))
    .join(", ");
  const content = (
    <>
      <span className={styles.monthEntryDot} data-kind={props.entry.kind} aria-hidden="true" />
      <time>{time}</time>
      <span>{props.entry.title}</span>
    </>
  );

  return props.entry.kind === "booking" ? (
    <button
      className={styles.monthEntry}
      data-calendar-entry-id={props.entry.id}
      type="button"
      aria-label={label}
      onClick={() => props.onSelectEntry(props.entry)}
    >
      {content}
    </button>
  ) : (
    <div className={styles.monthEntry} data-calendar-entry-id={props.entry.id} aria-label={label}>
      {content}
    </div>
  );
}

function createMonthCells(props: CalendarMonthViewProps): MonthCell[] {
  const monthStart = toLocalDate(props.range.start, props.timeZone);
  const monthEnd = toLocalDate(props.range.end, props.timeZone);
  const lastMonthDate = monthEnd.subtract({ days: 1 });
  const gridStart = monthStart.subtract({ days: monthStart.dayOfWeek - 1 });
  const gridEnd = lastMonthDate.add({ days: 7 - lastMonthDate.dayOfWeek + 1 });
  const entriesByDate = groupEntriesByDate(props.entries, props.timeZone);
  const availabilityDates = new Set(
    props.availability.map((period) => toLocalDate(period.startAt, props.timeZone).toString())
  );
  const cells: MonthCell[] = [];

  for (
    let date = gridStart;
    Temporal.PlainDate.compare(date, gridEnd) < 0;
    date = date.add({ days: 1 })
  ) {
    const key = date.toString();
    cells.push({
      date: key,
      isInMonth:
        Temporal.PlainDate.compare(date, monthStart) >= 0 &&
        Temporal.PlainDate.compare(date, monthEnd) < 0,
      entries: entriesByDate.get(key) ?? [],
      hasAvailability: availabilityDates.has(key)
    });
  }

  return cells;
}

function groupEntriesByDate(entries: readonly CalendarEntry[], timeZone: string) {
  const grouped = new Map<string, CalendarEntry[]>();

  for (const entry of entries) {
    const key = toLocalDate(entry.startAt, timeZone).toString();
    const current = grouped.get(key) ?? [];
    current.push(entry);
    grouped.set(key, current);
  }
  for (const group of grouped.values()) {
    group.sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
  }

  return grouped;
}

function createWeekdayLabels(locale: SupportedLocale, timeZone: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    weekday: "short",
    timeZone
  });
  const monday = Temporal.PlainDate.from("2026-01-05");

  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(toDate(monday.add({ days: index }), timeZone)).replace(".", "")
  );
}

function formatDateLabel(
  date: Temporal.PlainDate,
  locale: SupportedLocale,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    timeZone
  }).format(toDate(date, timeZone));
}

function formatTime(instant: string, locale: SupportedLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone
  }).format(new Date(instant));
}

function toLocalDate(instant: string, timeZone: string): Temporal.PlainDate {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone).toPlainDate();
}

function toDate(date: Temporal.PlainDate, timeZone: string): Date {
  return new Date(
    date.toZonedDateTime({ timeZone, plainTime: "12:00" }).toInstant().epochMilliseconds
  );
}
