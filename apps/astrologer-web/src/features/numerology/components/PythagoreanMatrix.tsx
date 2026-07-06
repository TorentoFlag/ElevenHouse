import type { PythagoreanMatrixCell } from "../model/numerologyResultModel";
import styles from "./NumerologyComponents.module.css";

export function PythagoreanMatrix({
  cells
}: {
  readonly cells: readonly PythagoreanMatrixCell[];
}) {
  return (
    <div className={styles.matrix} aria-label="Квадрат Пифагора">
      {cells.map((cell) => (
        <div className={styles.matrixCell} key={cell.digit}>
          <span className={styles.matrixValue}>{cell.value || "—"}</span>
          <span className={styles.matrixLabel}>цифра {cell.digit}</span>
        </div>
      ))}
    </div>
  );
}
