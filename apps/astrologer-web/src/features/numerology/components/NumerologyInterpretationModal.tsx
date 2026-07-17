import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { useId, useRef } from "react";
import type { NumerologyInterpretationCopy } from "../../../common/i18n/astrologerCopy";
import styles from "./NumerologyInterpretationModal.module.css";

export type NumerologyInterpretationModalProps = {
  readonly open: boolean;
  readonly copy: NumerologyInterpretationCopy;
  readonly text: string;
  readonly placeholder: string;
  readonly isCreatingAiDraft: boolean;
  readonly aiDraftErrorMessage: string | null;
  readonly saveDisabled: boolean;
  readonly approveDisabled: boolean;
  readonly onClose: () => void;
  readonly onTextChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onApprove: () => void;
};

export function NumerologyInterpretationModal({
  open,
  copy,
  text,
  placeholder,
  isCreatingAiDraft,
  aiDraftErrorMessage,
  saveDisabled,
  approveDisabled,
  onClose,
  onTextChange,
  onSave,
  onApprove
}: NumerologyInterpretationModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaId = `numerology-interpretation-text-${useId()}`;

  return (
    <Modal
      open={open}
      title={copy.modalTitle}
      closeLabel={copy.closeModalLabel}
      initialFocusRef={textareaRef}
      className={styles.dialog}
      contentClassName={styles.content}
      onClose={onClose}
    >
      <div className={styles.editor}>
        <label className={styles.label} htmlFor={textareaId}>
          {copy.textLabel}
        </label>
        <textarea
          ref={textareaRef}
          id={textareaId}
          className={styles.textarea}
          value={text}
          placeholder={placeholder}
          disabled={isCreatingAiDraft}
          onChange={(event) => onTextChange(event.currentTarget.value)}
        />
        <div className={styles.status} aria-live="polite">
          {isCreatingAiDraft ? <p>{copy.creatingAiDraftLabel}</p> : null}
          {aiDraftErrorMessage ? <p role="alert">{aiDraftErrorMessage}</p> : null}
        </div>
        <footer className={styles.footer}>
          <Button
            disabled={saveDisabled}
            onClick={onSave}
            size="medium"
            title={copy.saveDraftLabel}
            variant="glass"
          />
          <Button
            disabled={approveDisabled}
            onClick={onApprove}
            size="medium"
            title={copy.approveLabel}
            variant="brand"
          />
        </footer>
      </div>
    </Modal>
  );
}
