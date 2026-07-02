import { useState } from "react";
import type { DictionaryCategoryResponse, DictionaryLocale } from "@elevenhouse/contracts";
import { useCreateDictionaryAiDraftMutation } from "../../../../features/dictionary/model/useCreateDictionaryAiDraftMutation";
import { useCreateDictionaryCustomEntryMutation } from "../../../../features/dictionary/model/useCreateDictionaryCustomEntryMutation";
import {
  createReferenceEntryDraft,
  normalizeReferenceEntryDraft,
  resolveReferenceEntryVisibleFieldErrors,
  type ReferenceEntryDraftTouchedFields,
  validateReferenceEntryDraft
} from "../../helpers/referenceEntryDraft";
import { ReferenceEntryModalView, type ReferenceEntryModalCopy } from "./ReferenceEntryModalView";

export type ReferenceEntryModalProps = {
  readonly copy: ReferenceEntryModalCopy;
  readonly categories: DictionaryCategoryResponse[];
  readonly locale: DictionaryLocale;
  readonly selectedCategoryId: string | null;
  readonly titleSeed: string;
  readonly onClose: () => void;
};

export function ReferenceEntryModal({
  copy,
  categories,
  locale,
  selectedCategoryId,
  titleSeed,
  onClose
}: ReferenceEntryModalProps) {
  const [draft, setDraft] = useState(() =>
    createReferenceEntryDraft({
      categories,
      selectedCategoryId,
      titleSeed
    })
  );
  const [touchedFields, setTouchedFields] = useState<ReferenceEntryDraftTouchedFields>({
    categoryId: false,
    title: false,
    content: false
  });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const createEntryMutation = useCreateDictionaryCustomEntryMutation();
  const createAiDraftMutation = useCreateDictionaryAiDraftMutation();
  const validationState = validateReferenceEntryDraft({
    draft,
    locale,
    copy: copy.validation
  });
  const canSubmit = validationState.canSubmit;
  const visibleFieldErrors = resolveReferenceEntryVisibleFieldErrors({
    fieldErrors: validationState.fieldErrors,
    touchedFields,
    submitAttempted
  });

  const updateDraft = (nextDraft: typeof draft) => {
    setDraft(nextDraft);
  };

  return (
    <ReferenceEntryModalView
      copy={copy}
      categories={categories}
      draft={draft}
      canSubmit={canSubmit}
      isSaving={createEntryMutation.isPending}
      isCreatingAiDraft={createAiDraftMutation.isPending}
      fieldErrors={visibleFieldErrors}
      errorMessage={createEntryMutation.isError ? copy.genericError : null}
      aiErrorMessage={createAiDraftMutation.isError ? copy.genericError : null}
      onClose={onClose}
      onDraftChange={(nextDraft, fieldName) => {
        updateDraft(nextDraft);

        if (fieldName) {
          setTouchedFields((current) => ({ ...current, [fieldName]: true }));
        }
      }}
      onCreateAiDraft={() => {
        if (createAiDraftMutation.isPending || !draft.categoryId || !draft.title.trim()) {
          return;
        }

        createAiDraftMutation
          .mutateAsync({
            categoryId: draft.categoryId,
            locale,
            title: draft.title
          })
          .then((response) => {
            setDraft((currentDraft) => ({
              ...currentDraft,
              content: response.content
            }));
            setTouchedFields((current) => ({ ...current, content: true }));
          })
          .catch(() => undefined);
      }}
      onSubmit={() => {
        setSubmitAttempted(true);

        if (!canSubmit || createEntryMutation.isPending) {
          return;
        }

        createEntryMutation
          .mutateAsync({
            ...normalizeReferenceEntryDraft(draft),
            locale
          })
          .then(onClose)
          .catch(() => undefined);
      }}
    />
  );
}
