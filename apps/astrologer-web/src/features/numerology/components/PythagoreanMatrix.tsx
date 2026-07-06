import type { NumerologyWorkspaceMatrixCell } from "../model/numerologyWorkspaceModel";
import styles from "./NumerologyComponents.module.css";

export function PythagoreanMatrix({
  cells,
  selectedSelector,
  onSelect
}: {
  readonly cells: readonly NumerologyWorkspaceMatrixCell[];
  readonly selectedSelector: string | null;
  readonly onSelect: (selector: string) => void;
}) {
  return (
    <div className={styles.matrix} aria-label="Квадрат Пифагора">
      {cells.map((cell) => (
        <button
          className={styles.matrixCell}
          data-selected={selectedSelector === cell.selector ? "true" : undefined}
          key={cell.digit}
          onClick={() => onSelect(cell.selector)}
          type="button"
        >
          <span className={styles.matrixValue}>{cell.value || "—"}</span>
          <span className={styles.matrixLabel}>{cell.label}</span>
        </button>
      ))}
    </div>
  );
}
