import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import type { SavedNumerologyCalculationListItem } from "../../features/numerology/model/numerologySavedWorkspaceModel";
import styles from "./NumerologySavedWorkspace.module.css";

export type NumerologyCalculationMenuProps = {
  readonly items: readonly SavedNumerologyCalculationListItem[];
  readonly selectedCalculationId: string | null;
  readonly disabled: boolean;
  readonly onSelect: (calculation: CalculationRecordResponse) => void;
  readonly onCreate: () => void;
  readonly onRecalculate: () => void;
  readonly onArchive: () => void;
};

export function NumerologyCalculationMenu({
  items,
  selectedCalculationId,
  disabled,
  onSelect,
  onCreate,
  onRecalculate,
  onArchive
}: NumerologyCalculationMenuProps) {
  return (
    <details className={styles.calculationMenu}>
      <summary className={styles.calculationMenuTrigger} aria-label="Открыть список расчётов">
        Расчёты
        <span className={styles.calculationCount}>{items.length}</span>
      </summary>
      <div className={styles.calculationPopover}>
        <div className={styles.calculationMenuHeader}>
          <strong>Сохранённые расчёты</strong>
          <button type="button" disabled={disabled} onClick={onCreate}>
            Новый расчёт
          </button>
        </div>
        <div className={styles.calculationList} role="list">
          {items.length > 0 ? (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={styles.calculationItem}
                aria-current={item.id === selectedCalculationId ? "true" : undefined}
                disabled={disabled}
                onClick={() => onSelect(item.calculation)}
              >
                <span className={styles.calculationItemTitle}>{item.title}</span>
                <span className={styles.calculationItemMeta}>
                  {item.modeLabel} · {item.participantLabel} ·{" "}
                  <time dateTime={item.updatedAt}>{formatUpdatedAt(item.updatedAt)}</time>
                </span>
              </button>
            ))
          ) : (
            <p className={styles.calculationEmpty}>Сохранённых расчётов пока нет</p>
          )}
        </div>
        {selectedCalculationId ? (
          <div className={styles.calculationMenuActions}>
            <button type="button" disabled={disabled} onClick={onRecalculate}>
              Пересчитать
            </button>
            <button
              type="button"
              className={styles.calculationArchiveAction}
              disabled={disabled}
              onClick={onArchive}
            >
              В архив
            </button>
          </div>
        ) : null}
      </div>
    </details>
  );
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
