import type { FormEvent } from "react";
import type { DictionaryCategoryResponse } from "@elevenhouse/contracts";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Chip } from "@elevenhouse/design-system/components/Chip";
import "@elevenhouse/design-system/components/Chip.css";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import { Tooltip } from "@elevenhouse/design-system/components/Tooltip";
import "@elevenhouse/design-system/components/Tooltip.css";
import type {
  ReferenceEntryDraft,
  ReferenceEntryDraftFieldErrors,
  ReferenceEntryDraftTouchedFields,
  ReferenceEntryDraftValidationCopy
} from "../../../../helpers/referenceEntryDraft";
import { ReferenceAiDraftButton } from "../ReferenceAiDraftButton";
import styles from "./ReferenceEntryModalView.module.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";

const CATEGORY_ERROR_ID = "reference-entry-modal-category-error";
const TITLE_ERROR_ID = "reference-entry-modal-title-error";
const CONTENT_TEXTAREA_ID = "reference-entry-modal-content";
const CONTENT_ERROR_ID = "reference-entry-modal-content-error";

export type ReferenceEntryModalDraft = ReferenceEntryDraft;
type ReferenceEntryModalDraftField = keyof ReferenceEntryDraftTouchedFields;

export type ReferenceEntryModalBaseCopy = {
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
  readonly aiDraftLoadingLabel: string;
  readonly aiDraftLoadingAnnouncement: string;
  readonly aiDraftErrorLabel: string;
  readonly aiDraftErrorTitle: string;
  readonly aiDraftErrorAnnouncement: string;
  readonly aiDraftDisabledTooltip: string;
  readonly cancelLabel: string;
  readonly saveLabel: string;
  readonly savingLabel: string;
  readonly genericError: string;
  readonly validation: ReferenceEntryDraftValidationCopy;
};

export type ReferenceEntryModalViewCopy = Omit<
  ReferenceEntryModalBaseCopy,
  "createTitle" | "editTitle" | "createCloseLabel" | "editCloseLabel"
> & {
  readonly title: string;
  readonly closeLabel: string;
};

export type ReferenceEntryModalViewProps = {
  readonly copy: ReferenceEntryModalViewCopy;
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
  const isAiDraftDisabled = !draft.title.trim();
  const aiDraftButton = (
    <ReferenceAiDraftButton
      copy={{
        label: copy.aiDraftLabel,
        title: copy.aiDraftTitle,
        loadingLabel: copy.aiDraftLoadingLabel,
        loadingAnnouncement: copy.aiDraftLoadingAnnouncement,
        errorLabel: copy.aiDraftErrorLabel,
        errorTitle: copy.aiDraftErrorTitle,
        errorAnnouncement: copy.aiDraftErrorAnnouncement
      }}
      state={isCreatingAiDraft ? "loading" : aiErrorMessage ? "error" : "active"}
      disabled={isAiDraftDisabled}
      data-reference-entry-modal-ai="true"
      onClick={onCreateAiDraft}
    />
  );

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
            {isAiDraftDisabled ? (
              <Tooltip content={copy.aiDraftDisabledTooltip}>{aiDraftButton}</Tooltip>
            ) : (
              aiDraftButton
            )}
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
            startIcon={<Icon iconName="check" width={16} height={16} aria-hidden="true" />}
            disabled={!canSubmit || isSaving}
            data-reference-entry-modal-submit="true"
          />
        </div>
      </form>
    </Modal>
  );
}
