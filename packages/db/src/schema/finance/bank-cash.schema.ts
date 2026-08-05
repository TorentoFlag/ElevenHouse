import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { financeArtifacts } from "./finance-artifacts.schema";
import {
  financeCurrencyValues,
  financeNumeric38String,
  financeRevisionString,
  formatFinanceSqlValues
} from "./finance-values";
import { financeJournalTransactions, financeSourceIdentities } from "./ledger.schema";
import { financeProviderAccounts } from "./provider-accounts.schema";

const digestPattern = "^sha256:[0-9a-f]{64}$";
const digestSqlPattern = sql.raw(`'${digestPattern}'`);
const statementDirectionValues = ["credit", "debit"] as const;
const statementDedupeResultValues = ["inserted", "replay"] as const;
const bankMatchAuthorityValues = [
  "merchant_settlement",
  "manual_payout",
  "unmatched_to_suspense"
] as const;
const bankMatchResultValues = [
  "merchant_settlement",
  "manual_payout",
  "unmatched_debit",
  "unmatched_credit"
] as const;
const bankExceptionKindValues = [
  "artifact_scope_mismatch",
  "duplicate_natural_key_conflict",
  "unsupported_statement_row",
  "unmatched_debit",
  "unmatched_credit",
  "match_authority_conflict"
] as const;
const bankExceptionStateValues = ["open", "quarantined", "resolved"] as const;

function identifierCheck(...columns: Array<{ getSQL(): unknown }>) {
  return sql.join(
    columns.map(
      (column) =>
        sql`length(${column}) between 1 and 320 and btrim(${column}) = ${column} and ${column} !~ '[[:cntrl:]]'`
    ),
    sql` and `
  );
}

function nullableIdentifierCheck(...columns: Array<{ getSQL(): unknown }>) {
  return sql.join(
    columns.map(
      (column) =>
        sql`(${column} is null or (length(${column}) between 1 and 320 and btrim(${column}) = ${column} and ${column} !~ '[[:cntrl:]]'))`
    ),
    sql` and `
  );
}

export const financeBankCashPools = pgTable(
  "finance_bank_cash_pools",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    currency: text("currency").notNull(),
    bankAccountFingerprint: varchar("bank_account_fingerprint", { length: 71 }).notNull(),
    statementSourceFingerprint: varchar("statement_source_fingerprint", {
      length: 71
    }).notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("finance_bank_cash_pools_id_currency_unique").on(table.id, table.currency),
    unique("finance_bank_cash_pools_exact_identity_unique").on(
      table.id,
      table.currency,
      table.bankAccountFingerprint,
      table.statementSourceFingerprint
    ),
    uniqueIndex("finance_bank_cash_pools_active_bank_account_unique")
      .on(table.bankAccountFingerprint, table.currency)
      .where(sql`${table.retiredAt} is null`),
    uniqueIndex("finance_bank_cash_pools_active_statement_source_unique")
      .on(table.statementSourceFingerprint, table.currency)
      .where(sql`${table.retiredAt} is null`),
    check(
      "finance_bank_cash_pools_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check("finance_bank_cash_pools_identifier_check", identifierCheck(table.id)),
    check(
      "finance_bank_cash_pools_fingerprint_check",
      sql`${table.bankAccountFingerprint} ~ ${digestSqlPattern}
        and ${table.statementSourceFingerprint} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_bank_cash_pools_lifecycle_check",
      sql`${table.retiredAt} is null or ${table.retiredAt} >= ${table.activatedAt}`
    ),
    index("finance_bank_cash_pools_active_lookup_idx").on(table.currency, table.retiredAt, table.id)
  ]
);

export const financeCashPoolDirectoryReceipts = pgTable(
  "finance_cash_pool_directory_receipts",
  {
    receiptId: varchar("receipt_id", { length: 200 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    receiptVersion: integer("receipt_version").notNull().default(1),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    bankAccountFingerprint: varchar("bank_account_fingerprint", { length: 71 }).notNull(),
    statementSourceFingerprint: varchar("statement_source_fingerprint", {
      length: 71
    }).notNull(),
    monetaryInitialization: text("monetary_initialization")
      .notNull()
      .default("reference_only_zero"),
    balanceBearingRowsCreated: integer("balance_bearing_rows_created").notNull().default(0),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    }).notNull(),
    canonicalPreimage: text("canonical_preimage")
      .notNull()
      .default(sql`''`),
    canonicalDigest: varchar("canonical_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_cash_pool_directory_receipts_pool_fk",
      columns: [
        table.bankCashPoolId,
        table.currency,
        table.bankAccountFingerprint,
        table.statementSourceFingerprint
      ],
      foreignColumns: [
        financeBankCashPools.id,
        financeBankCashPools.currency,
        financeBankCashPools.bankAccountFingerprint,
        financeBankCashPools.statementSourceFingerprint
      ]
    }).onDelete("restrict"),
    unique("finance_cash_pool_directory_receipts_exact_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest
    ),
    unique("finance_cash_pool_directory_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    check(
      "finance_cash_pool_directory_receipts_reference_only_check",
      sql`${table.receiptVersion} = 1
        and ${table.monetaryInitialization} = 'reference_only_zero'
        and ${table.balanceBearingRowsCreated} = 0
        and ${table.journalTransactionId} is null`
    ),
    check(
      "finance_cash_pool_directory_receipts_digest_check",
      sql`length(${table.canonicalPreimage}) > 0 and ${table.canonicalDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_cash_pool_directory_receipts_identifier_check",
      identifierCheck(
        table.receiptId,
        table.bankCashPoolId,
        table.persistenceTransactionBoundaryRef
      )
    )
  ]
);

export const financeBankStatementImports = pgTable(
  "finance_bank_statement_imports",
  {
    id: varchar("id", { length: 200 }).primaryKey(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    artifactId: varchar("artifact_id", { length: 160 }).notNull(),
    artifactSha256Digest: varchar("artifact_sha256_digest", { length: 71 }).notNull(),
    artifactByteLength: financeNumeric38String("artifact_byte_length").notNull(),
    statementSourceFingerprint: varchar("statement_source_fingerprint", {
      length: 71
    }).notNull(),
    sourceStatementId: varchar("source_statement_id", { length: 320 }).notNull(),
    sourceCheckpoint: varchar("source_checkpoint", { length: 320 }).notNull(),
    importVersion: financeRevisionString("import_version").notNull(),
    normalizedRowsDigest: varchar("normalized_rows_digest", { length: 71 }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_statement_imports_pool_fk",
      columns: [table.bankCashPoolId, table.currency],
      foreignColumns: [financeBankCashPools.id, financeBankCashPools.currency]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_statement_imports_artifact_fk",
      columns: [table.artifactId],
      foreignColumns: [financeArtifacts.id]
    }).onDelete("restrict"),
    unique("finance_bank_statement_imports_artifact_unique").on(table.artifactId),
    unique("finance_bank_statement_imports_checkpoint_version_unique").on(
      table.bankCashPoolId,
      table.currency,
      table.sourceStatementId,
      table.sourceCheckpoint,
      table.importVersion
    ),
    unique("finance_bank_statement_imports_exact_owner_unique").on(
      table.id,
      table.bankCashPoolId,
      table.currency,
      table.sourceStatementId
    ),
    unique("finance_bank_statement_imports_receipt_binding_unique").on(
      table.id,
      table.artifactId,
      table.bankCashPoolId,
      table.currency,
      table.importVersion,
      table.sourceStatementId
    ),
    check(
      "finance_bank_statement_imports_shape_check",
      sql`${table.importVersion} >= 1
        and ${table.artifactByteLength} >= 0
        and ${table.artifactSha256Digest} ~ ${digestSqlPattern}
        and ${table.statementSourceFingerprint} ~ ${digestSqlPattern}
        and ${table.normalizedRowsDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_bank_statement_imports_identifier_check",
      identifierCheck(
        table.id,
        table.bankCashPoolId,
        table.artifactId,
        table.sourceStatementId,
        table.sourceCheckpoint
      )
    ),
    index("finance_bank_statement_imports_checkpoint_idx").on(
      table.bankCashPoolId,
      table.currency,
      table.importVersion,
      table.importedAt
    )
  ]
);

export const financeBankStatementRows = pgTable(
  "finance_bank_statement_rows",
  {
    bankStatementEntryId: varchar("bank_statement_entry_id", { length: 200 }).primaryKey(),
    statementImportId: varchar("statement_import_id", { length: 200 }).notNull(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    sourceStatementId: varchar("source_statement_id", { length: 320 }).notNull(),
    sourceRowId: varchar("source_row_id", { length: 320 }).notNull(),
    direction: text("direction").notNull(),
    signedAmountMinor: financeNumeric38String("signed_amount_minor").notNull(),
    bankReference: varchar("bank_reference", { length: 320 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    evidenceDigest: varchar("evidence_digest", { length: 71 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_statement_rows_import_fk",
      columns: [
        table.statementImportId,
        table.bankCashPoolId,
        table.currency,
        table.sourceStatementId
      ],
      foreignColumns: [
        financeBankStatementImports.id,
        financeBankStatementImports.bankCashPoolId,
        financeBankStatementImports.currency,
        financeBankStatementImports.sourceStatementId
      ]
    }).onDelete("restrict"),
    unique("finance_bank_statement_rows_entry_unique").on(
      table.bankStatementEntryId,
      table.bankCashPoolId,
      table.currency
    ),
    unique("finance_bank_statement_rows_receipt_binding_unique").on(
      table.bankStatementEntryId,
      table.statementImportId,
      table.bankCashPoolId,
      table.currency,
      table.sourceStatementId,
      table.sourceRowId
    ),
    unique("finance_bank_statement_rows_natural_unique").on(
      table.bankCashPoolId,
      table.sourceStatementId,
      table.sourceRowId
    ),
    check(
      "finance_bank_statement_rows_direction_check",
      sql`${table.direction} in ${sql.raw(formatFinanceSqlValues(statementDirectionValues))}`
    ),
    check(
      "finance_bank_statement_rows_signed_direction_check",
      sql`(${table.direction} = 'credit' and ${table.signedAmountMinor} > 0)
        or (${table.direction} = 'debit' and ${table.signedAmountMinor} < 0)`
    ),
    check(
      "finance_bank_statement_rows_reference_check",
      identifierCheck(
        table.bankStatementEntryId,
        table.statementImportId,
        table.bankCashPoolId,
        table.sourceStatementId,
        table.sourceRowId,
        table.bankReference
      )
    ),
    check(
      "finance_bank_statement_rows_time_check",
      sql`${table.observedAt} >= ${table.occurredAt}`
    ),
    check(
      "finance_bank_statement_rows_digest_check",
      sql`${table.evidenceDigest} ~ ${digestSqlPattern}`
    ),
    index("finance_bank_statement_rows_unmatched_lookup_idx").on(
      table.bankCashPoolId,
      table.currency,
      table.occurredAt,
      table.bankStatementEntryId
    ),
    index("finance_bank_statement_rows_reference_lookup_idx").on(
      table.bankCashPoolId,
      table.bankReference,
      table.occurredAt
    )
  ]
);

export const financeBankStatementIngestionReceipts = pgTable(
  "finance_bank_statement_ingestion_receipts",
  {
    receiptId: varchar("receipt_id", { length: 200 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    receiptVersion: integer("receipt_version").notNull().default(1),
    statementImportId: varchar("statement_import_id", { length: 200 }).notNull(),
    bankStatementEntryId: varchar("bank_statement_entry_id", { length: 200 }).notNull(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    sourceStatementId: varchar("source_statement_id", { length: 320 }).notNull(),
    sourceRowId: varchar("source_row_id", { length: 320 }).notNull(),
    artifactId: varchar("artifact_id", { length: 160 }).notNull(),
    artifactSha256Digest: varchar("artifact_sha256_digest", { length: 71 }).notNull(),
    artifactByteLength: financeNumeric38String("artifact_byte_length").notNull(),
    statementSourceFingerprint: varchar("statement_source_fingerprint", {
      length: 71
    }).notNull(),
    statementImportVersion: financeRevisionString("statement_import_version").notNull(),
    dedupeResult: text("dedupe_result").notNull(),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    }).notNull(),
    canonicalPreimage: text("canonical_preimage")
      .notNull()
      .default(sql`''`),
    canonicalDigest: varchar("canonical_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_statement_ingestion_receipts_import_fk",
      columns: [
        table.statementImportId,
        table.artifactId,
        table.bankCashPoolId,
        table.currency,
        table.statementImportVersion,
        table.sourceStatementId
      ],
      foreignColumns: [
        financeBankStatementImports.id,
        financeBankStatementImports.artifactId,
        financeBankStatementImports.bankCashPoolId,
        financeBankStatementImports.currency,
        financeBankStatementImports.importVersion,
        financeBankStatementImports.sourceStatementId
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_statement_ingestion_receipts_row_fk",
      columns: [
        table.bankStatementEntryId,
        table.statementImportId,
        table.bankCashPoolId,
        table.currency,
        table.sourceStatementId,
        table.sourceRowId
      ],
      foreignColumns: [
        financeBankStatementRows.bankStatementEntryId,
        financeBankStatementRows.statementImportId,
        financeBankStatementRows.bankCashPoolId,
        financeBankStatementRows.currency,
        financeBankStatementRows.sourceStatementId,
        financeBankStatementRows.sourceRowId
      ]
    }).onDelete("restrict"),
    unique("finance_bank_statement_ingestion_receipts_exact_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest
    ),
    unique("finance_bank_statement_ingestion_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    check(
      "finance_bank_statement_ingestion_receipts_shape_check",
      sql`${table.receiptVersion} = 1
        and ${table.statementImportVersion} >= 1
        and ${table.artifactByteLength} >= 0
        and ${table.dedupeResult} in ${sql.raw(formatFinanceSqlValues(statementDedupeResultValues))}
        and ${table.journalTransactionId} is null`
    ),
    check(
      "finance_bank_statement_ingestion_receipts_digest_check",
      sql`length(${table.canonicalPreimage}) > 0
        and ${table.canonicalDigest} ~ ${digestSqlPattern}
        and ${table.artifactSha256Digest} ~ ${digestSqlPattern}
        and ${table.statementSourceFingerprint} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_bank_statement_ingestion_receipts_identifier_check",
      identifierCheck(
        table.receiptId,
        table.statementImportId,
        table.bankStatementEntryId,
        table.bankCashPoolId,
        table.sourceStatementId,
        table.sourceRowId,
        table.artifactId,
        table.persistenceTransactionBoundaryRef
      )
    ),
    index("finance_bank_statement_ingestion_receipts_row_idx").on(
      table.bankCashPoolId,
      table.bankStatementEntryId,
      table.committedAt
    )
  ]
);

export const financeBankStatementClassificationRules = pgTable(
  "finance_bank_statement_classification_rules",
  {
    ruleId: varchar("rule_id", { length: 160 }).notNull(),
    ruleVersion: integer("rule_version").notNull(),
    ruleDigest: varchar("rule_digest", { length: 71 }).notNull(),
    authorityRef: varchar("authority_ref", { length: 320 }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      name: "finance_bank_statement_classification_rules_pk",
      columns: [table.ruleId, table.ruleVersion]
    }),
    unique("finance_bank_statement_classification_rules_exact_unique").on(
      table.ruleId,
      table.ruleVersion,
      table.ruleDigest
    ),
    check(
      "finance_bank_statement_classification_rules_shape_check",
      sql`${table.ruleVersion} >= 1 and ${table.ruleDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_bank_statement_classification_rules_identifier_check",
      identifierCheck(table.ruleId, table.authorityRef)
    )
  ]
);

/**
 * Launch invariant: one ArcPay merchant payout/wire is matched to one full credit row; one manual
 * astrologer payout/transfer is matched to one full debit row. Unknown rows are classified in
 * full to directional suspense. Any future batched-bank allocation model requires a new approved
 * domain/source-identity contract and is intentionally not inferred here.
 */
export const financeBankMatches = pgTable(
  "finance_bank_matches",
  {
    matchId: varchar("match_id", { length: 200 }).primaryKey(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    bankStatementEntryId: varchar("bank_statement_entry_id", { length: 200 }).notNull(),
    statementIngestionReceiptId: varchar("statement_ingestion_receipt_id", {
      length: 200
    }).notNull(),
    statementIngestionReceiptVersion: integer("statement_ingestion_receipt_version")
      .notNull()
      .default(1),
    statementIngestionReceiptDigest: varchar("statement_ingestion_receipt_digest", {
      length: 71
    }).notNull(),
    authorityKind: text("authority_kind").notNull(),
    merchantPayoutReceiptId: varchar("merchant_payout_receipt_id", { length: 200 }),
    merchantPayoutReceiptVersion: integer("merchant_payout_receipt_version"),
    merchantPayoutReceiptDigest: varchar("merchant_payout_receipt_digest", {
      length: 71
    }),
    merchantProviderAccountSeriesId: varchar("merchant_provider_account_series_id", {
      length: 160
    }),
    merchantProviderAccountId: varchar("merchant_provider_account_id", { length: 160 }),
    merchantProviderIdentityVersion: integer("merchant_provider_identity_version"),
    merchantPayoutId: varchar("merchant_payout_id", { length: 200 }),
    merchantProviderBankPayoutId: varchar("merchant_provider_bank_payout_id", { length: 200 }),
    merchantBankReference: varchar("merchant_bank_reference", { length: 320 }),
    payoutPaidReceiptId: varchar("payout_paid_receipt_id", { length: 200 }),
    payoutPaidReceiptVersion: integer("payout_paid_receipt_version"),
    payoutPaidReceiptDigest: varchar("payout_paid_receipt_digest", { length: 71 }),
    classificationRuleId: varchar("classification_rule_id", { length: 160 }),
    classificationRuleVersion: integer("classification_rule_version"),
    classificationRuleDigest: varchar("classification_rule_digest", { length: 71 }),
    matchResult: text("match_result").notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }).notNull(),
    journalTransactionDigest: varchar("journal_transaction_digest", { length: 71 }).notNull(),
    journalSourceIdentityId: uuid("journal_source_identity_id").notNull(),
    expectedBankLiquidityRevision: financeRevisionString(
      "expected_bank_liquidity_revision"
    ).notNull(),
    bankLiquidityRevision: financeRevisionString("bank_liquidity_revision").notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_matches_statement_row_fk",
      columns: [table.bankStatementEntryId, table.bankCashPoolId, table.currency],
      foreignColumns: [
        financeBankStatementRows.bankStatementEntryId,
        financeBankStatementRows.bankCashPoolId,
        financeBankStatementRows.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_matches_statement_ingestion_receipt_fk",
      columns: [
        table.statementIngestionReceiptId,
        table.statementIngestionReceiptVersion,
        table.statementIngestionReceiptDigest
      ],
      foreignColumns: [
        financeBankStatementIngestionReceipts.receiptId,
        financeBankStatementIngestionReceipts.receiptVersion,
        financeBankStatementIngestionReceipts.canonicalDigest
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_matches_merchant_provider_account_fk",
      columns: [
        table.merchantProviderAccountSeriesId,
        table.merchantProviderAccountId,
        table.merchantProviderIdentityVersion
      ],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_matches_journal_fk",
      columns: [table.journalTransactionId, table.journalTransactionDigest],
      foreignColumns: [financeJournalTransactions.id, financeJournalTransactions.canonicalDigest]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_matches_journal_source_fk",
      columns: [table.journalSourceIdentityId],
      foreignColumns: [financeSourceIdentities.id]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_matches_classification_rule_fk",
      columns: [
        table.classificationRuleId,
        table.classificationRuleVersion,
        table.classificationRuleDigest
      ],
      foreignColumns: [
        financeBankStatementClassificationRules.ruleId,
        financeBankStatementClassificationRules.ruleVersion,
        financeBankStatementClassificationRules.ruleDigest
      ]
    }).onDelete("restrict"),
    unique("finance_bank_matches_statement_row_unique").on(table.bankStatementEntryId),
    unique("finance_bank_matches_journal_unique").on(table.journalTransactionId),
    unique("finance_bank_matches_exact_receipt_binding_unique").on(
      table.matchId,
      table.bankCashPoolId,
      table.currency,
      table.bankStatementEntryId,
      table.matchResult,
      table.journalTransactionId,
      table.journalTransactionDigest,
      table.bankLiquidityRevision
    ),
    unique("finance_bank_matches_boundary_unique").on(table.persistenceTransactionBoundaryRef),
    uniqueIndex("finance_bank_matches_merchant_payout_authority_unique")
      .on(
        table.merchantPayoutReceiptId,
        table.merchantPayoutReceiptVersion,
        table.merchantPayoutReceiptDigest
      )
      .where(sql`${table.authorityKind} = 'merchant_settlement'`),
    uniqueIndex("finance_bank_matches_merchant_payout_id_unique")
      .on(
        table.merchantProviderAccountSeriesId,
        table.merchantProviderAccountId,
        table.merchantProviderIdentityVersion,
        table.merchantPayoutId
      )
      .where(sql`${table.authorityKind} = 'merchant_settlement'`),
    uniqueIndex("finance_bank_matches_merchant_wire_id_unique")
      .on(
        table.merchantProviderAccountSeriesId,
        table.merchantProviderAccountId,
        table.merchantProviderIdentityVersion,
        table.merchantProviderBankPayoutId
      )
      .where(sql`${table.authorityKind} = 'merchant_settlement'`),
    uniqueIndex("finance_bank_matches_payout_authority_unique")
      .on(table.payoutPaidReceiptId, table.payoutPaidReceiptVersion, table.payoutPaidReceiptDigest)
      .where(sql`${table.authorityKind} = 'manual_payout'`),
    uniqueIndex("finance_bank_matches_rule_authority_unique")
      .on(
        table.classificationRuleId,
        table.classificationRuleVersion,
        table.classificationRuleDigest,
        table.bankStatementEntryId
      )
      .where(sql`${table.authorityKind} = 'unmatched_to_suspense'`),
    check(
      "finance_bank_matches_authority_kind_check",
      sql`${table.authorityKind} in ${sql.raw(formatFinanceSqlValues(bankMatchAuthorityValues))}`
    ),
    check(
      "finance_bank_matches_result_check",
      sql`${table.matchResult} in ${sql.raw(formatFinanceSqlValues(bankMatchResultValues))}`
    ),
    check(
      "finance_bank_matches_authority_shape_check",
      sql`(
          ${table.authorityKind} = 'merchant_settlement'
          and ${table.merchantPayoutReceiptId} is not null
          and ${table.merchantPayoutReceiptVersion} = 1
          and ${table.merchantPayoutReceiptDigest} ~ ${digestSqlPattern}
          and ${table.merchantProviderAccountSeriesId} is not null
          and ${table.merchantProviderAccountId} is not null
          and ${table.merchantProviderIdentityVersion} >= 1
          and ${table.merchantPayoutId} is not null
          and ${table.merchantProviderBankPayoutId} is not null
          and ${table.merchantBankReference} is not null
          and ${table.payoutPaidReceiptId} is null
          and ${table.payoutPaidReceiptVersion} is null
          and ${table.payoutPaidReceiptDigest} is null
          and ${table.classificationRuleId} is null
          and ${table.classificationRuleVersion} is null
          and ${table.classificationRuleDigest} is null
          and ${table.matchResult} = 'merchant_settlement'
        ) or (
          ${table.authorityKind} = 'manual_payout'
          and ${table.merchantPayoutReceiptId} is null
          and ${table.merchantPayoutReceiptVersion} is null
          and ${table.merchantPayoutReceiptDigest} is null
          and ${table.merchantProviderAccountSeriesId} is null
          and ${table.merchantProviderAccountId} is null
          and ${table.merchantProviderIdentityVersion} is null
          and ${table.merchantPayoutId} is null
          and ${table.merchantProviderBankPayoutId} is null
          and ${table.merchantBankReference} is null
          and ${table.payoutPaidReceiptId} is not null
          and ${table.payoutPaidReceiptVersion} >= 1
          and ${table.payoutPaidReceiptDigest} ~ ${digestSqlPattern}
          and ${table.classificationRuleId} is null
          and ${table.classificationRuleVersion} is null
          and ${table.classificationRuleDigest} is null
          and ${table.matchResult} = 'manual_payout'
        ) or (
          ${table.authorityKind} = 'unmatched_to_suspense'
          and ${table.merchantPayoutReceiptId} is null
          and ${table.merchantPayoutReceiptVersion} is null
          and ${table.merchantPayoutReceiptDigest} is null
          and ${table.merchantProviderAccountSeriesId} is null
          and ${table.merchantProviderAccountId} is null
          and ${table.merchantProviderIdentityVersion} is null
          and ${table.merchantPayoutId} is null
          and ${table.merchantProviderBankPayoutId} is null
          and ${table.merchantBankReference} is null
          and ${table.payoutPaidReceiptId} is null
          and ${table.payoutPaidReceiptVersion} is null
          and ${table.payoutPaidReceiptDigest} is null
          and ${table.classificationRuleId} is not null
          and ${table.classificationRuleVersion} >= 1
          and ${table.classificationRuleDigest} ~ ${digestSqlPattern}
          and ${table.matchResult} in ('unmatched_debit', 'unmatched_credit')
        )`
    ),
    check(
      "finance_bank_matches_revision_check",
      sql`${table.expectedBankLiquidityRevision} >= 0
        and ${table.bankLiquidityRevision} = ${table.expectedBankLiquidityRevision} + 1`
    ),
    check(
      "finance_bank_matches_amount_digest_check",
      sql`${table.amountMinor} > 0
        and ${table.statementIngestionReceiptVersion} = 1
        and ${table.statementIngestionReceiptDigest} ~ ${digestSqlPattern}
        and ${table.journalTransactionDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_bank_matches_identifier_check",
      identifierCheck(
        table.matchId,
        table.bankCashPoolId,
        table.bankStatementEntryId,
        table.statementIngestionReceiptId,
        table.journalTransactionId,
        table.persistenceTransactionBoundaryRef
      )
    ),
    check(
      "finance_bank_matches_optional_identifier_check",
      nullableIdentifierCheck(
        table.merchantPayoutReceiptId,
        table.merchantProviderAccountSeriesId,
        table.merchantProviderAccountId,
        table.merchantPayoutId,
        table.merchantProviderBankPayoutId,
        table.merchantBankReference,
        table.payoutPaidReceiptId,
        table.classificationRuleId
      )
    ),
    index("finance_bank_matches_result_time_idx").on(
      table.bankCashPoolId,
      table.currency,
      table.matchResult,
      table.committedAt
    )
  ]
);

export const financeBankCashMatchReceipts = pgTable(
  "finance_bank_cash_match_receipts",
  {
    receiptId: varchar("receipt_id", { length: 200 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    receiptVersion: integer("receipt_version").notNull().default(1),
    matchId: varchar("match_id", { length: 200 }).notNull(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    bankStatementEntryId: varchar("bank_statement_entry_id", { length: 200 }).notNull(),
    matchResult: text("match_result").notNull(),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }).notNull(),
    journalTransactionDigest: varchar("journal_transaction_digest", { length: 71 }).notNull(),
    bankLiquidityRevision: financeRevisionString("bank_liquidity_revision").notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    }).notNull(),
    canonicalPreimage: text("canonical_preimage")
      .notNull()
      .default(sql`''`),
    canonicalDigest: varchar("canonical_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_cash_match_receipts_match_fk",
      columns: [
        table.matchId,
        table.bankCashPoolId,
        table.currency,
        table.bankStatementEntryId,
        table.matchResult,
        table.journalTransactionId,
        table.journalTransactionDigest,
        table.bankLiquidityRevision
      ],
      foreignColumns: [
        financeBankMatches.matchId,
        financeBankMatches.bankCashPoolId,
        financeBankMatches.currency,
        financeBankMatches.bankStatementEntryId,
        financeBankMatches.matchResult,
        financeBankMatches.journalTransactionId,
        financeBankMatches.journalTransactionDigest,
        financeBankMatches.bankLiquidityRevision
      ]
    }).onDelete("restrict"),
    unique("finance_bank_cash_match_receipts_exact_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest
    ),
    unique("finance_bank_cash_match_receipts_match_unique").on(table.matchId),
    unique("finance_bank_cash_match_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    check(
      "finance_bank_cash_match_receipts_shape_check",
      sql`${table.receiptVersion} = 1
        and ${table.bankLiquidityRevision} >= 1
        and ${table.matchResult} in ${sql.raw(formatFinanceSqlValues(bankMatchResultValues))}`
    ),
    check(
      "finance_bank_cash_match_receipts_digest_check",
      sql`length(${table.canonicalPreimage}) > 0
        and ${table.canonicalDigest} ~ ${digestSqlPattern}
        and ${table.journalTransactionDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_bank_cash_match_receipts_identifier_check",
      identifierCheck(
        table.receiptId,
        table.matchId,
        table.bankCashPoolId,
        table.bankStatementEntryId,
        table.journalTransactionId,
        table.persistenceTransactionBoundaryRef
      )
    )
  ]
);

export const financeBankExceptions = pgTable(
  "finance_bank_exceptions",
  {
    id: varchar("id", { length: 200 }).primaryKey(),
    caseId: varchar("case_id", { length: 200 }).notNull(),
    sequence: financeRevisionString("sequence").notNull(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    statementImportId: varchar("statement_import_id", { length: 200 }),
    bankStatementEntryId: varchar("bank_statement_entry_id", { length: 200 }),
    bankMatchId: varchar("bank_match_id", { length: 200 }),
    exceptionKind: text("exception_kind").notNull(),
    state: text("state").notNull(),
    reasonCode: varchar("reason_code", { length: 160 }).notNull(),
    authorityRef: varchar("authority_ref", { length: 320 }),
    resolutionJournalTransactionId: varchar("resolution_journal_transaction_id", {
      length: 200
    }),
    resolutionJournalTransactionDigest: varchar("resolution_journal_transaction_digest", {
      length: 71
    }),
    resolutionJournalSourceIdentityId: uuid("resolution_journal_source_identity_id"),
    evidenceDigest: varchar("evidence_digest", { length: 71 }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_exceptions_pool_fk",
      columns: [table.bankCashPoolId, table.currency],
      foreignColumns: [financeBankCashPools.id, financeBankCashPools.currency]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_exceptions_statement_import_fk",
      columns: [table.statementImportId],
      foreignColumns: [financeBankStatementImports.id]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_exceptions_statement_row_fk",
      columns: [table.bankStatementEntryId],
      foreignColumns: [financeBankStatementRows.bankStatementEntryId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_exceptions_match_fk",
      columns: [table.bankMatchId],
      foreignColumns: [financeBankMatches.matchId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_exceptions_resolution_journal_fk",
      columns: [table.resolutionJournalTransactionId, table.resolutionJournalTransactionDigest],
      foreignColumns: [financeJournalTransactions.id, financeJournalTransactions.canonicalDigest]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_exceptions_resolution_source_fk",
      columns: [table.resolutionJournalSourceIdentityId],
      foreignColumns: [financeSourceIdentities.id]
    }).onDelete("restrict"),
    unique("finance_bank_exceptions_case_sequence_unique").on(table.caseId, table.sequence),
    unique("finance_bank_exceptions_resolution_journal_unique").on(
      table.resolutionJournalTransactionId
    ),
    check(
      "finance_bank_exceptions_shape_check",
      sql`${table.sequence} >= 1
        and ${table.exceptionKind} in ${sql.raw(formatFinanceSqlValues(bankExceptionKindValues))}
        and ${table.state} in ${sql.raw(formatFinanceSqlValues(bankExceptionStateValues))}
        and (${table.statementImportId} is not null
          or ${table.bankStatementEntryId} is not null
          or ${table.bankMatchId} is not null)`
    ),
    check(
      "finance_bank_exceptions_digest_check",
      sql`${table.evidenceDigest} ~ ${digestSqlPattern}
        and (${table.resolutionJournalTransactionDigest} is null
          or ${table.resolutionJournalTransactionDigest} ~ ${digestSqlPattern})`
    ),
    check(
      "finance_bank_exceptions_resolution_shape_check",
      sql`(
          ${table.exceptionKind} in ('unmatched_debit', 'unmatched_credit')
          and ${table.state} = 'resolved'
          and ${table.bankStatementEntryId} is not null
          and ${table.bankMatchId} is not null
          and ${table.authorityRef} is not null
          and ${table.resolutionJournalTransactionId} is not null
          and ${table.resolutionJournalTransactionDigest} is not null
          and ${table.resolutionJournalSourceIdentityId} is not null
        ) or (
          not (${table.exceptionKind} in ('unmatched_debit', 'unmatched_credit')
            and ${table.state} = 'resolved')
          and ${table.resolutionJournalTransactionId} is null
          and ${table.resolutionJournalTransactionDigest} is null
          and ${table.resolutionJournalSourceIdentityId} is null
        )`
    ),
    check(
      "finance_bank_exceptions_identifier_check",
      identifierCheck(table.id, table.caseId, table.bankCashPoolId, table.reasonCode)
    ),
    check(
      "finance_bank_exceptions_optional_identifier_check",
      nullableIdentifierCheck(
        table.statementImportId,
        table.bankStatementEntryId,
        table.bankMatchId,
        table.authorityRef,
        table.resolutionJournalTransactionId
      )
    ),
    index("finance_bank_exceptions_open_idx").on(
      table.bankCashPoolId,
      table.currency,
      table.state,
      table.recordedAt,
      table.caseId
    )
  ]
);

/** Baseline owner installs this DDL after both bank schema files and pgcrypto exist. */
export const financeBankCashIntegritySql = `
create extension if not exists pgcrypto;

create or replace function finance_reject_bank_cash_history_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  raise exception 'bank cash evidence and history rows are append-only' using errcode = '55000';
end;
$$;

create or replace function finance_protect_bank_cash_pool_directory()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'bank cash-pool directory rows cannot be deleted' using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then
    if new.retired_at is not null then
      raise exception 'a bank cash-pool directory row must start active' using errcode = '23514';
    end if;
    new.activated_at := clock_timestamp();
    new.created_at := new.activated_at;
    return new;
  end if;
  if new.id <> old.id
     or new.currency <> old.currency
     or new.bank_account_fingerprint <> old.bank_account_fingerprint
     or new.statement_source_fingerprint <> old.statement_source_fingerprint
     or new.activated_at <> old.activated_at
     or new.created_at <> old.created_at
     or old.retired_at is not null
     or new.retired_at is null then
    raise exception 'bank cash-pool identity is immutable; only one-way retirement is allowed'
      using errcode = '55000';
  end if;
  new.retired_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_bank_cash_pools_protected
before insert or update or delete on finance_bank_cash_pools
for each row execute function finance_protect_bank_cash_pool_directory();
create trigger finance_bank_cash_pools_no_truncate
before truncate on finance_bank_cash_pools
for each statement execute function finance_reject_bank_cash_history_mutation();

create or replace function finance_issue_cash_pool_directory_receipt()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  pool finance_bank_cash_pools%rowtype;
begin
  select * into strict pool
    from finance_bank_cash_pools
    where id = new.bank_cash_pool_id
      and currency = new.currency
      and bank_account_fingerprint = new.bank_account_fingerprint
      and statement_source_fingerprint = new.statement_source_fingerprint;
  new.receipt_version := 1;
  new.monetary_initialization := 'reference_only_zero';
  new.balance_bearing_rows_created := 0;
  new.journal_transaction_id := null;
  new.issued_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'empty_cash_pool_directory_receipt',
    'receiptId', new.receipt_id,
    'version', new.receipt_version,
    'bankCashPoolId', new.bank_cash_pool_id,
    'currency', new.currency,
    'bankAccountFingerprint', new.bank_account_fingerprint,
    'statementSourceFingerprint', new.statement_source_fingerprint,
    'monetaryInitialization', new.monetary_initialization,
    'balanceBearingRowsCreated', new.balance_bearing_rows_created,
    'journalTransactionId', new.journal_transaction_id,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'issuedAt', to_char(new.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
exception
  when no_data_found then
    raise exception 'cash-pool directory receipt requires the exact directory identity'
      using errcode = '23503';
end;
$$;

create trigger finance_cash_pool_directory_receipts_issue
before insert on finance_cash_pool_directory_receipts
for each row execute function finance_issue_cash_pool_directory_receipt();

create or replace function finance_validate_bank_statement_import_insert()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  pool finance_bank_cash_pools%rowtype;
  artifact finance_artifacts%rowtype;
begin
  select * into strict pool
    from finance_bank_cash_pools
    where id = new.bank_cash_pool_id
      and currency = new.currency
      and retired_at is null;
  if pool.statement_source_fingerprint <> new.statement_source_fingerprint then
    raise exception 'statement source fingerprint does not match the exact cash pool'
      using errcode = '23514';
  end if;
  select * into strict artifact from finance_artifacts where id = new.artifact_id;
  if artifact.artifact_class <> 'bank_statement'
     or artifact.binding_kind <> 'bank_cash_pool'
     or artifact.bank_cash_pool_id is distinct from new.bank_cash_pool_id
     or artifact.currency is distinct from new.currency
     or artifact.statement_source_fingerprint is distinct from new.statement_source_fingerprint
     or artifact.sha256_digest <> new.artifact_sha256_digest
     or artifact.byte_length <> new.artifact_byte_length then
    raise exception 'statement artifact binding does not match the exact cash pool'
      using errcode = '23514';
  end if;
  new.imported_at := clock_timestamp();
  return new;
exception
  when no_data_found then
    raise exception 'statement import requires an active pool and exact private artifact'
      using errcode = '23503';
end;
$$;

create trigger finance_bank_statement_imports_validate
before insert on finance_bank_statement_imports
for each row execute function finance_validate_bank_statement_import_insert();

create or replace function finance_validate_bank_statement_row_insert()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  source_import finance_bank_statement_imports%rowtype;
  observed timestamptz;
  pool_activated_at timestamptz;
begin
  select * into strict source_import
    from finance_bank_statement_imports
    where id = new.statement_import_id
      and bank_cash_pool_id = new.bank_cash_pool_id
      and currency = new.currency
      and source_statement_id = new.source_statement_id;
  select activated_at into strict pool_activated_at
    from finance_bank_cash_pools
    where id = new.bank_cash_pool_id
      and currency = new.currency
      and retired_at is null;
  observed := clock_timestamp();
  if new.occurred_at < pool_activated_at then
    raise exception 'bank statement row predates cash pool activation'
      using errcode = '23514';
  end if;
  if observed < new.occurred_at then
    raise exception 'bank statement row cannot be observed before it occurred'
      using errcode = '23514';
  end if;
  new.observed_at := observed;
  new.created_at := observed;
  return new;
exception
  when no_data_found then
    raise exception 'statement row requires its exact immutable import' using errcode = '23503';
end;
$$;

create trigger finance_bank_statement_rows_validate
before insert on finance_bank_statement_rows
for each row execute function finance_validate_bank_statement_row_insert();

create or replace function finance_issue_bank_statement_ingestion_receipt()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  source_import finance_bank_statement_imports%rowtype;
  statement_row finance_bank_statement_rows%rowtype;
begin
  select * into strict source_import
    from finance_bank_statement_imports
    where id = new.statement_import_id
      and artifact_id = new.artifact_id
      and bank_cash_pool_id = new.bank_cash_pool_id
      and currency = new.currency
      and import_version = new.statement_import_version
      and source_statement_id = new.source_statement_id;
  select * into strict statement_row
    from finance_bank_statement_rows
    where bank_statement_entry_id = new.bank_statement_entry_id
      and statement_import_id = new.statement_import_id
      and bank_cash_pool_id = new.bank_cash_pool_id
      and currency = new.currency
      and source_statement_id = new.source_statement_id
      and source_row_id = new.source_row_id;
  if source_import.artifact_sha256_digest <> new.artifact_sha256_digest
     or source_import.artifact_byte_length <> new.artifact_byte_length
     or source_import.statement_source_fingerprint <> new.statement_source_fingerprint then
    raise exception 'statement ingestion receipt artifact does not match its exact import'
      using errcode = '23514';
  end if;
  new.receipt_version := 1;
  new.journal_transaction_id := null;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'bank_statement_ingestion_commit_receipt',
    'receiptId', new.receipt_id,
    'version', new.receipt_version,
    'bankCashPoolId', new.bank_cash_pool_id,
    'currency', new.currency,
    'bankStatementEntryId', new.bank_statement_entry_id,
    'statementImportId', new.statement_import_id,
    'sourceStatementId', new.source_statement_id,
    'sourceRowId', new.source_row_id,
    'artifactId', new.artifact_id,
    'artifactDigest', new.artifact_sha256_digest,
    'artifactByteLength', new.artifact_byte_length,
    'statementSourceFingerprint', new.statement_source_fingerprint,
    'statementImportVersion', new.statement_import_version,
    'dedupeResult', new.dedupe_result,
    'journalTransactionId', new.journal_transaction_id,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'committedAt', to_char(new.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
exception
  when no_data_found then
    raise exception 'statement ingestion receipt requires the exact import and statement row'
      using errcode = '23503';
end;
$$;

create trigger finance_bank_statement_ingestion_receipts_issue
before insert on finance_bank_statement_ingestion_receipts
for each row execute function finance_issue_bank_statement_ingestion_receipt();

create or replace function finance_require_bank_statement_ingestion_receipt()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_bank_statement_ingestion_receipts receipt
    where receipt.statement_import_id = new.statement_import_id
      and receipt.bank_statement_entry_id = new.bank_statement_entry_id
      and receipt.bank_cash_pool_id = new.bank_cash_pool_id
      and receipt.currency = new.currency
      and receipt.source_statement_id = new.source_statement_id
      and receipt.source_row_id = new.source_row_id
  ) then
    raise exception 'statement row requires a committed ingestion receipt'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_bank_statement_rows_require_ingestion_receipt
after insert on finance_bank_statement_rows
deferrable initially deferred for each row
execute function finance_require_bank_statement_ingestion_receipt();

create or replace function finance_prepare_bank_classification_rule()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_bank_statement_classification_rules_prepare
before insert on finance_bank_statement_classification_rules
for each row execute function finance_prepare_bank_classification_rule();

create or replace function finance_validate_bank_cash_match_insert()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  statement_row finance_bank_statement_rows%rowtype;
  ingestion_receipt finance_bank_statement_ingestion_receipts%rowtype;
  journal_row finance_journal_transactions%rowtype;
  source_row finance_source_identities%rowtype;
  liquidity_revision numeric(38, 0);
  expected_operation text;
begin
  select * into strict statement_row
    from finance_bank_statement_rows
    where bank_statement_entry_id = new.bank_statement_entry_id
      and bank_cash_pool_id = new.bank_cash_pool_id
      and currency = new.currency;
  select * into strict ingestion_receipt
    from finance_bank_statement_ingestion_receipts
    where receipt_id = new.statement_ingestion_receipt_id
      and receipt_version = new.statement_ingestion_receipt_version
      and canonical_digest = new.statement_ingestion_receipt_digest;
  if ingestion_receipt.bank_statement_entry_id <> statement_row.bank_statement_entry_id
     or ingestion_receipt.bank_cash_pool_id <> statement_row.bank_cash_pool_id
     or ingestion_receipt.currency <> statement_row.currency then
    raise exception 'bank cash match requires the exact statement ingestion receipt'
      using errcode = '23514';
  end if;
  if new.amount_minor <> abs(statement_row.signed_amount_minor) then
    raise exception 'bank cash match amount must equal the exact statement fact'
      using errcode = '23514';
  end if;
  if new.authority_kind = 'merchant_settlement'
     and new.merchant_bank_reference <> statement_row.bank_reference then
    raise exception 'merchant payout bank reference does not match the statement fact'
      using errcode = '23514';
  end if;
  if (new.match_result in ('merchant_settlement', 'unmatched_credit')
      and statement_row.direction <> 'credit')
     or (new.match_result in ('manual_payout', 'unmatched_debit')
      and statement_row.direction <> 'debit') then
    raise exception 'bank cash match result contradicts statement direction'
      using errcode = '23514';
  end if;
  if new.authority_kind = 'unmatched_to_suspense' then
    if not exists (
      select 1 from finance_bank_statement_classification_rules rule
      where rule.rule_id = new.classification_rule_id
        and rule.rule_version = new.classification_rule_version
        and rule.rule_digest = new.classification_rule_digest
        and rule.effective_at <= statement_row.observed_at
    ) then
      raise exception 'bank cash suspense match requires the exact classification rule'
        using errcode = '23503';
    end if;
  end if;
  select * into strict journal_row
    from finance_journal_transactions
    where id = new.journal_transaction_id
      and canonical_digest = new.journal_transaction_digest;
  if journal_row.sealed_at is null or journal_row.canonical_digest is null then
    raise exception 'bank cash match journal must be sealed' using errcode = '23514';
  end if;
  if journal_row.source_identity_id <> new.journal_source_identity_id
     or journal_row.currency <> new.currency
     or journal_row.occurred_at <> statement_row.occurred_at then
    raise exception 'bank cash match journal scope does not match the statement fact'
      using errcode = '23514';
  end if;
  select * into strict source_row
    from finance_source_identities
    where id = new.journal_source_identity_id;
  if source_row.source_id <> statement_row.bank_statement_entry_id
     or source_row.bank_cash_pool_id is distinct from statement_row.bank_cash_pool_id then
    raise exception 'journal source identity does not match the bank statement fact'
      using errcode = '23514';
  end if;
  expected_operation := case new.match_result
    when 'merchant_settlement' then 'merchant_payout_bank_matched'
    when 'manual_payout' then 'payout_debit_matched'
    when 'unmatched_debit' then 'unknown_debit_recorded'
    when 'unmatched_credit' then 'unknown_credit_recorded'
  end;
  if source_row.source_operation_key <> expected_operation
     or (new.match_result = 'merchant_settlement' and source_row.source_kind <> 'settlement')
     or (new.match_result <> 'merchant_settlement' and source_row.source_kind <> 'bank') then
    raise exception 'journal source identity does not match the bank statement fact authority'
      using errcode = '23514';
  end if;
  if new.authority_kind = 'merchant_settlement'
     and (
       source_row.provider_account_series_id is distinct from new.merchant_provider_account_series_id
       or source_row.provider_account_id is distinct from new.merchant_provider_account_id
       or source_row.provider_identity_version is distinct from new.merchant_provider_identity_version
       or not exists (
         select 1 from finance_provider_accounts provider_account
         where provider_account.series_id = new.merchant_provider_account_series_id
           and provider_account.provider_account_id = new.merchant_provider_account_id
           and provider_account.identity_version = new.merchant_provider_identity_version
           and provider_account.provider = 'arc_pay'
       )
     ) then
    raise exception 'merchant payout provider identity does not match the sealed journal'
      using errcode = '23514';
  end if;
  select revision into liquidity_revision
    from finance_bank_liquidity_heads
    where bank_cash_pool_id = new.bank_cash_pool_id
      and currency = new.currency
    for update;
  if not found then
    liquidity_revision := 0;
  end if;
  if liquidity_revision <> new.expected_bank_liquidity_revision then
    raise exception 'bank cash match expected liquidity revision is stale' using errcode = '40001';
  end if;
  new.committed_at := clock_timestamp();
  return new;
exception
  when no_data_found then
    raise exception 'bank cash match requires exact statement, journal and liquidity authority'
      using errcode = '23503';
end;
$$;

create trigger finance_bank_matches_validate
before insert on finance_bank_matches
for each row execute function finance_validate_bank_cash_match_insert();

create or replace function finance_issue_bank_cash_match_receipt()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  matched finance_bank_matches%rowtype;
begin
  select * into strict matched
    from finance_bank_matches
    where match_id = new.match_id
      and bank_cash_pool_id = new.bank_cash_pool_id
      and currency = new.currency
      and bank_statement_entry_id = new.bank_statement_entry_id
      and match_result = new.match_result
      and journal_transaction_id = new.journal_transaction_id
      and journal_transaction_digest = new.journal_transaction_digest
      and bank_liquidity_revision = new.bank_liquidity_revision;
  new.receipt_version := 1;
  new.persistence_transaction_boundary_ref := matched.persistence_transaction_boundary_ref;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'bank_cash_match_commit_receipt',
    'receiptId', new.receipt_id,
    'version', new.receipt_version,
    'matchId', new.match_id,
    'bankCashPoolId', new.bank_cash_pool_id,
    'currency', new.currency,
    'bankStatementEntryId', new.bank_statement_entry_id,
    'matchResult', new.match_result,
    'journalTransactionId', new.journal_transaction_id,
    'journalTransactionDigest', new.journal_transaction_digest,
    'bankLiquidityRevision', new.bank_liquidity_revision,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'committedAt', to_char(new.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
exception
  when no_data_found then
    raise exception 'bank cash match receipt requires the exact committed match'
      using errcode = '23503';
end;
$$;

create trigger finance_bank_cash_match_receipts_issue
before insert on finance_bank_cash_match_receipts
for each row execute function finance_issue_bank_cash_match_receipt();

create or replace function finance_require_bank_cash_match_receipt()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_bank_cash_match_receipts receipt
    where receipt.match_id = new.match_id
      and receipt.bank_cash_pool_id = new.bank_cash_pool_id
      and receipt.currency = new.currency
      and receipt.bank_statement_entry_id = new.bank_statement_entry_id
      and receipt.match_result = new.match_result
      and receipt.journal_transaction_id = new.journal_transaction_id
      and receipt.journal_transaction_digest = new.journal_transaction_digest
      and receipt.bank_liquidity_revision = new.bank_liquidity_revision
  ) then
    raise exception 'bank cash match requires its nominal commit receipt'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_bank_matches_require_commit_receipt
after insert on finance_bank_matches
deferrable initially deferred for each row
execute function finance_require_bank_cash_match_receipt();

create or replace function finance_validate_bank_exception_insert()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  previous finance_bank_exceptions%rowtype;
  journal_row finance_journal_transactions%rowtype;
  source_row finance_source_identities%rowtype;
begin
  new.recorded_at := clock_timestamp();
  if new.sequence = 1 then
    if new.state = 'resolved' then
      raise exception 'bank exception cannot begin resolved' using errcode = '23514';
    end if;
  else
    select * into strict previous
      from finance_bank_exceptions
      where case_id = new.case_id and sequence = new.sequence - 1;
    if previous.bank_cash_pool_id <> new.bank_cash_pool_id
       or previous.currency <> new.currency
       or previous.statement_import_id is distinct from new.statement_import_id
       or previous.bank_statement_entry_id is distinct from new.bank_statement_entry_id
       or previous.bank_match_id is distinct from new.bank_match_id
       or previous.exception_kind <> new.exception_kind then
      raise exception 'bank exception history identity drift' using errcode = '23514';
    end if;
    if previous.state = 'resolved' or new.state = 'open' then
      raise exception 'bank exception history transition is invalid' using errcode = '23514';
    end if;
  end if;
  if new.statement_import_id is not null and not exists (
    select 1 from finance_bank_statement_imports source_import
    where source_import.id = new.statement_import_id
      and source_import.bank_cash_pool_id = new.bank_cash_pool_id
      and source_import.currency = new.currency
  ) then
    raise exception 'bank exception import scope mismatch' using errcode = '23514';
  end if;
  if new.bank_statement_entry_id is not null and not exists (
    select 1 from finance_bank_statement_rows statement_row
    where statement_row.bank_statement_entry_id = new.bank_statement_entry_id
      and statement_row.bank_cash_pool_id = new.bank_cash_pool_id
      and statement_row.currency = new.currency
  ) then
    raise exception 'bank exception statement scope mismatch' using errcode = '23514';
  end if;
  if new.bank_match_id is not null and not exists (
    select 1 from finance_bank_matches matched
    where matched.match_id = new.bank_match_id
      and matched.bank_cash_pool_id = new.bank_cash_pool_id
      and matched.currency = new.currency
  ) then
    raise exception 'bank exception match scope mismatch' using errcode = '23514';
  end if;
  if new.exception_kind in ('unmatched_debit', 'unmatched_credit')
     and new.bank_match_id is not null
     and not exists (
       select 1 from finance_bank_matches matched
       where matched.match_id = new.bank_match_id
         and matched.bank_statement_entry_id = new.bank_statement_entry_id
         and matched.match_result = new.exception_kind
     ) then
    raise exception 'bank exception must resolve the exact directional suspense match'
      using errcode = '23514';
  end if;
  if new.resolution_journal_transaction_id is not null then
    select * into strict journal_row
      from finance_journal_transactions
      where id = new.resolution_journal_transaction_id
        and canonical_digest = new.resolution_journal_transaction_digest;
    select * into strict source_row
      from finance_source_identities
      where id = new.resolution_journal_source_identity_id;
    if journal_row.sealed_at is null
       or journal_row.source_identity_id <> source_row.id
       or journal_row.currency <> new.currency
       or journal_row.posted_at > new.recorded_at
       or source_row.source_kind <> 'bank'
       or source_row.source_operation_key <> 'suspense_reclassified'
       or source_row.source_id <> new.bank_statement_entry_id
       or source_row.bank_cash_pool_id is distinct from new.bank_cash_pool_id then
      raise exception 'bank suspense resolution requires the exact sealed reclassification journal'
        using errcode = '23514';
    end if;
    if exists (
      select 1
        from finance_journal_entries entry
        join finance_accounts account on account.id = entry.account_id
       where entry.journal_transaction_id = new.resolution_journal_transaction_id
         and account.code = 'bank_cash'
    ) then
      raise exception 'bank suspense reclassification cannot change bank_cash twice'
        using errcode = '23514';
    end if;
  end if;
  return new;
exception
  when no_data_found then
    raise exception 'bank exception history requires its immediately preceding fact'
      using errcode = '23503';
end;
$$;

create trigger finance_bank_exceptions_validate
before insert on finance_bank_exceptions
for each row execute function finance_validate_bank_exception_insert();

create or replace function finance_require_unmatched_bank_exception()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if new.match_result in ('unmatched_debit', 'unmatched_credit') and not exists (
    select 1 from finance_bank_exceptions exception_event
    where exception_event.bank_match_id = new.match_id
      and exception_event.exception_kind = new.match_result
      and exception_event.state in ('open', 'quarantined')
  ) then
    raise exception 'unmatched bank cash requires a typed exception case'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_bank_matches_require_exception
after insert on finance_bank_matches
deferrable initially deferred for each row
execute function finance_require_unmatched_bank_exception();

create or replace function finance_require_bank_match_liquidity_commit()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1
      from finance_bank_matches matched
      join finance_bank_liquidity_heads head
        on head.bank_cash_pool_id = matched.bank_cash_pool_id
       and head.currency = matched.currency
       and head.revision = matched.bank_liquidity_revision
      join finance_bank_liquidity_history history
        on history.history_id = head.last_history_id
       and history.bank_cash_pool_id = head.bank_cash_pool_id
       and history.currency = head.currency
       and history.revision = head.revision
       and history.mutation_kind = 'bank_statement_matched'
       and history.mutation_ref_id = matched.match_id
     where matched.match_id = new.match_id
       and matched.bank_liquidity_revision = new.bank_liquidity_revision
  ) then
    raise exception 'bank cash match and liquidity revision must commit atomically'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_bank_cash_match_receipts_require_liquidity
after insert on finance_bank_cash_match_receipts
deferrable initially deferred for each row
execute function finance_require_bank_match_liquidity_commit();

create trigger finance_cash_pool_directory_receipts_immutable
before update or delete on finance_cash_pool_directory_receipts
for each row execute function finance_reject_bank_cash_history_mutation();
create trigger finance_cash_pool_directory_receipts_no_truncate
before truncate on finance_cash_pool_directory_receipts
for each statement execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_statement_imports_immutable
before update or delete on finance_bank_statement_imports
for each row execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_statement_imports_no_truncate
before truncate on finance_bank_statement_imports
for each statement execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_statement_rows_immutable
before update or delete on finance_bank_statement_rows
for each row execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_statement_rows_no_truncate
before truncate on finance_bank_statement_rows
for each statement execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_statement_ingestion_receipts_immutable
before update or delete on finance_bank_statement_ingestion_receipts
for each row execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_statement_ingestion_receipts_no_truncate
before truncate on finance_bank_statement_ingestion_receipts
for each statement execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_statement_classification_rules_immutable
before update or delete on finance_bank_statement_classification_rules
for each row execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_statement_classification_rules_no_truncate
before truncate on finance_bank_statement_classification_rules
for each statement execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_matches_immutable
before update or delete on finance_bank_matches
for each row execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_matches_no_truncate
before truncate on finance_bank_matches
for each statement execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_cash_match_receipts_immutable
before update or delete on finance_bank_cash_match_receipts
for each row execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_cash_match_receipts_no_truncate
before truncate on finance_bank_cash_match_receipts
for each statement execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_exceptions_immutable
before update or delete on finance_bank_exceptions
for each row execute function finance_reject_bank_cash_history_mutation();
create trigger finance_bank_exceptions_no_truncate
before truncate on finance_bank_exceptions
for each statement execute function finance_reject_bank_cash_history_mutation();
`;

/** Baseline owner wires these only after the normalized receipt owners exist. */
export const financeBankCashDeferredForeignKeys = [
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
] as const;
