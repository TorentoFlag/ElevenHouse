import { digestValue } from "../source-lot-operation-receipt-core";
import type { ChargebackRecoveryPostingAllocationAuthority } from "./chargeback-recovery-posting-types";
import {
  outcomeEvidenceRef,
  readUnverifiedChargebackOutcomeEvidenceBinding
} from "./chargeback-resolution-outcome-evidence";
import {
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import type { UnverifiedReceiptLinkedPostingProjection } from "./receipt-linked-posting-projection";

export function assertChargebackRecoveryOutcome(
  authority: ChargebackRecoveryPostingAllocationAuthority,
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): void {
  const reference = authority.latestOutcomeEvidenceRef;
  if (reference === null) {
    if (input !== null) mismatch("authority_mismatch");
    return;
  }
  if (input === null) mismatch("authority_mismatch");
  const evidence = readUnverifiedChargebackOutcomeEvidenceBinding(input, envelope);
  if (
    !sameCanonicalFinancePostingValue(reference, outcomeEvidenceRef(evidence)) ||
    evidence.chargebackCaseId !== authority.chargebackCaseId
  )
    mismatch("authority_mismatch");
  if (evidence.outcome === "won") mismatch("source_mismatch");
  if (compareFinancePostingInstants(authority.collectedAt, evidence.decidedAt) < 0) {
    mismatch("invalid_chronology");
  }
}

export function assertChargebackRecoveryReceipt(
  authority: ChargebackRecoveryPostingAllocationAuthority,
  projection: UnverifiedReceiptLinkedPostingProjection
): void {
  const receipt = projection.receipt;
  const source = authority.sourceAuthority;
  const expectedRef = Object.freeze({
    kind: source.kind,
    authorityId: source.authorityId,
    authorityVersion: String(source.version),
    evidenceId: source.canonicalEvidenceId,
    canonicalDigest: digestValue(source),
    digestPurpose: "drift_detection_only" as const
  });
  if (
    receipt.operationKind !== "chargeback_recovery_collected" ||
    receipt.receiptId !== authority.operationReceiptId ||
    receipt.canonicalDigest !== authority.operationReceiptDigest ||
    receipt.sourceKey.kind !== "chargeback" ||
    receipt.sourceKey.operation !== "recovery_collected" ||
    receipt.sourceKey.sourceId !== source.recoveryCollectionId ||
    receipt.astrologerUserId !== authority.astrologerUserId ||
    receipt.occurredAt !== authority.collectedAt ||
    receipt.authorityRefs.length !== 1 ||
    !sameCanonicalFinancePostingValue(receipt.authorityRefs[0], expectedRef)
  ) {
    mismatch("proof_operation_receipt_mismatch");
  }
  const rowsByEffect = new Map(projection.rows.map((row) => [row.sourceLink.semanticEdgeId, row]));
  const used = new Set<string>();
  for (const collection of authority.collectionRows) {
    const debit = rowsByEffect.get(collection.receiptPayableEffectId);
    const credit = rowsByEffect.get(collection.receiptRecoveryEffectId);
    if (
      !debit ||
      !credit ||
      used.has(debit.sourceLink.semanticEdgeId) ||
      used.has(credit.sourceLink.semanticEdgeId) ||
      debit.entry.side !== "debit" ||
      !["astrologer_pending", "astrologer_available", "astrologer_reserved"].includes(
        debit.entry.account.code
      ) ||
      !("astrologerUserId" in debit.entry.account) ||
      debit.entry.account.astrologerUserId !== authority.astrologerUserId ||
      debit.entry.links.componentId !== collection.receiptPayableComponentId ||
      credit.entry.account.code !== "astrologer_recovery_receivable" ||
      credit.entry.side !== "credit" ||
      credit.entry.account.astrologerUserId !== authority.astrologerUserId ||
      credit.entry.links.componentId !== collection.receiptRecoveryComponentId
    ) {
      mismatch("proof_operation_receipt_mismatch");
    }
    assertFinancePostingMoneyEqual(debit.entry.amount, collection.amount, "amount_mismatch");
    assertFinancePostingMoneyEqual(credit.entry.amount, collection.amount, "amount_mismatch");
    used.add(debit.sourceLink.semanticEdgeId);
    used.add(credit.sourceLink.semanticEdgeId);
  }
  if (used.size !== projection.rows.length) mismatch("proof_operation_receipt_mismatch");
}

function mismatch(reason: ConstructorParameters<typeof FinancePostingIntegrityError>[0]): never {
  throw new FinancePostingIntegrityError(reason);
}
