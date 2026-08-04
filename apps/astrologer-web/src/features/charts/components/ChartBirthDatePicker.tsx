import { useState } from "react";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import styles from "./ChartBirthDataEditor.module.css";

export function ChartBirthDatePicker({
  copy,
  disabled,
  onChange,
  value
}: {
  readonly copy: ChartEngineCopy;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const selectedDate = parseBirthDateValue(value);
  const [viewYear, setViewYear] = useState(selectedDate?.year ?? getDefaultBirthDatePickerYear());
  const [viewMonth, setViewMonth] = useState(selectedDate?.month ?? new Date().getMonth() + 1);
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

  return (
    <div className={styles.birthDatePopover}>
      <div className={styles.birthPickerControls}>
        <label>
          <span>{copy.birthData.month}</span>
          <select
            aria-label={copy.birthData.birthMonth}
            name="birthMonthPicker"
            value={padDatePart(viewMonth)}
            disabled={disabled}
            onChange={(event) => setViewMonth(Number(event.target.value))}
          >
            {copy.calendar.months.map((month, index) => (
              <option key={month} value={padDatePart(index + 1)}>
                {month}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.birthData.year}</span>
          <select
            aria-label={copy.birthData.birthYear}
            name="birthYearPicker"
            value={String(viewYear)}
            disabled={disabled}
            onChange={(event) => setViewYear(Number(event.target.value))}
          >
            {getBirthYearOptions().map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.birthDateWeekdays} aria-hidden="true">
        {copy.calendar.weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className={styles.birthDateGrid}>
        {Array.from({ length: getBirthDateLeadingOffset(viewYear, viewMonth) }, (_, index) => (
          <span key={`empty-${index}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const dateValue = `${viewYear}-${padDatePart(viewMonth)}-${padDatePart(day)}`;
          const isSelected = value === dateValue;
          return (
            <button
              key={dateValue}
              className={isSelected ? styles.birthDateDayActive : styles.birthDateDay}
              type="button"
              aria-label={copy.calendar.dateAria(
                day,
                copy.calendar.monthsGenitive[viewMonth - 1] ?? "",
                viewYear
              )}
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => onChange(dateValue)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function formatBirthDateButtonLabel(value: string, copy: ChartEngineCopy): string {
  const parsed = parseBirthDateValue(value);
  if (!parsed) return copy.birthData.chooseDate;
  return `${padDatePart(parsed.day)}.${padDatePart(parsed.month)}.${parsed.year}`;
}

function getBirthYearOptions(): readonly number[] {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: currentYear - 1899 }, (_, index) => 1900 + index).reverse();
}

function getDefaultBirthDatePickerYear(): number {
  return new Date().getFullYear() - 35;
}

function parseBirthDateValue(
  value: string
): { readonly year: number; readonly month: number; readonly day: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function getBirthDateLeadingOffset(year: number, month: number): number {
  const jsDay = new Date(year, month - 1, 1).getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}
