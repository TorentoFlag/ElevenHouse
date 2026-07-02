import type { DictionaryCategoryResponse } from "@elevenhouse/contracts";

export type ReferenceEntryDraft = {
  readonly categoryId: string;
  readonly title: string;
  readonly content: string;
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

export function isReferenceEntryDraftSubmittable(draft: ReferenceEntryDraft): boolean {
  return Boolean(draft.categoryId && draft.title.trim() && draft.content.trim());
}

export function normalizeReferenceEntryDraft(draft: ReferenceEntryDraft): ReferenceEntryDraft {
  return {
    categoryId: draft.categoryId,
    title: draft.title.trim(),
    content: draft.content.trim()
  };
}

export function createReferenceEntryAiDraft({
  title,
  template
}: {
  readonly title: string;
  readonly template: string;
}): string {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    return "";
  }

  return template.replace("{title}", normalizedTitle);
}
