import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { IconButton } from "@elevenhouse/design-system/components/IconButton";
import "@elevenhouse/design-system/components/IconButton.css";
import { Tooltip } from "@elevenhouse/design-system/components/Tooltip";
import "@elevenhouse/design-system/components/Tooltip.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useId, useRef, useState, type MouseEvent } from "react";
import type { NumerologyInterpretationCopy } from "../../../common/i18n/astrologerCopy";
import { NumerologyInterpretationModal } from "./NumerologyInterpretationModal";
import styles from "./NumerologyComponents.module.css";

export type NumerologyInterpretationEditorProps = {
  readonly copy: NumerologyInterpretationCopy;
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
  copy,
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const expandTriggerContainerRef = useRef<HTMLSpanElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  function openEditor(event: MouseEvent<HTMLButtonElement>): void {
    returnFocusRef.current = event.currentTarget;
    setIsModalOpen(true);
  }

  function createAiDraft(event: MouseEvent<HTMLButtonElement>): void {
    returnFocusRef.current = event.currentTarget;
    setIsModalOpen(true);
    onCreateAiDraft();
  }

  function closeEditor(): void {
    setIsModalOpen(false);
    requestAnimationFrame(() => {
      const preferred = returnFocusRef.current;
      const fallback = expandTriggerContainerRef.current?.querySelector("button") ?? null;
      const target = preferred && !preferred.disabled ? preferred : fallback;
      target?.focus();
    });
  }

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
          <span>{copy.sectionLabel}</span>
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
          <div className={styles.interpretationActionRow}>
            <span
              className={styles.aiDraftButtonTooltip}
              title={aiDraftDisabledReason ?? undefined}
            >
              <Button
                className={styles.aiDraftButton}
                disabled={aiDraftDisabled}
                onClick={createAiDraft}
                size="small"
                startIcon={
                  <Icon iconName="sparkle" width={13} height={13} aria-hidden="true" />
                }
                title={
                  isCreatingAiDraft ? copy.creatingAiDraftLabel : copy.createAiDraftLabel
                }
                variant="glass"
              />
            </span>
            <span ref={expandTriggerContainerRef}>
              <Tooltip content={copy.openEditorLabel} id={`${regionId}-expand-tooltip`}>
                <IconButton
                  aria-haspopup="dialog"
                  label={copy.openEditorLabel}
                  icon={<Icon iconName="expand" aria-hidden="true" />}
                  size="medium"
                  variant="default"
                  onClick={openEditor}
                />
              </Tooltip>
            </span>
          </div>
        </div>
      ) : null}
      <NumerologyInterpretationModal
        open={isModalOpen}
        copy={copy}
        text={text}
        placeholder={placeholder}
        isCreatingAiDraft={isCreatingAiDraft}
        aiDraftErrorMessage={aiDraftErrorMessage}
        saveDisabled={saveDisabled}
        approveDisabled={approveDisabled}
        onClose={closeEditor}
        onTextChange={onTextChange}
        onSave={onSave}
        onApprove={onApprove}
      />
    </div>
  );
}
