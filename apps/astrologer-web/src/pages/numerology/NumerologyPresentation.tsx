import { createPortal } from "react-dom";
import type { buildNumerologyWorkspaceModel } from "../../features/numerology/model/numerologyWorkspaceModel";
import styles from "./NumerologyPage.module.css";

export type NumerologyPresentationProps = {
  readonly model: NonNullable<ReturnType<typeof buildNumerologyWorkspaceModel>>;
  readonly onClose: () => void;
};

export function NumerologyPresentation({ model, onClose }: NumerologyPresentationProps) {
  return createPortal(
    <div
      className={styles.presentationOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Презентация нумерологии"
    >
      <div className={styles.presentationHeader}>
        <div>
          <strong>{model.subject?.displayName ?? model.title}</strong>
          <span>{model.subject?.birthDate ?? model.versionLabel}</span>
        </div>
        <button type="button" className="eh-button eh-button--secondary" onClick={onClose}>
          Закрыть
        </button>
      </div>
      <div className={styles.presentationBody}>
        <div className={styles.presentationNumbers}>
          {model.keyNumbers.slice(0, 4).map((item) => (
            <span key={item.code}>
              <strong>{item.value}</strong>
              <small>{item.label}</small>
            </span>
          ))}
        </div>
        {model.matrix ? (
          <div className={styles.presentationMatrix}>
            {model.matrix.cells.map((cell) => (
              <span key={cell.digit}>
                <strong>{cell.value || "—"}</strong>
                <small>{cell.label}</small>
              </span>
            ))}
          </div>
        ) : null}
        {model.strengthLines.length > 0 ? (
          <div className={styles.presentationLines}>
            {model.strengthLines.map((line) => (
              <span key={line.code}>
                {line.label}: <strong>{line.value}</strong>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
