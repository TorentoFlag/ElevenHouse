import { describe, expect, it } from "vitest";
import {
  financeOperationKindSchema,
  financeOperationKindValues,
  financeTransactionCategorySchema,
  financeTransactionCategoryValues
} from "./finance-operations";

describe("finance operation contracts", () => {
  it("defines the single exact high-risk operation vocabulary", () => {
    expect(financeOperationKindValues).toEqual([
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
    ]);
    for (const operationKind of financeOperationKindValues) {
      expect(financeOperationKindSchema.parse(operationKind)).toBe(operationKind);
    }
    expect(() => financeOperationKindSchema.parse("sale")).toThrow();
    expect(() => financeOperationKindSchema.parse("unknown_finance_operation")).toThrow();
  });

  it("defines only the two approved immutable transaction categories", () => {
    expect(financeTransactionCategoryValues).toEqual(["client_purchase", "platform_subscription"]);
    expect(financeTransactionCategorySchema.parse("client_purchase")).toBe("client_purchase");
    expect(financeTransactionCategorySchema.parse("platform_subscription")).toBe(
      "platform_subscription"
    );
    expect(() => financeTransactionCategorySchema.parse("payout")).toThrow();
  });
});
