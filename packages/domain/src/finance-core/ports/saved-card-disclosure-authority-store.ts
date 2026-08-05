import type {
  SavedCardDisclosureDraftInput,
  SavedCardDisclosureVersion
} from "../saved-card-disclosure-authority";

/** Administrative lifecycle authority. Card-setup execution will receive a narrower published reader. */
export type SavedCardDisclosureAuthorityStore = Readonly<{
  listVersions(): Promise<readonly SavedCardDisclosureVersion[]>;
  findVersion(input: Readonly<{
    disclosureSeriesId: string;
    version: number;
    locale: "ru" | "en";
    canonicalDigest: `sha256:${string}`;
  }>): Promise<SavedCardDisclosureVersion | null>;
  findVersionByIdentity(input: Readonly<{
    disclosureSeriesId: string;
    version: number;
    locale: "ru" | "en";
  }>): Promise<SavedCardDisclosureVersion | null>;
  createDraft(input: SavedCardDisclosureDraftInput): Promise<SavedCardDisclosureVersion>;
  updateDraft(input: Readonly<{
    disclosureSeriesId: string;
    version: number;
    locale: "ru" | "en";
    expectedDraftRevision: number;
    next: SavedCardDisclosureDraftInput;
  }>): Promise<SavedCardDisclosureVersion>;
  publishDraft(input: Readonly<{
    disclosureSeriesId: string;
    version: number;
    locale: "ru" | "en";
    expectedDraftRevision: number;
  }>): Promise<SavedCardDisclosureVersion>;
  retirePublished(input: Readonly<{
    disclosureSeriesId: string;
    version: number;
    locale: "ru" | "en";
  }>): Promise<SavedCardDisclosureVersion>;
}>;
