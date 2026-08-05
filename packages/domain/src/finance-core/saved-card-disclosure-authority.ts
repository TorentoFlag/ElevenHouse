/* eslint-disable no-control-regex -- Domain validation intentionally rejects ASCII control characters. */
import { canonicalizeFinanceCommandPayload } from "../finance-authorization/canonical-command-payload";
import { digestFinanceCanonicalValueV1 } from "./finance-canonical-digest";
import type { FinanceDigest } from "./ports/finance-port-types";

export type SavedCardDisclosureLifecycle = "draft" | "published" | "retired";

export type SavedCardDisclosure = Readonly<{
  disclosureSeriesId: string;
  version: number;
  locale: "ru" | "en";
  body: string;
  canonicalDigest: FinanceDigest;
}>;

export type SavedCardDisclosureVersion = Readonly<{
  disclosure: SavedCardDisclosure;
  draftRevision: number;
  lifecycle: SavedCardDisclosureLifecycle;
}>;

export type SavedCardDisclosureDraftInput = Omit<SavedCardDisclosure, "canonicalDigest">;

export class SavedCardDisclosureAuthorityError extends Error {
  readonly code = "FINANCE_SAVED_CARD_DISCLOSURE_AUTHORITY_ERROR" as const;

  constructor(readonly reason: "invalid_disclosure" | "draft_revision_conflict" | "lifecycle_transition_invalid") {
    super("Saved-card disclosure authority validation failed");
    this.name = "SavedCardDisclosureAuthorityError";
  }
}

export function createSavedCardDisclosureDraft(
  input: SavedCardDisclosureDraftInput
): SavedCardDisclosureVersion {
  return createVersion(input, 1, "draft");
}

export function reviseSavedCardDisclosureDraft(input: Readonly<{
  current: SavedCardDisclosureVersion;
  expectedDraftRevision: number;
  next: SavedCardDisclosureDraftInput;
}>): SavedCardDisclosureVersion {
  const current = verifySavedCardDisclosureVersion(input.current);
  if (
    current.lifecycle !== "draft" ||
    current.draftRevision !== input.expectedDraftRevision ||
    current.disclosure.disclosureSeriesId !== input.next.disclosureSeriesId ||
    current.disclosure.version !== input.next.version ||
    current.disclosure.locale !== input.next.locale
  ) {
    fail("draft_revision_conflict");
  }
  return createVersion(input.next, current.draftRevision + 1, "draft");
}

export function publishSavedCardDisclosureDraft(
  draft: SavedCardDisclosureVersion
): SavedCardDisclosureVersion {
  const verified = verifySavedCardDisclosureVersion(draft);
  if (verified.lifecycle !== "draft") fail("lifecycle_transition_invalid");
  return Object.freeze({ ...verified, lifecycle: "published" as const });
}

/** Retirement stops this exact locale from being served; consent records retain its digest. */
export function retirePublishedSavedCardDisclosure(
  published: SavedCardDisclosureVersion
): SavedCardDisclosureVersion {
  const verified = verifySavedCardDisclosureVersion(published);
  if (verified.lifecycle !== "published") fail("lifecycle_transition_invalid");
  return Object.freeze({ ...verified, lifecycle: "retired" as const });
}

export function verifySavedCardDisclosureVersion(
  input: SavedCardDisclosureVersion
): SavedCardDisclosureVersion {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    !Number.isSafeInteger(input.draftRevision) ||
    input.draftRevision < 1 ||
    !["draft", "published", "retired"].includes(input.lifecycle)
  ) {
    fail("invalid_disclosure");
  }
  const disclosure = createDisclosure(input.disclosure);
  if (disclosure.canonicalDigest !== input.disclosure.canonicalDigest) fail("invalid_disclosure");
  return Object.freeze({ disclosure, draftRevision: input.draftRevision, lifecycle: input.lifecycle });
}

export function canonicalizeSavedCardDisclosure(
  input: Omit<SavedCardDisclosure, "canonicalDigest"> | SavedCardDisclosure
): string {
  return new TextDecoder().decode(canonicalizeFinanceCommandPayload(normalizeDisclosure(input)));
}

function createVersion(
  input: SavedCardDisclosureDraftInput,
  draftRevision: number,
  lifecycle: SavedCardDisclosureLifecycle
): SavedCardDisclosureVersion {
  return Object.freeze({ disclosure: createDisclosure(input), draftRevision, lifecycle });
}

function createDisclosure(input: Omit<SavedCardDisclosure, "canonicalDigest"> | SavedCardDisclosure): SavedCardDisclosure {
  const normalized = normalizeDisclosure(input);
  return Object.freeze({ ...normalized, canonicalDigest: digestFinanceCanonicalValueV1(normalized) });
}

function normalizeDisclosure(input: Omit<SavedCardDisclosure, "canonicalDigest"> | SavedCardDisclosure) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) fail("invalid_disclosure");
  const disclosureSeriesId = identifier(input.disclosureSeriesId, 160);
  if (!Number.isSafeInteger(input.version) || input.version < 1) fail("invalid_disclosure");
  if (input.locale !== "ru" && input.locale !== "en") fail("invalid_disclosure");
  const body = text(input.body, 50_000);
  return Object.freeze({ disclosureSeriesId, version: input.version, locale: input.locale, body });
}

function identifier(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) fail("invalid_disclosure");
  return value;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > max) fail("invalid_disclosure");
  return value;
}

function fail(reason: SavedCardDisclosureAuthorityError["reason"]): never {
  throw new SavedCardDisclosureAuthorityError(reason);
}
