import {
  createChargebackLostAuthority,
  createChargebackRecoveryCollectionAuthority,
  createChargebackWonAuthority
} from "../source-lot-codec-authority";
import type {
  ChargebackLostAuthority,
  ChargebackRecoveryCollectionAuthority,
  ChargebackRecoveryCollectionSource,
  ChargebackWonAuthority
} from "../source-lot-types";
import {
  readExactDataRecord,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingVersion,
  readOwnDataDiscriminator
} from "./posting-codec";
import { readChargebackUnsignedMoney } from "./chargeback-posting-value-codec";

export function readChargebackRecoverySourceAuthority(
  input: unknown
): ChargebackRecoveryCollectionAuthority {
  const fields = readExactDataRecord(input, [
    "kind",
    "authorityId",
    "version",
    "recoveryCollectionId",
    "chargebackCaseId",
    "astrologerUserId",
    "collectionSource",
    "collectedPayableAmount",
    "accountingAllocationId",
    "accountingAllocationVersion",
    "allocationStatus",
    "canonicalEvidenceId",
    "collectedAt"
  ]);
  return createChargebackRecoveryCollectionAuthority({
    kind: "chargeback_recovery_collection",
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    recoveryCollectionId: readFinancePostingIdentifier(fields.recoveryCollectionId),
    chargebackCaseId: readFinancePostingIdentifier(fields.chargebackCaseId),
    astrologerUserId: readFinancePostingIdentifier(fields.astrologerUserId),
    collectionSource: readCollectionSource(fields.collectionSource),
    collectedPayableAmount: readChargebackUnsignedMoney(fields.collectedPayableAmount),
    accountingAllocationId: readFinancePostingIdentifier(fields.accountingAllocationId),
    accountingAllocationVersion: readFinancePostingVersion(fields.accountingAllocationVersion),
    allocationStatus: fields.allocationStatus,
    canonicalEvidenceId: readFinancePostingIdentifier(fields.canonicalEvidenceId),
    collectedAt: readFinancePostingInstant(fields.collectedAt)
  });
}

export function readChargebackWonSourceAuthority(input: unknown): ChargebackWonAuthority {
  const fields = readExactDataRecord(input, [
    "kind",
    "authorityId",
    "version",
    "chargebackCaseId",
    "restoredPayableAmount",
    "suspenseClearedAmount",
    "accountingAllocationId",
    "accountingAllocationVersion",
    "allocationStatus",
    "canonicalEvidenceId",
    "wonAt"
  ]);
  return createChargebackWonAuthority({
    kind: "chargeback_won",
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    chargebackCaseId: readFinancePostingIdentifier(fields.chargebackCaseId),
    restoredPayableAmount: readChargebackUnsignedMoney(fields.restoredPayableAmount),
    suspenseClearedAmount: readChargebackUnsignedMoney(fields.suspenseClearedAmount),
    accountingAllocationId: readFinancePostingIdentifier(fields.accountingAllocationId),
    accountingAllocationVersion: readFinancePostingVersion(fields.accountingAllocationVersion),
    allocationStatus: fields.allocationStatus,
    canonicalEvidenceId: readFinancePostingIdentifier(fields.canonicalEvidenceId),
    wonAt: readFinancePostingInstant(fields.wonAt)
  });
}

export function readChargebackLostSourceAuthority(input: unknown): ChargebackLostAuthority {
  const fields = readExactDataRecord(input, [
    "kind",
    "authorityId",
    "version",
    "chargebackCaseId",
    "unallocatedSuspense",
    "accountingAllocationId",
    "accountingAllocationVersion",
    "allocationStatus",
    "canonicalEvidenceId",
    "lostAt"
  ]);
  return createChargebackLostAuthority({
    kind: "chargeback_lost",
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    chargebackCaseId: readFinancePostingIdentifier(fields.chargebackCaseId),
    unallocatedSuspense: readChargebackUnsignedMoney(fields.unallocatedSuspense),
    accountingAllocationId: readFinancePostingIdentifier(fields.accountingAllocationId),
    accountingAllocationVersion: readFinancePostingVersion(fields.accountingAllocationVersion),
    allocationStatus: fields.allocationStatus,
    canonicalEvidenceId: readFinancePostingIdentifier(fields.canonicalEvidenceId),
    lostAt: readFinancePostingInstant(fields.lostAt)
  });
}

function readCollectionSource(input: unknown): ChargebackRecoveryCollectionSource {
  const kind = readOwnDataDiscriminator(input, "kind", ["future_payable", "returned_payout"]);
  if (kind === "future_payable") {
    const fields = readExactDataRecord(input, ["kind", "sourceOrderId"]);
    return Object.freeze({
      kind,
      sourceOrderId: readFinancePostingIdentifier(fields.sourceOrderId)
    });
  }
  const fields = readExactDataRecord(input, [
    "kind",
    "sourceOrderId",
    "payoutRequestId",
    "payoutAllocationId",
    "payoutReturnAuthorityId",
    "payoutReturnAuthorityVersion",
    "payoutReturnEvidenceId"
  ]);
  return Object.freeze({
    kind,
    sourceOrderId: readFinancePostingIdentifier(fields.sourceOrderId),
    payoutRequestId: readFinancePostingIdentifier(fields.payoutRequestId),
    payoutAllocationId: readFinancePostingIdentifier(fields.payoutAllocationId),
    payoutReturnAuthorityId: readFinancePostingIdentifier(fields.payoutReturnAuthorityId),
    payoutReturnAuthorityVersion: readFinancePostingVersion(fields.payoutReturnAuthorityVersion),
    payoutReturnEvidenceId: readFinancePostingIdentifier(fields.payoutReturnEvidenceId)
  });
}
