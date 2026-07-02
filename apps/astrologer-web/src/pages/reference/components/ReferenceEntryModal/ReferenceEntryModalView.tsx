import type { FormEvent } from "react";
import type { DictionaryCategoryResponse } from "@elevenhouse/contracts";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Chip } from "@elevenhouse/design-system/components/Chip";
import "@elevenhouse/design-system/components/Chip.css";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { Check } from "@elevenhouse/design-system/icons/Check";
import { Sparkle } from "@elevenhouse/design-system/icons/Sparkle";
import type {
  ReferenceEntryDraft,
  ReferenceEntryDraftFieldErrors,
  ReferenceEntryDraftTouchedFields,
  ReferenceEntryDraftValidationCopy
} from "../../helpers/referenceEntryDraft";
import styles from "./ReferenceEntryModal.module.css";

const CATEGORY_ERROR_ID = "reference-entry-modal-category-error";
const TITLE_ERROR_ID = "reference-entry-modal-title-error";
const CONTENT_TEXTAREA_ID = "reference-entry-modal-content";
const CONTENT_ERROR_ID = "reference-entry-modal-content-error";

export type ReferenceEntryModalDraft = ReferenceEntryDraft;
type ReferenceEntryModalDraftField = keyof ReferenceEntryDraftTouchedFields;

export type ReferenceEntryModalCopy = {
  readonly title: string;
  readonly closeLabel: string;
  readonly createTitle: string;
  readonly editTitle: string;
  readonly createCloseLabel: string;
  readonly editCloseLabel: string;
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
  readonly validation: ReferenceEntryDraftValidationCopy;
};

export type ReferenceEntryModalViewProps = {
  readonly copy: ReferenceEntryModalCopy;
  readonly categories: DictionaryCategoryResponse[];
  readonly draft: ReferenceEntryModalDraft;
  readonly isCategoryEditable: boolean;
  readonly canSubmit: boolean;
  readonly isSaving: boolean;
  readonly isCreatingAiDraft: boolean;
  readonly fieldErrors: ReferenceEntryDraftFieldErrors;
  readonly errorMessage: string | null;
  readonly aiErrorMessage: string | null;
  readonly onClose: () => void;
  readonly onDraftChange: (
    draft: ReferenceEntryModalDraft,
    fieldName?: ReferenceEntryModalDraftField
  ) => void;
  readonly onSubmit: () => void;
  readonly onCreateAiDraft: () => void;
};

export function ReferenceEntryModalView({
  copy,
  categories,
  draft,
  isCategoryEditable,
  canSubmit,
  isSaving,
  isCreatingAiDraft,
  fieldErrors,
  errorMessage,
  aiErrorMessage,
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
          <div
            className={styles.categoryList}
            role="group"
            aria-describedby={fieldErrors.categoryId ? CATEGORY_ERROR_ID : undefined}
          >
            {categories.map((category) => {
              const isActive = draft.categoryId === category.id;

              return (
                <Chip
                  key={category.id}
                  label={category.name}
                  type="button"
                  active={isActive}
                  disabled={!isCategoryEditable}
                  data-reference-entry-modal-category-id={category.id}
                  onClick={() => {
                    if (!isCategoryEditable) {
                      return;
                    }

                    onDraftChange({ ...draft, categoryId: category.id }, "categoryId");
                  }}
                />
              );
            })}
          </div>
          {fieldErrors.categoryId ? (
            <span className={styles.fieldError} id={CATEGORY_ERROR_ID}>
              {fieldErrors.categoryId}
            </span>
          ) : null}
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{copy.titleLabel}</span>
          <input
            className={`${styles.input}${fieldErrors.title ? ` ${styles.inputInvalid}` : ""}`}
            data-reference-entry-modal-title="true"
            autoFocus
            value={draft.title}
            placeholder={copy.titlePlaceholder}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? TITLE_ERROR_ID : undefined}
            onChange={(event) =>
              onDraftChange({ ...draft, title: event.currentTarget.value }, "title")
            }
          />
          {fieldErrors.title ? (
            <span className={styles.fieldError} id={TITLE_ERROR_ID}>
              {fieldErrors.title}
            </span>
          ) : null}
        </label>

        <div className={styles.field}>
          <span className={styles.labelRow}>
            <label className={styles.label} htmlFor={CONTENT_TEXTAREA_ID}>
              {copy.contentLabel}
            </label>
            <button
              className={styles.aiDraftButton}
              type="button"
              title={copy.aiDraftTitle}
              data-reference-entry-modal-ai="true"
              disabled={isCreatingAiDraft}
              onClick={onCreateAiDraft}
            >
              <Sparkle width={12} height={12} aria-hidden="true" />
              {copy.aiDraftLabel}
            </button>
          </span>
          <textarea
            id={CONTENT_TEXTAREA_ID}
            className={`${styles.textarea}${fieldErrors.content ? ` ${styles.inputInvalid}` : ""}`}
            data-reference-entry-modal-content="true"
            value={draft.content}
            placeholder={copy.contentPlaceholder}
            rows={5}
            aria-invalid={fieldErrors.content ? true : undefined}
            aria-describedby={fieldErrors.content ? CONTENT_ERROR_ID : undefined}
            onChange={(event) =>
              onDraftChange({ ...draft, content: event.currentTarget.value }, "content")
            }
          />
          {fieldErrors.content ? (
            <span className={styles.fieldError} id={CONTENT_ERROR_ID}>
              {fieldErrors.content}
            </span>
          ) : null}
        </div>

        {aiErrorMessage && <p className={styles.error}>{aiErrorMessage}</p>}
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
            startIcon={<Check width={16} height={16} aria-hidden="true" />}
            disabled={!canSubmit || isSaving}
            data-reference-entry-modal-submit="true"
          />
        </div>
      </form>
    </Modal>
  );
}
