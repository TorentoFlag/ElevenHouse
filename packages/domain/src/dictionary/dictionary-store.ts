import type {
  DictionaryAstrologerEntry,
  DictionaryCategoryListResult,
  DictionaryEntryListResult,
  DictionaryEntrySourceFilter,
  DictionaryLocale
} from "./dictionary-types";

export type DictionaryCategoryListQuery = {
  readonly ownerUserId: string;
  readonly locale: DictionaryLocale;
};

export type DictionaryEntryListQuery = {
  readonly ownerUserId: string;
  readonly locale: DictionaryLocale;
  readonly categoryId?: string;
  readonly source: DictionaryEntrySourceFilter;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
};

export type DictionaryEntriesByCodesQuery = {
  readonly ownerUserId: string;
  readonly locale: DictionaryLocale;
  readonly codes: readonly string[];
};

export type DictionaryCustomEntryInput = {
  readonly ownerUserId: string;
  readonly categoryId: string;
  readonly code: string;
  readonly locale: DictionaryLocale;
  readonly entryType: "custom";
  readonly title: string;
  readonly content: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type DictionaryCustomEntryUpdateInput = {
  readonly ownerUserId: string;
  readonly entryId: string;
  readonly categoryId: string;
  readonly title: string;
  readonly content: string;
  readonly updatedAt: string;
};

export type DictionaryPlatformEntryOverrideInput = {
  readonly ownerUserId: string;
  readonly platformEntryId: string;
  readonly title: string;
  readonly content: string;
  readonly updatedAt: string;
};

export type DictionaryAstrologerEntryDeleteInput = {
  readonly ownerUserId: string;
  readonly entryId: string;
};

export type DictionaryAstrologerEntriesResetInput = {
  readonly ownerUserId: string;
};

export type DictionaryPlatformEntryOverrideResetInput = {
  readonly ownerUserId: string;
  readonly platformEntryId: string;
};

export type DictionaryStore = {
  readonly listCategories: (
    query: DictionaryCategoryListQuery
  ) => Promise<DictionaryCategoryListResult>;
  readonly listEntries: (query: DictionaryEntryListQuery) => Promise<DictionaryEntryListResult>;
  readonly listEntriesByCodes: (
    query: DictionaryEntriesByCodesQuery
  ) => Promise<DictionaryEntryListResult>;
  readonly createCustomEntry: (
    input: DictionaryCustomEntryInput
  ) => Promise<DictionaryAstrologerEntry>;
  readonly updateCustomEntry: (
    input: DictionaryCustomEntryUpdateInput
  ) => Promise<DictionaryAstrologerEntry>;
  readonly upsertPlatformEntryOverride: (
    input: DictionaryPlatformEntryOverrideInput
  ) => Promise<DictionaryAstrologerEntry>;
  readonly deleteAstrologerEntry: (input: DictionaryAstrologerEntryDeleteInput) => Promise<void>;
  readonly resetAstrologerEntries: (input: DictionaryAstrologerEntriesResetInput) => Promise<void>;
  readonly resetPlatformEntryOverride: (
    input: DictionaryPlatformEntryOverrideResetInput
  ) => Promise<void>;
};
