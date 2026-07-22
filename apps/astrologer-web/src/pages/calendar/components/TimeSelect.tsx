import { useEffect, useState, type KeyboardEvent } from "react";
import { minuteToTime } from "../../../features/availability/model/availabilityEditorForm";

type TimeSelectProps = {
  readonly ariaLabel: string;
  readonly name?: string;
  readonly value: number;
  readonly maxMinute?: number;
  readonly onChange: (value: number) => void;
};

export function TimeSelect({
  ariaLabel,
  name,
  value,
  maxMinute = 1_440,
  onChange
}: TimeSelectProps) {
  const [draft, setDraft] = useState(() => minuteToTime(value));

  useEffect(() => {
    setDraft(minuteToTime(value));
  }, [value]);

  function commitDraft() {
    const minute = parseTimeInput(draft, maxMinute);
    if (minute === null) {
      setDraft(minuteToTime(value));
      return;
    }

    onChange(minute);
    setDraft(minuteToTime(minute));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  return (
    <input
      aria-label={ariaLabel}
      autoComplete="off"
      inputMode="numeric"
      name={name}
      pattern="[0-2]?[0-9]:[0-5][0-9]"
      value={draft}
      onBlur={commitDraft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
    />
  );
}

function parseTimeInput(value: string, maxMinute: number): number | null {
  const match = /^([0-2]?\d):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === 24 && minutes !== 0) return null;
  if (hours > 24) return null;

  const total = hours * 60 + minutes;
  if (total > maxMinute) return null;
  return total;
}
