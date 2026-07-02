import { useState } from "react";
import type { DictionaryCategoryResponse, DictionaryLocale } from "@elevenhouse/contracts";
import { useCreateDictionaryCustomEntryMutation } from "../../../../features/dictionary/model/useCreateDictionaryCustomEntryMutation";
import {
  createReferenceEntryAiDraft,
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
  const canSubmit = isReferenceEntryDraftSubmittable(draft);

  return (
    <ReferenceEntryModalView
      copy={copy}
      categories={categories}
      draft={draft}
      canSubmit={canSubmit}
      isSaving={createEntryMutation.isPending}
      errorMessage={createEntryMutation.isError ? copy.genericError : null}
      onClose={onClose}
      onDraftChange={setDraft}
      onCreateAiDraft={() => {
        const content = createReferenceEntryAiDraft({
          title: draft.title,
          template: copy.aiDraftTemplate
        });

        if (content) {
          setDraft({ ...draft, content });
        }
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
