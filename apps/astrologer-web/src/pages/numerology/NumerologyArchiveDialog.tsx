import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import styles from "./NumerologySavedWorkspace.module.css";

export type NumerologyArchiveDialogProps = {
  readonly calculationTitle: string;
  readonly isPending: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
};

export function NumerologyArchiveDialog({
  calculationTitle,
  isPending,
  onConfirm,
  onClose
}: NumerologyArchiveDialogProps) {
  return (
    <Modal title="Переместить расчёт в архив?" closeLabel="Закрыть" onClose={onClose}>
      <div className={styles.archiveDialog}>
        <p>
          «{calculationTitle}» исчезнет из активного списка. Данные сохранятся в архиве и не будут
          удалены физически.
        </p>
        <div className={styles.archiveActions}>
          <button
            type="button"
            className={styles.dangerAction}
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? "Перемещение…" : "В архив"}
          </button>
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={isPending}
            onClick={onClose}
          >
            Отмена
          </button>
        </div>
      </div>
    </Modal>
  );
}
