export const dictionaryLocaleValues = ["ru", "en"] as const;
export type DictionaryLocale = (typeof dictionaryLocaleValues)[number];

export const dictionaryEntrySourceValues = ["platform", "modified", "custom"] as const;
export type DictionaryEntrySource = (typeof dictionaryEntrySourceValues)[number];
export type DictionaryEntrySourceFilter = "all" | DictionaryEntrySource;

export const dictionaryAstrologerEntryTypeValues = ["override", "custom"] as const;
export type DictionaryAstrologerEntryType = (typeof dictionaryAstrologerEntryTypeValues)[number];

export type DictionaryCategory = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly order: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type DictionaryEffectiveEntry = {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryCode: string;
  readonly code: string;
  readonly locale: DictionaryLocale;
  readonly source: DictionaryEntrySource;
  readonly title: string;
  readonly content: string;
  readonly platformEntryId?: string;
  readonly astrologerEntryId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type DictionaryEntryListResult = {
  readonly entries: readonly DictionaryEffectiveEntry[];
  readonly total: number;
};

export type DictionaryAstrologerEntry = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly platformEntryId?: string;
  readonly categoryId: string;
  readonly code: string;
  readonly locale: DictionaryLocale;
  readonly entryType: DictionaryAstrologerEntryType;
  readonly title: string;
  readonly content: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};
