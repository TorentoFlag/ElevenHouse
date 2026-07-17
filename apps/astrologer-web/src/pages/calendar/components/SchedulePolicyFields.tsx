import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import type { AvailabilityEditorForm } from "../../../features/availability/model/availabilityEditorForm";
import styles from "../CalendarPage.module.css";

type SchedulePolicyFieldsProps = {
  readonly copy: AstrologerCopy["calendar"]["availabilityEditor"];
  readonly form: AvailabilityEditorForm;
  readonly onChange: (form: AvailabilityEditorForm) => void;
};

const intervalOptions = [15, 30, 45, 60, 90];
const bufferOptions = [0, 5, 10, 15, 30, 45, 60];
const noticeOptions = [0, 120, 360, 720, 1_440, 2_880];
const horizonOptions = [7, 14, 30, 60, 90, 180, 365];

export function SchedulePolicyFields({ copy, form, onChange }: SchedulePolicyFieldsProps) {
  return (
    <section className={styles.editorSection}>
      <div className={styles.policyGrid}>
        <PolicySelect
          label={copy.startIntervalLabel}
          value={form.startIntervalMinutes}
          options={intervalOptions}
          format={(value) => `${value} ${copy.minutesShort}`}
          onChange={(value) => onChange({ ...form, startIntervalMinutes: value })}
        />
        <PolicySelect
          label={copy.minimumNoticeLabel}
          value={form.minimumNoticeMinutes}
          options={noticeOptions}
          format={(value) => formatNotice(value, copy)}
          onChange={(value) => onChange({ ...form, minimumNoticeMinutes: value })}
        />
        <PolicySelect
          label={copy.bufferBeforeLabel}
          value={form.bufferBeforeMinutes}
          options={bufferOptions}
          format={(value) => `${value} ${copy.minutesShort}`}
          onChange={(value) => onChange({ ...form, bufferBeforeMinutes: value })}
        />
        <PolicySelect
          label={copy.bufferAfterLabel}
          value={form.bufferAfterMinutes}
          options={bufferOptions}
          format={(value) => `${value} ${copy.minutesShort}`}
          onChange={(value) => onChange({ ...form, bufferAfterMinutes: value })}
        />
        <PolicySelect
          label={copy.bookingHorizonLabel}
          value={form.bookingHorizonDays}
          options={horizonOptions}
          format={(value) => `${value} ${copy.daysShort}`}
          onChange={(value) => onChange({ ...form, bookingHorizonDays: value })}
        />
        <label className={styles.editorField}>
          <span>{copy.maximumBookingsLabel}</span>
          <select
            value={form.maximumBookingsPerDay ?? ""}
            onChange={(event) =>
              onChange({
                ...form,
                maximumBookingsPerDay:
                  event.target.value === "" ? null : Number(event.target.value)
              })
            }
          >
            <option value="">{copy.unlimitedLabel}</option>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

type PolicySelectProps = {
  readonly label: string;
  readonly value: number;
  readonly options: readonly number[];
  readonly format: (value: number) => string;
  readonly onChange: (value: number) => void;
};

function PolicySelect({ label, value, options, format, onChange }: PolicySelectProps) {
  const normalizedOptions = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <label className={styles.editorField}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {normalizedOptions.map((option) => (
          <option key={option} value={option}>{format(option)}</option>
        ))}
      </select>
    </label>
  );
}

function formatNotice(
  minutes: number,
  copy: AstrologerCopy["calendar"]["availabilityEditor"]
): string {
  if (minutes === 0) return copy.immediateLabel;
  if (minutes < 1_440) return `${minutes / 60} ${copy.hoursShort}`;
  return `${minutes / 1_440} ${copy.daysShort}`;
}
