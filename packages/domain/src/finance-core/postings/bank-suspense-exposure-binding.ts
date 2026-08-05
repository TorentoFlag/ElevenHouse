import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import {
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingIdentifier,
  readFinancePostingInstant,
  readFinancePostingMoney,
  readFinancePostingUnsignedDecimal
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import type {
  BankSuspenseReclassificationTarget,
  UnverifiedArcMerchantPayoutClearingExposureBinding,
  UnverifiedBankOutboundClearingExposureBinding
} from "./bank-suspense-reclassification-types";

export function readUnverifiedBankOutboundClearingExposureBinding(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): UnverifiedBankOutboundClearingExposureBinding {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "bindingId",
    "version",
    "authorizationStatus",
    "digestPurpose",
    "bankExposureId",
    "payoutRequestId",
    "bankCashPoolId",
    "amount",
    "claimedRemainingAmount",
    "claimedConsumptionStatus",
    "clearingJournalTransactionId",
    "clearingJournalTransactionDigest",
    "issuedAt",
    "bindingDigest"
  ]);
  if (
    fields.kind !== "bank_outbound_clearing_exposure_binding" ||
    fields.authorizationStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    fields.claimedConsumptionStatus !== "unconsumed"
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const core = Object.freeze({
    kind: "bank_outbound_clearing_exposure_binding" as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    version: readPositiveDecimalVersion(fields.version, decoderEnvelope.maxDecimalDigits),
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    bankExposureId: readFinancePostingIdentifier(fields.bankExposureId),
    payoutRequestId: readFinancePostingIdentifier(fields.payoutRequestId),
    bankCashPoolId: readFinancePostingIdentifier(fields.bankCashPoolId),
    amount: readFinancePostingMoney(fields.amount),
    claimedRemainingAmount: readFinancePostingMoney(fields.claimedRemainingAmount),
    claimedConsumptionStatus: "unconsumed" as const,
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

export function readUnverifiedArcMerchantPayoutClearingExposureBinding(
  input: unknown,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): UnverifiedArcMerchantPayoutClearingExposureBinding {
  const decoderEnvelope = normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  const fields = readExactDataRecord(input, [
    "kind",
    "bindingId",
    "version",
    "authorizationStatus",
    "digestPurpose",
    "providerAccountId",
    "merchantPayoutId",
    "bankCashPoolId",
    "amount",
    "claimedRemainingAmount",
    "claimedConsumptionStatus",
    "clearingJournalTransactionId",
    "clearingJournalTransactionDigest",
    "issuedAt",
    "bindingDigest"
  ]);
  if (
    fields.kind !== "arc_merchant_payout_clearing_exposure_binding" ||
    fields.authorizationStatus !== "unverified" ||
    fields.digestPurpose !== "drift_detection_only" ||
    fields.claimedConsumptionStatus !== "unconsumed"
  ) {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  const core = Object.freeze({
    kind: "arc_merchant_payout_clearing_exposure_binding" as const,
    bindingId: readFinancePostingIdentifier(fields.bindingId),
    version: readPositiveDecimalVersion(fields.version, decoderEnvelope.maxDecimalDigits),
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    providerAccountId: readFinancePostingIdentifier(fields.providerAccountId),
    merchantPayoutId: readFinancePostingIdentifier(fields.merchantPayoutId),
    bankCashPoolId: readFinancePostingIdentifier(fields.bankCashPoolId),
    amount: readFinancePostingMoney(fields.amount),
    claimedRemainingAmount: readFinancePostingMoney(fields.claimedRemainingAmount),
    claimedConsumptionStatus: "unconsumed" as const,
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

export function assertUnverifiedBankSuspenseExposureBinding(
  target: BankSuspenseReclassificationTarget,
  bankCashPoolId: string,
  amount: Money,
  approvedAt: string,
  decoderEnvelopeInput: FinancePostingDecoderEnvelope
): void {
  normalizeFinancePostingDecoderEnvelope(decoderEnvelopeInput);
  if (target.kind === "returned_payout_credit") return;
  const binding = target.exposureBinding;
  if (binding.bankCashPoolId !== bankCashPoolId) {
    throw new FinancePostingIntegrityError("scope_mismatch");
  }
  assertFinancePostingMoneyEqual(binding.amount, amount, "amount_mismatch");
  assertFinancePostingMoneyEqual(binding.claimedRemainingAmount, amount, "amount_mismatch");
  if (compareFinancePostingInstants(approvedAt, binding.issuedAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
}

function readPositiveDecimalVersion(input: unknown, maximumDigits: number): string {
  const value = readFinancePostingUnsignedDecimal(input, maximumDigits);
  if (BigInt(value) === 0n) {
    throw new FinancePostingIntegrityError("invalid_version");
  }
  return value;
}
