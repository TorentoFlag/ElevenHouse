import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingVersion,
  readOwnDataDiscriminator
} from "./posting-codec";
import { readChargebackUnsignedMoney } from "./chargeback-posting-value-codec";
import {
  readPositionAuthorityRef,
  readUnverifiedChargebackTreatmentDecision
} from "./chargeback-principal-position-authority";
import type {
  ChargebackPaidRecoveryPosition,
  ChargebackPlatformCommissionPosition,
  ChargebackPlatformLossPosition
} from "./chargeback-principal-position-types";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";

export function readChargebackPaidRecoveryPosition(input: unknown): ChargebackPaidRecoveryPosition {
  const fields = readExactDataRecord(input, [
    "kind",
    "positionId",
    "originalSaleId",
    "componentId",
    "payableLotId",
    "payoutRequestId",
    "payoutAllocationId",
    "sourceCapacity",
    "consumedBefore",
    "currentDelta",
    "consumedAfter",
    "remainingAfter",
    "paidEvidence",
    "treatmentDecision"
  ]);
  if (fields.kind !== "paid_recovery") mismatch();
  const evidence = readExactDataRecord(fields.paidEvidence, [
    "payoutPaidAuthorityId",
    "payoutPaidAuthorityVersion",
    "payoutPaidAuthorityDigest",
    "operationReceiptId",
    "operationReceiptDigest",
    "journalTransactionId",
    "journalTransactionDigest",
    "bankReference",
    "transferredAt"
  ]);
  return Object.freeze({
    kind: "paid_recovery",
    positionId: readFinancePostingIdentifier(fields.positionId),
    originalSaleId: readFinancePostingIdentifier(fields.originalSaleId),
    componentId: readFinancePostingIdentifier(fields.componentId),
    payableLotId: readFinancePostingIdentifier(fields.payableLotId),
    payoutRequestId: readFinancePostingIdentifier(fields.payoutRequestId),
    payoutAllocationId: readFinancePostingIdentifier(fields.payoutAllocationId),
    sourceCapacity: readChargebackUnsignedMoney(fields.sourceCapacity),
    consumedBefore: readChargebackUnsignedMoney(fields.consumedBefore),
    currentDelta: readChargebackUnsignedMoney(fields.currentDelta),
    consumedAfter: readChargebackUnsignedMoney(fields.consumedAfter),
    remainingAfter: readChargebackUnsignedMoney(fields.remainingAfter),
    paidEvidence: Object.freeze({
      payoutPaidAuthorityId: readFinancePostingIdentifier(evidence.payoutPaidAuthorityId),
      payoutPaidAuthorityVersion: readFinancePostingVersion(evidence.payoutPaidAuthorityVersion),
      payoutPaidAuthorityDigest: readFinancePostingDigest(evidence.payoutPaidAuthorityDigest),
      operationReceiptId: readFinancePostingIdentifier(evidence.operationReceiptId),
      operationReceiptDigest: readFinancePostingDigest(evidence.operationReceiptDigest),
      journalTransactionId: readFinancePostingIdentifier(evidence.journalTransactionId),
      journalTransactionDigest: readFinancePostingDigest(evidence.journalTransactionDigest),
      bankReference: readFinancePostingIdentifier(evidence.bankReference),
      transferredAt: readFinancePostingInstant(evidence.transferredAt)
    }),
    treatmentDecision: readUnverifiedChargebackTreatmentDecision(fields.treatmentDecision)
  });
}

export function readChargebackPlatformPosition(
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): ChargebackPlatformCommissionPosition | ChargebackPlatformLossPosition {
  const kind = readOwnDataDiscriminator(input, "kind", [
    "platform_commission_reversal",
    "platform_loss"
  ] as const);
  if (kind === "platform_loss") return readPlatformLoss(input);
  const fields = readExactDataRecord(input, [
    "kind",
    "positionId",
    "originalSaleId",
    "componentId",
    "debitAccount",
    "originalJournalEntry",
    "originalCommissionAmount",
    "deferredRemainingBefore",
    "revenueRemainingBefore",
    "reversedBefore",
    "currentDelta",
    "deferredRemainingAfter",
    "revenueRemainingAfter",
    "reversedAfter",
    "ledgerPositionAuthorityRef"
  ]);
  if (
    fields.debitAccount !== "platform_commission_deferred" &&
    fields.debitAccount !== "platform_commission_revenue"
  ) {
    mismatch();
  }
  const journal = readExactDataRecord(fields.originalJournalEntry, [
    "transactionId",
    "entryIndex",
    "canonicalDigest"
  ]);
  if (
    !Number.isSafeInteger(journal.entryIndex) ||
    (journal.entryIndex as number) < 0 ||
    (journal.entryIndex as number) >= envelope.maxJournalEntries
  ) {
    throw new FinancePostingIntegrityError("decoder_envelope_exceeded");
  }
  return Object.freeze({
    kind: "platform_commission_reversal",
    positionId: readFinancePostingIdentifier(fields.positionId),
    originalSaleId: readFinancePostingIdentifier(fields.originalSaleId),
    componentId: readFinancePostingIdentifier(fields.componentId),
    debitAccount: fields.debitAccount,
    originalJournalEntry: Object.freeze({
      transactionId: readFinancePostingIdentifier(journal.transactionId),
      entryIndex: journal.entryIndex as number,
      canonicalDigest: readFinancePostingDigest(journal.canonicalDigest)
    }),
    originalCommissionAmount: readChargebackUnsignedMoney(fields.originalCommissionAmount),
    deferredRemainingBefore: readChargebackUnsignedMoney(fields.deferredRemainingBefore),
    revenueRemainingBefore: readChargebackUnsignedMoney(fields.revenueRemainingBefore),
    reversedBefore: readChargebackUnsignedMoney(fields.reversedBefore),
    currentDelta: readChargebackUnsignedMoney(fields.currentDelta),
    deferredRemainingAfter: readChargebackUnsignedMoney(fields.deferredRemainingAfter),
    revenueRemainingAfter: readChargebackUnsignedMoney(fields.revenueRemainingAfter),
    reversedAfter: readChargebackUnsignedMoney(fields.reversedAfter),
    ledgerPositionAuthorityRef: readPositionAuthorityRef(fields.ledgerPositionAuthorityRef)
  });
}

function readPlatformLoss(input: unknown): ChargebackPlatformLossPosition {
  const fields = readExactDataRecord(input, [
    "kind",
    "positionId",
    "originalSaleId",
    "componentId",
    "sourceCapacity",
    "consumedBefore",
    "currentDelta",
    "consumedAfter",
    "remainingAfter",
    "treatmentDecision"
  ]);
  return Object.freeze({
    kind: "platform_loss",
    positionId: readFinancePostingIdentifier(fields.positionId),
    originalSaleId: readFinancePostingIdentifier(fields.originalSaleId),
    componentId: readFinancePostingIdentifier(fields.componentId),
    sourceCapacity: readChargebackUnsignedMoney(fields.sourceCapacity),
    consumedBefore: readChargebackUnsignedMoney(fields.consumedBefore),
    currentDelta: readChargebackUnsignedMoney(fields.currentDelta),
    consumedAfter: readChargebackUnsignedMoney(fields.consumedAfter),
    remainingAfter: readChargebackUnsignedMoney(fields.remainingAfter),
    treatmentDecision: readUnverifiedChargebackTreatmentDecision(fields.treatmentDecision)
  });
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
