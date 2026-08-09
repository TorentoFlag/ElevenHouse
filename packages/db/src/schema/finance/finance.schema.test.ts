import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as refundCaseSchemaModule from "./refund-cases.schema";
import {
  astrologerRiskProfiles,
  financeCurrencyValues,
  financeIdempotencyCommands,
  financePaymentProviderValues,
  financeRefundAllocationAuthorities,
  financeRefundAllocationLinks,
  financeRefundCases,
  financeRefundCumulativePositions,
  financeRefundFundingPositions,
  financeRefundFundingTransitionAuthorities,
  financeRefundLifecycleValues,
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
  paymentReversalCaseReviewResolutionValues,
  paymentReversalCaseReviews,
  payoutMethodValues,
  payoutMethods,
  payoutRequestStatusValues,
  payoutRequests,
  reconciliationRecords,
  refunds,
  riskTierValues,
  walletBalanceReadModels
} from "./index";

const baselineMigrationFile = readCurrentMigrationSql();
const baselineSnapshotFile = "packages/db/drizzle/meta/0016_snapshot.json";

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
    expect(getTableName(paymentReversalCaseReviews)).toBe("payment_reversal_case_reviews");
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
      "paid",
      "failed",
      "rejected",
      "cancelled"
    ]);
    expect(riskTierValues).toEqual(["low", "standard", "elevated", "high", "manual_review"]);
    expect(financePaymentProviderValues).toEqual(["arc_pay"]);
    expect(paymentReversalCaseReviewResolutionValues).toEqual([
      "ledger_verified",
      "provider_follow_up_required",
      "evidence_sent"
    ]);
    expect(financeCurrencyValues).toEqual(["RUB"]);
    expect(ledgerEntrySideValues).toEqual(["debit", "credit"]);
  });

  it("uses non-32-bit minor-unit money columns with explicit RUB checks", () => {
    const orderColumns = getTableColumns(orders);
    const attemptColumns = getTableColumns(paymentAttempts);
    const payoutColumns = getTableColumns(payoutRequests);

    expect(orderColumns.grossAmountMinor.getSQLType()).toBe("bigint");
    expect(Object.keys(orderColumns)).toEqual(
      expect.arrayContaining([
        "bookingId",
        "productTitleSnapshot",
        "financePolicyRiskTier",
        "financePolicyHoldDurationHours",
        "financePolicyReserveBps",
        "financePolicyReserveReleaseDelayDays",
        "tariffSeriesId",
        "tariffVersion",
        "tariffVersionDigest",
        "tariffCommissionBps",
        "financePolicyProviderSettlementRequired"
      ])
    );
    expect(attemptColumns.amountMinor.getSQLType()).toBe("bigint");
    expect(payoutColumns.amountMinor.getSQLType()).toBe("bigint");
    expect(financeSafeIntegerMinorUnitMax).toBe(Number.MAX_SAFE_INTEGER);
    expect(tableCheckNames(orders)).toEqual(
      expect.arrayContaining([
        "orders_status_check",
        "orders_product_title_snapshot_check",
        "orders_money_currency_check",
        "orders_money_amount_check",
        "orders_money_allocation_check",
        "orders_finance_policy_risk_tier_check",
        "orders_finance_policy_hold_duration_check",
        "orders_finance_policy_reserve_bps_check",
        "orders_finance_policy_reserve_release_check",
        "orders_tariff_commission_check"
      ])
    );
    expect(tableCheckNames(paymentAttempts)).toEqual(
      expect.arrayContaining([
        "payment_attempts_status_check",
        "payment_attempts_provider_check",
        "payment_attempts_currency_check",
        "payment_attempts_amount_check"
      ])
    );
    expect(Object.keys(attemptColumns)).not.toContain("environment");
  });

  it("links live paid orders to at most one booking hold", () => {
    expect(tableForeignKeyNames(orders)).toEqual(
      expect.arrayContaining(["orders_booking_id_bookings_id_fk"])
    );
    expect(tableIndexNames(orders)).toEqual(expect.arrayContaining(["orders_booking_unique"]));
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
        "payment_provider_events_type_check"
      ])
    );
    expect(Object.keys(getTableColumns(paymentProviderEvents))).not.toContain("environment");
  });

  it("deduplicates provider refunds by provider and refund id without persisting key mode", () => {
    expect(Object.keys(getTableColumns(refunds))).toEqual(
      expect.arrayContaining(["provider", "providerRefundId"])
    );
    expect(tableCheckNames(refunds)).toEqual(
      expect.arrayContaining(["refunds_provider_check"])
    );
    expect(tableIndexNames(refunds)).toEqual(
      expect.arrayContaining(["refunds_provider_refund_unique"])
    );
    expect(Object.keys(getTableColumns(refunds))).not.toContain("environment");
  });

  it("keeps authoritative outbound refund cases separate from legacy webhook refund rows", () => {
    expect(getTableName(financeRefundCases)).toBe("finance_refund_cases");
    expect(getTableName(financeRefundAllocationAuthorities)).toBe(
      "finance_refund_allocation_authorities"
    );
    expect(getTableName(financeRefundAllocationLinks)).toBe("finance_refund_allocation_links");
    expect(financeRefundLifecycleValues).toEqual([
      "requested",
      "approved",
      "provider_unknown",
      "succeeded",
      "failed",
      "allocation_blocked"
    ]);
    expect(Object.keys(getTableColumns(financeRefundCases))).toEqual(
      expect.arrayContaining([
        "economicPaymentIntentId",
        "providerPaymentId",
        "previousCumulativeRefundedMinor",
        "approvedCumulativeRefundedMinor",
        "version",
        "allocationAuthorityId",
        "allocationAuthorityVersion",
        "allocationAuthorityDigest",
        "fundingCoverageDigest",
        "providerOperationIntentId",
        "providerRefundId"
      ])
    );
    expect(Object.keys(getTableColumns(financeRefundAllocationAuthorities))).toEqual([
      "refundId",
      "authorityId",
      "authorityVersion",
      "allocationPayload",
      "allocationPreimage",
      "allocationDigest",
      "persistedAt"
    ]);
    expect(Object.keys(getTableColumns(financeRefundCumulativePositions))).toEqual(
      expect.arrayContaining([
        "positionId",
        "seriesId",
        "providerAccountId",
        "providerIdentityVersion",
        "providerPaymentId",
        "version",
        "positionPayload",
        "positionDigest"
      ])
    );
    expect(Object.keys(getTableColumns(financeRefundFundingPositions))).toEqual(
      expect.arrayContaining([
        "positionId",
        "version",
        "sourceKind",
        "sourcePayload",
        "capacityMinor",
        "freeMinor",
        "reservedMinor",
        "consumedMinor",
        "positionPayload",
        "positionDigest"
      ])
    );
    expect(Object.keys(getTableColumns(financeRefundFundingTransitionAuthorities))).toEqual(
      expect.arrayContaining([
        "refundId",
        "operation",
        "bindingId",
        "bindingPayload",
        "bindingDigest"
      ])
    );
    expect(tableCheckNames(financeRefundAllocationAuthorities)).toEqual(
      expect.arrayContaining([
        "finance_refund_allocation_authorities_shape_check",
        "finance_refund_allocation_authorities_digest_check"
      ])
    );
    expect(tableCheckNames(financeRefundFundingPositions)).toEqual(
      expect.arrayContaining([
        "finance_refund_funding_positions_source_kind_check",
        "finance_refund_funding_positions_amount_check",
        "finance_refund_funding_positions_payload_check"
      ])
    );
    expect(tableCheckNames(financeRefundFundingTransitionAuthorities)).toEqual(
      expect.arrayContaining([
        "finance_refund_funding_transition_authorities_operation_check",
        "finance_refund_funding_transition_authorities_digest_check"
      ])
    );
    expect(tableCheckNames(financeRefundCases)).toEqual(
      expect.arrayContaining([
        "finance_refund_cases_cumulative_amount_check",
        "finance_refund_cases_lifecycle_provider_result_check",
        "finance_refund_cases_identifier_check"
      ])
    );
    expect(tableIndexNames(financeRefundCases)).toEqual(
      expect.arrayContaining([
        "finance_refund_cases_payment_cumulative_unique",
        "finance_refund_cases_provider_refund_unique"
      ])
    );
    expect(tableForeignKeyNames(financeRefundAllocationLinks)).toEqual(
      expect.arrayContaining([
        "finance_refund_allocation_links_refund_fk",
        "finance_refund_allocation_links_source_lot_fk",
        "finance_refund_allocation_links_refund_pending_lot_fk"
      ])
    );
    const integritySql = String(
      Reflect.get(refundCaseSchemaModule, "financeRefundAllocationAuthorityIntegritySql")
    ).replaceAll(/\s+/g, " ").toLowerCase();
    expect(integritySql).toContain("finance_canonical_jsonb_v1");
    expect(integritySql).toContain("allocation_payload - 'allocationdigest'");
    expect(integritySql).toContain("refund allocation authorities are immutable");
    expect(integritySql).toContain(
      "refund case allocation authority does not bind its economic identity"
    );
    expect(integritySql).toContain("'{refundapprovalauthorityref,canonicaldigest}'");
    expect(integritySql).toContain("provider_operation.operation_kind = 'refund'");
    expect(integritySql).toContain("refund funding positions are append-only");
    expect(integritySql).toContain("refund funding transition authorities are immutable");
    expect(integritySql).toContain(
      "refund funding transition authority does not bind persisted positions"
    );
  });

  it("stores one durable admin review per payment reversal provider event", () => {
    expect(Object.keys(getTableColumns(paymentReversalCaseReviews))).toEqual(
      expect.arrayContaining([
        "providerEventId",
        "resolution",
        "adminUserId",
        "adminNote",
        "reviewedAt"
      ])
    );
    expect(tableCheckNames(paymentReversalCaseReviews)).toEqual(
      expect.arrayContaining([
        "payment_reversal_case_reviews_resolution_check",
        "payment_reversal_case_reviews_admin_note_check"
      ])
    );
    expect(tableIndexNames(paymentReversalCaseReviews)).toEqual(
      expect.arrayContaining([
        "payment_reversal_case_reviews_provider_event_unique",
        "payment_reversal_case_reviews_reviewed_at_idx"
      ])
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
    expect(payoutMethodValues).toEqual(["manual_bank_transfer"]);
    expect(tableCheckNames(payoutMethods)).toEqual(
      expect.arrayContaining([
        "payout_methods_method_check",
        "payout_methods_manual_only_check",
        "payout_methods_version_check"
      ])
    );
    expect(tableCheckNames(payoutRequests)).toEqual(
      expect.arrayContaining([
        "payout_requests_status_check",
        "payout_requests_method_check",
        "payout_requests_paid_evidence_check",
        "payout_requests_paid_proof_shape_check",
        "payout_requests_failure_reason_check",
        "payout_requests_amount_check",
        "payout_requests_currency_check"
      ])
    );
    expect(Object.keys(getTableColumns(payoutRequests))).toEqual(
      expect.arrayContaining([
        "paidProofArtifactId",
        "paidProofArtifactDigest",
        "paidProofArtifactByteLength"
      ])
    );
    expect(tableForeignKeyNames(payoutRequests)).toEqual(
      expect.arrayContaining(["payout_requests_paid_proof_artifact_fk"])
    );
    expect(tableIndexNames(payoutRequests)).toEqual(
      expect.arrayContaining(["payout_requests_paid_proof_artifact_unique"])
    );
  });

  it("records finance policy defaults, risk overrides, reconciliation, and idempotency", () => {
    expect(getTableColumns(financePolicies).holdDurationHours.default).toBe(48);
    expect(tableCheckNames(financePolicies)).toEqual(
      expect.arrayContaining([
        "finance_policies_risk_tier_check",
        "finance_policies_hold_duration_check",
        "finance_policies_reserve_bps_check",
        "finance_policies_reserve_release_delay_check"
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
        "reconciliation_records_status_check",
        "reconciliation_records_provider_identifier_check"
      ])
    );
    expect(Object.keys(getTableColumns(reconciliationRecords))).not.toContain("environment");
    expect(tableIndexNames(financeIdempotencyCommands)).toContain(
      "finance_idempotency_commands_scope_key_unique"
    );
  });

  it("keeps conditional finance checks null-safe in the generated baseline", () => {
    const migration = baselineMigrationFile;

    expect(migration).toContain('CREATE TABLE "payout_method_versions"');
    expect(migration).not.toContain('"manual_bank_transfer_details"');
    expect(migration).not.toContain('"provider_payout_account_id"');
    expect(migration).not.toContain('"payout_requests"."provider_payout_id"');
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
    const migration = baselineMigrationFile;
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
    expect(migration).toContain("\"finance_policy_risk_tier\" text DEFAULT 'standard' NOT NULL");
    expect(migration).toContain(
      'CONSTRAINT "orders_finance_policy_risk_tier_check" CHECK ("orders"."finance_policy_risk_tier" in'
    );
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
    expect(migration).toContain('"payout_requests"."paid_proof_artifact_id" is not null');
    expect(migration).toContain('CONSTRAINT "payout_requests_paid_proof_artifact_fk"');
    expect(migration).toContain('CREATE UNIQUE INDEX "payout_requests_paid_proof_artifact_unique"');
    expect(migration).toContain("create or replace function finance_validate_paid_payout_proof()");
    expect(migration).toContain(
      "paid payout proof must reference one active exact bank transfer artifact"
    );
    expect(migration).toContain(
      'ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action'
    );
    expect(migration).toContain(
      "CONSTRAINT \"chart_calculation_jobs_method_check\" CHECK (\"chart_calculation_jobs\".\"method\" in ('natal', 'astrocartography', 'transit', 'synastry', 'composite', 'solar_return', 'progression', 'horary'))"
    );
    expect(snapshot.prevId).not.toBe("00000000-0000-0000-0000-000000000000");
  });
});
