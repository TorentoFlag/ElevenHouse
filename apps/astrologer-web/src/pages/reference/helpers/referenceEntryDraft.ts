import {
  createDictionaryCustomEntryRequestSchema,
  dictionaryContentMaxLength,
  dictionaryTitleMaxLength,
  type DictionaryCategoryResponse,
  type DictionaryEffectiveEntryResponse,
  type DictionaryLocale
} from "@elevenhouse/contracts";

export type ReferenceEntryDraft = {
  readonly categoryId: string;
  readonly title: string;
  readonly content: string;
};

export type ReferenceEntryDraftFieldErrors = {
  readonly categoryId?: string;
  readonly title?: string;
  readonly content?: string;
};

export type ReferenceEntryDraftTouchedFields = {
  readonly categoryId: boolean;
  readonly title: boolean;
  readonly content: boolean;
};

export type ReferenceEntryDraftValidationCopy = {
  readonly categoryRequired: string;
  readonly titleRequired: string;
  readonly titleMaxLength: string;
  readonly contentRequired: string;
  readonly contentMaxLength: string;
};

export function createReferenceEntryDraft({
  categories,
  selectedCategoryId,
  titleSeed
}: {
  readonly categories: DictionaryCategoryResponse[];
  readonly selectedCategoryId: string | null;
  readonly titleSeed: string;
}): ReferenceEntryDraft {
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);

  return {
    categoryId: (selectedCategory ?? categories[0])?.id ?? "",
    title: titleSeed.trim(),
    content: ""
  };
}

export function isReferenceEntryDraftSubmittable({
  draft,
  locale
}: {
  readonly draft: ReferenceEntryDraft;
  readonly locale: DictionaryLocale;
}): boolean {
  return createDictionaryCustomEntryRequestSchema.safeParse({
    ...normalizeReferenceEntryDraft(draft),
    locale
  }).success;
}

export function validateReferenceEntryDraft({
  draft,
  locale,
  copy
}: {
  readonly draft: ReferenceEntryDraft;
  readonly locale: DictionaryLocale;
  readonly copy: ReferenceEntryDraftValidationCopy;
}): {
  readonly canSubmit: boolean;
  readonly fieldErrors: ReferenceEntryDraftFieldErrors;
} {
  const normalizedDraft = normalizeReferenceEntryDraft(draft);
  const result = createDictionaryCustomEntryRequestSchema.safeParse({
    ...normalizedDraft,
    locale
  });

  if (result.success) {
    return {
      canSubmit: true,
      fieldErrors: {}
    };
  }

  const invalidFields = new Set(result.error.issues.map((issue) => issue.path[0]));

  return {
    canSubmit: false,
    fieldErrors: {
      ...(invalidFields.has("categoryId") ? { categoryId: copy.categoryRequired } : {}),
      ...(invalidFields.has("title")
        ? {
            title:
              normalizedDraft.title.length === 0
                ? copy.titleRequired
                : formatValidationMessage(copy.titleMaxLength, dictionaryTitleMaxLength)
          }
        : {}),
      ...(invalidFields.has("content")
        ? {
            content:
              normalizedDraft.content.length === 0
                ? copy.contentRequired
                : formatValidationMessage(copy.contentMaxLength, dictionaryContentMaxLength)
          }
        : {})
    }
  };
}

export function resolveReferenceEntryVisibleFieldErrors({
  fieldErrors,
  touchedFields,
  submitAttempted
}: {
  readonly fieldErrors: ReferenceEntryDraftFieldErrors;
  readonly touchedFields: ReferenceEntryDraftTouchedFields;
  readonly submitAttempted: boolean;
}): ReferenceEntryDraftFieldErrors {
  if (submitAttempted) {
    return fieldErrors;
  }

  return {
    ...(touchedFields.categoryId && fieldErrors.categoryId
      ? { categoryId: fieldErrors.categoryId }
      : {}),
    ...(touchedFields.title && fieldErrors.title ? { title: fieldErrors.title } : {}),
    ...(touchedFields.content && fieldErrors.content ? { content: fieldErrors.content } : {})
  };
}

export function normalizeReferenceEntryDraft(draft: ReferenceEntryDraft): ReferenceEntryDraft {
  return {
    categoryId: draft.categoryId,
    title: draft.title.trim(),
    content: draft.content.trim()
  };
}

export function createReferenceEntryDraftFromEntry(
  entry: DictionaryEffectiveEntryResponse
): ReferenceEntryDraft {
  return {
    categoryId: entry.categoryId,
    title: entry.title,
    content: entry.content
  };
}

export function createReferenceEntryUpdatePayload(draft: ReferenceEntryDraft): ReferenceEntryDraft {
  return normalizeReferenceEntryDraft(draft);
}

export function createReferencePlatformEntryOverridePayload(draft: ReferenceEntryDraft): Pick<
  ReferenceEntryDraft,
  "title" | "content"
> {
  const normalizedDraft = normalizeReferenceEntryDraft(draft);

  return {
    title: normalizedDraft.title,
    content: normalizedDraft.content
  };
}

function formatValidationMessage(template: string, max: number): string {
  return template.replace("{max}", String(max));
}
