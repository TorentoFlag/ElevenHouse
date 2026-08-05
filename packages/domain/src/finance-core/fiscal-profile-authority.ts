import {
  createFiscalProfile,
  type FiscalProfile,
  FiscalProfileIntegrityError
} from "./fiscal-profile";

export type FiscalProfileLifecycle = "draft" | "published" | "retired";

export type FiscalProfileVersion = Readonly<{
  profile: FiscalProfile;
  draftRevision: number;
  lifecycle: FiscalProfileLifecycle;
}>;

export type FiscalProfileDraftInput = Omit<FiscalProfile, "canonicalDigest">;

export class FiscalProfileAuthorityError extends Error {
  readonly code = "FINANCE_FISCAL_PROFILE_AUTHORITY_ERROR" as const;

  constructor(readonly reason: "invalid_profile" | "draft_revision_conflict" | "lifecycle_transition_invalid") {
    super("Fiscal profile authority validation failed");
    this.name = "FiscalProfileAuthorityError";
  }
}

/** Creates a mutable administrative draft; only its accounting terms are digest-bound. */
export function createFiscalProfileDraft(input: FiscalProfileDraftInput): FiscalProfileVersion {
  return createVersion(input, 1, "draft");
}

/** Draft revision is an explicit optimistic-concurrency token for administrative edits. */
export function reviseFiscalProfileDraft(input: Readonly<{
  current: FiscalProfileVersion;
  expectedDraftRevision: number;
  next: FiscalProfileDraftInput;
}>): FiscalProfileVersion {
  const current = verifyFiscalProfileVersion(input.current);
  if (
    current.lifecycle !== "draft" ||
    current.draftRevision !== input.expectedDraftRevision ||
    input.next.profileSeriesId !== current.profile.profileSeriesId ||
    input.next.version !== current.profile.version
  ) {
    fail("draft_revision_conflict");
  }
  return createVersion(input.next, current.draftRevision + 1, "draft");
}

/** Publishing seals the terms used to create fiscal charge snapshots. */
export function publishFiscalProfileDraft(draft: FiscalProfileVersion): FiscalProfileVersion {
  const verified = verifyFiscalProfileVersion(draft);
  if (verified.lifecycle !== "draft") fail("lifecycle_transition_invalid");
  return Object.freeze({ ...verified, lifecycle: "published" as const });
}

/** Retirement disables the series at persistence level; it never mutates a prior charge snapshot. */
export function retirePublishedFiscalProfileVersion(
  published: FiscalProfileVersion
): FiscalProfileVersion {
  const verified = verifyFiscalProfileVersion(published);
  if (verified.lifecycle !== "published") fail("lifecycle_transition_invalid");
  return Object.freeze({ ...verified, lifecycle: "retired" as const });
}

/** Rehydrates only a well-formed profile version; persistence supplies lifecycle timestamps and CAS. */
export function verifyFiscalProfileVersion(input: FiscalProfileVersion): FiscalProfileVersion {
  if (
    typeof input !== "object" || input === null || Array.isArray(input) ||
    (input.lifecycle !== "draft" && input.lifecycle !== "published" && input.lifecycle !== "retired") ||
    !Number.isSafeInteger(input.draftRevision) || input.draftRevision < 1
  ) {
    fail("invalid_profile");
  }
  try {
    const profile = createFiscalProfile(input.profile);
    if (profile.canonicalDigest !== input.profile.canonicalDigest) fail("invalid_profile");
    return Object.freeze({ profile, draftRevision: input.draftRevision, lifecycle: input.lifecycle });
  } catch (error) {
    if (error instanceof FiscalProfileAuthorityError) throw error;
    if (error instanceof FiscalProfileIntegrityError) fail("invalid_profile");
    throw error;
  }
}

function createVersion(
  input: FiscalProfileDraftInput,
  draftRevision: number,
  lifecycle: FiscalProfileLifecycle
): FiscalProfileVersion {
  try {
    return Object.freeze({
      profile: createFiscalProfile(input),
      draftRevision,
      lifecycle
    });
  } catch (error) {
    if (error instanceof FiscalProfileIntegrityError) fail("invalid_profile");
    throw error;
  }
}

function fail(reason: FiscalProfileAuthorityError["reason"]): never {
  throw new FiscalProfileAuthorityError(reason);
}
