import { useState } from "react";
import type {
  DictionaryCategoryResponse,
  DictionaryEffectiveEntryResponse,
  DictionaryLocale
} from "@elevenhouse/contracts";
import { useCreateDictionaryAiDraftMutation } from "../../../../features/dictionary/model/useCreateDictionaryAiDraftMutation";
import { useCreateDictionaryCustomEntryMutation } from "../../../../features/dictionary/model/useCreateDictionaryCustomEntryMutation";
import { useUpdateDictionaryCustomEntryMutation } from "../../../../features/dictionary/model/useUpdateDictionaryCustomEntryMutation";
import { useUpdateDictionaryPlatformEntryOverrideMutation } from "../../../../features/dictionary/model/useUpdateDictionaryPlatformEntryOverrideMutation";
import {
  createReferenceEntryDraft,
  createReferenceEntryDraftFromEntry,
  createReferenceEntryUpdatePayload,
  createReferencePlatformEntryOverridePayload,
  normalizeReferenceEntryDraft,
  resolveReferenceEntryVisibleFieldErrors,
  type ReferenceEntryDraftTouchedFields,
  validateReferenceEntryDraft
} from "../../helpers/referenceEntryDraft";
import { ReferenceEntryModalView, type ReferenceEntryModalCopy } from "./ReferenceEntryModalView";

type ReferenceEntryModalCreateMode = {
  readonly mode: "create";
  readonly selectedCategoryId: string | null;
  readonly titleSeed: string;
};

type ReferenceEntryModalEditMode = {
  readonly mode: "edit";
  readonly entry: DictionaryEffectiveEntryResponse;
};

export type ReferenceEntryModalProps = {
  readonly copy: ReferenceEntryModalCopy;
  readonly categories: DictionaryCategoryResponse[];
  readonly locale: DictionaryLocale;
  readonly onClose: () => void;
} & (ReferenceEntryModalCreateMode | ReferenceEntryModalEditMode);

export function ReferenceEntryModal(props: ReferenceEntryModalProps) {
  const { copy, categories, locale, onClose } = props;
  const [draft, setDraft] = useState(() =>
    props.mode === "edit"
      ? createReferenceEntryDraftFromEntry(props.entry)
      : createReferenceEntryDraft({
          categories,
          selectedCategoryId: props.selectedCategoryId,
          titleSeed: props.titleSeed
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
  const updateCustomEntryMutation = useUpdateDictionaryCustomEntryMutation();
  const updatePlatformEntryMutation = useUpdateDictionaryPlatformEntryOverrideMutation();
  const isSaving =
    createEntryMutation.isPending ||
    updateCustomEntryMutation.isPending ||
    updatePlatformEntryMutation.isPending;
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
      copy={{
        ...copy,
        title: props.mode === "edit" ? copy.editTitle : copy.createTitle,
        closeLabel: props.mode === "edit" ? copy.editCloseLabel : copy.createCloseLabel
      }}
      categories={categories}
      draft={draft}
      isCategoryEditable={props.mode === "create" || props.entry.source === "custom"}
      canSubmit={canSubmit}
      isSaving={isSaving}
      isCreatingAiDraft={createAiDraftMutation.isPending}
      fieldErrors={visibleFieldErrors}
      errorMessage={
        createEntryMutation.isError ||
        updateCustomEntryMutation.isError ||
        updatePlatformEntryMutation.isError
          ? copy.genericError
          : null
      }
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

        if (!canSubmit || isSaving) {
          return;
        }

        if (props.mode === "create") {
          createEntryMutation
            .mutateAsync({
              ...normalizeReferenceEntryDraft(draft),
              locale
            })
            .then(onClose)
            .catch(() => undefined);
          return;
        }

        if (props.entry.source === "custom") {
          const entryId = props.entry.astrologerEntryId ?? props.entry.id;

          updateCustomEntryMutation
            .mutateAsync({
              entryId,
              ...createReferenceEntryUpdatePayload(draft)
            })
            .then(onClose)
            .catch(() => undefined);
          return;
        }

        if (props.entry.platformEntryId) {
          updatePlatformEntryMutation
            .mutateAsync({
              platformEntryId: props.entry.platformEntryId,
              ...createReferencePlatformEntryOverridePayload(draft)
            })
            .then(onClose)
            .catch(() => undefined);
        }
      }}
    />
  );
}
