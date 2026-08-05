import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeBankCashDeferredForeignKeys,
  financeBankCashIntegritySql,
  financeBankCashMatchReceipts,
  financeBankCashPools,
  financeBankExceptions,
  financeBankMatches,
  financeBankStatementClassificationRules,
  financeBankStatementImports,
  financeBankStatementIngestionReceipts,
  financeBankStatementRows,
  financeCashPoolDirectoryReceipts
} from "./bank-cash.schema";
import {
  financeBankExposureHistory,
  financeBankExposures,
  financeBankLiquidityHeads,
  financeBankLiquidityHistory,
  financeBankLiquidityIntegritySql,
  financeBankLiquiditySnapshotAdoptionReceipts,
  financeBankLiquiditySnapshots,
  financeBankSnapshotExposureCoverage
} from "./bank-liquidity.schema";

function config(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table);
}

function names(items: ReadonlyArray<{ name?: string; config?: { name?: string } }>): string[] {
  return items.flatMap((item) => {
    const name = item.name ?? item.config?.name;
    return name === undefined ? [] : [name];
  });
}

function foreignKeyNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return config(table).foreignKeys.map((key) => key.getName());
}

const ownedBankTables = [
  financeBankCashPools,
  financeCashPoolDirectoryReceipts,
  financeBankStatementImports,
  financeBankStatementRows,
  financeBankStatementIngestionReceipts,
  financeBankStatementClassificationRules,
  financeBankMatches,
  financeBankCashMatchReceipts,
  financeBankExceptions,
  financeBankLiquiditySnapshots,
  financeBankLiquiditySnapshotAdoptionReceipts,
  financeBankLiquidityHistory,
  financeBankLiquidityHeads,
  financeBankExposures,
  financeBankExposureHistory,
  financeBankSnapshotExposureCoverage
] as const;

describe("normalized bank cash and liquidity persistence foundation", () => {
  it("keeps the cash-pool directory reference-only and rejects overlapping active identities", () => {
    expect(getTableName(financeBankCashPools)).toBe("finance_bank_cash_pools");
    expect(Object.keys(getTableColumns(financeBankCashPools))).toEqual([
      "id",
      "currency",
      "bankAccountFingerprint",
      "statementSourceFingerprint",
      "activatedAt",
      "retiredAt",
      "createdAt"
    ]);

    const directoryColumns = Object.keys(getTableColumns(financeBankCashPools)).map((column) =>
      column.toLowerCase()
    );
    expect(directoryColumns.some((column) => /amount|balance|opening|journal/.test(column))).toBe(
      false
    );
    expect(names(config(financeBankCashPools).indexes)).toEqual(
      expect.arrayContaining([
        "finance_bank_cash_pools_active_bank_account_unique",
        "finance_bank_cash_pools_active_statement_source_unique"
      ])
    );
    expect(names(config(financeBankCashPools).uniqueConstraints)).toContain(
      "finance_bank_cash_pools_id_currency_unique"
    );

    expect(getTableName(financeCashPoolDirectoryReceipts)).toBe(
      "finance_cash_pool_directory_receipts"
    );
    expect(Object.keys(getTableColumns(financeCashPoolDirectoryReceipts))).toEqual([
      "receiptId",
      "receiptVersion",
      "bankCashPoolId",
      "currency",
      "bankAccountFingerprint",
      "statementSourceFingerprint",
      "monetaryInitialization",
      "balanceBearingRowsCreated",
      "journalTransactionId",
      "persistenceTransactionBoundaryRef",
      "canonicalPreimage",
      "canonicalDigest",
      "issuedAt"
    ]);
    expect(names(config(financeCashPoolDirectoryReceipts).checks)).toEqual(
      expect.arrayContaining([
        "finance_cash_pool_directory_receipts_reference_only_check",
        "finance_cash_pool_directory_receipts_digest_check"
      ])
    );
  });

  it("stores only verified unrestricted-available snapshots behind a pool/currency CAS head", () => {
    expect(getTableName(financeBankLiquidityHeads)).toBe("finance_bank_liquidity_heads");
    expect(getTableName(financeBankLiquiditySnapshots)).toBe("finance_bank_liquidity_snapshots");
    expect(getTableName(financeBankLiquidityHistory)).toBe("finance_bank_liquidity_history");
    expect(getTableName(financeBankLiquiditySnapshotAdoptionReceipts)).toBe(
      "finance_bank_liquidity_snapshot_adoption_receipts"
    );

    expect(
      getTableColumns(financeBankLiquiditySnapshots).unrestrictedAvailableMinor.getSQLType()
    ).toBe("numeric(38, 0)");
    expect(Object.keys(getTableColumns(financeBankLiquiditySnapshots))).toEqual(
      expect.arrayContaining([
        "bankCashPoolId",
        "currency",
        "balanceBasis",
        "unrestrictedAvailableMinor",
        "sourceCheckpoint",
        "asOf",
        "expiresAt",
        "evidenceDigest",
        "verifiedAt"
      ])
    );
    expect(names(config(financeBankLiquiditySnapshots).checks)).toEqual(
      expect.arrayContaining([
        "finance_bank_liquidity_snapshots_basis_check",
        "finance_bank_liquidity_snapshots_expiry_check",
        "finance_bank_liquidity_snapshots_digest_check"
      ])
    );
    expect(names(config(financeBankLiquidityHeads).uniqueConstraints)).toContain(
      "finance_bank_liquidity_heads_pool_currency_unique"
    );
    expect(getTableColumns(financeBankLiquidityHeads).snapshotState.notNull).toBe(true);
    expect(getTableColumns(financeBankLiquidityHeads).currentSnapshotId.notNull).toBe(false);
    expect(getTableColumns(financeBankLiquidityHeads).unrestrictedAvailableMinor.notNull).toBe(
      false
    );
    expect(getTableColumns(financeBankLiquidityHeads).availableLiquidityMinor.notNull).toBe(false);
    expect(getTableColumns(financeBankLiquidityHistory).snapshotState.notNull).toBe(true);
    expect(getTableColumns(financeBankLiquidityHistory).currentSnapshotId.notNull).toBe(false);
    expect(getTableColumns(financeBankLiquidityHistory).unrestrictedAvailableMinor.notNull).toBe(
      false
    );
    expect(getTableColumns(financeBankLiquidityHistory).availableLiquidityMinor.notNull).toBe(
      false
    );
    expect(names(config(financeBankLiquidityHeads).checks)).toContain(
      "finance_bank_liquidity_heads_snapshot_shape_check"
    );
    expect(names(config(financeBankLiquidityHistory).checks)).toContain(
      "finance_bank_liquidity_history_snapshot_shape_check"
    );
    expect(names(config(financeBankLiquidityHistory).uniqueConstraints)).toEqual(
      expect.arrayContaining([
        "finance_bank_liquidity_history_pool_revision_unique",
        "finance_bank_liquidity_history_receipt_unique"
      ])
    );
  });

  it("persists one payout exposure and unambiguous snapshot/statement coverage", () => {
    expect(getTableName(financeBankExposures)).toBe("finance_bank_exposures");
    expect(getTableName(financeBankExposureHistory)).toBe("finance_bank_exposure_history");
    expect(getTableName(financeBankSnapshotExposureCoverage)).toBe(
      "finance_bank_snapshot_exposure_coverage"
    );

    expect(names(config(financeBankExposures).uniqueConstraints)).toEqual(
      expect.arrayContaining([
        "finance_bank_exposures_payout_unique",
        "finance_bank_exposures_id_pool_currency_unique"
      ])
    );
    expect(names(config(financeBankExposureHistory).checks)).toEqual(
      expect.arrayContaining([
        "finance_bank_exposure_history_state_check",
        "finance_bank_exposure_history_transition_check",
        "finance_bank_exposure_history_digest_check"
      ])
    );
    expect(names(config(financeBankExposureHistory).uniqueConstraints)).toContain(
      "finance_bank_exposure_history_statement_row_unique"
    );
    expect(names(config(financeBankSnapshotExposureCoverage).uniqueConstraints)).toContain(
      "finance_bank_snapshot_exposure_coverage_exact_unique"
    );
    expect(foreignKeyNames(financeBankSnapshotExposureCoverage)).toEqual(
      expect.arrayContaining([
        "finance_bank_snapshot_exposure_coverage_exposure_fk",
        "finance_bank_snapshot_exposure_coverage_snapshot_fk",
        "finance_bank_snapshot_exposure_coverage_statement_row_fk"
      ])
    );
  });

  it("deduplicates immutable statement facts by exact artifact and bank natural keys", () => {
    expect(getTableName(financeBankStatementImports)).toBe("finance_bank_statement_imports");
    expect(getTableName(financeBankStatementRows)).toBe("finance_bank_statement_rows");
    expect(getTableName(financeBankStatementIngestionReceipts)).toBe(
      "finance_bank_statement_ingestion_receipts"
    );
    expect(Object.keys(getTableColumns(financeBankStatementIngestionReceipts))).toEqual(
      expect.arrayContaining(["sourceStatementId", "sourceRowId"])
    );

    expect(names(config(financeBankStatementImports).uniqueConstraints)).toEqual(
      expect.arrayContaining([
        "finance_bank_statement_imports_artifact_unique",
        "finance_bank_statement_imports_checkpoint_version_unique"
      ])
    );
    expect(names(config(financeBankStatementRows).uniqueConstraints)).toEqual(
      expect.arrayContaining([
        "finance_bank_statement_rows_entry_unique",
        "finance_bank_statement_rows_natural_unique"
      ])
    );
    expect(getTableColumns(financeBankStatementRows).signedAmountMinor.getSQLType()).toBe(
      "numeric(38, 0)"
    );
    expect(names(config(financeBankStatementRows).checks)).toEqual(
      expect.arrayContaining([
        "finance_bank_statement_rows_signed_direction_check",
        "finance_bank_statement_rows_reference_check"
      ])
    );

    const semanticColumns = [
      ...Object.keys(getTableColumns(financeBankStatementImports)),
      ...Object.keys(getTableColumns(financeBankStatementRows))
    ].map((column) => column.toLowerCase());
    expect(
      semanticColumns.some((column) =>
        /rawpayload|raw_payload|payload|plaintext|ciphertext|objectkey|signedurl/.test(column)
      )
    ).toBe(false);
  });

  it("binds each bank-cash mutation once to ingestion, discriminated authority and a sealed journal", () => {
    expect(getTableName(financeBankStatementClassificationRules)).toBe(
      "finance_bank_statement_classification_rules"
    );
    expect(getTableName(financeBankMatches)).toBe("finance_bank_matches");
    expect(getTableName(financeBankCashMatchReceipts)).toBe("finance_bank_cash_match_receipts");
    expect(getTableName(financeBankExceptions)).toBe("finance_bank_exceptions");

    expect(names(config(financeBankMatches).uniqueConstraints)).toEqual(
      expect.arrayContaining([
        "finance_bank_matches_statement_row_unique",
        "finance_bank_matches_journal_unique"
      ])
    );
    expect(names(config(financeBankMatches).indexes)).toEqual(
      expect.arrayContaining([
        "finance_bank_matches_merchant_payout_authority_unique",
        "finance_bank_matches_merchant_payout_id_unique",
        "finance_bank_matches_merchant_wire_id_unique",
        "finance_bank_matches_payout_authority_unique",
        "finance_bank_matches_rule_authority_unique"
      ])
    );
    expect(foreignKeyNames(financeBankMatches)).toEqual(
      expect.arrayContaining([
        "finance_bank_matches_statement_ingestion_receipt_fk",
        "finance_bank_matches_journal_fk",
        "finance_bank_matches_journal_source_fk",
        "finance_bank_matches_merchant_provider_account_fk"
      ])
    );
    expect(names(config(financeBankMatches).checks)).toEqual(
      expect.arrayContaining([
        "finance_bank_matches_authority_shape_check",
        "finance_bank_matches_result_check"
      ])
    );

    const matchColumns = Object.keys(getTableColumns(financeBankMatches));
    expect(matchColumns).toEqual(
      expect.arrayContaining([
        "merchantPayoutReceiptId",
        "merchantPayoutReceiptVersion",
        "merchantPayoutReceiptDigest",
        "merchantProviderAccountSeriesId",
        "merchantProviderAccountId",
        "merchantProviderIdentityVersion",
        "merchantPayoutId",
        "merchantProviderBankPayoutId",
        "merchantBankReference"
      ])
    );
    expect(matchColumns).not.toEqual(
      expect.arrayContaining([
        "merchantSettlementReceiptId",
        "merchantSettlementReceiptVersion",
        "merchantSettlementReceiptDigest"
      ])
    );
    expect(matchColumns).not.toEqual(
      expect.arrayContaining([
        "economicPaymentIntentId",
        "economicPaymentClearingVersion",
        "clearingVersion",
        "paymentState"
      ])
    );
    expect(names(config(financeBankCashMatchReceipts).uniqueConstraints)).toEqual(
      expect.arrayContaining([
        "finance_bank_cash_match_receipts_match_unique",
        "finance_bank_cash_match_receipts_boundary_unique"
      ])
    );
    expect(foreignKeyNames(financeBankExceptions)).toEqual(
      expect.arrayContaining([
        "finance_bank_exceptions_resolution_journal_fk",
        "finance_bank_exceptions_resolution_source_fk"
      ])
    );
    for (const receiptTable of [
      financeCashPoolDirectoryReceipts,
      financeBankStatementIngestionReceipts,
      financeBankLiquiditySnapshotAdoptionReceipts,
      financeBankCashMatchReceipts
    ]) {
      const receiptColumns = getTableColumns(receiptTable);
      expect(receiptColumns.receiptId.hasDefault).toBe(true);
      expect(receiptColumns.canonicalPreimage.hasDefault).toBe(true);
      expect(receiptColumns.canonicalDigest.hasDefault).toBe(true);
    }
  });

  it("uses a primary key or inline unique constraint for every foreign-key target", () => {
    for (const table of ownedBankTables) {
      for (const foreignKey of config(table).foreignKeys) {
        const reference = (
          foreignKey as unknown as {
            reference(): {
              foreignTable: Parameters<typeof getTableConfig>[0];
              foreignColumns: Array<{ name: string; primary: boolean }>;
            };
          }
        ).reference();
        const targetColumnNames = reference.foreignColumns.map((column) => column.name);
        const targetConfig = config(reference.foreignTable);
        const hasColumnPrimaryKey =
          reference.foreignColumns.length === 1 && reference.foreignColumns[0]?.primary === true;
        const hasTablePrimaryKey = targetConfig.primaryKeys.some(
          (primaryKey) =>
            primaryKey.columns.map((column) => column.name).join("|") ===
            targetColumnNames.join("|")
        );
        const hasInlineUniqueConstraint = targetConfig.uniqueConstraints.some(
          (constraint) =>
            constraint.columns.map((column) => column.name).join("|") ===
            targetColumnNames.join("|")
        );

        expect(
          hasColumnPrimaryKey || hasTablePrimaryKey || hasInlineUniqueConstraint,
          `${foreignKey.getName()} must not depend on a late or partial unique index`
        ).toBe(true);
      }
    }
  });

  it("installs DB clocks, exact-source validation, CAS fences and append-only guards", () => {
    for (const ddl of [financeBankCashIntegritySql, financeBankLiquidityIntegritySql]) {
      const functions = ddl.match(
        /create or replace function[\s\S]*?(?=create or replace function|$)/g
      );
      expect(functions).not.toBeNull();
      for (const integrityFunction of functions ?? []) {
        expect(integrityFunction).toContain("set search_path = pg_catalog, public");
      }
    }

    const cashSql = financeBankCashIntegritySql.replaceAll(/\s+/g, " ").toLowerCase();
    expect(cashSql).toContain("clock_timestamp()");
    expect(cashSql).toContain("digest(new.canonical_preimage, 'sha256')");
    expect(cashSql).toContain("statement artifact binding does not match the exact cash pool");
    expect(cashSql).toContain("bank cash match requires the exact statement ingestion receipt");
    expect(cashSql).toContain("bank cash match journal must be sealed");
    expect(cashSql).toContain("journal source identity does not match the bank statement fact");
    expect(cashSql).toContain("bank cash match amount must equal the exact statement fact");
    expect(cashSql).toContain("merchant payout bank reference does not match the statement fact");
    expect(cashSql).toContain(
      "merchant payout provider identity does not match the sealed journal"
    );
    expect(cashSql).toContain("bank statement row predates cash pool activation");
    expect(cashSql).toContain("bank suspense reclassification cannot change bank_cash twice");
    expect(cashSql).toContain("bank exception history identity drift");
    expect(cashSql).toContain("statement row requires a committed ingestion receipt");
    expect(cashSql).toContain("bank cash match requires its nominal commit receipt");
    expect(cashSql).not.toContain("update finance_economic_payment");
    expect(cashSql).not.toContain("update finance_payment_clearing");

    for (const tableName of [
      "finance_bank_statement_imports",
      "finance_bank_statement_rows",
      "finance_bank_statement_ingestion_receipts",
      "finance_bank_statement_classification_rules",
      "finance_bank_matches",
      "finance_bank_cash_match_receipts",
      "finance_bank_exceptions"
    ]) {
      expect(cashSql).toContain(`before truncate on ${tableName}`);
    }

    const liquiditySql = financeBankLiquidityIntegritySql.replaceAll(/\s+/g, " ").toLowerCase();
    expect(liquiditySql).toContain("clock_timestamp()");
    expect(liquiditySql).toContain("expected_revision");
    expect(liquiditySql).toContain("liquidity head revision must advance by one");
    expect(liquiditySql).toContain("liquidity history requires its committed head revision");
    expect(liquiditySql).toContain("bank exposure transition is invalid");
    expect(liquiditySql).toContain("bank exposure statement amount is invalid");
    expect(liquiditySql).toContain("exact manual-payout bank match");
    expect(liquiditySql).toContain("snapshot coverage is ambiguous");
    expect(liquiditySql).toContain("exact payout debit transition");
    expect(liquiditySql).toContain("coverage exceeds the exact statement amount");
    expect(liquiditySql).toContain("snapshot must still be eligible when adopted");
    expect(liquiditySql).toContain("snapshot predates cash pool activation");
    expect(liquiditySql).toContain("current_revision := 0");
    expect(liquiditySql).toContain("initial liquidity head requires a real bank fact or snapshot");
    expect(liquiditySql).toContain("liquidity history requires the exact bank cash match");
    expect(liquiditySql).toContain("cannot be authorized without an adopted eligible snapshot");
    expect(liquiditySql).toContain("all open payout exposures");
    expect(liquiditySql).toContain("liquidity head must cover every open bank exposure");
    expect(liquiditySql).toContain(
      "'committed', 'initiated_unreflected', 'paid_unreflected', 'statement_reflected'"
    );
    expect(liquiditySql).toContain(
      "snapshot adoption receipt requires its committed liquidity revision"
    );
    for (const tableName of [
      "finance_bank_liquidity_snapshots",
      "finance_bank_liquidity_snapshot_adoption_receipts",
      "finance_bank_liquidity_history",
      "finance_bank_exposure_history",
      "finance_bank_snapshot_exposure_coverage"
    ]) {
      expect(liquiditySql).toContain(`before truncate on ${tableName}`);
    }
  });

  it("defers only receipt owners that do not exist yet and never targets legacy payout rows", () => {
    expect(financeBankCashDeferredForeignKeys).toEqual([
      {
        sourceTable: "finance_bank_matches",
        sourceColumns: [
          "merchant_payout_receipt_id",
          "merchant_payout_receipt_version",
          "merchant_payout_receipt_digest",
          "merchant_provider_account_series_id",
          "merchant_provider_account_id",
          "merchant_provider_identity_version",
          "merchant_payout_id",
          "merchant_provider_bank_payout_id",
          "bank_cash_pool_id",
          "amount_minor",
          "currency",
          "merchant_bank_reference"
        ],
        targetTable: "finance_merchant_payout_confirmation_commit_receipts",
        targetColumns: [
          "receipt_id",
          "receipt_version",
          "canonical_digest",
          "provider_account_series_id",
          "provider_account_id",
          "provider_identity_version",
          "merchant_payout_id",
          "provider_bank_payout_id",
          "bank_cash_pool_id",
          "amount_minor",
          "currency",
          "bank_reference"
        ],
        discriminator: { column: "authority_kind", value: "merchant_settlement" }
      },
      {
        sourceTable: "finance_bank_matches",
        sourceColumns: [
          "payout_paid_receipt_id",
          "payout_paid_receipt_version",
          "payout_paid_receipt_digest"
        ],
        targetTable: "finance_payout_paid_confirmation_commit_receipts",
        targetColumns: ["receipt_id", "receipt_version", "canonical_digest"],
        discriminator: { column: "authority_kind", value: "manual_payout" }
      }
    ]);
    expect(JSON.stringify(financeBankCashDeferredForeignKeys)).not.toContain(
      '"targetTable":"payout_requests"'
    );
  });
});
