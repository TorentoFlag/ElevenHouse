import type {
  DictionaryAstrologerEntry,
  DictionaryCategoryListResult,
  DictionaryEntryListResult
} from "./dictionary-types";
import {
  normalizeDictionaryEntrySourceFilter,
  normalizeDictionaryLocale
} from "./dictionary-normalization";
import { normalizeOptionalString, normalizeRequiredString } from "../shared";
import type { DictionaryStore } from "./dictionary-store";

export function listDictionaryCategories(input: {
  readonly store: DictionaryStore;
  readonly ownerUserId: string;
  readonly locale: string;
}): Promise<DictionaryCategoryListResult> {
  return input.store.listCategories({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Dictionary owner user id is required"),
    locale: normalizeDictionaryLocale(input.locale)
  });
}

export function listDictionaryEntries(input: {
  readonly store: DictionaryStore;
  readonly ownerUserId: string;
  readonly locale: string;
  readonly categoryId?: string;
  readonly source?: string;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}): Promise<DictionaryEntryListResult> {
  const query = {
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Dictionary owner user id is required"),
    locale: normalizeDictionaryLocale(input.locale),
    source: normalizeDictionaryEntrySourceFilter(input.source),
    categoryId: normalizeOptionalString(input.categoryId),
    search: normalizeOptionalString(input.search),
    limit: input.limit,
    offset: input.offset
  };

  return input.store.listEntries(query);
}

export function createDictionaryCustomEntry(input: {
  readonly store: DictionaryStore;
  readonly ownerUserId: string;
  readonly categoryId: string;
  readonly code: string;
  readonly locale: string;
  readonly title: string;
  readonly content: string;
  readonly now: Date;
}): Promise<DictionaryAstrologerEntry> {
  const now = input.now.toISOString();

  return input.store.createCustomEntry({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Dictionary owner user id is required"),
    categoryId: normalizeRequiredString(input.categoryId, "Dictionary category id is required"),
    code: normalizeRequiredString(input.code, "Dictionary entry code is required"),
    locale: normalizeDictionaryLocale(input.locale),
    entryType: "custom",
    title: normalizeRequiredString(input.title, "Dictionary entry title is required"),
    content: normalizeRequiredString(input.content, "Dictionary entry content is required"),
    createdAt: now,
    updatedAt: now
  });
}

export function overrideDictionaryPlatformEntry(input: {
  readonly store: DictionaryStore;
  readonly ownerUserId: string;
  readonly platformEntryId: string;
  readonly title: string;
  readonly content: string;
  readonly now: Date;
}): Promise<DictionaryAstrologerEntry> {
  return input.store.upsertPlatformEntryOverride({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Dictionary owner user id is required"),
    platformEntryId: normalizeRequiredString(
      input.platformEntryId,
      "Dictionary platform entry id is required"
    ),
    title: normalizeRequiredString(input.title, "Dictionary entry title is required"),
    content: normalizeRequiredString(input.content, "Dictionary entry content is required"),
    updatedAt: input.now.toISOString()
  });
}

export function deleteDictionaryAstrologerEntry(input: {
  readonly store: DictionaryStore;
  readonly ownerUserId: string;
  readonly entryId: string;
}): Promise<void> {
  return input.store.deleteAstrologerEntry({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Dictionary owner user id is required"),
    entryId: normalizeRequiredString(input.entryId, "Dictionary astrologer entry id is required")
  });
}

export function resetDictionaryPlatformEntryOverride(input: {
  readonly store: DictionaryStore;
  readonly ownerUserId: string;
  readonly platformEntryId: string;
}): Promise<void> {
  return input.store.resetPlatformEntryOverride({
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Dictionary owner user id is required"),
    platformEntryId: normalizeRequiredString(
      input.platformEntryId,
      "Dictionary platform entry id is required"
    )
  });
}
