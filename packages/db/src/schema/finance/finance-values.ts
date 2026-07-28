export const financeCurrencyValues = ["RUB"] as const;
export const financeSafeIntegerMinorUnitMax = 9_007_199_254_740_991;

export const financePaymentProviderValues = ["arc_pay"] as const;
export const financePaymentProviderEnvironmentValues = ["sandbox", "live"] as const;

export const orderStatusValues = [
  "draft",
  "pending_payment",
  "paid",
  "fulfilled",
  "cancelled",
  "expired",
  "partially_refunded",
  "refunded",
  "chargeback"
] as const;

export const paymentAttemptStatusValues = [
  "created",
  "checkout_opened",
  "pending",
  "authorized",
  "captured",
  "settled",
  "failed",
  "declined",
  "timeout",
  "expired",
  "voided",
  "partially_refunded",
  "refunded",
  "chargeback"
] as const;

export const paymentProviderEventTypeValues = [
  "payment.created",
  "payment.checkout_opened",
  "payment.pending",
  "payment.pending_3ds",
  "payment.authorized",
  "payment.processing",
  "payment.captured",
  "payment.settled",
  "payment.failed",
  "payment.declined",
  "payment.timeout",
  "payment.expired",
  "payment.voided",
  "payment.refunded",
  "payment.partially_refunded",
  "payment.chargeback",
  "settlement.cleared",
  "reconciliation.exception"
] as const;

export const refundStatusValues = ["requested", "processing", "succeeded", "failed"] as const;

export const paymentReversalCaseReviewResolutionValues = [
  "ledger_verified",
  "provider_follow_up_required",
  "evidence_sent"
] as const;

export const walletBalanceBucketValues = [
  "pending",
  "available",
  "reserved",
  "payout_pending",
  "negative_balance"
] as const;

export const ledgerAccountTypeValues = [
  "platform_clearing",
  "platform_revenue",
  "provider_fees",
  "astrologer_pending",
  "astrologer_available",
  "astrologer_reserved",
  "astrologer_payout_pending",
  "astrologer_negative_balance",
  "payout_clearing"
] as const;

export const ledgerEntrySideValues = ["debit", "credit"] as const;

export const ledgerOperationTypeValues = [
  "sale_captured",
  "platform_fee_recorded",
  "provider_fee_recorded",
  "hold_created",
  "funds_released",
  "reserve_created",
  "reserve_released",
  "payout_reserved",
  "payout_paid",
  "payout_failed",
  "refund_recorded",
  "chargeback_recorded",
  "manual_adjustment"
] as const;

export const payoutRequestStatusValues = [
  "requested",
  "under_review",
  "approved",
  "processing_manual",
  "processing_provider",
  "paid",
  "failed",
  "rejected",
  "cancelled"
] as const;

export const payoutMethodValues = ["manual_bank_transfer", "arc_pay_provider"] as const;

export const riskTierValues = ["low", "standard", "elevated", "high", "manual_review"] as const;

export const reconciliationStatusValues = ["pending", "matched", "exception", "ignored"] as const;

export const financeIdempotencyCommandStateValues = ["processing", "completed", "failed"] as const;

export function formatFinanceSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
