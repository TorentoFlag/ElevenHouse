import type { MatrixData } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { MatrixOctagram } from "../../features/matrix/components/MatrixOctagram";
import styles from "./MatrixPage.module.css";

export function MatrixPresentation({
  matrix,
  title,
  onClose
}: {
  readonly matrix: MatrixData;
  readonly title: string;
  readonly onClose: () => void;
}) {
  return (
    <div
      className={styles.presentationOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Презентация Матрицы судьбы"
    >
      <header className={styles.presentationHeader}>
        <div>
          <span>Матрица судьбы</span>
          <strong>{title}</strong>
        </div>
        <button type="button" onClick={onClose}>
          <Icon iconName="close" width={18} height={18} />
          Закрыть
        </button>
      </header>
      <div className={styles.presentationBody}>
        <MatrixOctagram matrix={matrix} selected="E" compact />
        <div className={styles.presentationSummary}>
          <span>Центр матрицы</span>
          <strong>{matrix.points.E}</strong>
          <p>
            Символический инструмент для подготовки консультации. Интерпретации требуют
            профессионального контекста.
          </p>
        </div>
      </div>
    </div>
  );
}
