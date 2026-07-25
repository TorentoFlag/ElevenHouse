import { existsSync, readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  astrologerRiskProfiles,
  financeCurrencyValues,
  financeIdempotencyCommands,
  financePaymentProviderEnvironmentValues,
  financePaymentProviderValues,
  financePolicies,
  financeSafeIntegerMinorUnitMax,
  ledgerAccounts,
  ledgerEntries,
  ledgerEntrySideValues,
  ledgerTransactions,
  orderStatusValues,
  orders,
  paymentAttemptStatusValues,
  paymentAttempts,
  paymentProviderEvents,
  payoutMethodValues,
  payoutMethods,
  payoutRequestStatusValues,
  payoutRequests,
  reconciliationRecords,
  refunds,
  riskTierValues,
  walletBalanceReadModels
} from "./index";

const baselineMigrationFile = "packages/db/drizzle/0000_sticky_rictor.sql";
const baselineSnapshotFile = "packages/db/drizzle/meta/0000_snapshot.json";

function tableCheckNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).checks.map((check) => check.name);
}

function tableIndexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.flatMap((index) =>
    index.config.name === undefined ? [] : [index.config.name]
  );
}

function tableForeignKeyNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).foreignKeys.map((key) => key.getName());
}

describe("Finance persistence schema", () => {
  it("exports every finance table with the canonical table names", () => {
    expect(getTableName(orders)).toBe("orders");
    expect(getTableName(paymentAttempts)).toBe("payment_attempts");
    expect(getTableName(paymentProviderEvents)).toBe("payment_provider_events");
    expect(getTableName(ledgerAccounts)).toBe("ledger_accounts");
    expect(getTableName(ledgerTransactions)).toBe("ledger_transactions");
    expect(getTableName(ledgerEntries)).toBe("ledger_entries");
    expect(getTableName(walletBalanceReadModels)).toBe("wallet_balance_read_models");
    expect(getTableName(payoutMethods)).toBe("payout_methods");
    expect(getTableName(payoutRequests)).toBe("payout_requests");
    expect(getTableName(financePolicies)).toBe("finance_policies");
    expect(getTableName(astrologerRiskProfiles)).toBe("astrologer_risk_profiles");
    expect(getTableName(reconciliationRecords)).toBe("reconciliation_records");
    expect(getTableName(financeIdempotencyCommands)).toBe("finance_idempotency_commands");
  });

  it("keeps Task 1 finance enum values explicit in the DB package", () => {
    expect(orderStatusValues).toEqual([
      "draft",
      "pending_payment",
      "paid",
      "fulfilled",
      "cancelled",
      "expired",
      "partially_refunded",
      "refunded",
      "chargeback"
    ]);
    expect(paymentAttemptStatusValues).toEqual([
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
    ]);
    expect(payoutRequestStatusValues).toEqual([
      "requested",
      "under_review",
      "approved",
      "processing_manual",
      "processing_provider",
      "paid",
      "failed",
      "rejected",
      "cancelled"
    ]);
    expect(riskTierValues).toEqual(["low", "standard", "elevated", "high", "manual_review"]);
    expect(financePaymentProviderValues).toEqual(["arc_pay"]);
    expect(financePaymentProviderEnvironmentValues).toEqual(["sandbox", "live"]);
    expect(financeCurrencyValues).toEqual(["RUB"]);
  });

  it("uses non-32-bit minor-unit money columns with explicit RUB checks", () => {
    const orderColumns = getTableColumns(orders);
    const attemptColumns = getTableColumns(paymentAttempts);
    const payoutColumns = getTableColumns(payoutRequests);

    expect(orderColumns.grossAmountMinor.getSQLType()).toBe("bigint");
    expect(attemptColumns.amountMinor.getSQLType()).toBe("bigint");
    expect(payoutColumns.amountMinor.getSQLType()).toBe("bigint");
    expect(financeSafeIntegerMinorUnitMax).toBe(Number.MAX_SAFE_INTEGER);
    expect(tableCheckNames(orders)).toEqual(
      expect.arrayContaining([
        "orders_status_check",
        "orders_money_currency_check",
        "orders_money_amount_check",
        "orders_money_allocation_check"
      ])
    );
    expect(tableCheckNames(paymentAttempts)).toEqual(
      expect.arrayContaining([
        "payment_attempts_status_check",
        "payment_attempts_provider_check",
        "payment_attempts_environment_check",
        "payment_attempts_currency_check",
        "payment_attempts_amount_check"
      ])
    );
  });

  it("enforces provider payment and webhook uniqueness boundaries", () => {
    expect(tableIndexNames(paymentAttempts)).toEqual(
      expect.arrayContaining(["payment_attempts_provider_payment_unique"])
    );
    expect(tableIndexNames(paymentProviderEvents)).toEqual(
      expect.arrayContaining(["payment_provider_events_webhook_unique"])
    );
    expect(tableCheckNames(paymentProviderEvents)).toEqual(
      expect.arrayContaining([
        "payment_provider_events_provider_check",
        "payment_provider_events_environment_check",
        "payment_provider_events_type_check"
      ])
    );
  });

  it("deduplicates provider refunds by provider environment and refund id", () => {
    expect(Object.keys(getTableColumns(refunds))).toEqual(
      expect.arrayContaining(["provider", "environment", "providerRefundId"])
    );
    expect(tableCheckNames(refunds)).toEqual(
      expect.arrayContaining(["refunds_provider_check", "refunds_environment_check"])
    );
    expect(tableIndexNames(refunds)).toEqual(
      expect.arrayContaining(["refunds_provider_refund_unique"])
    );
  });

  it("makes ledger double-entry structure explicit with account references", () => {
    expect(Object.keys(getTableColumns(ledgerEntries))).toEqual(
      expect.arrayContaining([
        "ledgerTransactionId",
        "accountId",
        "side",
        "amountMinor",
        "currency"
      ])
    );
    expect(tableCheckNames(ledgerEntries)).toEqual(
      expect.arrayContaining([
        "ledger_entries_side_check",
        "ledger_entries_amount_check",
        "ledger_entries_currency_check"
      ])
    );
    expect(tableForeignKeyNames(ledgerEntries)).toEqual(
      expect.arrayContaining([
        "ledger_entries_ledger_transaction_id_ledger_transactions_id_fk",
        "ledger_entries_account_id_ledger_accounts_id_fk"
      ])
    );
    expect(tableIndexNames(ledgerEntries)).toEqual(
      expect.arrayContaining(["ledger_entries_transaction_account_side_idx"])
    );
  });

  it("supports payout methods, paid evidence, and failure evidence at the DB boundary", () => {
    expect(payoutMethodValues).toEqual(["manual_bank_transfer", "arc_pay_provider"]);
    expect(tableCheckNames(payoutMethods)).toEqual(
      expect.arrayContaining([
        "payout_methods_method_check",
        "payout_methods_provider_check",
        "payout_methods_method_provider_shape_check"
      ])
    );
    expect(tableCheckNames(payoutRequests)).toEqual(
      expect.arrayContaining([
        "payout_requests_status_check",
        "payout_requests_method_check",
        "payout_requests_paid_evidence_check",
        "payout_requests_failure_reason_check",
        "payout_requests_amount_check",
        "payout_requests_currency_check"
      ])
    );
  });

  it("records finance policy defaults, risk overrides, reconciliation, and idempotency", () => {
    expect(getTableColumns(financePolicies).holdDurationHours.default).toBe(48);
    expect(tableCheckNames(financePolicies)).toEqual(
      expect.arrayContaining([
        "finance_policies_risk_tier_check",
        "finance_policies_hold_duration_check",
        "finance_policies_reserve_bps_check",
        "finance_policies_platform_fee_bps_check"
      ])
    );
    expect(tableCheckNames(astrologerRiskProfiles)).toEqual(
      expect.arrayContaining([
        "astrologer_risk_profiles_risk_tier_check",
        "astrologer_risk_profiles_manual_override_check"
      ])
    );
    expect(tableCheckNames(reconciliationRecords)).toEqual(
      expect.arrayContaining([
        "reconciliation_records_provider_check",
        "reconciliation_records_environment_check",
        "reconciliation_records_status_check",
        "reconciliation_records_provider_identifier_check"
      ])
    );
    expect(tableIndexNames(financeIdempotencyCommands)).toContain(
      "finance_idempotency_commands_scope_key_unique"
    );
  });

  it("keeps conditional finance checks null-safe in the generated baseline", () => {
    const migration = readFileSync(baselineMigrationFile, "utf8");

    expect(migration).toContain(
      '"manual_bank_transfer_details" is not null and jsonb_typeof("payout_methods"."manual_bank_transfer_details") = \'object\''
    );
    expect(migration).toContain(
      '"provider_payout_account_id" is not null and length(trim("payout_methods"."provider_payout_account_id")) between 1 and 160'
    );
    expect(migration).toContain(
      '"payout_requests"."provider" is not null and "payout_requests"."provider" = \'arc_pay\''
    );
    expect(migration).toContain(
      '"payout_requests"."failure_reason" is not null and length(trim("payout_requests"."failure_reason")) between 1 and 2000'
    );
    expect(migration).toContain(
      '"reconciliation_records"."exception_code" is not null and length(trim("reconciliation_records"."exception_code")) between 1 and 120'
    );
    expect(migration).toContain(
      '"finance_idempotency_commands"."result" is not null and jsonb_typeof("finance_idempotency_commands"."result") = \'object\''
    );
    expect(migration).toContain(
      '"finance_idempotency_commands"."error_code" is not null and length(trim("finance_idempotency_commands"."error_code")) between 1 and 120'
    );
    expect(migration).toContain(
      '"astrologer_risk_profiles"."manual_override_reason" is not null and length(trim("astrologer_risk_profiles"."manual_override_reason")) between 1 and 2000'
    );
  });

  it("keeps the generated finance DDL in the single current baseline", () => {
    const migration = readFileSync(baselineMigrationFile, "utf8");
    const snapshot = JSON.parse(readFileSync(baselineSnapshotFile, "utf8")) as {
      prevId: string;
      tables: Record<string, unknown>;
    };

    for (const table of [
      "orders",
      "payment_attempts",
      "payment_provider_events",
      "refunds",
      "ledger_accounts",
      "ledger_transactions",
      "ledger_entries",
      "wallet_balance_read_models",
      "payout_methods",
      "payout_requests",
      "finance_policies",
      "astrologer_risk_profiles",
      "reconciliation_records",
      "finance_idempotency_commands"
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
      expect(snapshot.tables[`public.${table}`]).toBeDefined();
    }

    expect(migration).toContain('"gross_amount_minor" bigint NOT NULL');
    expect(migration).toContain(
      '"orders"."gross_amount_minor" >= 0 and "orders"."gross_amount_minor" <= 9007199254740991'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "payment_attempts_provider_payment_unique" ON "payment_attempts" USING btree ("provider","environment","provider_payment_id") WHERE "payment_attempts"."provider_payment_id" is not null'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "payment_provider_events_webhook_unique" ON "payment_provider_events" USING btree ("provider","environment","provider_webhook_id")'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "finance_idempotency_commands_scope_key_unique" ON "finance_idempotency_commands" USING btree ("scope","idempotency_key")'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "refunds_provider_refund_unique" ON "refunds" USING btree ("provider","environment","provider_refund_id") WHERE "refunds"."provider_refund_id" is not null'
    );
    expect(migration).toContain(
      'CREATE INDEX "ledger_entries_transaction_account_side_idx" ON "ledger_entries" USING btree ("ledger_transaction_id","account_id","entry_side")'
    );
    expect(migration).toContain(
      'CONSTRAINT "payout_requests_paid_evidence_check" CHECK ("payout_requests"."status" <> \'paid\' or ("payout_requests"."external_reference" is not null and "payout_requests"."transferred_at" is not null))'
    );
    expect(migration).toContain(
      'ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action'
    );
    expect(migration).toContain(
      "CONSTRAINT \"chart_calculation_jobs_method_check\" CHECK (\"chart_calculation_jobs\".\"method\" in ('natal', 'astrocartography', 'transit', 'synastry', 'composite', 'solar_return', 'progression', 'horary'))"
    );
    expect(snapshot.prevId).toBe("00000000-0000-0000-0000-000000000000");
    expect(existsSync("packages/db/drizzle/0001_sticky_rictor.sql")).toBe(false);
    expect(existsSync("packages/db/drizzle/meta/0001_snapshot.json")).toBe(false);
  });
});
