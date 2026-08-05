import type { SavedCardDisclosure } from "../saved-card-disclosure-authority";

/** Card-setup orchestration may read only a sealed localized disclosure, never admin drafts. */
export type SavedCardDisclosureReaderPort = Readonly<{
  findPublishedDisclosure(input: Readonly<{
    disclosureSeriesId: string;
    locale: "ru" | "en";
  }>): Promise<SavedCardDisclosure | null>;
}>;
