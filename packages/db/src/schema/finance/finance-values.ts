import { numeric } from "drizzle-orm/pg-core";

export const financeCurrencyValues = ["RUB"] as const;
export const financeSafeIntegerMinorUnitMax = 9_007_199_254_740_991;

export const financeSignedInt64Minimum = "-9223372036854775808";
export const financeSignedInt64Maximum = "9223372036854775807";
export const financeNumeric38Minimum = "-99999999999999999999999999999999999999";
export const financeNumeric38Maximum = "99999999999999999999999999999999999999";

export function financeSignedInt64String(name: string) {
  return numeric(name, { precision: 19, scale: 0, mode: "string" });
}

export function financeNumeric38String(name: string) {
  return numeric(name, { precision: 38, scale: 0, mode: "string" });
}

export function financeRevisionString(name: string) {
  return financeNumeric38String(name);
}

export const financePaymentProviderValues = ["arc_pay"] as const;
export const financeTransactionCategoryValues = ["client_purchase", "platform_subscription"] as const;
export const financeReadinessEvidenceStatusValues = ["active", "revoked"] as const;
export const financeReadinessEvidenceRequirementValues = [
  "legal_accounting_client_purchase",
  "legal_accounting_platform_subscription",
  "commercial_tariff",
  "capability_enforcement",
  "billing_operations_policy",
  "risk_policy",
  "product_fulfillment",
  "refund_chargeback_principal_policy",
  "finance_step_up",
  "payout_recipient_policy",
  "bank_liquidity_policy"
] as const;

export const financeArtifactClassValues = [
  "provider_request",
  "provider_response",
  "provider_webhook",
  "provider_canonical_read",
  "provider_settlement_page",
  "provider_payout_statement",
  "bank_statement",
  "bank_transfer_evidence"
] as const;

export const financeArtifactBindingKindValues = ["provider", "bank_cash_pool"] as const;
export const financeArtifactServiceIdentityValues = [
  "provider_ingress",
  "payment_processing",
  "astrologer_billing",
  "client_checkout_delivery",
  "refund_processing",
  "chargeback_processing",
  "settlement_reconciliation",
  "bank_reconciliation",
  "payout_operations",
  "finance_retention"
] as const;
export const financeArtifactAccessPurposeValues = [
  "provider_webhook_verification",
  "provider_operation_dispatch",
  "provider_operation_result_verification",
  "saved_card_customer_action_delivery",
  "platform_tariff_invoice_customer_action_delivery",
  "client_checkout_action_delivery",
  "refund_result_verification",
  "chargeback_fact_verification",
  "settlement_ingestion",
  "payout_statement_ingestion",
  "bank_statement_ingestion",
  "bank_evidence_verification",
  "payout_execution_evidence_verification",
  "retention_deletion"
] as const;
export const financeArtifactAccessActionValues = ["read", "retention_delete"] as const;
export const financeArtifactAccessOutcomeValues = ["allowed", "denied"] as const;
export const financeArtifactLegalHoldActionValues = ["applied", "released"] as const;
export const financeArtifactPurgeAttemptOutcomeValues = ["failed", "deletion_verified"] as const;
export const financeRestrictedCredentialLifecycleValues = [
  "pending_activation",
  "active",
  "revoked",
  "expired",
  "compromised"
] as const;

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

/**
 * Authoritative lifecycle for an ElevenHouse-initiated refund. This is intentionally separate
 * from `refundStatusValues`, which remains the legacy provider-webhook projection used by the
 * existing payment reversal reader.
 */
export const financeRefundLifecycleValues = [
  "requested",
  "approved",
  "provider_unknown",
  "succeeded",
  "failed",
  "allocation_blocked"
] as const;

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
  "paid",
  "failed",
  "rejected",
  "cancelled"
] as const;

/** ArcPay is ElevenHouse's acquiring/settlement provider, never an astrologer payout rail. */
export const payoutMethodValues = ["manual_bank_transfer"] as const;

export const riskTierValues = ["low", "standard", "elevated", "high", "manual_review"] as const;

export const reconciliationStatusValues = ["pending", "matched", "exception", "ignored"] as const;

export const financeIdempotencyCommandStateValues = ["processing", "completed", "failed"] as const;

export function formatFinanceSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
