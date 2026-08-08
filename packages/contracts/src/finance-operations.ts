import { z } from "@elevenhouse/validation";

export const financeOperationKindValues = [
  "tariff_publish",
  "fiscal_policy_publish",
  "risk_policy_publish",
  "client_checkout_prepare",
  "client_order_capture",
  "platform_card_setup_prepare",
  "platform_card_setup_execute",
  "platform_card_setup_complete_3ds_method",
  "platform_invoice_complete_3ds_method",
  "platform_invoice_charge",
  "platform_renewal_schedule",
  "refund_execute",
  "chargeback_record_provisional",
  "chargeback_principal_allocate",
  "payout_destination_reveal",
  "payout_destination_change",
  "payout_approve",
  "payout_start_processing",
  "payout_confirm_paid",
  "bank_snapshot_attest",
  "bank_statement_match",
  "settlement_ingestion",
  "ledger_correction"
] as const;
export const financeOperationKindSchema = z.enum(financeOperationKindValues);
export type FinanceOperationKind = z.infer<typeof financeOperationKindSchema>;

export const financeTransactionCategoryValues = [
  "client_purchase",
  "platform_subscription"
] as const;
export const financeTransactionCategorySchema = z.enum(financeTransactionCategoryValues);
export type FinanceTransactionCategory = z.infer<typeof financeTransactionCategorySchema>;
