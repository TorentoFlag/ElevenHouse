import type { NumerologyWorkspaceMatrixCell } from "../model/numerologyWorkspaceModel";
import styles from "./NumerologyComponents.module.css";

export function PythagoreanMatrix({
  cells,
  selectedSelector,
  onSelect,
  selectorForDigit = (_, defaultSelector) => defaultSelector
}: {
  readonly cells: readonly NumerologyWorkspaceMatrixCell[];
  readonly selectedSelector: string | null;
  readonly onSelect: (selector: string) => void;
  readonly selectorForDigit?: (digit: string, defaultSelector: string) => string;
}) {
  return (
    <div className={styles.matrix} aria-label="Квадрат Пифагора">
      {cells.map((cell) => {
        const selector = selectorForDigit(cell.digit, cell.selector);
        return (
          <button
            className={styles.matrixCell}
            data-selected={selectedSelector === selector ? "true" : undefined}
            key={cell.digit}
            onClick={() => onSelect(selector)}
            type="button"
          >
            <span className={styles.matrixValue}>{cell.value || "—"}</span>
            <span className={styles.matrixLabel}>{cell.label}</span>
          </button>
        );
      })}
    </div>
  );
}
