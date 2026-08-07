import { readStrictOwnDataRecord, type StrictOwnDataFailureReason } from "./strict-own-data";

export const arcProviderAccountProviderValues = ["arc_pay"] as const;

export type ArcProviderAccountProvider = (typeof arcProviderAccountProviderValues)[number];

export type ArcProviderAccountIdentity = Readonly<{
  providerAccountId: string;
  identityVersion: number;
  provider: ArcProviderAccountProvider;
  merchantTenantId: string;
  terminalScope: string;
  settlementScope: string;
}>;

export type ArcProviderAccountIntegrityReason =
  | "invalid_shape"
  | "unknown_field"
  | "invalid_field"
  | "stale_identity_version"
  | "identity_id_reused"
  | "replacement_version_invalid";

export class ArcProviderAccountIntegrityError extends Error {
  readonly code = "arc_provider_account_integrity_violation";

  constructor(readonly reason: ArcProviderAccountIntegrityReason) {
    super("ArcPay provider-account identity is invalid");
    this.name = "ArcProviderAccountIntegrityError";
  }
}

const identityKeyValues = [
  "providerAccountId",
  "identityVersion",
  "provider",
  "merchantTenantId",
  "terminalScope",
  "settlementScope"
] as const;
const replacementCommandKeyValues = ["current", "expectedIdentityVersion", "replacement"] as const;

export function createArcProviderAccountIdentity(input: unknown): ArcProviderAccountIdentity {
  const fields = readExactOwnDataObject(input, identityKeyValues);

  const providerAccountId = requireIdentityString(fields.providerAccountId);
  const merchantTenantId = requireIdentityString(fields.merchantTenantId);
  const terminalScope = requireIdentityString(fields.terminalScope);
  const settlementScope = requireIdentityString(fields.settlementScope);
  if (!Number.isSafeInteger(fields.identityVersion) || Number(fields.identityVersion) < 1) {
    throw new ArcProviderAccountIntegrityError("invalid_field");
  }
  if (fields.provider !== "arc_pay") {
    throw new ArcProviderAccountIntegrityError("invalid_field");
  }

  return Object.freeze({
    providerAccountId,
    identityVersion: Number(fields.identityVersion),
    provider: fields.provider,
    merchantTenantId,
    terminalScope,
    settlementScope
  });
}

export function replaceArcProviderAccountIdentity(input: unknown): ArcProviderAccountIdentity {
  const command = readExactOwnDataObject(input, replacementCommandKeyValues);
  const current = createArcProviderAccountIdentity(command.current);
  if (
    !Number.isSafeInteger(command.expectedIdentityVersion) ||
    command.expectedIdentityVersion !== current.identityVersion
  ) {
    throw new ArcProviderAccountIntegrityError("stale_identity_version");
  }

  const replacement = createArcProviderAccountIdentity(command.replacement);
  if (replacement.providerAccountId === current.providerAccountId) {
    throw new ArcProviderAccountIntegrityError("identity_id_reused");
  }
  if (replacement.identityVersion !== current.identityVersion + 1) {
    throw new ArcProviderAccountIntegrityError("replacement_version_invalid");
  }
  return replacement;
}

export function sameArcProviderAccountIdentity(
  left: ArcProviderAccountIdentity,
  right: ArcProviderAccountIdentity
): boolean {
  const validatedLeft = createArcProviderAccountIdentity(left);
  const validatedRight = createArcProviderAccountIdentity(right);
  return (
    validatedLeft.providerAccountId === validatedRight.providerAccountId &&
    validatedLeft.identityVersion === validatedRight.identityVersion &&
    validatedLeft.provider === validatedRight.provider &&
    validatedLeft.merchantTenantId === validatedRight.merchantTenantId &&
    validatedLeft.terminalScope === validatedRight.terminalScope &&
    validatedLeft.settlementScope === validatedRight.settlementScope
  );
}

function requireIdentityString(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value
  ) {
    throw new ArcProviderAccountIntegrityError("invalid_field");
  }
  return value;
}

function readExactOwnDataObject<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys
): Readonly<Record<Keys[number], unknown>> {
  const fields = readStrictOwnDataRecord(value, expectedKeys, providerAccountShapeFailure);
  if (
    typeof value !== "object" ||
    value === null ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new ArcProviderAccountIntegrityError("invalid_shape");
  }
  return fields;
}

function providerAccountShapeFailure(reason: StrictOwnDataFailureReason): never {
  throw new ArcProviderAccountIntegrityError(
    reason === "symbol_key" || reason === "unexpected_key" ? "unknown_field" : "invalid_shape"
  );
}
