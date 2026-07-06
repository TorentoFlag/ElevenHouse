import type { NumerologyCalculationResponse } from "@elevenhouse/contracts";
import {
  getCompatibilityPairNumber,
  getNumerologyKeyNumbers,
  getPythagoreanMatrixCells
} from "../model/numerologyResultModel";
import { PythagoreanMatrix } from "./PythagoreanMatrix";
import styles from "./NumerologyComponents.module.css";

export function NumerologyResultPanel({
  response
}: {
  readonly response: NumerologyCalculationResponse | null;
}) {
  const keyNumbers = getNumerologyKeyNumbers(response);
  const cells = getPythagoreanMatrixCells(response);
  const pairNumber = getCompatibilityPairNumber(response);

  if (!response) {
    return (
      <div className={styles.resultPanel}>
        <div className={styles.panelBox}>
          <h2 className={styles.panelTitle}>Расчет не выбран</h2>
          <p className={styles.muted}>Создайте новый расчет или откройте сохраненный.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.resultPanel}>
      {pairNumber ? (
        <div className={styles.panelBox}>
          <h2 className={styles.panelTitle}>Число пары</h2>
          <span className={styles.keyValue}>{pairNumber}</span>
        </div>
      ) : null}
      <div className={styles.keyRail} aria-label="Ключевые числа">
        {keyNumbers.map((item) => (
          <div className={styles.keyNumber} key={item.code}>
            <span className={styles.keyValue}>{item.value}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      {cells.some((cell) => cell.count > 0) ? <PythagoreanMatrix cells={cells} /> : null}
    </div>
  );
}
