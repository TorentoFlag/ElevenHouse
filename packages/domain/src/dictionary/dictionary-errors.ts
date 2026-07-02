export class DictionaryPlatformEntryNotFoundError extends Error {
  constructor(readonly platformEntryId: string) {
    super("Dictionary platform entry not found");
    this.name = "DictionaryPlatformEntryNotFoundError";
  }
}

export class DictionaryAstrologerEntryNotFoundError extends Error {
  constructor(readonly entryId: string) {
    super("Dictionary astrologer entry not found");
    this.name = "DictionaryAstrologerEntryNotFoundError";
  }
}

export class DictionaryCategoryNotFoundError extends Error {
  constructor(readonly categoryId: string) {
    super("Dictionary category not found");
    this.name = "DictionaryCategoryNotFoundError";
  }
}
