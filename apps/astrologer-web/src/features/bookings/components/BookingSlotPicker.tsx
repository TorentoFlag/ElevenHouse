import type { SupportedLocale } from "@elevenhouse/i18n";
import { Temporal } from "temporal-polyfill";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  groupManualBookingSlotsByDate,
  type ManualBookingSlotOption
} from "../model/manualBookingForm";
import styles from "./BookingSlotPicker.module.css";

export type BookingSlotPickerCopy = {
  readonly pickerLabel: string;
  readonly previousMonthLabel: string;
  readonly nextMonthLabel: string;
  readonly timeSlotsLabel: (date: string) => string;
  readonly availableDateLabel: (date: string, count: number) => string;
  readonly unavailableDateLabel: (date: string) => string;
  readonly selectedDateLabel: string;
  readonly slotCountLabel: (count: number) => string;
  readonly noSlotsForDateLabel: string;
};

export type BookingSlotPickerProps = {
  readonly copy: BookingSlotPickerCopy;
  readonly locale: SupportedLocale;
  readonly timeZone: string;
  readonly slots: readonly ManualBookingSlotOption[];
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
};

export function BookingSlotPicker(props: BookingSlotPickerProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const groups = useMemo(() => groupManualBookingSlotsByDate(props.slots), [props.slots]);
  const groupByDate = useMemo(
    () => new Map(groups.map((group) => [group.dateKey, group])),
    [groups]
  );
  const selectedSlot = props.slots.find((slot) => slot.value === props.value) ?? null;
  const selectedDateKey = selectedSlot?.dateKey ?? groups[0]?.dateKey ?? "";
  const [visibleMonth, setVisibleMonth] = useState(() =>
    toMonthKey(selectedDateKey || groups[0]?.dateKey || getTodayKey(props.timeZone))
  );
  const dates = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const selectedGroup = selectedDateKey ? groupByDate.get(selectedDateKey) ?? null : null;

  const selectDate = (dateKey: string) => {
    const group = groupByDate.get(dateKey);
    const firstSlot = group?.slots[0];
    if (firstSlot) props.onChange(firstSlot.value);
  };

  const focusDate = (date: Temporal.PlainDate) => {
    const selector = `[data-date-key="${date.toString()}"]`;
    const button = rootRef.current?.querySelector<HTMLButtonElement>(selector);
    button?.focus();
  };

  const navigateMonth = (delta: -1 | 1) => {
    setVisibleMonth((current) =>
      Temporal.PlainYearMonth.from(current).add({ months: delta }).toString()
    );
  };

  return (
    <section ref={rootRef} className={styles.picker} aria-label={props.copy.pickerLabel}>
      <div className={styles.calendarPanel}>
        <div className={styles.monthHeader}>
          <button
            type="button"
            className={styles.monthButton}
            aria-label={props.copy.previousMonthLabel}
            disabled={props.disabled}
            onClick={() => navigateMonth(-1)}
          >
            ‹
          </button>
          <h4 aria-live="polite">{formatMonthLabel(visibleMonth, props.locale, props.timeZone)}</h4>
          <button
            type="button"
            className={styles.monthButton}
            aria-label={props.copy.nextMonthLabel}
            disabled={props.disabled}
            onClick={() => navigateMonth(1)}
          >
            ›
          </button>
        </div>

        <div className={styles.weekdays} aria-hidden="true">
          {getWeekdayLabels(props.locale).map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>

        <div className={styles.dateGrid} role="grid">
          {dates.map((date) => {
            const dateKey = date.toString();
            const group = groupByDate.get(dateKey) ?? null;
            const isAvailable = Boolean(group);
            const isSelected = dateKey === selectedDateKey;
            const isOutside = !dateKey.startsWith(visibleMonth);
            const fullLabel = formatDateLabel(date, props.locale, props.timeZone);
            const ariaLabel = isAvailable
              ? props.copy.availableDateLabel(fullLabel, group?.slots.length ?? 0)
              : props.copy.unavailableDateLabel(fullLabel);

            return (
              <button
                type="button"
                role="gridcell"
                className={styles.dateButton}
                data-date-key={dateKey}
                data-available={isAvailable ? "true" : undefined}
                data-outside={isOutside ? "true" : undefined}
                aria-label={ariaLabel}
                aria-pressed={isSelected}
                disabled={props.disabled || !isAvailable}
                key={dateKey}
                onClick={() => selectDate(dateKey)}
                onKeyDown={(event) =>
                  handleDateKeyDown({
                    event,
                    date,
                    setVisibleMonth,
                    focusDate
                  })
                }
              >
                <span>{date.day}</span>
                {isAvailable ? (
                  <small>{props.copy.slotCountLabel(group?.slots.length ?? 0)}</small>
                ) : null}
                {isSelected ? <em>{props.copy.selectedDateLabel}</em> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.timePanel}>
        <div className={styles.timeHeader}>
          <span>{props.copy.timeSlotsLabel(selectedGroup?.dateLabel ?? "")}</span>
          {selectedGroup ? <strong>{props.copy.slotCountLabel(selectedGroup.slots.length)}</strong> : null}
        </div>
        {selectedGroup ? (
          <div className={styles.timeGrid}>
            {selectedGroup.slots.map((slot) => (
              <button
                type="button"
                className={styles.timeButton}
                aria-pressed={slot.value === props.value}
                disabled={props.disabled}
                key={slot.value}
                onClick={() => props.onChange(slot.value)}
              >
                {slot.timeLabel}
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>{props.copy.noSlotsForDateLabel}</p>
        )}
      </div>
    </section>
  );
}

function handleDateKeyDown(input: {
  readonly event: KeyboardEvent<HTMLButtonElement>;
  readonly date: Temporal.PlainDate;
  readonly setVisibleMonth: (value: string | ((current: string) => string)) => void;
  readonly focusDate: (date: Temporal.PlainDate) => void;
}) {
  const keyOffsets: Record<string, Temporal.DurationLike> = {
    ArrowRight: { days: 1 },
    ArrowLeft: { days: -1 },
    ArrowDown: { days: 7 },
    ArrowUp: { days: -7 }
  };
  const offset = keyOffsets[input.event.key];
  if (offset) {
    input.event.preventDefault();
    const nextDate = input.date.add(offset);
    input.setVisibleMonth(toMonthKey(nextDate.toString()));
    window.setTimeout(() => input.focusDate(nextDate), 0);
    return;
  }

  if (input.event.key === "Home" || input.event.key === "End") {
    input.event.preventDefault();
    const weekdayIndex = input.date.dayOfWeek - 1;
    const nextDate =
      input.event.key === "Home"
        ? input.date.subtract({ days: weekdayIndex })
        : input.date.add({ days: 6 - weekdayIndex });
    input.setVisibleMonth(toMonthKey(nextDate.toString()));
    window.setTimeout(() => input.focusDate(nextDate), 0);
    return;
  }

  if (input.event.key === "PageUp" || input.event.key === "PageDown") {
    input.event.preventDefault();
    const months = input.event.key === "PageUp" ? -1 : 1;
    const nextDate = input.date.add({ months });
    input.setVisibleMonth(toMonthKey(nextDate.toString()));
    window.setTimeout(() => input.focusDate(nextDate), 0);
  }
}

function buildMonthGrid(monthKey: string): Temporal.PlainDate[] {
  const firstOfMonth = Temporal.PlainYearMonth.from(monthKey).toPlainDate({ day: 1 });
  const gridStart = firstOfMonth.subtract({ days: firstOfMonth.dayOfWeek - 1 });
  return Array.from({ length: 42 }, (_, index) => gridStart.add({ days: index }));
}

function toMonthKey(dateKey: string): string {
  return Temporal.PlainDate.from(dateKey).toPlainYearMonth().toString();
}

function getTodayKey(timeZone: string): string {
  return Temporal.Now.zonedDateTimeISO(timeZone).toPlainDate().toString();
}

function formatMonthLabel(monthKey: string, locale: SupportedLocale, timeZone: string): string {
  const date = Temporal.PlainYearMonth.from(monthKey).toPlainDate({ day: 1 });
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone
  }).format(toDate(date, timeZone));
}

function formatDateLabel(
  date: Temporal.PlainDate,
  locale: SupportedLocale,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone
  }).format(toDate(date, timeZone));
}

function getWeekdayLabels(locale: SupportedLocale): readonly string[] {
  const baseMonday = Temporal.PlainDate.from("2026-01-05");
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
      toDate(baseMonday.add({ days: index }), "UTC")
    )
  );
}

function toDate(date: Temporal.PlainDate, timeZone: string): Date {
  return new Date(
    date.toZonedDateTime({ timeZone, plainTime: "12:00" }).toInstant().epochMilliseconds
  );
}
