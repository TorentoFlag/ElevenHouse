import type { MatrixData } from "@elevenhouse/contracts";
import { Modal } from "@elevenhouse/design-system/components/Modal";
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
    <Modal
      title={`Матрица судьбы · ${title}`}
      right={<span className={styles.presentationEscapeHint}>Esc · Выйти</span>}
      closeLabel="Закрыть презентацию"
      backdropClassName={styles.presentationOverlay}
      className={styles.presentationDialog}
      contentClassName={styles.presentationContent}
      onClose={onClose}
    >
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
    </Modal>
  );
}
