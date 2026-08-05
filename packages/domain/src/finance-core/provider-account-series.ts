import {
  createArcProviderAccountIdentity,
  replaceArcProviderAccountIdentity,
  type ArcProviderAccountIdentity
} from "./provider-account";
import { readStrictOwnDataRecord } from "./strict-own-data";

export type ArcProviderAccountSeriesState = Readonly<{
  seriesId: string;
  version: number;
  current: ArcProviderAccountIdentity;
  predecessorProviderAccountId: string | null;
}>;

export type ArcProviderAccountReplacementLink = Readonly<{
  seriesId: string;
  predecessorProviderAccountId: string;
  predecessorIdentityVersion: number;
  replacementProviderAccountId: string;
  replacementIdentityVersion: number;
  previousSeriesVersion: number;
  nextSeriesVersion: number;
}>;

export type ArcProviderAccountSeriesReplacement = Readonly<{
  state: ArcProviderAccountSeriesState;
  link: ArcProviderAccountReplacementLink;
}>;

export type ArcProviderAccountSeriesIntegrityReason =
  | "invalid_shape"
  | "invalid_field"
  | "initial_identity_version_invalid"
  | "series_version_conflict"
  | "current_identity_conflict"
  | "replacement_identity_invalid";

export class ArcProviderAccountSeriesIntegrityError extends Error {
  readonly code = "arc_provider_account_series_integrity_violation";

  constructor(readonly reason: ArcProviderAccountSeriesIntegrityReason) {
    super("ArcPay provider-account series is invalid");
    this.name = "ArcProviderAccountSeriesIntegrityError";
  }
}

export function createArcProviderAccountSeries(input: unknown): ArcProviderAccountSeriesState {
  const fields = exactDataRecord(input, ["seriesId", "identity"]);
  const seriesId = identifier(fields.seriesId);
  const current = safeIdentity(fields.identity);
  if (current.identityVersion !== 1) {
    throw new ArcProviderAccountSeriesIntegrityError("initial_identity_version_invalid");
  }

  return Object.freeze({
    seriesId,
    version: 1,
    current,
    predecessorProviderAccountId: null
  });
}

export function replaceArcProviderAccountSeries(
  input: unknown
): ArcProviderAccountSeriesReplacement {
  const fields = exactDataRecord(input, [
    "current",
    "expectedSeriesVersion",
    "expectedCurrentProviderAccountId",
    "replacement"
  ]);
  const current = safeSeriesState(fields.current);
  if (fields.expectedSeriesVersion !== current.version) {
    throw new ArcProviderAccountSeriesIntegrityError("series_version_conflict");
  }
  if (fields.expectedCurrentProviderAccountId !== current.current.providerAccountId) {
    throw new ArcProviderAccountSeriesIntegrityError("current_identity_conflict");
  }

  let replacement: ArcProviderAccountIdentity;
  try {
    replacement = replaceArcProviderAccountIdentity({
      current: current.current,
      expectedIdentityVersion: current.current.identityVersion,
      replacement: fields.replacement
    });
  } catch {
    throw new ArcProviderAccountSeriesIntegrityError("replacement_identity_invalid");
  }

  const nextVersion = current.version + 1;
  if (replacement.identityVersion !== nextVersion) {
    throw new ArcProviderAccountSeriesIntegrityError("replacement_identity_invalid");
  }
  const link = Object.freeze({
    seriesId: current.seriesId,
    predecessorProviderAccountId: current.current.providerAccountId,
    predecessorIdentityVersion: current.current.identityVersion,
    replacementProviderAccountId: replacement.providerAccountId,
    replacementIdentityVersion: replacement.identityVersion,
    previousSeriesVersion: current.version,
    nextSeriesVersion: nextVersion
  });
  const state = Object.freeze({
    seriesId: current.seriesId,
    version: nextVersion,
    current: replacement,
    predecessorProviderAccountId: current.current.providerAccountId
  });

  return Object.freeze({ state, link });
}

function safeSeriesState(input: unknown): ArcProviderAccountSeriesState {
  const fields = exactDataRecord(input, [
    "seriesId",
    "version",
    "current",
    "predecessorProviderAccountId"
  ]);
  const seriesId = identifier(fields.seriesId);
  const current = safeIdentity(fields.current);
  if (
    !Number.isSafeInteger(fields.version) ||
    Number(fields.version) < 1 ||
    fields.version !== current.identityVersion
  ) {
    throw new ArcProviderAccountSeriesIntegrityError("invalid_field");
  }
  const predecessorProviderAccountId = nullableIdentifier(fields.predecessorProviderAccountId);
  if (
    (fields.version === 1 && predecessorProviderAccountId !== null) ||
    (Number(fields.version) > 1 && predecessorProviderAccountId === null) ||
    predecessorProviderAccountId === current.providerAccountId
  ) {
    throw new ArcProviderAccountSeriesIntegrityError("invalid_field");
  }
  return Object.freeze({
    seriesId,
    version: Number(fields.version),
    current,
    predecessorProviderAccountId
  });
}

function safeIdentity(value: unknown): ArcProviderAccountIdentity {
  try {
    return createArcProviderAccountIdentity(value);
  } catch {
    throw new ArcProviderAccountSeriesIntegrityError("invalid_field");
  }
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 160 ||
    value.trim() !== value
  ) {
    throw new ArcProviderAccountSeriesIntegrityError("invalid_field");
  }
  return value;
}

function nullableIdentifier(value: unknown): string | null {
  return value === null ? null : identifier(value);
}

function exactDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Readonly<Record<Keys[number], unknown>> {
  return readStrictOwnDataRecord(value, expectedKeys, () => {
    throw new ArcProviderAccountSeriesIntegrityError("invalid_shape");
  });
}
