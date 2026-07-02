import { useState } from "react";
import type { DictionaryCategoryResponse, DictionaryLocale } from "@elevenhouse/contracts";
import { useCreateDictionaryAiDraftMutation } from "../../../../features/dictionary/model/useCreateDictionaryAiDraftMutation";
import { useCreateDictionaryCustomEntryMutation } from "../../../../features/dictionary/model/useCreateDictionaryCustomEntryMutation";
import {
  createReferenceEntryDraft,
  isReferenceEntryDraftSubmittable,
  normalizeReferenceEntryDraft
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
  const createEntryMutation = useCreateDictionaryCustomEntryMutation();
  const createAiDraftMutation = useCreateDictionaryAiDraftMutation();
  const canSubmit = isReferenceEntryDraftSubmittable(draft);

  return (
    <ReferenceEntryModalView
      copy={copy}
      categories={categories}
      draft={draft}
      canSubmit={canSubmit}
      isSaving={createEntryMutation.isPending}
      isCreatingAiDraft={createAiDraftMutation.isPending}
      errorMessage={createEntryMutation.isError ? copy.genericError : null}
      aiErrorMessage={createAiDraftMutation.isError ? copy.genericError : null}
      onClose={onClose}
      onDraftChange={setDraft}
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
          })
          .catch(() => undefined);
      }}
      onSubmit={() => {
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
