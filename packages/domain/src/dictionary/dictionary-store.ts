import type {
  DictionaryAstrologerEntry,
  DictionaryCategory,
  DictionaryEntryListResult,
  DictionaryEntrySourceFilter,
  DictionaryLocale
} from "./dictionary-types";

export type DictionaryEntryListQuery = {
  readonly ownerUserId: string;
  readonly locale: DictionaryLocale;
  readonly categoryId?: string;
  readonly source: DictionaryEntrySourceFilter;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
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

export type DictionaryPlatformEntryOverrideResetInput = {
  readonly ownerUserId: string;
  readonly platformEntryId: string;
};

export type DictionaryStore = {
  readonly listCategories: () => Promise<readonly DictionaryCategory[]>;
  readonly listEntries: (query: DictionaryEntryListQuery) => Promise<DictionaryEntryListResult>;
  readonly createCustomEntry: (
    input: DictionaryCustomEntryInput
  ) => Promise<DictionaryAstrologerEntry>;
  readonly upsertPlatformEntryOverride: (
    input: DictionaryPlatformEntryOverrideInput
  ) => Promise<DictionaryAstrologerEntry>;
  readonly deleteAstrologerEntry: (input: DictionaryAstrologerEntryDeleteInput) => Promise<void>;
  readonly resetPlatformEntryOverride: (
    input: DictionaryPlatformEntryOverrideResetInput
  ) => Promise<void>;
};
