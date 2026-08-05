import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingVersion,
  readOwnDataDiscriminator
} from "./posting-codec";

export type ProviderFeeType = "acquiring" | "chargeback_processing";

type ConfirmedBase = Readonly<{
  kind: "provider_fee_confirmed_fact";
  schemaVersion: 1;
  providerFeeId: string;
  version: number;
  feeType: ProviderFeeType;
  arcProviderAccountId: string;
  amount: Money;
  occurredAt: string;
  observedAt: string;
  integrityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type ProviderFeeConfirmedFact =
  | (ConfirmedBase & Readonly<{ feeType: "acquiring"; providerPaymentId: string }>)
  | (ConfirmedBase & Readonly<{ feeType: "chargeback_processing"; chargebackCaseId: string }>);

export type ProviderFeeOriginalRef = Readonly<{
  providerFeeId: string;
  version: number;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

type ReturnedBase = Readonly<{
  kind: "provider_fee_returned_fact";
  schemaVersion: 1;
  providerFeeReturnId: string;
  version: number;
  feeType: ProviderFeeType;
  arcProviderAccountId: string;
  originalFeeRef: ProviderFeeOriginalRef;
  amount: Money;
  occurredAt: string;
  observedAt: string;
  integrityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type ProviderFeeReturnedFact =
  | (ReturnedBase & Readonly<{ feeType: "acquiring"; providerPaymentId: string }>)
  | (ReturnedBase & Readonly<{ feeType: "chargeback_processing"; chargebackCaseId: string }>);

const commonConfirmedKeys = [
  "kind",
  "schemaVersion",
  "providerFeeId",
  "version",
  "feeType",
  "arcProviderAccountId",
  "amount",
  "occurredAt",
  "observedAt",
  "integrityStatus",
  "digestPurpose",
  "canonicalDigest"
] as const;

const commonReturnedKeys = [
  "kind",
  "schemaVersion",
  "providerFeeReturnId",
  "version",
  "feeType",
  "arcProviderAccountId",
  "originalFeeRef",
  "amount",
  "occurredAt",
  "observedAt",
  "integrityStatus",
  "digestPurpose",
  "canonicalDigest"
] as const;

export function readProviderFeeConfirmedFact(input: unknown): ProviderFeeConfirmedFact {
  const feeType = readFeeType(input);
  const fields = readExactDataRecord(input, [
    ...commonConfirmedKeys,
    feeType === "acquiring" ? "providerPaymentId" : "chargebackCaseId"
  ]);
  assertLiterals(fields, "provider_fee_confirmed_fact");
  const common = Object.freeze({
    kind: "provider_fee_confirmed_fact" as const,
    schemaVersion: 1 as const,
    providerFeeId: readFinancePostingIdentifier(fields.providerFeeId),
    version: readFinancePostingVersion(fields.version),
    feeType,
    arcProviderAccountId: readFinancePostingIdentifier(fields.arcProviderAccountId),
    amount: readFinancePostingMoney(fields.amount),
    occurredAt: readFinancePostingInstant(fields.occurredAt),
    observedAt: readFinancePostingInstant(fields.observedAt),
    integrityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const
  });
  const core =
    feeType === "acquiring"
      ? Object.freeze({
          ...common,
          feeType,
          providerPaymentId: readFinancePostingIdentifier(fields.providerPaymentId)
        })
      : Object.freeze({
          ...common,
          feeType,
          chargebackCaseId: readFinancePostingIdentifier(fields.chargebackCaseId)
        });
  return finishFact(core, fields.canonicalDigest, "evidence_mismatch");
}

export function readProviderFeeReturnedFact(input: unknown): ProviderFeeReturnedFact {
  const feeType = readFeeType(input);
  const fields = readExactDataRecord(input, [
    ...commonReturnedKeys,
    feeType === "acquiring" ? "providerPaymentId" : "chargebackCaseId"
  ]);
  assertLiterals(fields, "provider_fee_returned_fact");
  const common = Object.freeze({
    kind: "provider_fee_returned_fact" as const,
    schemaVersion: 1 as const,
    providerFeeReturnId: readFinancePostingIdentifier(fields.providerFeeReturnId),
    version: readFinancePostingVersion(fields.version),
    feeType,
    arcProviderAccountId: readFinancePostingIdentifier(fields.arcProviderAccountId),
    originalFeeRef: readOriginalRef(fields.originalFeeRef),
    amount: readFinancePostingMoney(fields.amount),
    occurredAt: readFinancePostingInstant(fields.occurredAt),
    observedAt: readFinancePostingInstant(fields.observedAt),
    integrityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const
  });
  const core =
    feeType === "acquiring"
      ? Object.freeze({
          ...common,
          feeType,
          providerPaymentId: readFinancePostingIdentifier(fields.providerPaymentId)
        })
      : Object.freeze({
          ...common,
          feeType,
          chargebackCaseId: readFinancePostingIdentifier(fields.chargebackCaseId)
        });
  return finishFact(core, fields.canonicalDigest, "evidence_mismatch");
}

export function sameProviderFeeSubject(
  left: ProviderFeeConfirmedFact | ProviderFeeReturnedFact,
  right: ProviderFeeConfirmedFact | ProviderFeeReturnedFact
): boolean {
  return left.feeType === "acquiring" && right.feeType === "acquiring"
    ? left.providerPaymentId === right.providerPaymentId
    : left.feeType === "chargeback_processing" && right.feeType === "chargeback_processing"
      ? left.chargebackCaseId === right.chargebackCaseId
      : false;
}

function readFeeType(input: unknown): ProviderFeeType {
  return readOwnDataDiscriminator(input, "feeType", [
    "acquiring",
    "chargeback_processing"
  ] as const);
}

function readOriginalRef(input: unknown): ProviderFeeOriginalRef {
  const fields = readExactDataRecord(input, ["providerFeeId", "version", "canonicalDigest"]);
  return Object.freeze({
    providerFeeId: readFinancePostingIdentifier(fields.providerFeeId),
    version: readFinancePostingVersion(fields.version),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

function assertLiterals(fields: Record<string, unknown>, kind: string): void {
  if (
    fields.kind !== kind ||
    fields.schemaVersion !== 1 ||
    fields.integrityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only"
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
}

function finishFact<T extends object>(
  core: T,
  digestInput: unknown,
  reason: "evidence_mismatch"
): T & { readonly canonicalDigest: FinanceAuthorizationPayloadHash } {
  const canonicalDigest = readFinancePostingDigest(digestInput);
  if (canonicalDigest !== hashFinanceCommandPayload(core)) {
    throw new FinancePostingIntegrityError(reason);
  }
  return Object.freeze({ ...core, canonicalDigest });
}
