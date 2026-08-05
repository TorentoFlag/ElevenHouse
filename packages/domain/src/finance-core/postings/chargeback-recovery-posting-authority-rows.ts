import { readChargebackUnsignedMoney } from "./chargeback-posting-value-codec";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingVersion
} from "./posting-codec";
import type {
  ChargebackRecoveryExposure,
  ChargebackResolvedAllocationRef
} from "./chargeback-recovery-posting-types";

export function readRecoveryAllocationRef(input: unknown): ChargebackResolvedAllocationRef {
  const value = readExactDataRecord(input, [
    "kind",
    "authorityId",
    "accountingAllocationId",
    "version",
    "nextAllocatedPrincipal",
    "canonicalDigest",
    "journalTransactionId",
    "journalDigest"
  ]);
  if (value.kind !== "chargeback_principal_posting_allocation") mismatch();
  return Object.freeze({
    kind: "chargeback_principal_posting_allocation",
    authorityId: readFinancePostingIdentifier(value.authorityId),
    accountingAllocationId: readFinancePostingIdentifier(value.accountingAllocationId),
    version: readFinancePostingVersion(value.version),
    nextAllocatedPrincipal: readChargebackUnsignedMoney(value.nextAllocatedPrincipal),
    canonicalDigest: readFinancePostingDigest(value.canonicalDigest),
    journalTransactionId: readFinancePostingIdentifier(value.journalTransactionId),
    journalDigest: readFinancePostingDigest(value.journalDigest)
  });
}

export function readRecoveryExposure(input: unknown): ChargebackRecoveryExposure {
  const value = readExactDataRecord(input, [
    "exposureId",
    "originalComponentId",
    "originalSaleId",
    "payableLotId",
    "payoutAllocationId",
    "sourceCapacity",
    "allocatedAmount",
    "priorCollectedAmount",
    "collectionDelta",
    "nextCollectedAmount"
  ]);
  return Object.freeze({
    exposureId: readFinancePostingIdentifier(value.exposureId),
    originalComponentId: readFinancePostingIdentifier(value.originalComponentId),
    originalSaleId: readFinancePostingIdentifier(value.originalSaleId),
    payableLotId: readFinancePostingIdentifier(value.payableLotId),
    payoutAllocationId: readFinancePostingIdentifier(value.payoutAllocationId),
    sourceCapacity: readChargebackUnsignedMoney(value.sourceCapacity),
    allocatedAmount: readChargebackUnsignedMoney(value.allocatedAmount),
    priorCollectedAmount: readChargebackUnsignedMoney(value.priorCollectedAmount),
    collectionDelta: readChargebackUnsignedMoney(value.collectionDelta),
    nextCollectedAmount: readChargebackUnsignedMoney(value.nextCollectedAmount)
  });
}

export function readRecoveryProviderRef(input: unknown) {
  const value = readExactDataRecord(input, ["kind", "bindingId", "version", "canonicalDigest"]);
  if (value.kind !== "unverified_chargeback_provider_evidence_binding") mismatch();
  return Object.freeze({
    kind: value.kind,
    bindingId: readFinancePostingIdentifier(value.bindingId),
    version: readFinancePostingVersion(value.version),
    canonicalDigest: readFinancePostingDigest(value.canonicalDigest)
  });
}

export function readRecoveryPriorRef(input: unknown) {
  if (input === null) return null;
  const value = readExactDataRecord(input, ["kind", "authorityId", "version", "canonicalDigest"]);
  if (value.kind !== "chargeback_recovery_posting_allocation") mismatch();
  return Object.freeze({
    kind: value.kind,
    authorityId: readFinancePostingIdentifier(value.authorityId),
    version: readFinancePostingVersion(value.version),
    canonicalDigest: readFinancePostingDigest(value.canonicalDigest)
  });
}

export function readRecoveryOutcomeRef(input: unknown) {
  if (input === null) return null;
  const value = readExactDataRecord(input, [
    "kind",
    "evidenceId",
    "version",
    "outcome",
    "canonicalDigest"
  ]);
  if (
    value.kind !== "unverified_chargeback_outcome_evidence_binding" ||
    (value.outcome !== "won" && value.outcome !== "lost")
  )
    mismatch();
  return Object.freeze({
    kind: value.kind,
    evidenceId: readFinancePostingIdentifier(value.evidenceId),
    version: readFinancePostingVersion(value.version),
    outcome: value.outcome,
    canonicalDigest: readFinancePostingDigest(value.canonicalDigest)
  });
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
