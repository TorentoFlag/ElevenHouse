import { Modal } from "@elevenhouse/design-system/components/Modal";
import type { NumerologyWorkspaceModel } from "../../features/numerology/model/numerologyWorkspaceModel";
import { CompatibilityNumerologyPresentation } from "./CompatibilityNumerologyPresentation";
import { IndividualNumerologyPresentation } from "./IndividualNumerologyPresentation";
import styles from "./NumerologyPresentation.module.css";

export type NumerologyPresentationDialogProps = {
  readonly model: NumerologyWorkspaceModel;
  readonly isPeriodVisible: boolean;
  readonly interpretationText: string;
  readonly onClose: () => void;
};

export function NumerologyPresentationDialog({
  model,
  isPeriodVisible,
  interpretationText,
  onClose
}: NumerologyPresentationDialogProps) {
  const title =
    model.mode === "compatibility"
      ? `${model.title} · Совместимость`
      : `${model.subject?.displayName ?? model.title} · Нумерологический портрет`;

  return (
    <Modal
      title={title}
      right={<span className={styles.escapeHint}>Esc · Выйти</span>}
      closeLabel="Закрыть презентацию"
      backdropClassName={styles.backdrop}
      className={styles.dialog}
      contentClassName={styles.content}
      onClose={onClose}
    >
      {model.mode === "compatibility" ? (
        <CompatibilityNumerologyPresentation
          model={model}
          interpretationText={interpretationText}
        />
      ) : (
        <IndividualNumerologyPresentation
          model={model}
          isPeriodVisible={isPeriodVisible}
          interpretationText={interpretationText}
        />
      )}
    </Modal>
  );
}
