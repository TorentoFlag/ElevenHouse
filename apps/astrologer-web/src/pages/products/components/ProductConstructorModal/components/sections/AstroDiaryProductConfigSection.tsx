import { NumberStepper } from "@elevenhouse/design-system/components/NumberStepper";
import {
  astroDiaryClientResponseWindowCalendarDaysBounds,
  astroDiaryReflectionCyclesPerPeriodBounds,
  astroDiaryResponseSlaWorkingDaysBounds,
  isValidIanaTimezone,
  isoWeekdayValues
} from "@elevenhouse/validation/products";
import type { ProductConstructorSectionProps } from "../../types";
import { LabeledStepper, SectionHeading } from "../ConstructorPrimitives";
import styles from "../../ProductConstructorModal.module.css";

export function AstroDiaryProductConfigSection({
  draft,
  controller
}: ProductConstructorSectionProps) {
  const config = draft.astroDiaryConfig;
  if (!config || !draft.accessGrants.includes("journal")) {
    return null;
  }

  const { actions, uiCopy } = controller;
  const timezoneIsValid = isValidIanaTimezone(config.serviceTimezone);
  const updateConfig = (patch: Partial<typeof config>) => {
    actions.updateDraft({ astroDiaryConfig: { ...config, ...patch } });
  };

  return (
    <section
      className={styles.constructorSectionPlain}
      aria-labelledby="product-constructor-astro-diary"
    >
      <SectionHeading
        id="product-constructor-astro-diary"
        title={uiCopy.astroDiarySettingsLabel}
        hint={uiCopy.astroDiarySettingsHint}
      />
      <div className={styles.astroDiaryNumericSettings}>
        <LabeledStepper label={uiCopy.reflectionCyclesPerPeriodLabel}>
          <NumberStepper
            value={config.reflectionCyclesPerPeriod}
            min={astroDiaryReflectionCyclesPerPeriodBounds.min}
            max={astroDiaryReflectionCyclesPerPeriodBounds.max}
            decrementLabel={uiCopy.decreaseAstroDiaryValueLabel(
              uiCopy.reflectionCyclesPerPeriodLabel
            )}
            incrementLabel={uiCopy.increaseAstroDiaryValueLabel(
              uiCopy.reflectionCyclesPerPeriodLabel
            )}
            onValueChange={(reflectionCyclesPerPeriod) =>
              updateConfig({ reflectionCyclesPerPeriod })
            }
          />
        </LabeledStepper>
        <LabeledStepper label={uiCopy.responseSlaWorkingDaysLabel}>
          <NumberStepper
            value={config.responseSlaWorkingDays}
            min={astroDiaryResponseSlaWorkingDaysBounds.min}
            max={astroDiaryResponseSlaWorkingDaysBounds.max}
            decrementLabel={uiCopy.decreaseAstroDiaryValueLabel(uiCopy.responseSlaWorkingDaysLabel)}
            incrementLabel={uiCopy.increaseAstroDiaryValueLabel(uiCopy.responseSlaWorkingDaysLabel)}
            onValueChange={(responseSlaWorkingDays) => updateConfig({ responseSlaWorkingDays })}
          />
        </LabeledStepper>
        <LabeledStepper label={uiCopy.clientResponseWindowCalendarDaysLabel}>
          <NumberStepper
            value={config.clientResponseWindowCalendarDays}
            min={astroDiaryClientResponseWindowCalendarDaysBounds.min}
            max={astroDiaryClientResponseWindowCalendarDaysBounds.max}
            decrementLabel={uiCopy.decreaseAstroDiaryValueLabel(
              uiCopy.clientResponseWindowCalendarDaysLabel
            )}
            incrementLabel={uiCopy.increaseAstroDiaryValueLabel(
              uiCopy.clientResponseWindowCalendarDaysLabel
            )}
            onValueChange={(clientResponseWindowCalendarDays) =>
              updateConfig({ clientResponseWindowCalendarDays })
            }
          />
        </LabeledStepper>
      </div>
      <fieldset className={styles.astroDiaryWeekdays}>
        <legend className={styles.fieldLabel}>{uiCopy.workingWeekdaysLabel}</legend>
        <div className={styles.constructorChipRow}>
          {isoWeekdayValues.map((weekday) => {
            const isSelected = config.workingWeekdays.includes(weekday);
            return (
              <button
                key={weekday}
                type="button"
                className={styles.astroDiaryWeekdayButton}
                data-selected={isSelected ? "true" : "false"}
                aria-pressed={isSelected}
                onClick={() => actions.toggleAstroDiaryWorkingWeekday(weekday)}
              >
                {uiCopy.weekdayLabels[weekday]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className={styles.astroDiaryTimezoneField}>
        <span className={styles.fieldLabel}>{uiCopy.serviceTimezoneLabel}</span>
        <input
          className={styles.textInput}
          data-astro-diary-timezone="true"
          value={config.serviceTimezone}
          aria-invalid={!timezoneIsValid}
          aria-describedby="product-constructor-astro-diary-timezone-hint"
          onChange={(event) => updateConfig({ serviceTimezone: event.currentTarget.value })}
        />
        <span
          id="product-constructor-astro-diary-timezone-hint"
          className={timezoneIsValid ? styles.constructorHint : styles.astroDiaryFieldError}
        >
          {timezoneIsValid ? uiCopy.serviceTimezoneHint : uiCopy.serviceTimezoneInvalidLabel}
        </span>
      </label>
    </section>
  );
}
