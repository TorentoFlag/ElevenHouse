import {
  readRecoveryAllocationRef,
  readRecoveryOutcomeRef,
  readRecoveryProviderRef
} from "./chargeback-recovery-posting-authority-rows";
import type { ChargebackResolvedAllocationRef } from "./chargeback-recovery-posting-types";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingVersion
} from "./posting-codec";
import type { UnverifiedChargebackOutcomeEvidenceRef } from "./chargeback-resolution-outcome-evidence";
import type { ChargebackResolutionRecoveryRef } from "./chargeback-resolution-types";

export function readResolutionAllocationRef(input: unknown): ChargebackResolvedAllocationRef {
  return readRecoveryAllocationRef(input);
}

export function readResolutionProviderRef(input: unknown) {
  return readRecoveryProviderRef(input);
}

export function readResolutionOutcomeRef(input: unknown): UnverifiedChargebackOutcomeEvidenceRef {
  const value = readRecoveryOutcomeRef(input);
  if (value === null) mismatch();
  return value;
}

export function readResolutionRecoveryRef(input: unknown): ChargebackResolutionRecoveryRef {
  const value = readExactDataRecord(input, [
    "kind",
    "authorityId",
    "version",
    "canonicalDigest",
    "journalTransactionId",
    "journalDigest"
  ]);
  if (value.kind !== "chargeback_recovery_posting_allocation") mismatch();
  return Object.freeze({
    kind: value.kind,
    authorityId: readFinancePostingIdentifier(value.authorityId),
    version: readFinancePostingVersion(value.version),
    canonicalDigest: readFinancePostingDigest(value.canonicalDigest),
    journalTransactionId: readFinancePostingIdentifier(value.journalTransactionId),
    journalDigest: readFinancePostingDigest(value.journalDigest)
  });
}

export function assertResolutionCanonicalRefs(
  refs: readonly { version: number; journalTransactionId: string }[]
): void {
  if (
    refs.some((ref, index) => index > 0 && ref.version <= refs[index - 1]!.version) ||
    new Set(refs.map((ref) => ref.journalTransactionId)).size !== refs.length
  )
    mismatch();
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
