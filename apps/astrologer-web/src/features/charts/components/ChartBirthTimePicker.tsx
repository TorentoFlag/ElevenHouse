import { useState } from "react";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import styles from "./ChartBirthDataEditor.module.css";

export function ChartBirthTimePicker({
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
  const parsedTime = parseBirthTimeValue(value);
  const [selectedHour, setSelectedHour] = useState(parsedTime?.hour ?? "12");

  return (
    <div className={styles.birthTimePopover}>
      <div className={styles.birthTimeSection}>
        <span>{copy.birthData.hours}</span>
        <div className={styles.birthTimeGrid}>
          {birthHourOptions.map((hour) => (
            <button
              key={hour}
              className={
                selectedHour === hour ? styles.birthTimeOptionActive : styles.birthTimeOption
              }
              type="button"
              aria-label={`${hour}:00`}
              aria-pressed={selectedHour === hour}
              disabled={disabled}
              onClick={() => setSelectedHour(hour)}
            >
              {hour}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.birthTimeSection}>
        <span>{copy.birthData.minutes}</span>
        <div className={styles.birthMinuteGrid}>
          {birthMinuteOptions.map((minute) => (
            <button
              key={minute}
              className={
                parsedTime?.minute === minute
                  ? styles.birthTimeOptionActive
                  : styles.birthTimeOption
              }
              type="button"
              aria-label={copy.birthData.minuteAria(minute)}
              aria-pressed={parsedTime?.minute === minute}
              disabled={disabled}
              onClick={() => onChange(`${selectedHour}:${minute}`)}
            >
              {minute}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const birthHourOptions = Array.from({ length: 24 }, (_, hour) => padTimePart(hour));
const birthMinuteOptions = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

function parseBirthTimeValue(
  value: string
): { readonly hour: string; readonly minute: string } | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, hour, minute] = match;
  return hour && minute ? { hour, minute } : null;
}

function padTimePart(value: number): string {
  return String(value).padStart(2, "0");
}
