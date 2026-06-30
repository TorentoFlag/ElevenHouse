export class DictionaryPlatformEntryNotFoundError extends Error {
  constructor(readonly platformEntryId: string) {
    super("Dictionary platform entry not found");
    this.name = "DictionaryPlatformEntryNotFoundError";
  }
}

export class DictionaryCategoryNotFoundError extends Error {
  constructor(readonly categoryId: string) {
    super("Dictionary category not found");
    this.name = "DictionaryCategoryNotFoundError";
  }
}
