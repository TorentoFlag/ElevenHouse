import {
  readUnverifiedPayoutBankExposureBinding,
  readUnverifiedPayoutBankExposureTransitionBinding
} from "./payout-bank-exposure-binding";
import { readUnverifiedPayoutOutboundClearingCoverageBinding } from "./payout-clearing-coverage-binding";
import {
  assertFinancePostingMoneyEqual,
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { readPayoutReturnSourceAuthority } from "./payout-source-authority-codec";
import { readPayoutReceiptSourceAuthorityRef } from "./payout-receipt-authority";
import { sumReceiptRows, type ReceiptPostingPrepared } from "./receipt-liability-posting-core";

export type PreparedPayoutReturnCore = Readonly<{
  source: ReturnType<typeof readPayoutReturnSourceAuthority>;
  exposure: ReturnType<typeof readUnverifiedPayoutBankExposureTransitionBinding>;
  coverage: ReturnType<typeof readUnverifiedPayoutOutboundClearingCoverageBinding>;
  amount: Readonly<{ amountMinor: number; currency: "RUB" }>;
}>;

export function preparePayoutReturnCore(
  fields: Readonly<Record<string, unknown>>,
  previousInput: unknown,
  prepared: ReceiptPostingPrepared,
  path: "without_debit" | "reflected",
  envelope: FinancePostingDecoderEnvelope
): PreparedPayoutReturnCore {
  const source = readPayoutReturnSourceAuthority(fields.sourceAuthority);
  const sourceRef = readPayoutReceiptSourceAuthorityRef(prepared.receipt, source);
  const previous = readUnverifiedPayoutBankExposureBinding(previousInput, envelope);
  const exposure = readUnverifiedPayoutBankExposureTransitionBinding(
    { binding: fields.exposureTransition, previousBinding: previousInput },
    envelope
  );
  const coverage = readUnverifiedPayoutOutboundClearingCoverageBinding(
    fields.priorClearingCoverage,
    envelope
  );
  const amount = Object.freeze({
    amountMinor: sumReceiptRows(prepared, "credit"),
    currency: "RUB" as const
  });
  const paidRef =
    path === "without_debit"
      ? {
          bindingId: previous.bindingId,
          exposureVersion: previous.exposureVersion,
          status: previous.status,
          bindingDigest: previous.bindingDigest
        }
      : previous.previousBindingRef;
  if (
    source.returnedAt !== prepared.receipt.occurredAt ||
    source.bankReference !== coverage.bankReference ||
    exposure.payoutRequestId !== source.payoutRequestId ||
    exposure.astrologerUserId !== prepared.receipt.astrologerUserId ||
    exposure.bankCashPoolId !== coverage.bankCashPoolId ||
    exposure.occurredAt !== source.returnedAt ||
    coverage.bankExposureId !== exposure.bankExposureId ||
    coverage.payoutRequestId !== source.payoutRequestId ||
    paidRef === null ||
    paidRef.status !== "paid_unreflected" ||
    !sameCanonicalFinancePostingValue(coverage.paidExposureBindingRef, paidRef) ||
    !sameCanonicalFinancePostingValue(exposure.transitionAuthorityRef, sourceRef) ||
    !sameCanonicalFinancePostingValue(fields.receiptBinding, prepared.receiptBinding) ||
    compareFinancePostingInstants(source.returnedAt, coverage.issuedAt) < 0 ||
    (path === "without_debit" &&
      compareFinancePostingInstants(coverage.issuedAt, previous.occurredAt) < 0) ||
    (path === "reflected" &&
      compareFinancePostingInstants(previous.occurredAt, coverage.issuedAt) < 0) ||
    prepared.rows.some(
      (row) => row.entry.account.code !== "astrologer_reserved" || row.entry.side !== "credit"
    )
  ) {
    mismatch();
  }
  if (
    (path === "without_debit" &&
      (source.outcome !== "returned_without_debit" ||
        previous.status !== "paid_unreflected" ||
        exposure.transitionKind !== "returned_without_debit" ||
        exposure.status !== "returned_without_debit")) ||
    (path === "reflected" &&
      (source.outcome !== "returned_after_matched_debit" ||
        previous.status !== "statement_reflected" ||
        exposure.transitionKind !== "return_credit_reflected" ||
        exposure.status !== "returned_reflected"))
  ) {
    mismatch();
  }
  assertFinancePostingMoneyEqual(exposure.amount, amount, "amount_mismatch");
  assertFinancePostingMoneyEqual(coverage.amount, amount, "amount_mismatch");
  return Object.freeze({ source, exposure, coverage, amount });
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
