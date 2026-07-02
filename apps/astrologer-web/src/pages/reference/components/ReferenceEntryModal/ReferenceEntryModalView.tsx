import type { FormEvent } from "react";
import type { DictionaryCategoryResponse } from "@elevenhouse/contracts";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Chip } from "@elevenhouse/design-system/components/Chip";
import "@elevenhouse/design-system/components/Chip.css";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { Sparkle } from "@elevenhouse/design-system/icons/Sparkle";
import { Verified } from "@elevenhouse/design-system/icons/Verified";
import type { ReferenceEntryDraft } from "../../helpers/referenceEntryDraft";
import styles from "./ReferenceEntryModal.module.css";

export type ReferenceEntryModalDraft = ReferenceEntryDraft;

export type ReferenceEntryModalCopy = {
  readonly title: string;
  readonly closeLabel: string;
  readonly categoryLabel: string;
  readonly titleLabel: string;
  readonly titlePlaceholder: string;
  readonly contentLabel: string;
  readonly contentPlaceholder: string;
  readonly aiDraftLabel: string;
  readonly aiDraftTitle: string;
  readonly cancelLabel: string;
  readonly saveLabel: string;
  readonly savingLabel: string;
  readonly genericError: string;
  readonly aiDraftTemplate: string;
};

export type ReferenceEntryModalViewProps = {
  readonly copy: ReferenceEntryModalCopy;
  readonly categories: DictionaryCategoryResponse[];
  readonly draft: ReferenceEntryModalDraft;
  readonly canSubmit: boolean;
  readonly isSaving: boolean;
  readonly errorMessage: string | null;
  readonly onClose: () => void;
  readonly onDraftChange: (draft: ReferenceEntryModalDraft) => void;
  readonly onSubmit: () => void;
  readonly onCreateAiDraft: () => void;
};

export function ReferenceEntryModalView({
  copy,
  categories,
  draft,
  canSubmit,
  isSaving,
  errorMessage,
  onClose,
  onDraftChange,
  onSubmit,
  onCreateAiDraft
}: ReferenceEntryModalViewProps) {
  return (
    <Modal title={copy.title} closeLabel={copy.closeLabel} onClose={onClose}>
      <form
        className={styles.form}
        data-reference-entry-modal-form="true"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className={styles.field}>
          <span className={styles.label}>{copy.categoryLabel}</span>
          <div className={styles.categoryList}>
            {categories.map((category) => {
              const isActive = draft.categoryId === category.id;

              return (
                <Chip
                  key={category.id}
                  label={category.name}
                  type="button"
                  active={isActive}
                  data-reference-entry-modal-category-id={category.id}
                  onClick={() => onDraftChange({ ...draft, categoryId: category.id })}
                />
              );
            })}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{copy.titleLabel}</span>
          <input
            className={styles.input}
            data-reference-entry-modal-title="true"
            autoFocus
            value={draft.title}
            placeholder={copy.titlePlaceholder}
            onChange={(event) => onDraftChange({ ...draft, title: event.currentTarget.value })}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.labelRow}>
            <span className={styles.label}>{copy.contentLabel}</span>
            <button
              className={styles.aiDraftButton}
              type="button"
              title={copy.aiDraftTitle}
              data-reference-entry-modal-ai="true"
              onClick={onCreateAiDraft}
            >
              <Sparkle width={12} height={12} aria-hidden="true" />
              {copy.aiDraftLabel}
            </button>
          </span>
          <textarea
            className={styles.textarea}
            data-reference-entry-modal-content="true"
            value={draft.content}
            placeholder={copy.contentPlaceholder}
            rows={5}
            onChange={(event) => onDraftChange({ ...draft, content: event.currentTarget.value })}
          />
        </label>

        {errorMessage && <p className={styles.error}>{errorMessage}</p>}

        <div className={styles.footer}>
          <Button
            type="button"
            variant="glass"
            size="medium"
            title={copy.cancelLabel}
            data-reference-entry-modal-cancel="true"
            onClick={onClose}
          />
          <Button
            className={styles.submitButton}
            type="submit"
            variant="brand"
            size="medium"
            title={isSaving ? copy.savingLabel : copy.saveLabel}
            startIcon={<Verified width={14} height={14} aria-hidden="true" />}
            disabled={!canSubmit || isSaving}
            data-reference-entry-modal-submit="true"
          />
        </div>
      </form>
    </Modal>
  );
}
