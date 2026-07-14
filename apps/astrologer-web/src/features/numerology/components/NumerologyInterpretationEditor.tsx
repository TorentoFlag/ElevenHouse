import { Icon } from "@elevenhouse/design-system/icons/Icon";
import styles from "./NumerologyComponents.module.css";

export type NumerologyInterpretationEditorProps = {
  readonly text: string;
  readonly placeholder: string;
  readonly isCreatingAiDraft: boolean;
  readonly aiDraftErrorMessage: string | null;
  readonly aiDraftDisabled: boolean;
  readonly aiDraftDisabledReason: string | null;
  readonly saveDisabled: boolean;
  readonly approveDisabled: boolean;
  readonly onTextChange: (value: string) => void;
  readonly onCreateAiDraft: () => void;
  readonly onSave: () => void;
  readonly onApprove: () => void;
};

export function NumerologyInterpretationEditor({
  text,
  placeholder,
  isCreatingAiDraft,
  aiDraftErrorMessage,
  aiDraftDisabled,
  aiDraftDisabledReason,
  saveDisabled,
  approveDisabled,
  onTextChange,
  onCreateAiDraft,
  onSave,
  onApprove
}: NumerologyInterpretationEditorProps) {
  return (
    <div className={styles.manualInterpretation}>
      <div className={styles.interpretationHeading}>
        <span className={styles.kicker}>Трактовка</span>
        <span className={styles.aiDraftButtonTooltip} title={aiDraftDisabledReason ?? undefined}>
          <button
            type="button"
            className={styles.aiDraftButton}
            disabled={aiDraftDisabled}
            onClick={onCreateAiDraft}
          >
            <Icon iconName="sparkle" width={14} height={14} aria-hidden="true" />
            {isCreatingAiDraft ? "Создаём черновик…" : "Создать AI-черновик"}
          </button>
        </span>
      </div>
      <textarea
        aria-label="Текст трактовки"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={placeholder}
        disabled={isCreatingAiDraft}
      />
      <div className={styles.interpretationActions}>
        <button
          type="button"
          className="eh-button eh-button--secondary"
          disabled={saveDisabled}
          onClick={onSave}
        >
          Сохранить
        </button>
        <button
          type="button"
          className="eh-button eh-button--primary"
          disabled={approveDisabled}
          onClick={onApprove}
        >
          Утвердить
        </button>
      </div>
      <div className={styles.interpretationStatus} aria-live="polite">
        {aiDraftErrorMessage ? <p role="alert">{aiDraftErrorMessage}</p> : null}
      </div>
    </div>
  );
}
