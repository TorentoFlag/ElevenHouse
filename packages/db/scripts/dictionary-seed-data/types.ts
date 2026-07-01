export type DictionarySeedCategory = {
  readonly code: string;
  readonly name: string;
  readonly order: number;
};

export type DictionarySeedPlatformEntry = {
  readonly categoryCode: string;
  readonly code: string;
  readonly locale: "ru" | "en";
  readonly title: string;
  readonly content: string;
  readonly status: "published" | "archived";
};
