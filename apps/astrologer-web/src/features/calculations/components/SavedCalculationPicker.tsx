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
    <aside className={styles.savedRail} aria-label="Сохранённые расчёты">
      <div className={styles.panelKicker}>Сохранённые</div>
      {calculations.length === 0 ? (
        <p className={styles.mutedText}>Пока нет расчётов</p>
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
              aria-current={calculation.id === selectedCalculationId ? "true" : undefined}
              onClick={() => onSelect(calculation)}
            >
              <span className={styles.savedItemTitle}>{calculation.title}</span>
              <span className={styles.savedItemMeta}>
                {formatCalculationMode(calculation)} · {formatCalculationStatus(calculation)} ·{" "}
                {formatParticipant(calculation)} ·{" "}
                <time dateTime={calculation.updatedAt}>{formatUpdatedAt(calculation.updatedAt)}</time>
              </span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

function formatCalculationMode(calculation: CalculationRecordResponse): string {
  return calculation.mode === "compatibility" ? "Совместимость" : "Индивидуальный";
}

function formatCalculationStatus(calculation: CalculationRecordResponse): string {
  const labels: Record<CalculationRecordResponse["status"], string> = {
    calculated: "Рассчитан",
    linked: "Привязан",
    published: "Опубликован",
    archived: "Архив"
  };
  return labels[calculation.status];
}

function formatParticipant(calculation: CalculationRecordResponse): string {
  return calculation.participants.find((participant) => participant.role === "subject")
    ?.displayName ?? "Без клиента";
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}
