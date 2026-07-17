import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useState } from "react";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import {
  addDateOverride,
  removeDateOverride,
  updateDateOverride,
  type AvailabilityEditorForm
} from "../../../features/availability/model/availabilityEditorForm";
import styles from "../CalendarPage.module.css";
import { TimeSelect } from "./TimeSelect";

type DateOverridesEditorProps = {
  readonly copy: AstrologerCopy["calendar"]["availabilityEditor"];
  readonly form: AvailabilityEditorForm;
  readonly onChange: (form: AvailabilityEditorForm) => void;
};

export function DateOverridesEditor({ copy, form, onChange }: DateOverridesEditorProps) {
  const [newDate, setNewDate] = useState("");
  return (
    <section className={styles.editorSection}>
      <div className={styles.editorSectionHeading}>
        <div><h3>{copy.overridesTitle}</h3><p>{copy.overridesDescription}</p></div>
      </div>
      <div className={styles.overrideCreator}>
        <label className={styles.editorField}>
          <span>{copy.overrideDateLabel}</span>
          <input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
        </label>
        <button
          className={styles.inlineButton}
          type="button"
          disabled={!newDate || form.dateOverrides.some((override) => override.date === newDate)}
          onClick={() => { onChange(addDateOverride(form, newDate)); setNewDate(""); }}
        >
          <Icon iconName="plus" width={14} height={14} aria-hidden="true" />
          {copy.addOverrideLabel}
        </button>
      </div>
      <div className={styles.overrideList}>
        {form.dateOverrides.map((override, index) => (
          <div className={styles.overrideCard} key={override.date}>
            <div className={styles.overrideHeader}>
              <strong>{override.date}</strong>
              <button
                className={styles.removeButton}
                type="button"
                aria-label={`${copy.removeOverrideLabel}: ${override.date}`}
                onClick={() => onChange(removeDateOverride(form, index))}
              ><Icon iconName="trash" width={14} height={14} aria-hidden="true" /></button>
            </div>
            <select
              aria-label={`${copy.overrideDateLabel}: ${override.date}`}
              value={override.mode}
              onChange={(event) => {
                const mode = event.target.value as "available" | "unavailable";
                onChange(updateDateOverride(form, index, {
                  ...override,
                  mode,
                  periods: mode === "available" ? [{ startMinute: 540, endMinute: 1_020 }] : []
                }));
              }}
            >
              <option value="unavailable">{copy.closedLabel}</option>
              <option value="available">{copy.availableLabel}</option>
            </select>
            {override.mode === "available" ? (
              <div className={styles.overridePeriods}>
                {override.periods.map((period, periodIndex) => (
                  <div className={styles.periodRow} key={periodIndex}>
                    <TimeSelect
                      ariaLabel={`${override.date}: ${copy.fromLabel}`}
                      value={period.startMinute}
                      maxMinute={1_425}
                      onChange={(value) => onChange(updateDateOverride(form, index, {
                        ...override,
                        periods: override.periods.map((candidate, candidateIndex) => candidateIndex === periodIndex
                          ? { ...candidate, startMinute: value }
                          : candidate)
                      }))}
                    />
                    <span aria-hidden="true">—</span>
                    <TimeSelect
                      ariaLabel={`${override.date}: ${copy.toLabel}`}
                      value={period.endMinute}
                      onChange={(value) => onChange(updateDateOverride(form, index, {
                        ...override,
                        periods: override.periods.map((candidate, candidateIndex) => candidateIndex === periodIndex
                          ? { ...candidate, endMinute: value }
                          : candidate)
                      }))}
                    />
                    <button
                      className={styles.removeButton}
                      type="button"
                      aria-label={copy.removePeriodLabel}
                      disabled={override.periods.length === 1}
                      onClick={() => onChange(updateDateOverride(form, index, {
                        ...override,
                        periods: override.periods.filter((_, candidateIndex) => candidateIndex !== periodIndex)
                      }))}
                    ><Icon iconName="trash" width={14} height={14} aria-hidden="true" /></button>
                  </div>
                ))}
                <button
                  className={styles.inlineButton}
                  type="button"
                  onClick={() => {
                    const previousEnd = override.periods.at(-1)?.endMinute ?? 540;
                    const startMinute = Math.min(previousEnd + 30, 1_380);
                    onChange(updateDateOverride(form, index, {
                      ...override,
                      periods: [...override.periods, { startMinute, endMinute: Math.min(startMinute + 60, 1_440) }]
                    }));
                  }}
                ><Icon iconName="plus" width={14} height={14} aria-hidden="true" />{copy.addPeriodLabel}</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
