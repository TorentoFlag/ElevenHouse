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
    <Modal title="Удалить расчёт?" closeLabel="Закрыть" onClose={onClose}>
      <div className={styles.archiveDialog}>
        <p>{`«${calculationTitle}» исчезнет из рабочего пространства. Восстановить его через интерфейс не получится.`}</p>
        <div className={styles.archiveActions}>
          <button
            type="button"
            className={styles.dangerAction}
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? "Удаление…" : "Удалить"}
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
