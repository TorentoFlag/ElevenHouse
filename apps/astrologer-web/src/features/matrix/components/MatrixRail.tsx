import type { MatrixData } from "@elevenhouse/contracts";
import {
  getMatrixArcana,
  matrixRailGroups,
  type MatrixSelector
} from "../model/matrixWorkspaceModel";
import styles from "../../../pages/matrix/MatrixPage.module.css";

export function MatrixRail({
  matrix,
  selected,
  onSelect
}: {
  readonly matrix: MatrixData;
  readonly selected: MatrixSelector;
  readonly onSelect: (selector: MatrixSelector) => void;
}) {
  return (
    <nav className={styles.rail} aria-label="Разделы Матрицы судьбы">
      {matrixRailGroups.map((group) => (
        <section className={styles.railGroup} key={group.title}>
          <h2>{group.title}</h2>
          {group.items.map((item) => (
            <button
              type="button"
              key={item.selector}
              className={selected === item.selector ? styles.railItemActive : styles.railItem}
              onClick={() => onSelect(item.selector)}
            >
              <span
                className={
                  group.title === "Предназначения" ? styles.railNumberGold : styles.railNumber
                }
              >
                {getMatrixArcana(matrix, item.selector)}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </section>
      ))}
    </nav>
  );
}
