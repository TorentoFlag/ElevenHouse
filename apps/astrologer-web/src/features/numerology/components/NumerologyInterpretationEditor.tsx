import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useId, useState } from "react";
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
  const regionId = `numerology-interpretation-${useId()}`;
  const [isExpanded, setIsExpanded] = useState(
    () => isCreatingAiDraft || aiDraftErrorMessage !== null
  );

  return (
    <div
      className={styles.manualInterpretation}
      data-expanded={isExpanded ? "true" : undefined}
    >
      <button
        aria-controls={regionId}
        aria-expanded={isExpanded}
        className={styles.interpretationDisclosure}
        onClick={() => setIsExpanded((current) => !current)}
        type="button"
      >
        <span className={styles.interpretationDisclosureLabel}>
          <Icon iconName="sparkle" width={14} height={14} aria-hidden="true" />
          <span>AI-разбор портрета</span>
        </span>
        <span
          aria-hidden="true"
          className={styles.interpretationChevron}
          data-open={isExpanded ? "true" : undefined}
        >
          <Icon iconName="chevronDown" width={14} height={14} />
        </span>
      </button>
      {isExpanded ? (
        <div className={styles.interpretationContent} id={regionId}>
          <span
            className={styles.aiDraftButtonTooltip}
            title={aiDraftDisabledReason ?? undefined}
          >
            <Button
              className={styles.aiDraftButton}
              disabled={aiDraftDisabled}
              onClick={onCreateAiDraft}
              size="small"
              startIcon={
                <Icon iconName="sparkle" width={13} height={13} aria-hidden="true" />
              }
              title={isCreatingAiDraft ? "Создаём черновик…" : "Создать AI-черновик"}
              variant="glass"
            />
          </span>
          <textarea
            aria-label="Текст трактовки"
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={placeholder}
            disabled={isCreatingAiDraft}
          />
          <div className={styles.interpretationActions}>
            <Button
              disabled={saveDisabled}
              onClick={onSave}
              size="small"
              title="Сохранить"
              variant="glass"
            />
            <Button
              disabled={approveDisabled}
              onClick={onApprove}
              size="small"
              title="Утвердить"
              variant="brand"
            />
          </div>
          <div className={styles.interpretationStatus} aria-live="polite">
            {aiDraftErrorMessage ? <p role="alert">{aiDraftErrorMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
