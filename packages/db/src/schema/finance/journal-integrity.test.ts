import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  financeLedgerAccountCodeValues,
  financeLedgerChart,
  financeSourceOperationsByKind
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";
import {
  financeAccounts,
  financeAllocationLinkProofEntries,
  financeAllocationLinkProofs,
  financeJournalEntries,
  financeJournalTransactions,
  financePersistenceCommitReceipts,
  financeSourceIdentities,
  persistedFinanceLedgerAccountCodeValues,
  persistedFinanceSourceScopeKindValues
} from "./ledger.schema";
import { financeJournalIntegritySql } from "./journal-integrity.sql";

describe("sealed finance journal schema", () => {
  it("persists the exact approved 22-account operational chart without generic accounts", () => {
    expect(persistedFinanceLedgerAccountCodeValues).toEqual(financeLedgerAccountCodeValues);
    expect(persistedFinanceLedgerAccountCodeValues).toHaveLength(22);
    expect(persistedFinanceLedgerAccountCodeValues).not.toContain("platform_clearing");
    expect(persistedFinanceLedgerAccountCodeValues).not.toContain("manual_adjustment");
    expect(Object.keys(financeLedgerChart)).toEqual([...financeLedgerAccountCodeValues]);

    expect(getTableName(financeAccounts)).toBe("finance_accounts");
    expect(Object.keys(getTableColumns(financeAccounts))).toEqual([
      "id",
      "code",
      "accountClass",
      "normalSide",
      "scopeKind",
      "providerAccountVersionId",
      "providerAccountSeriesId",
      "providerAccountId",
      "providerIdentityVersion",
      "bankCashPoolId",
      "astrologerUserId",
      "refundId",
      "payoutRequestId",
      "currency",
      "createdAt"
    ]);

    const config = getTableConfig(financeAccounts);
    expect(config.checks.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_accounts_code_check",
        "finance_accounts_class_check",
        "finance_accounts_normal_side_check",
        "finance_accounts_scope_kind_check",
        "finance_accounts_chart_shape_check",
        "finance_accounts_scope_shape_check",
        "finance_accounts_provider_identity_check",
        "finance_accounts_scope_identifier_check",
        "finance_accounts_currency_check"
      ])
    );
    expect(config.indexes.map((candidate) => candidate.config.name)).toEqual(
      expect.arrayContaining([
        "finance_accounts_provider_unique",
        "finance_accounts_provider_bank_unique",
        "finance_accounts_bank_unique",
        "finance_accounts_astrologer_unique",
        "finance_accounts_refund_payout_unique",
        "finance_accounts_platform_unique"
      ])
    );
    const providerIdentityForeignKey = config.foreignKeys.find(
      (candidate) => candidate.getName() === "finance_accounts_provider_identity_fk"
    );
    expect(providerIdentityForeignKey?.reference().columns.map((column) => column.name)).toEqual([
      "provider_account_version_id",
      "provider_account_series_id",
      "provider_account_id",
      "provider_identity_version"
    ]);
    expect(
      providerIdentityForeignKey?.reference().foreignColumns.map((column) => column.name)
    ).toEqual(["id", "series_id", "provider_account_id", "identity_version"]);
  });

  it("stores one typed natural source identity for one journal transaction", () => {
    expect(getTableName(financeSourceIdentities)).toBe("finance_source_identities");
    expect(Object.keys(financeSourceOperationsByKind)).toEqual([
      "bank",
      "order",
      "platform_invoice",
      "provider_fee",
      "reserve",
      "payout",
      "refund",
      "chargeback",
      "settlement",
      "correction"
    ]);

    const sourceConfig = getTableConfig(financeSourceIdentities);
    expect(sourceConfig.checks.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_source_identities_kind_operation_check",
        "finance_source_identities_source_id_check",
        "finance_source_identities_scope_kind_check",
        "finance_source_identities_provider_identity_check",
        "finance_source_identities_scope_shape_check",
        "finance_source_identities_scope_identifier_check",
        "finance_source_identities_kind_scope_check"
      ])
    );
    expect(persistedFinanceSourceScopeKindValues).toEqual([
      "internal",
      "provider_account",
      "bank_cash_pool",
      "astrologer",
      "refund_and_payout",
      "provider_account_and_bank_cash_pool",
      "provider_account_and_astrologer",
      "bank_cash_pool_and_astrologer",
      "provider_account_bank_cash_pool_and_astrologer",
      "provider_account_astrologer_refund_and_payout",
      "bank_cash_pool_astrologer_refund_and_payout",
      "provider_account_bank_cash_pool_astrologer_refund_and_payout"
    ]);
    const sourceProviderIdentityForeignKey = sourceConfig.foreignKeys.find(
      (candidate) => candidate.getName() === "finance_source_identities_provider_identity_fk"
    );
    expect(
      sourceProviderIdentityForeignKey?.reference().columns.map((column) => column.name)
    ).toEqual([
      "provider_account_version_id",
      "provider_account_series_id",
      "provider_account_id",
      "provider_identity_version"
    ]);
    expect(
      sourceProviderIdentityForeignKey?.reference().foreignColumns.map((column) => column.name)
    ).toEqual(["id", "series_id", "provider_account_id", "identity_version"]);
    expect(financeSourceIdentities.sourceId.getSQLType()).toBe("varchar(200)");
    expect(sourceConfig.uniqueConstraints.map((candidate) => candidate.name)).toContain(
      "finance_source_identities_natural_unique"
    );

    const transactionConfig = getTableConfig(financeJournalTransactions);
    expect(Object.keys(getTableColumns(financeJournalTransactions))).toEqual([
      "id",
      "sourceIdentityId",
      "occurredAt",
      "postedAt",
      "reversesJournalTransactionId",
      "currency",
      "entryCount",
      "totalDebitMinor",
      "totalCreditMinor",
      "canonicalPreimage",
      "canonicalDigest",
      "sealedAt",
      "createdAt"
    ]);
    expect(financeJournalTransactions.id.getSQLType()).toBe("varchar(200)");
    expect(financeJournalTransactions.reversesJournalTransactionId.getSQLType()).toBe(
      "varchar(200)"
    );
    expect(transactionConfig.uniqueConstraints.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_journal_transactions_source_unique",
        "finance_journal_transactions_id_currency_unique",
        "finance_journal_transactions_id_currency_occurred_unique",
        "finance_journal_transactions_id_digest_unique"
      ])
    );
    expect(transactionConfig.indexes.map((candidate) => candidate.config.name)).toContain(
      "finance_journal_transactions_history_idx"
    );
    expect(transactionConfig.checks.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_journal_transactions_identifier_check",
        "finance_journal_transactions_seal_chronology_check",
        "finance_journal_transactions_canonical_digest_check"
      ])
    );
  });

  it("uses positive string-decoded money and normalized strict proof rows", () => {
    expect(getTableName(financeJournalEntries)).toBe("finance_journal_entries");
    expect(Object.keys(getTableColumns(financeJournalEntries))).toEqual([
      "id",
      "journalTransactionId",
      "occurredAt",
      "entryIndex",
      "accountId",
      "side",
      "amountMinor",
      "currency",
      "originalSaleId",
      "componentId",
      "payableLotId",
      "payoutAllocationId",
      "createdAt"
    ]);
    expect(financeJournalEntries.amountMinor.dataType).toBe("string");
    expect(financeJournalEntries.amountMinor.getSQLType()).toBe("numeric(38, 0)");

    const entryConfig = getTableConfig(financeJournalEntries);
    expect(entryConfig.checks.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_journal_entries_side_check",
        "finance_journal_entries_amount_check",
        "finance_journal_entries_currency_check",
        "finance_journal_entries_index_check",
        "finance_journal_entries_link_identifier_check"
      ])
    );
    expect(entryConfig.uniqueConstraints.map((candidate) => candidate.name)).toContain(
      "finance_journal_entries_transaction_order_unique"
    );
    const accountHistoryIndex = entryConfig.indexes.find(
      (candidate) => candidate.config.name === "finance_journal_entries_account_history_idx"
    );
    expect(
      accountHistoryIndex?.config.columns.map((candidate) =>
        "name" in candidate ? candidate.name : null
      )
    ).toEqual(["account_id", "occurred_at", "journal_transaction_id", "entry_index"]);

    expect(getTableName(financeAllocationLinkProofs)).toBe("finance_allocation_link_proofs");
    expect(getTableName(financeAllocationLinkProofEntries)).toBe(
      "finance_allocation_link_proof_entries"
    );
    expect(getTableName(financePersistenceCommitReceipts)).toBe(
      "finance_persistence_commit_receipts"
    );
    expect(financeAllocationLinkProofEntries.amountMinor.dataType).toBe("string");
    expect(financeAllocationLinkProofs.proofId.getSQLType()).toBe("varchar(200)");
    expect(financeAllocationLinkProofs.operationSnapshotPreviousWalletRevision.dataType).toBe(
      "string"
    );
    expect(financeAllocationLinkProofs.operationSnapshotPreviousWalletRevision.getSQLType()).toBe(
      "numeric(38, 0)"
    );
    expect(
      getTableConfig(financeAllocationLinkProofs).checks.map((candidate) => candidate.name)
    ).toEqual(
      expect.arrayContaining([
        "finance_allocation_link_proofs_digest_check",
        "finance_allocation_link_proofs_identifier_check",
        "finance_allocation_link_proofs_snapshot_digest_check",
        "finance_allocation_link_proofs_snapshot_revision_check"
      ])
    );
    expect(
      getTableConfig(financeAllocationLinkProofEntries).uniqueConstraints.map(
        (candidate) => candidate.name
      )
    ).toEqual(
      expect.arrayContaining([
        "finance_allocation_link_proof_entries_proof_order_unique",
        "finance_allocation_link_proof_entries_journal_entry_unique"
      ])
    );
  });

  it("installs deferred seal/balance proof checks and immutable history guards", () => {
    const normalized = financeJournalIntegritySql.replaceAll(/\s+/g, " ").toLowerCase();

    expect(normalized).toContain("create constraint trigger finance_journal_commit_integrity");
    expect(normalized).toContain("deferrable initially deferred for each row");
    expect(normalized).toContain("finance journal transaction must be sealed before commit");
    expect(normalized).toContain("finance journal transaction is not balanced per currency");
    expect(normalized).toContain(
      "finance journal entry account scope does not match source identity"
    );
    expect(normalized).toContain(
      "finance allocation proof does not strictly mirror journal entries"
    );
    expect(normalized).toContain("finance journal persistence receipt is cross-wired");
    expect(normalized).toContain("finance_online_wallet_refund_applications");
    expect(normalized).toContain("finance_online_wallet_chargeback_cases");
    expect(normalized).toContain("finance_online_wallet_chargeback_resolutions");
    expect(normalized).toContain("source_row.source_kind = 'refund'");
    expect(normalized).toContain("source_row.source_kind = 'chargeback'");
    expect(normalized).toContain("source_row.source_operation_key = 'confirmed'");
    expect(normalized).toContain("mutation.operation_kind = 'refund_confirmed'");
    expect(normalized).toContain("select * into strict transaction_row");
    expect(normalized).toContain("where id = new.id");
    expect(normalized).toContain("create constraint trigger finance_source_identity_owned");
    expect(normalized).toContain(
      "finance source identity must own exactly one journal transaction"
    );
    expect(normalized).toContain(
      "only a typed correction reversal may reference an original transaction"
    );
    expect(normalized).toContain("finance correction reversal must preserve the original entries");
    expect(normalized).toContain(
      "finance correction reversal and replacement must commit as one pair"
    );
    expect(normalized).toContain(
      "paired_receipt.persistence_transaction_boundary_ref = receipt_row.persistence_transaction_boundary_ref"
    );
    expect(normalized).toContain("new.issued_at >= journal_transaction.sealed_at");
    expect(normalized).toContain("new.sealed_at := statement_timestamp()");
    expect(normalized).toContain("new.issued_at := statement_timestamp()");
    expect(normalized).toContain("create extension if not exists pgcrypto");
    expect(normalized.match(/set search_path = pg_catalog, public/g)).toHaveLength(13);
    expect(normalized).toContain("finance_journal_transaction_preimage");
    expect(normalized).toContain("new.canonical_preimage :=");
    expect(normalized).toContain(
      "new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex')"
    );
    expect(normalized).toContain("finance_journal_receipt_preimage");
    expect(normalized).toContain("digest(new.canonical_preimage, 'sha256')");
    expect(normalized).toContain("before update or delete on finance_journal_transactions");
    expect(normalized).toContain("before insert or update or delete on finance_journal_entries");
    expect(normalized).toContain("before truncate on finance_journal_transactions");
    expect(normalized).toContain("before truncate on finance_journal_entries");
    expect(normalized).toContain("before truncate on finance_allocation_link_proofs");
    expect(normalized).toContain("before truncate on finance_source_identities");
  });

  it("keeps chart and journal rows lazy instead of seeding synthetic opening history", () => {
    const baseline = readCurrentMigrationSql().toLowerCase();

    expect(baseline).not.toMatch(/insert\s+into\s+"?finance_accounts"?/);
    expect(baseline).not.toMatch(/insert\s+into\s+"?finance_journal_(transactions|entries)"?/);
  });
});
