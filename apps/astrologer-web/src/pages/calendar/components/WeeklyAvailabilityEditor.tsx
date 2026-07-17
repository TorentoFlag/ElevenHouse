import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import {
  addWeeklyPeriod,
  removeWeeklyPeriod,
  updateWeeklyPeriod,
  type AvailabilityEditorForm,
  type AvailabilityWeekday
} from "../../../features/availability/model/availabilityEditorForm";
import styles from "../CalendarPage.module.css";
import { TimeSelect } from "./TimeSelect";

type WeeklyAvailabilityEditorProps = {
  readonly copy: AstrologerCopy["calendar"]["availabilityEditor"];
  readonly form: AvailabilityEditorForm;
  readonly onChange: (form: AvailabilityEditorForm) => void;
};

export function WeeklyAvailabilityEditor({ copy, form, onChange }: WeeklyAvailabilityEditorProps) {
  return (
    <section className={styles.editorSection}>
      <div className={styles.editorSectionHeading}>
        <div><h3>{copy.weeklyTitle}</h3><p>{copy.weeklyDescription}</p></div>
      </div>
      <div className={styles.weekdayList}>
        {copy.weekdays.map((label, index) => {
          const weekday = (index + 1) as AvailabilityWeekday;
          const periods = form.weeklyPeriods.filter((period) => period.weekday === weekday);
          return (
            <div className={styles.weekdayRow} key={weekday}>
              <div className={styles.weekdayLabel}>
                <strong>{label}</strong>
                {periods.length === 0 ? <span>{copy.unavailableLabel}</span> : null}
              </div>
              <div className={styles.periodList}>
                {periods.map((period, periodIndex) => (
                  <div className={styles.periodRow} key={`${weekday}-${periodIndex}`}>
                    <label>
                      <span className={styles.visuallyHidden}>{copy.fromLabel}</span>
                      <TimeSelect
                        ariaLabel={`${label}: ${copy.fromLabel}`}
                        value={period.startMinute}
                        maxMinute={1_425}
                        onChange={(value) => onChange(updateWeeklyPeriod(form, weekday, periodIndex, {
                          startMinute: value,
                          endMinute: period.endMinute
                        }))}
                      />
                    </label>
                    <span aria-hidden="true">—</span>
                    <label>
                      <span className={styles.visuallyHidden}>{copy.toLabel}</span>
                      <TimeSelect
                        ariaLabel={`${label}: ${copy.toLabel}`}
                        value={period.endMinute}
                        onChange={(value) => onChange(updateWeeklyPeriod(form, weekday, periodIndex, {
                          startMinute: period.startMinute,
                          endMinute: value
                        }))}
                      />
                    </label>
                    <button
                      className={styles.removeButton}
                      type="button"
                      aria-label={`${copy.removePeriodLabel}: ${label}`}
                      onClick={() => onChange(removeWeeklyPeriod(form, weekday, periodIndex))}
                    >
                      <Icon iconName="trash" width={14} height={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <button
                  className={styles.inlineButton}
                  type="button"
                  onClick={() => onChange(addWeeklyPeriod(form, weekday))}
                >
                  <Icon iconName="plus" width={14} height={14} aria-hidden="true" />
                  {copy.addPeriodLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
