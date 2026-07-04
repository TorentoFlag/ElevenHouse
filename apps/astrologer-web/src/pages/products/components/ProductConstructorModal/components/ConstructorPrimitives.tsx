import type { ReactNode } from "react";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { SelectableTile } from "@elevenhouse/design-system/components/SelectableTile";
import "@elevenhouse/design-system/components/SelectableTile.css";
import type { OptionGroupProps } from "../types";
import styles from "../ProductConstructorModal.module.css";

export function SectionHeading({
  id,
  title,
  hint
}: {
  readonly id: string;
  readonly title: ReactNode;
  readonly hint?: ReactNode;
}) {
  return (
    <div className={styles.constructorSectionHeading}>
      <h3 id={id} className={styles.constructorSectionTitle}>
        {title}
      </h3>
      {hint ? <p>{hint}</p> : null}
    </div>
  );
}

export function LabeledStepper({
  label,
  children
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.constructorStepperRow}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </div>
  );
}

export function ConstructorOptionGroup<TValue extends string>({
  options,
  copyByValue,
  selectedValue,
  selectedValues,
  onSelect,
  onToggle
}: OptionGroupProps<TValue>) {
  return (
    <div className={styles.constructorChipRow}>
      {options.map((option) => {
        const selected = selectedValues
          ? selectedValues.includes(option.value)
          : selectedValue === option.value;

        return (
          <SelectableTile
            key={option.value}
            className={styles.constructorChip}
            label={copyByValue[option.value].label}
            selected={selected}
            icon={<Icon iconName={option.iconName} width={16} height={16} aria-hidden="true" />}
            onClick={() => {
              if (onToggle) onToggle(option.value);
              if (onSelect) onSelect(option.value);
            }}
          />
        );
      })}
    </div>
  );
}
