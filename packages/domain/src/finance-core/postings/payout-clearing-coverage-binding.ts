import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  assertFinancePostingMoneyEqual,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { readPayoutAuthorityRef, readPayoutExposureRef } from "./payout-posting-codec";
import type { UnverifiedPayoutOutboundClearingCoverageBinding } from "./payout-bank-exposure-types";

export function readUnverifiedPayoutOutboundClearingCoverageBinding(
  input: unknown,
  envelope: FinancePostingDecoderEnvelope
): UnverifiedPayoutOutboundClearingCoverageBinding {
  const fields = readExactDataRecord(input, [
    "kind",
    "schemaVersion",
    "bindingId",
    "authorizationStatus",
    "atomicityStatus",
    "digestPurpose",
    "bankExposureId",
    "payoutRequestId",
    "bankCashPoolId",
    "amount",
    "claimedRemainingAmount",
    "claimedConsumptionStatus",
    "paidExposureBindingRef",
    "paidOperationReceiptId",
    "paidOperationReceiptDigest",
    "paidAuthorityRef",
    "bankReference",
    "clearingJournalTransactionId",
    "clearingJournalTransactionDigest",
    "issuedAt",
    "bindingDigest"
  ]);
  if (
    fields.kind !== "unverified_payout_outbound_clearing_coverage_binding" ||
    fields.schemaVersion !== 1 ||
    fields.authorizationStatus !== "unverified" ||
    fields.atomicityStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    fields.claimedConsumptionStatus !== "unconsumed"
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const amount = readFinancePostingMoney(fields.amount);
  const claimedRemainingAmount = readFinancePostingMoney(fields.claimedRemainingAmount);
  assertFinancePostingMoneyEqual(amount, claimedRemainingAmount, "amount_mismatch");
  const paidExposureBindingRef = readPayoutExposureRef(fields.paidExposureBindingRef, envelope);
  const paidAuthorityRef = readPayoutAuthorityRef(fields.paidAuthorityRef);
  if (
    paidExposureBindingRef.status !== "paid_unreflected" ||
    paidAuthorityRef.kind !== "payout_paid"
  ) {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const core = Object.freeze({
    kind: "unverified_payout_outbound_clearing_coverage_binding" as const,
    schemaVersion: 1 as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    bankExposureId: readFinancePostingIdentifier(fields.bankExposureId),
    payoutRequestId: readFinancePostingIdentifier(fields.payoutRequestId),
    bankCashPoolId: readFinancePostingIdentifier(fields.bankCashPoolId),
    amount,
    claimedRemainingAmount,
    claimedConsumptionStatus: "unconsumed" as const,
    paidExposureBindingRef,
    paidOperationReceiptId: readFinancePostingIdentifier(fields.paidOperationReceiptId),
    paidOperationReceiptDigest: readFinancePostingDigest(fields.paidOperationReceiptDigest),
    paidAuthorityRef,
    bankReference: readFinancePostingIdentifier(fields.bankReference),
    clearingJournalTransactionId: readFinancePostingIdentifier(fields.clearingJournalTransactionId),
    clearingJournalTransactionDigest: readFinancePostingDigest(
      fields.clearingJournalTransactionDigest
    ),
    issuedAt: readFinancePostingInstant(fields.issuedAt)
  });
  const bindingDigest = readFinancePostingDigest(fields.bindingDigest);
  if (bindingDigest !== hashFinanceCommandPayload(core)) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  return Object.freeze({ ...core, bindingDigest });
}
