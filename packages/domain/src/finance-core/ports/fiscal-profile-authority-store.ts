import type {
  FiscalProfileDraftInput,
  FiscalProfileVersion
} from "../fiscal-profile-authority";

/** Administrative authority; payment paths deliberately depend only on FiscalProfileReaderPort. */
export type FiscalProfileAuthorityStore = Readonly<{
  listVersions(): Promise<readonly FiscalProfileVersion[]>;
  findVersion(input: Readonly<{
    profileSeriesId: string;
    version: number;
    canonicalDigest: `sha256:${string}`;
  }>): Promise<FiscalProfileVersion | null>;
  findVersionByIdentity(input: Readonly<{
    profileSeriesId: string;
    version: number;
  }>): Promise<FiscalProfileVersion | null>;
  createDraft(input: FiscalProfileDraftInput): Promise<FiscalProfileVersion>;
  updateDraft(input: Readonly<{
    profileSeriesId: string;
    version: number;
    expectedDraftRevision: number;
    next: FiscalProfileDraftInput;
  }>): Promise<FiscalProfileVersion>;
  publishDraft(input: Readonly<{
    profileSeriesId: string;
    version: number;
    expectedDraftRevision: number;
  }>): Promise<FiscalProfileVersion>;
  retirePublished(input: Readonly<{
    profileSeriesId: string;
    version: number;
  }>): Promise<FiscalProfileVersion>;
}>;
