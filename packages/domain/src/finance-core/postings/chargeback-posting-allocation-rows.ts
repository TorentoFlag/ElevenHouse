import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingMoney,
  readFinancePostingVersion
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import type {
  ChargebackPlatformPostingAccountCode,
  ChargebackPlatformPostingAllocation,
  ChargebackRecoveryPostingAllocation
} from "./chargeback-posting-allocation-types";
import type { FinancePostingAuthorityRef } from "./posting-types";

const platformCodes = new Set<ChargebackPlatformPostingAccountCode>([
  "platform_commission_deferred",
  "platform_commission_revenue",
  "platform_chargeback_loss"
]);

export function readChargebackRecoveryPostingAllocation(
  input: unknown
): ChargebackRecoveryPostingAllocation {
  const fields = readExactDataRecord(input, [
    "kind",
    "allocationId",
    "componentId",
    "originalSaleId",
    "payableLotId",
    "payoutRequestId",
    "payoutAllocationId",
    "amount",
    "treatmentAuthorityRef"
  ]);
  if (fields.kind !== "recovery_receivable") {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    kind: "recovery_receivable",
    allocationId: readFinancePostingIdentifier(fields.allocationId),
    componentId: readFinancePostingIdentifier(fields.componentId),
    originalSaleId: readFinancePostingIdentifier(fields.originalSaleId),
    payableLotId: readFinancePostingIdentifier(fields.payableLotId),
    payoutRequestId: readFinancePostingIdentifier(fields.payoutRequestId),
    payoutAllocationId: readFinancePostingIdentifier(fields.payoutAllocationId),
    amount: readFinancePostingMoney(fields.amount),
    treatmentAuthorityRef: readTreatmentAuthorityRef(
      fields.treatmentAuthorityRef,
      "chargeback_recovery_treatment"
    ) as ChargebackRecoveryPostingAllocation["treatmentAuthorityRef"]
  });
}

export function readChargebackPlatformPostingAllocation(
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): ChargebackPlatformPostingAllocation {
  const fields = readExactDataRecord(input, [
    "kind",
    "allocationId",
    "componentId",
    "originalSaleId",
    "accountCode",
    "amount",
    "originalJournalEntry",
    "treatmentAuthorityRef"
  ]);
  if (fields.kind !== "platform_component" || !platformCodes.has(fields.accountCode as never)) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const accountCode = fields.accountCode as ChargebackPlatformPostingAccountCode;
  const core = Object.freeze({
    kind: "platform_component",
    allocationId: readFinancePostingIdentifier(fields.allocationId),
    componentId: readFinancePostingIdentifier(fields.componentId),
    originalSaleId: readFinancePostingIdentifier(fields.originalSaleId),
    accountCode,
    amount: readFinancePostingMoney(fields.amount)
  });
  if (accountCode === "platform_chargeback_loss") {
    if (fields.originalJournalEntry !== null) {
      throw new FinancePostingIntegrityError("authority_mismatch");
    }
    return Object.freeze({
      ...core,
      accountCode,
      originalJournalEntry: null,
      treatmentAuthorityRef: readTreatmentAuthorityRef(
        fields.treatmentAuthorityRef,
        "chargeback_platform_loss_treatment"
      ) as Extract<
        ChargebackPlatformPostingAllocation,
        { accountCode: "platform_chargeback_loss" }
      >["treatmentAuthorityRef"]
    });
  }
  if (fields.originalJournalEntry === null) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    ...core,
    accountCode,
    originalJournalEntry: readOriginalJournalEntry(fields.originalJournalEntry, envelope),
    treatmentAuthorityRef: readTreatmentAuthorityRef(
      fields.treatmentAuthorityRef,
      "chargeback_component_reversal"
    ) as Extract<
      ChargebackPlatformPostingAllocation,
      { accountCode: "platform_commission_deferred" | "platform_commission_revenue" }
    >["treatmentAuthorityRef"]
  });
}

function readTreatmentAuthorityRef(
  input: unknown,
  expectedKind: FinancePostingAuthorityRef["kind"]
): FinancePostingAuthorityRef {
  const fields = readExactDataRecord(input, ["kind", "authorityId", "version", "canonicalDigest"]);
  if (fields.kind !== expectedKind) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  return Object.freeze({
    kind: expectedKind,
    authorityId: readFinancePostingIdentifier(fields.authorityId),
    version: readFinancePostingVersion(fields.version),
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}

function readOriginalJournalEntry(input: unknown, envelope: FinancePostingDecoderEnvelope) {
  const fields = readExactDataRecord(input, ["transactionId", "entryIndex", "canonicalDigest"]);
  if (
    !Number.isSafeInteger(fields.entryIndex) ||
    (fields.entryIndex as number) < 0 ||
    (fields.entryIndex as number) >= envelope.maxJournalEntries
  ) {
    throw new FinancePostingIntegrityError("decoder_envelope_exceeded");
  }
  return Object.freeze({
    transactionId: readFinancePostingIdentifier(fields.transactionId),
    entryIndex: fields.entryIndex as number,
    canonicalDigest: readFinancePostingDigest(fields.canonicalDigest)
  });
}
