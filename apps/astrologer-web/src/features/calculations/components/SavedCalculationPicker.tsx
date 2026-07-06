import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import styles from "./SavedCalculationPicker.module.css";

export type SavedCalculationPickerProps = {
  readonly calculations: readonly CalculationRecordResponse[];
  readonly selectedCalculationId: string | null;
  readonly onSelect: (calculation: CalculationRecordResponse) => void;
};

export function SavedCalculationPicker({
  calculations,
  selectedCalculationId,
  onSelect
}: SavedCalculationPickerProps) {
  return (
    <aside className={styles.savedRail} aria-label="Сохраненные расчеты">
      <div className={styles.panelKicker}>Сохраненные</div>
      {calculations.length === 0 ? (
        <p className={styles.mutedText}>Пока нет расчетов</p>
      ) : (
        <div className={styles.savedList}>
          {calculations.map((calculation) => (
            <button
              key={calculation.id}
              type="button"
              className={
                calculation.id === selectedCalculationId
                  ? `${styles.savedItem} ${styles.savedItemActive}`
                  : styles.savedItem
              }
              onClick={() => onSelect(calculation)}
            >
              <span className={styles.savedItemTitle}>{calculation.title}</span>
              <span className={styles.savedItemMeta}>
                {calculation.mode === "compatibility" ? "Совместимость" : "Индивидуальный"} ·{" "}
                {calculation.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
