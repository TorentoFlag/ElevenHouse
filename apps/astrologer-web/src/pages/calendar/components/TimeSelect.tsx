import { minuteToTime } from "../../../features/availability/model/availabilityEditorForm";

type TimeSelectProps = {
  readonly ariaLabel: string;
  readonly value: number;
  readonly maxMinute?: number;
  readonly onChange: (value: number) => void;
};

export function TimeSelect({
  ariaLabel,
  value,
  maxMinute = 1_440,
  onChange
}: TimeSelectProps) {
  const options = createTimeOptions(value, maxMinute);
  return (
    <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(Number(event.target.value))}>
      {options.map((minute) => <option key={minute} value={minute}>{minuteToTime(minute)}</option>)}
    </select>
  );
}

function createTimeOptions(value: number, maxMinute: number): number[] {
  const options: number[] = [];
  for (let minute = 0; minute <= maxMinute; minute += 15) options.push(minute);
  if (value >= 0 && value <= maxMinute && !options.includes(value)) options.push(value);
  return options.sort((left, right) => left - right);
}
