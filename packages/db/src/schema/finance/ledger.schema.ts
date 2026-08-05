import {
  financeLedgerAccountCodeValues,
  financeLedgerChart,
  financeSourceOperationsByKind
} from "@elevenhouse/domain/finance-core";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  financeCurrencyValues,
  financeSafeIntegerMinorUnitMax,
  formatFinanceSqlValues,
  ledgerAccountTypeValues,
  ledgerEntrySideValues,
  ledgerOperationTypeValues,
  walletBalanceBucketValues
} from "./finance-values";
import { orders } from "./orders.schema";
import { payoutRequests } from "./payouts.schema";
import { financeProviderAccounts } from "./provider-accounts.schema";

export const persistedFinanceLedgerAccountCodeValues = financeLedgerAccountCodeValues;

const financeLedgerAccountClassValues = ["asset", "liability", "income", "expense", "control"];
const financeLedgerSideValues = ["debit", "credit"];
const financeLedgerAccountScopeKindValues = [
  "arc_provider_account",
  "arc_provider_account_and_bank_cash_pool",
  "bank_cash_pool",
  "astrologer",
  "refund_and_payout",
  "platform"
];
export const persistedFinanceSourceScopeKindValues = Object.freeze([
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
] as const);

const financeLedgerChartShapeSql = Object.values(financeLedgerChart)
  .map(
    (entry) =>
      `(code = ${quote(entry.code)} and account_class = ${quote(
        entry.accountClass
      )} and normal_side = ${quote(entry.normalSide)} and scope_kind = ${quote(entry.scopeKind)})`
  )
  .join(" or ");

const financeSourceKindOperationSql = Object.entries(financeSourceOperationsByKind)
  .map(
    ([kind, operations]) =>
      `(source_kind = ${quote(kind)} and source_operation_key in ${sqlValues(operations)})`
  )
  .join(" or ");

const financeSourceScopeShapeSql = [
  sourceScopeShape("internal", false, false, false, false),
  sourceScopeShape("provider_account", true, false, false, false),
  sourceScopeShape("bank_cash_pool", false, true, false, false),
  sourceScopeShape("astrologer", false, false, true, false),
  sourceScopeShape("refund_and_payout", false, false, false, true),
  sourceScopeShape("provider_account_and_bank_cash_pool", true, true, false, false),
  sourceScopeShape("provider_account_and_astrologer", true, false, true, false),
  sourceScopeShape("bank_cash_pool_and_astrologer", false, true, true, false),
  sourceScopeShape("provider_account_bank_cash_pool_and_astrologer", true, true, true, false),
  sourceScopeShape("provider_account_astrologer_refund_and_payout", true, false, true, true),
  sourceScopeShape("bank_cash_pool_astrologer_refund_and_payout", false, true, true, true),
  sourceScopeShape(
    "provider_account_bank_cash_pool_astrologer_refund_and_payout",
    true,
    true,
    true,
    true
  )
].join(" or ");

const financeSourceKindScopeSql = [
  sourceOperationScope("bank", "payout_debit_matched", ["bank_cash_pool"]),
  sourceOperationScope("bank", "payout_return_credit_matched", [
    "bank_cash_pool_and_astrologer",
    "bank_cash_pool_astrologer_refund_and_payout"
  ]),
  sourceOperationScope("bank", "unknown_debit_recorded", ["bank_cash_pool"]),
  sourceOperationScope("bank", "unknown_credit_recorded", ["bank_cash_pool"]),
  sourceOperationScope("bank", "suspense_reclassified", [
    "bank_cash_pool",
    "bank_cash_pool_and_astrologer",
    "bank_cash_pool_astrologer_refund_and_payout",
    "provider_account_and_bank_cash_pool",
    "provider_account_bank_cash_pool_and_astrologer",
    "provider_account_bank_cash_pool_astrologer_refund_and_payout"
  ]),
  sourceOperationScope("order", "sale_captured", ["provider_account_and_astrologer"]),
  sourceOperationScope("order", "commission_earned", ["provider_account_and_astrologer"]),
  sourceOperationScope("platform_invoice", "captured", ["provider_account"]),
  sourceOperationScope("platform_invoice", "revenue_earned", ["provider_account"]),
  sourceOperationScope("provider_fee", "confirmed", ["provider_account"]),
  sourceOperationScope("provider_fee", "returned", ["provider_account"]),
  sourceOperationScope("reserve", "hold_released", ["astrologer"]),
  sourceOperationScope("reserve", "released", ["astrologer"]),
  sourceOperationScope("payout", "requested", ["astrologer"]),
  sourceOperationScope("payout", "released", ["astrologer"]),
  sourceOperationScope("payout", "paid", ["bank_cash_pool_and_astrologer"]),
  sourceOperationScope("payout", "returned_without_debit", ["bank_cash_pool_and_astrologer"]),
  sourceOperationScope("refund", "approved", ["astrologer", "provider_account_and_astrologer"]),
  sourceOperationScope("refund", "confirmed", ["provider_account_and_astrologer"]),
  sourceOperationScope("refund", "failed", ["astrologer", "provider_account_and_astrologer"]),
  sourceOperationScope("refund", "bridge_payout_failed", [
    "provider_account_astrologer_refund_and_payout",
    "bank_cash_pool_astrologer_refund_and_payout",
    "provider_account_bank_cash_pool_astrologer_refund_and_payout"
  ]),
  sourceOperationScope("refund", "bridge_payout_paid", [
    "provider_account_astrologer_refund_and_payout",
    "bank_cash_pool_astrologer_refund_and_payout",
    "provider_account_bank_cash_pool_astrologer_refund_and_payout"
  ]),
  ...financeSourceOperationsByKind.chargeback.map((operation) =>
    sourceOperationScope("chargeback", operation, ["provider_account_and_astrologer"])
  ),
  ...financeSourceOperationsByKind.settlement.map((operation) =>
    sourceOperationScope("settlement", operation, ["provider_account_and_bank_cash_pool"])
  ),
  ...financeSourceOperationsByKind.correction.map((operation) =>
    sourceOperationScope("correction", operation, persistedFinanceSourceScopeKindValues)
  )
].join(" or ");

export const financeAccounts = pgTable(
  "finance_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    accountClass: text("account_class").notNull(),
    normalSide: text("normal_side").notNull(),
    scopeKind: text("scope_kind").notNull(),
    providerAccountVersionId: uuid("provider_account_version_id"),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }),
    providerAccountId: varchar("provider_account_id", { length: 160 }),
    providerIdentityVersion: integer("provider_identity_version"),
    // Deferred FK: the normalized bank cash-pool owner is introduced by settlement Task 8.
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }),
    astrologerUserId: uuid("astrologer_user_id").references(() => users.id, {
      onDelete: "restrict"
    }),
    // Deferred FK: the normalized refund and payout aggregates are introduced by later tasks.
    refundId: varchar("refund_id", { length: 160 }),
    payoutRequestId: varchar("payout_request_id", { length: 160 }),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_accounts_provider_identity_fk",
      columns: [
        table.providerAccountVersionId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion
      ],
      foreignColumns: [
        financeProviderAccounts.id,
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ]
    }).onDelete("restrict"),
    check(
      "finance_accounts_code_check",
      sql`${table.code} in ${sql.raw(sqlValues(persistedFinanceLedgerAccountCodeValues))}`
    ),
    check(
      "finance_accounts_class_check",
      sql`${table.accountClass} in ${sql.raw(sqlValues(financeLedgerAccountClassValues))}`
    ),
    check(
      "finance_accounts_normal_side_check",
      sql`${table.normalSide} in ${sql.raw(sqlValues(financeLedgerSideValues))}`
    ),
    check(
      "finance_accounts_scope_kind_check",
      sql`${table.scopeKind} in ${sql.raw(sqlValues(financeLedgerAccountScopeKindValues))}`
    ),
    check("finance_accounts_chart_shape_check", sql.raw(`(${financeLedgerChartShapeSql})`)),
    check(
      "finance_accounts_provider_identity_check",
      sql`(${table.providerAccountVersionId} is null and ${table.providerAccountSeriesId} is null and ${table.providerAccountId} is null and ${table.providerIdentityVersion} is null) or (${table.providerAccountVersionId} is not null and ${table.providerAccountSeriesId} is not null and length(${table.providerAccountSeriesId}) between 1 and 160 and btrim(${table.providerAccountSeriesId}) = ${table.providerAccountSeriesId} and ${table.providerAccountId} is not null and length(${table.providerAccountId}) between 1 and 160 and btrim(${table.providerAccountId}) = ${table.providerAccountId} and ${table.providerIdentityVersion} >= 1)`
    ),
    check(
      "finance_accounts_scope_shape_check",
      sql`(${table.scopeKind} = 'arc_provider_account' and ${table.providerAccountVersionId} is not null and ${table.bankCashPoolId} is null and ${table.astrologerUserId} is null and ${table.refundId} is null and ${table.payoutRequestId} is null) or (${table.scopeKind} = 'arc_provider_account_and_bank_cash_pool' and ${table.providerAccountVersionId} is not null and ${table.bankCashPoolId} is not null and ${table.astrologerUserId} is null and ${table.refundId} is null and ${table.payoutRequestId} is null) or (${table.scopeKind} = 'bank_cash_pool' and ${table.providerAccountVersionId} is null and ${table.bankCashPoolId} is not null and ${table.astrologerUserId} is null and ${table.refundId} is null and ${table.payoutRequestId} is null) or (${table.scopeKind} = 'astrologer' and ${table.providerAccountVersionId} is null and ${table.bankCashPoolId} is null and ${table.astrologerUserId} is not null and ${table.refundId} is null and ${table.payoutRequestId} is null) or (${table.scopeKind} = 'refund_and_payout' and ${table.providerAccountVersionId} is null and ${table.bankCashPoolId} is null and ${table.astrologerUserId} is null and ${table.refundId} is not null and ${table.payoutRequestId} is not null) or (${table.scopeKind} = 'platform' and ${table.providerAccountVersionId} is null and ${table.bankCashPoolId} is null and ${table.astrologerUserId} is null and ${table.refundId} is null and ${table.payoutRequestId} is null)`
    ),
    check(
      "finance_accounts_scope_identifier_check",
      sql`(${table.bankCashPoolId} is null or (length(${table.bankCashPoolId}) between 1 and 160 and btrim(${table.bankCashPoolId}) = ${table.bankCashPoolId})) and (${table.refundId} is null or (length(${table.refundId}) between 1 and 160 and btrim(${table.refundId}) = ${table.refundId})) and (${table.payoutRequestId} is null or (length(${table.payoutRequestId}) between 1 and 160 and btrim(${table.payoutRequestId}) = ${table.payoutRequestId}))`
    ),
    check("finance_accounts_currency_check", sql`${table.currency} = 'RUB'`),
    unique("finance_accounts_id_currency_unique").on(table.id, table.currency),
    uniqueIndex("finance_accounts_provider_unique")
      .on(table.code, table.providerAccountVersionId, table.currency)
      .where(sql`${table.scopeKind} = 'arc_provider_account'`),
    uniqueIndex("finance_accounts_provider_bank_unique")
      .on(table.code, table.providerAccountVersionId, table.bankCashPoolId, table.currency)
      .where(sql`${table.scopeKind} = 'arc_provider_account_and_bank_cash_pool'`),
    uniqueIndex("finance_accounts_bank_unique")
      .on(table.code, table.bankCashPoolId, table.currency)
      .where(sql`${table.scopeKind} = 'bank_cash_pool'`),
    uniqueIndex("finance_accounts_astrologer_unique")
      .on(table.code, table.astrologerUserId, table.currency)
      .where(sql`${table.scopeKind} = 'astrologer'`),
    uniqueIndex("finance_accounts_refund_payout_unique")
      .on(table.code, table.refundId, table.payoutRequestId, table.currency)
      .where(sql`${table.scopeKind} = 'refund_and_payout'`),
    uniqueIndex("finance_accounts_platform_unique")
      .on(table.code, table.currency)
      .where(sql`${table.scopeKind} = 'platform'`)
  ]
);

export const financeSourceIdentities = pgTable(
  "finance_source_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceKind: text("source_kind").notNull(),
    sourceId: varchar("source_id", { length: 200 }).notNull(),
    sourceOperationKey: text("source_operation_key").notNull(),
    sourceScopeKind: text("source_scope_kind").notNull(),
    providerAccountVersionId: uuid("provider_account_version_id"),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }),
    providerAccountId: varchar("provider_account_id", { length: 160 }),
    providerIdentityVersion: integer("provider_identity_version"),
    // Deferred FK: the normalized bank cash-pool owner is introduced by settlement Task 8.
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }),
    astrologerUserId: uuid("astrologer_user_id").references(() => users.id, {
      onDelete: "restrict"
    }),
    // Deferred FK: the normalized refund and payout aggregates are introduced by later tasks.
    refundId: varchar("refund_id", { length: 160 }),
    payoutRequestId: varchar("payout_request_id", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_source_identities_provider_identity_fk",
      columns: [
        table.providerAccountVersionId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion
      ],
      foreignColumns: [
        financeProviderAccounts.id,
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ]
    }).onDelete("restrict"),
    check(
      "finance_source_identities_kind_operation_check",
      sql.raw(`(${financeSourceKindOperationSql})`)
    ),
    check(
      "finance_source_identities_source_id_check",
      sql`length(${table.sourceId}) between 1 and 200 and btrim(${table.sourceId}) = ${table.sourceId}`
    ),
    check(
      "finance_source_identities_scope_kind_check",
      sql`${table.sourceScopeKind} in ${sql.raw(sqlValues(persistedFinanceSourceScopeKindValues))}`
    ),
    check(
      "finance_source_identities_provider_identity_check",
      sql`(${table.providerAccountVersionId} is null and ${table.providerAccountSeriesId} is null and ${table.providerAccountId} is null and ${table.providerIdentityVersion} is null) or (${table.providerAccountVersionId} is not null and ${table.providerAccountSeriesId} is not null and length(${table.providerAccountSeriesId}) between 1 and 160 and btrim(${table.providerAccountSeriesId}) = ${table.providerAccountSeriesId} and ${table.providerAccountId} is not null and length(${table.providerAccountId}) between 1 and 160 and btrim(${table.providerAccountId}) = ${table.providerAccountId} and ${table.providerIdentityVersion} >= 1)`
    ),
    check(
      "finance_source_identities_scope_shape_check",
      sql.raw(`(${financeSourceScopeShapeSql})`)
    ),
    check(
      "finance_source_identities_scope_identifier_check",
      sql`(${table.bankCashPoolId} is null or (length(${table.bankCashPoolId}) between 1 and 160 and btrim(${table.bankCashPoolId}) = ${table.bankCashPoolId})) and (${table.refundId} is null or (length(${table.refundId}) between 1 and 160 and btrim(${table.refundId}) = ${table.refundId})) and (${table.payoutRequestId} is null or (length(${table.payoutRequestId}) between 1 and 160 and btrim(${table.payoutRequestId}) = ${table.payoutRequestId}))`
    ),
    check("finance_source_identities_kind_scope_check", sql.raw(`(${financeSourceKindScopeSql})`)),
    unique("finance_source_identities_natural_unique").on(
      table.sourceKind,
      table.sourceId,
      table.sourceOperationKey
    ),
    index("finance_source_identities_provider_idx").on(
      table.providerAccountVersionId,
      table.sourceKind,
      table.sourceId
    ),
    index("finance_source_identities_bank_idx").on(
      table.bankCashPoolId,
      table.sourceKind,
      table.sourceId
    )
  ]
);

export const financeJournalTransactions = pgTable(
  "finance_journal_transactions",
  {
    id: varchar("id", { length: 200 }).primaryKey(),
    sourceIdentityId: uuid("source_identity_id")
      .notNull()
      .references(() => financeSourceIdentities.id, { onDelete: "restrict" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    reversesJournalTransactionId: varchar("reverses_journal_transaction_id", { length: 200 }),
    currency: text("currency").notNull(),
    entryCount: integer("entry_count").notNull().default(0),
    totalDebitMinor: numeric("total_debit_minor", {
      precision: 38,
      scale: 0,
      mode: "string"
    }),
    totalCreditMinor: numeric("total_credit_minor", {
      precision: 38,
      scale: 0,
      mode: "string"
    }),
    canonicalPreimage: text("canonical_preimage"),
    canonicalDigest: varchar("canonical_digest", { length: 71 }),
    sealedAt: timestamp("sealed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_journal_transactions_reverses_fk",
      columns: [table.reversesJournalTransactionId],
      foreignColumns: [table.id]
    }).onDelete("restrict"),
    check("finance_journal_transactions_time_check", sql`${table.postedAt} >= ${table.occurredAt}`),
    check(
      "finance_journal_transactions_identifier_check",
      sql`length(${table.id}) between 1 and 200 and btrim(${table.id}) = ${table.id} and (${table.reversesJournalTransactionId} is null or (length(${table.reversesJournalTransactionId}) between 1 and 200 and btrim(${table.reversesJournalTransactionId}) = ${table.reversesJournalTransactionId}))`
    ),
    check(
      "finance_journal_transactions_seal_chronology_check",
      sql`${table.sealedAt} is null or ${table.sealedAt} >= ${table.postedAt}`
    ),
    check(
      "finance_journal_transactions_canonical_digest_check",
      sql`(${table.canonicalPreimage} is null and ${table.canonicalDigest} is null) or (length(${table.canonicalPreimage}) > 0 and ${table.canonicalDigest} ~ '^sha256:[0-9a-f]{64}$')`
    ),
    check("finance_journal_transactions_currency_check", sql`${table.currency} = 'RUB'`),
    check(
      "finance_journal_transactions_reversal_check",
      sql`${table.reversesJournalTransactionId} is null or ${table.reversesJournalTransactionId} <> ${table.id}`
    ),
    check(
      "finance_journal_transactions_seal_shape_check",
      sql`(${table.sealedAt} is null and ${table.entryCount} = 0 and ${table.totalDebitMinor} is null and ${table.totalCreditMinor} is null and ${table.canonicalPreimage} is null and ${table.canonicalDigest} is null) or (${table.sealedAt} is not null and ${table.entryCount} >= 2 and ${table.totalDebitMinor} > 0 and ${table.totalCreditMinor} > 0 and ${table.totalDebitMinor} = ${table.totalCreditMinor} and ${table.canonicalPreimage} is not null and ${table.canonicalDigest} is not null)`
    ),
    unique("finance_journal_transactions_source_unique").on(table.sourceIdentityId),
    unique("finance_journal_transactions_id_currency_unique").on(table.id, table.currency),
    unique("finance_journal_transactions_id_currency_occurred_unique").on(
      table.id,
      table.currency,
      table.occurredAt
    ),
    unique("finance_journal_transactions_id_digest_unique").on(table.id, table.canonicalDigest),
    uniqueIndex("finance_journal_transactions_reversal_unique")
      .on(table.reversesJournalTransactionId)
      .where(sql`${table.reversesJournalTransactionId} is not null`),
    index("finance_journal_transactions_history_idx").on(table.occurredAt, table.id)
  ]
);

export const financeJournalEntries = pgTable(
  "finance_journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    entryIndex: integer("entry_index").notNull(),
    accountId: uuid("account_id").notNull(),
    side: text("side").notNull(),
    amountMinor: numeric("amount_minor", { precision: 38, scale: 0, mode: "string" }).notNull(),
    currency: text("currency").notNull(),
    originalSaleId: varchar("original_sale_id", { length: 200 }),
    componentId: varchar("component_id", { length: 200 }),
    payableLotId: varchar("payable_lot_id", { length: 200 }),
    payoutAllocationId: varchar("payout_allocation_id", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_journal_entries_transaction_currency_occurred_fk",
      columns: [table.journalTransactionId, table.currency, table.occurredAt],
      foreignColumns: [
        financeJournalTransactions.id,
        financeJournalTransactions.currency,
        financeJournalTransactions.occurredAt
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_journal_entries_account_currency_fk",
      columns: [table.accountId, table.currency],
      foreignColumns: [financeAccounts.id, financeAccounts.currency]
    }).onDelete("restrict"),
    check("finance_journal_entries_index_check", sql`${table.entryIndex} >= 0`),
    check(
      "finance_journal_entries_side_check",
      sql`${table.side} in ${sql.raw(sqlValues(financeLedgerSideValues))}`
    ),
    check("finance_journal_entries_amount_check", sql`${table.amountMinor} > 0`),
    check("finance_journal_entries_currency_check", sql`${table.currency} = 'RUB'`),
    check(
      "finance_journal_entries_link_identifier_check",
      sql`(${table.originalSaleId} is null or (length(${table.originalSaleId}) between 1 and 200 and btrim(${table.originalSaleId}) = ${table.originalSaleId})) and (${table.componentId} is null or (length(${table.componentId}) between 1 and 200 and btrim(${table.componentId}) = ${table.componentId})) and (${table.payableLotId} is null or (length(${table.payableLotId}) between 1 and 200 and btrim(${table.payableLotId}) = ${table.payableLotId})) and (${table.payoutAllocationId} is null or (length(${table.payoutAllocationId}) between 1 and 200 and btrim(${table.payoutAllocationId}) = ${table.payoutAllocationId}))`
    ),
    unique("finance_journal_entries_transaction_order_unique").on(
      table.journalTransactionId,
      table.entryIndex
    ),
    index("finance_journal_entries_account_history_idx").on(
      table.accountId,
      table.occurredAt,
      table.journalTransactionId,
      table.entryIndex
    )
  ]
);

export const financeAllocationLinkProofs = pgTable(
  "finance_allocation_link_proofs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proofId: varchar("proof_id", { length: 200 }).notNull(),
    version: integer("version").notNull(),
    allocationAuthorityKind: varchar("allocation_authority_kind", { length: 200 }).notNull(),
    allocationAuthorityId: varchar("allocation_authority_id", { length: 200 }).notNull(),
    allocationAuthorityVersion: integer("allocation_authority_version").notNull(),
    allocationAuthorityDigest: text("allocation_authority_digest").notNull(),
    sourceEvidenceKind: varchar("source_evidence_kind", { length: 200 }).notNull(),
    sourceEvidenceId: varchar("source_evidence_id", { length: 200 }).notNull(),
    sourceEvidenceDigest: text("source_evidence_digest").notNull(),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 })
      .notNull()
      .references(() => financeJournalTransactions.id, { onDelete: "restrict" }),
    journalSourceKind: varchar("journal_source_kind", { length: 200 }).notNull(),
    journalSourceId: varchar("journal_source_id", { length: 200 }).notNull(),
    journalSourceOperationKey: varchar("journal_source_operation_key", { length: 200 }).notNull(),
    operationId: varchar("operation_id", { length: 200 }).notNull(),
    operationSnapshotId: varchar("operation_snapshot_id", { length: 200 }),
    operationSnapshotOperationId: varchar("operation_snapshot_operation_id", { length: 200 }),
    operationSnapshotPreviousWalletRevision: numeric(
      "operation_snapshot_previous_wallet_revision",
      { precision: 38, scale: 0, mode: "string" }
    ),
    operationSnapshotNextWalletRevision: numeric("operation_snapshot_next_wallet_revision", {
      precision: 38,
      scale: 0,
      mode: "string"
    }),
    operationSnapshotPreviousLotStateDigest: text("operation_snapshot_previous_lot_state_digest"),
    operationSnapshotNextLotStateDigest: text("operation_snapshot_next_lot_state_digest"),
    operationSnapshotHistoryRecordDigest: text("operation_snapshot_history_record_digest"),
    operationSnapshotDigest: text("operation_snapshot_digest"),
    proofDigest: text("proof_digest").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("finance_allocation_link_proofs_version_check", sql`${table.version} = 1`),
    check(
      "finance_allocation_link_proofs_authority_version_check",
      sql`${table.allocationAuthorityVersion} >= 1`
    ),
    check(
      "finance_allocation_link_proofs_identifier_check",
      sql`length(${table.proofId}) between 1 and 200 and btrim(${table.proofId}) = ${table.proofId} and length(${table.allocationAuthorityKind}) between 1 and 200 and btrim(${table.allocationAuthorityKind}) = ${table.allocationAuthorityKind} and length(${table.allocationAuthorityId}) between 1 and 200 and btrim(${table.allocationAuthorityId}) = ${table.allocationAuthorityId} and length(${table.sourceEvidenceKind}) between 1 and 200 and btrim(${table.sourceEvidenceKind}) = ${table.sourceEvidenceKind} and length(${table.sourceEvidenceId}) between 1 and 200 and btrim(${table.sourceEvidenceId}) = ${table.sourceEvidenceId} and length(${table.journalSourceId}) between 1 and 200 and btrim(${table.journalSourceId}) = ${table.journalSourceId} and length(${table.operationId}) between 1 and 200 and btrim(${table.operationId}) = ${table.operationId} and (${table.operationSnapshotId} is null or (length(${table.operationSnapshotId}) between 1 and 200 and btrim(${table.operationSnapshotId}) = ${table.operationSnapshotId})) and (${table.operationSnapshotOperationId} is null or (length(${table.operationSnapshotOperationId}) between 1 and 200 and btrim(${table.operationSnapshotOperationId}) = ${table.operationSnapshotOperationId}))`
    ),
    check(
      "finance_allocation_link_proofs_digest_check",
      sql`${table.allocationAuthorityDigest} ~ '^sha256:[0-9a-f]{64}$' and ${table.sourceEvidenceDigest} ~ '^sha256:[0-9a-f]{64}$' and ${table.proofDigest} ~ '^sha256:[0-9a-f]{64}$'`
    ),
    check(
      "finance_allocation_link_proofs_snapshot_digest_check",
      sql`(${table.operationSnapshotPreviousLotStateDigest} is null and ${table.operationSnapshotNextLotStateDigest} is null and ${table.operationSnapshotHistoryRecordDigest} is null and ${table.operationSnapshotDigest} is null) or (${table.operationSnapshotPreviousLotStateDigest} ~ '^sha256:[0-9a-f]{64}$' and ${table.operationSnapshotNextLotStateDigest} ~ '^sha256:[0-9a-f]{64}$' and ${table.operationSnapshotHistoryRecordDigest} ~ '^sha256:[0-9a-f]{64}$' and ${table.operationSnapshotDigest} ~ '^sha256:[0-9a-f]{64}$')`
    ),
    check(
      "finance_allocation_link_proofs_snapshot_revision_check",
      sql`${table.operationSnapshotPreviousWalletRevision} is null or (${table.operationSnapshotPreviousWalletRevision} >= 0 and ${table.operationSnapshotNextWalletRevision} = ${table.operationSnapshotPreviousWalletRevision} + 1)`
    ),
    check(
      "finance_allocation_link_proofs_snapshot_shape_check",
      sql`(${table.operationSnapshotId} is null and ${table.operationSnapshotOperationId} is null and ${table.operationSnapshotPreviousWalletRevision} is null and ${table.operationSnapshotNextWalletRevision} is null and ${table.operationSnapshotPreviousLotStateDigest} is null and ${table.operationSnapshotNextLotStateDigest} is null and ${table.operationSnapshotHistoryRecordDigest} is null and ${table.operationSnapshotDigest} is null) or (${table.operationSnapshotId} is not null and ${table.operationSnapshotOperationId} is not null and ${table.operationSnapshotPreviousWalletRevision} is not null and ${table.operationSnapshotNextWalletRevision} is not null and ${table.operationSnapshotPreviousLotStateDigest} is not null and ${table.operationSnapshotNextLotStateDigest} is not null and ${table.operationSnapshotHistoryRecordDigest} is not null and ${table.operationSnapshotDigest} is not null)`
    ),
    unique("finance_allocation_link_proofs_public_id_unique").on(table.proofId),
    unique("finance_allocation_link_proofs_transaction_unique").on(table.journalTransactionId),
    index("finance_allocation_link_proofs_operation_idx").on(table.operationId)
  ]
);

export const financeAllocationLinkProofEntries = pgTable(
  "finance_allocation_link_proof_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proofRecordId: uuid("proof_record_id")
      .notNull()
      .references(() => financeAllocationLinkProofs.id, { onDelete: "restrict" }),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => financeJournalEntries.id, { onDelete: "restrict" }),
    entryIndex: integer("entry_index").notNull(),
    accountId: uuid("account_id").notNull(),
    side: text("side").notNull(),
    amountMinor: numeric("amount_minor", { precision: 38, scale: 0, mode: "string" }).notNull(),
    currency: text("currency").notNull(),
    originalSaleId: varchar("original_sale_id", { length: 200 }),
    componentId: varchar("component_id", { length: 200 }),
    payableLotId: varchar("payable_lot_id", { length: 200 }),
    payoutAllocationId: varchar("payout_allocation_id", { length: 200 }),
    semanticEdgeId: varchar("semantic_edge_id", { length: 200 }),
    lotAllocationId: varchar("lot_allocation_id", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("finance_allocation_link_proof_entries_index_check", sql`${table.entryIndex} >= 0`),
    check(
      "finance_allocation_link_proof_entries_side_check",
      sql`${table.side} in ${sql.raw(sqlValues(financeLedgerSideValues))}`
    ),
    check("finance_allocation_link_proof_entries_amount_check", sql`${table.amountMinor} > 0`),
    check("finance_allocation_link_proof_entries_currency_check", sql`${table.currency} = 'RUB'`),
    check(
      "finance_allocation_link_proof_entries_source_link_check",
      sql`(${table.semanticEdgeId} is null and ${table.lotAllocationId} is null) or (${table.semanticEdgeId} is not null and ${table.lotAllocationId} is not null)`
    ),
    check(
      "finance_allocation_link_proof_entries_identifier_check",
      sql`(${table.originalSaleId} is null or (length(${table.originalSaleId}) between 1 and 200 and btrim(${table.originalSaleId}) = ${table.originalSaleId})) and (${table.componentId} is null or (length(${table.componentId}) between 1 and 200 and btrim(${table.componentId}) = ${table.componentId})) and (${table.payableLotId} is null or (length(${table.payableLotId}) between 1 and 200 and btrim(${table.payableLotId}) = ${table.payableLotId})) and (${table.payoutAllocationId} is null or (length(${table.payoutAllocationId}) between 1 and 200 and btrim(${table.payoutAllocationId}) = ${table.payoutAllocationId})) and (${table.semanticEdgeId} is null or (length(${table.semanticEdgeId}) between 1 and 200 and btrim(${table.semanticEdgeId}) = ${table.semanticEdgeId})) and (${table.lotAllocationId} is null or (length(${table.lotAllocationId}) between 1 and 200 and btrim(${table.lotAllocationId}) = ${table.lotAllocationId}))`
    ),
    unique("finance_allocation_link_proof_entries_proof_order_unique").on(
      table.proofRecordId,
      table.entryIndex
    ),
    unique("finance_allocation_link_proof_entries_journal_entry_unique").on(table.journalEntryId),
    uniqueIndex("finance_allocation_link_proof_entries_semantic_edge_unique")
      .on(table.semanticEdgeId)
      .where(sql`${table.semanticEdgeId} is not null`),
    uniqueIndex("finance_allocation_link_proof_entries_lot_allocation_unique")
      .on(table.lotAllocationId)
      .where(sql`${table.lotAllocationId} is not null`)
  ]
);

export const financePersistenceCommitReceipts = pgTable(
  "finance_persistence_commit_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: varchar("receipt_id", { length: 200 }).notNull(),
    receiptKind: text("receipt_kind").notNull(),
    sourceIdentityId: uuid("source_identity_id")
      .notNull()
      .references(() => financeSourceIdentities.id, { onDelete: "restrict" }),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 })
      .notNull()
      .references(() => financeJournalTransactions.id, { onDelete: "restrict" }),
    proofRecordId: uuid("proof_record_id")
      .notNull()
      .references(() => financeAllocationLinkProofs.id, { onDelete: "restrict" }),
    canonicalPreimage: text("canonical_preimage").notNull(),
    canonicalDigest: text("canonical_digest").notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "finance_persistence_commit_receipts_kind_check",
      sql`${table.receiptKind} = 'sealed_journal_transaction'`
    ),
    check(
      "finance_persistence_commit_receipts_digest_check",
      sql`${table.canonicalDigest} ~ '^sha256:[0-9a-f]{64}$'`
    ),
    check(
      "finance_persistence_commit_receipts_preimage_check",
      sql`length(${table.canonicalPreimage}) between 1 and 2000`
    ),
    check(
      "finance_persistence_commit_receipts_boundary_check",
      sql`length(${table.persistenceTransactionBoundaryRef}) between 1 and 200 and btrim(${table.persistenceTransactionBoundaryRef}) = ${table.persistenceTransactionBoundaryRef}`
    ),
    check(
      "finance_persistence_commit_receipts_identifier_check",
      sql`length(${table.receiptId}) between 1 and 200 and btrim(${table.receiptId}) = ${table.receiptId}`
    ),
    unique("finance_persistence_commit_receipts_public_id_unique").on(table.receiptId),
    unique("finance_persistence_commit_receipts_source_unique").on(table.sourceIdentityId),
    unique("finance_persistence_commit_receipts_transaction_unique").on(table.journalTransactionId),
    unique("finance_persistence_commit_receipts_proof_unique").on(table.proofRecordId)
  ]
);

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlValues(values: readonly string[]): string {
  return `(${values.map(quote).join(", ")})`;
}

function sourceScopeShape(
  kind: (typeof persistedFinanceSourceScopeKindValues)[number],
  provider: boolean,
  bank: boolean,
  astrologer: boolean,
  refundAndPayout: boolean
): string {
  return `(source_scope_kind = ${quote(kind)} and provider_account_version_id is ${
    provider ? "not " : ""
  }null and bank_cash_pool_id is ${bank ? "not " : ""}null and astrologer_user_id is ${
    astrologer ? "not " : ""
  }null and refund_id is ${refundAndPayout ? "not " : ""}null and payout_request_id is ${
    refundAndPayout ? "not " : ""
  }null)`;
}

function sourceOperationScope<K extends keyof typeof financeSourceOperationsByKind>(
  sourceKind: keyof typeof financeSourceOperationsByKind,
  operation: (typeof financeSourceOperationsByKind)[K][number],
  scopeKinds: readonly (typeof persistedFinanceSourceScopeKindValues)[number][]
): string {
  return `(source_kind = ${quote(sourceKind)} and source_operation_key = ${quote(
    operation
  )} and source_scope_kind in ${sqlValues(scopeKinds)})`;
}

// These operational tables remain live until every payment-flow consumer is
// migrated to the immutable finance journal above.  Keeping their schema here
// is a compatibility boundary, not an alias: both table families are distinct
// persisted contracts during the verified migration period.
export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountType: text("account_type").notNull(),
    astrologerUserId: uuid("astrologer_user_id").references(() => users.id, {
      onDelete: "restrict"
    }),
    balanceBucket: text("balance_bucket"),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "ledger_accounts_account_type_check",
      sql`${table.accountType} in ${sql.raw(formatFinanceSqlValues(ledgerAccountTypeValues))}`
    ),
    check(
      "ledger_accounts_balance_bucket_check",
      sql`${table.balanceBucket} is null or ${table.balanceBucket} in ${sql.raw(
        formatFinanceSqlValues(walletBalanceBucketValues)
      )}`
    ),
    check(
      "ledger_accounts_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check(
      "ledger_accounts_astrologer_shape_check",
      sql`(${table.accountType} in ('platform_clearing', 'platform_revenue', 'provider_fees', 'payout_clearing') and ${table.astrologerUserId} is null and ${table.balanceBucket} is null) or (${table.accountType} = 'astrologer_pending' and ${table.astrologerUserId} is not null and ${table.balanceBucket} = 'pending') or (${table.accountType} = 'astrologer_available' and ${table.astrologerUserId} is not null and ${table.balanceBucket} = 'available') or (${table.accountType} = 'astrologer_reserved' and ${table.astrologerUserId} is not null and ${table.balanceBucket} = 'reserved') or (${table.accountType} = 'astrologer_payout_pending' and ${table.astrologerUserId} is not null and ${table.balanceBucket} = 'payout_pending') or (${table.accountType} = 'astrologer_negative_balance' and ${table.astrologerUserId} is not null and ${table.balanceBucket} = 'negative_balance')`
    ),
    uniqueIndex("ledger_accounts_platform_unique")
      .on(table.accountType, table.currency)
      .where(sql`${table.astrologerUserId} is null`),
    uniqueIndex("ledger_accounts_astrologer_unique")
      .on(table.astrologerUserId, table.accountType, table.currency)
      .where(sql`${table.astrologerUserId} is not null`),
    index("ledger_accounts_astrologer_bucket_idx").on(table.astrologerUserId, table.balanceBucket)
  ]
);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    operationType: text("operation_type").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    payoutRequestId: uuid("payout_request_id").references(() => payoutRequests.id, {
      onDelete: "restrict"
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull()
  },
  (table) => [
    check(
      "ledger_transactions_operation_type_check",
      sql`${table.operationType} in ${sql.raw(formatFinanceSqlValues(ledgerOperationTypeValues))}`
    ),
    check(
      "ledger_transactions_source_check",
      sql`${table.orderId} is not null or ${table.payoutRequestId} is not null or ${table.operationType} = 'manual_adjustment'`
    ),
    check("ledger_transactions_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    index("ledger_transactions_order_idx").on(table.orderId),
    index("ledger_transactions_payout_request_idx").on(table.payoutRequestId),
    index("ledger_transactions_posted_idx").on(table.postedAt, table.id)
  ]
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerTransactionId: uuid("ledger_transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    side: text("entry_side").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "ledger_entries_side_check",
      sql`${table.side} in ${sql.raw(formatFinanceSqlValues(ledgerEntrySideValues))}`
    ),
    check(
      "ledger_entries_amount_check",
      sql`${table.amountMinor} > 0 and ${table.amountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))}`
    ),
    check(
      "ledger_entries_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check("ledger_entries_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    index("ledger_entries_transaction_account_side_idx").on(
      table.ledgerTransactionId,
      table.accountId,
      table.side
    ),
    index("ledger_entries_account_created_idx").on(table.accountId, table.createdAt)
  ]
);

export const walletBalanceReadModels = pgTable(
  "wallet_balance_read_models",
  {
    astrologerUserId: uuid("astrologer_user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    pendingAmountMinor: bigint("pending_amount_minor", { mode: "number" }).notNull().default(0),
    pendingCurrency: text("pending_currency").notNull().default("RUB"),
    availableAmountMinor: bigint("available_amount_minor", { mode: "number" }).notNull().default(0),
    availableCurrency: text("available_currency").notNull().default("RUB"),
    reservedAmountMinor: bigint("reserved_amount_minor", { mode: "number" }).notNull().default(0),
    reservedCurrency: text("reserved_currency").notNull().default("RUB"),
    payoutPendingAmountMinor: bigint("payout_pending_amount_minor", { mode: "number" })
      .notNull()
      .default(0),
    payoutPendingCurrency: text("payout_pending_currency").notNull().default("RUB"),
    negativeBalanceAmountMinor: bigint("negative_balance_amount_minor", { mode: "number" })
      .notNull()
      .default(0),
    negativeBalanceCurrency: text("negative_balance_currency").notNull().default("RUB"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "wallet_balance_read_models_amount_check",
      sql`${table.pendingAmountMinor} >= 0 and ${table.pendingAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))} and ${table.availableAmountMinor} >= 0 and ${table.availableAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))} and ${table.reservedAmountMinor} >= 0 and ${table.reservedAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))} and ${table.payoutPendingAmountMinor} >= 0 and ${table.payoutPendingAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))} and ${table.negativeBalanceAmountMinor} >= 0 and ${table.negativeBalanceAmountMinor} <= ${sql.raw(String(financeSafeIntegerMinorUnitMax))}`
    ),
    check(
      "wallet_balance_read_models_currency_check",
      sql`${table.pendingCurrency} = 'RUB' and ${table.availableCurrency} = 'RUB' and ${table.reservedCurrency} = 'RUB' and ${table.payoutPendingCurrency} = 'RUB' and ${table.negativeBalanceCurrency} = 'RUB'`
    )
  ]
);
