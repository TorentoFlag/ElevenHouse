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
  financeSignedInt64Maximum,
  financeSignedInt64Minimum,
  financeSignedInt64String,
  formatFinanceSqlValues
} from "./finance-values";
import { financeJournalTransactions } from "./ledger.schema";
import { financeProviderAccounts } from "./provider-accounts.schema";
import { financeBankCashPools } from "./bank-cash.schema";
import {
  financeCaptureFacts,
  financeEconomicPaymentIntents,
  financePaymentClearingHeads
} from "./economic-payments.schema";

export const financeSettlementStreamValues = ["settlement_ledger", "settlement_payouts"] as const;
export const financeSettlementPaymentMatchResultValues = [
  "matched",
  "quarantined_no_effect"
] as const;
export const financeSettlementPaymentAmountRelationValues = [
  "same_minor",
  "negated_minor"
] as const;

const digestCheck = sql.raw("'^sha256:[a-f0-9]{64}$'");
const safeIntegerMaximum = "9007199254740991";

export const financeSettlementCursors = pgTable(
  "finance_settlement_cursors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    stream: text("stream").notNull(),
    initialBackfillStart: timestamp("initial_backfill_start", { withTimezone: true }).notNull(),
    overlapSeconds: integer("overlap_seconds").notNull(),
    highWaterMark: timestamp("high_water_mark", { withTimezone: true }).notNull(),
    activeWindowStart: timestamp("active_window_start", { withTimezone: true }),
    activeWindowEnd: timestamp("active_window_end", { withTimezone: true }),
    nextPageCursor: varchar("next_page_cursor", { length: 1_000 }),
    checkpointedPageCount: integer("checkpointed_page_count").notNull().default(0),
    maxPageCount: integer("max_page_count"),
    leaseOwnerId: varchar("lease_owner_id", { length: 160 }),
    leaseTokenDigest: varchar("lease_token_digest", { length: 71 }),
    leaseClaimedAt: timestamp("lease_claimed_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    fencingToken: financeRevisionString("fencing_token").notNull().default("0"),
    windowGeneration: financeRevisionString("window_generation").notNull().default("0"),
    version: financeRevisionString("version").notNull().default("1"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion
      ],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_settlement_cursors_provider_identity_fk"
    }).onDelete("restrict"),
    unique("finance_settlement_cursors_provider_stream_unique").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.stream
    ),
    unique("finance_settlement_cursors_exact_owner_unique").on(
      table.id,
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.stream
    ),
    check(
      "finance_settlement_cursors_stream_check",
      sql`${table.stream} in ${sql.raw(formatFinanceSqlValues(financeSettlementStreamValues))}`
    ),
    check(
      "finance_settlement_cursors_version_check",
      sql`${table.version} between 1 and ${sql.raw(safeIntegerMaximum)}
        and ${table.fencingToken} between 0 and ${sql.raw(safeIntegerMaximum)}
        and ${table.windowGeneration} between 0 and ${sql.raw(safeIntegerMaximum)}`
    ),
    check(
      "finance_settlement_cursors_time_check",
      sql`${table.highWaterMark} >= ${table.initialBackfillStart}
        and ${table.updatedAt} >= ${table.highWaterMark}`
    ),
    check(
      "finance_settlement_cursors_overlap_check",
      sql`${table.overlapSeconds} between 1 and 604800`
    ),
    check(
      "finance_settlement_cursors_window_shape_check",
      sql`(
          ${table.activeWindowStart} is null
          and ${table.activeWindowEnd} is null
          and ${table.nextPageCursor} is null
          and ${table.checkpointedPageCount} = 0
          and ${table.maxPageCount} is null
        ) or (
          ${table.activeWindowStart} is not null
          and ${table.activeWindowEnd} is not null
          and ${table.activeWindowStart} < ${table.activeWindowEnd}
          and ${table.activeWindowEnd} <= ${table.updatedAt}
          and ${table.windowGeneration} >= 1
          and ${table.maxPageCount} between 1 and 10000
          and ${table.checkpointedPageCount} between 0 and ${table.maxPageCount} - 1
          and (
            (${table.nextPageCursor} is null and ${table.checkpointedPageCount} = 0)
            or (${table.nextPageCursor} is not null and ${table.checkpointedPageCount} >= 1)
          )
        )`
    ),
    check(
      "finance_settlement_cursors_lease_shape_check",
      sql`(
          ${table.leaseOwnerId} is null
          and ${table.leaseTokenDigest} is null
          and ${table.leaseClaimedAt} is null
          and ${table.leaseExpiresAt} is null
        ) or (
          ${table.leaseOwnerId} is not null
          and ${table.leaseTokenDigest} ~ ${digestCheck}
          and ${table.leaseClaimedAt} is not null
          and ${table.leaseExpiresAt} > ${table.leaseClaimedAt}
          and ${table.fencingToken} >= 1
        )`
    ),
    index("finance_settlement_cursors_lease_expiry_idx").on(
      table.leaseExpiresAt,
      table.stream,
      table.id
    )
  ]
);

export const financeSettlementPages = pgTable(
  "finance_settlement_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    settlementCursorId: uuid("settlement_cursor_id").notNull(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    stream: text("stream").notNull(),
    windowGeneration: financeRevisionString("window_generation").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    checkpointIdentity: varchar("checkpoint_identity", { length: 2_000 }).notNull(),
    providerPageCursor: varchar("provider_page_cursor", { length: 1_000 }),
    nextPageCursor: varchar("next_page_cursor", { length: 1_000 }),
    rawArtifactId: varchar("raw_artifact_id", { length: 160 }).notNull(),
    rawArtifactDigest: varchar("raw_artifact_digest", { length: 71 }).notNull(),
    rawArtifactByteLength: financeNumeric38String("raw_artifact_byte_length").notNull(),
    decodedEntriesDigest: varchar("decoded_entries_digest", { length: 71 }).notNull(),
    returnedCount: integer("returned_count").notNull(),
    operationPolicyId: varchar("operation_policy_id", { length: 160 }).notNull(),
    operationPolicyVersion: integer("operation_policy_version").notNull(),
    operationPolicyDigest: varchar("operation_policy_digest", { length: 71 }).notNull(),
    maximumRows: integer("maximum_rows").notNull(),
    maximumDecimalDigits: integer("maximum_decimal_digits").notNull(),
    maximumArtifactBytes: financeNumeric38String("maximum_artifact_bytes").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.settlementCursorId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.stream
      ],
      foreignColumns: [
        financeSettlementCursors.id,
        financeSettlementCursors.providerAccountSeriesId,
        financeSettlementCursors.providerAccountId,
        financeSettlementCursors.providerIdentityVersion,
        financeSettlementCursors.stream
      ],
      name: "finance_settlement_pages_cursor_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rawArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_settlement_pages_raw_artifact_fk"
    }).onDelete("restrict"),
    unique("finance_settlement_pages_checkpoint_unique").on(
      table.settlementCursorId,
      table.windowGeneration,
      table.checkpointIdentity
    ),
    unique("finance_settlement_pages_provider_cursor_unique")
      .on(table.settlementCursorId, table.windowGeneration, table.providerPageCursor)
      .nullsNotDistinct(),
    unique("finance_settlement_pages_exact_checkpoint_owner_unique").on(
      table.id,
      table.settlementCursorId,
      table.windowGeneration,
      table.checkpointIdentity
    ),
    unique("finance_settlement_pages_id_stream_unique").on(table.id, table.stream),
    check(
      "finance_settlement_pages_stream_check",
      sql`${table.stream} in ${sql.raw(formatFinanceSqlValues(financeSettlementStreamValues))}`
    ),
    check(
      "finance_settlement_pages_digest_check",
      sql`${table.rawArtifactDigest} ~ ${digestCheck}
        and ${table.decodedEntriesDigest} ~ ${digestCheck}
        and ${table.operationPolicyDigest} ~ ${digestCheck}`
    ),
    check(
      "finance_settlement_pages_limits_check",
      sql`${table.windowGeneration} >= 1
        and ${table.rawArtifactByteLength} >= 0
        and ${table.returnedCount} between 0 and ${table.maximumRows}
        and ${table.maximumRows} between 1 and 10000
        and ${table.maximumDecimalDigits} between 1 and 1000
        and ${table.maximumArtifactBytes} > 0
        and ${table.rawArtifactByteLength} <= ${table.maximumArtifactBytes}
        and ${table.operationPolicyVersion} >= 1`
    ),
    check(
      "finance_settlement_pages_time_check",
      sql`${table.windowStart} < ${table.windowEnd}
        and ${table.fetchedAt} <= ${table.verifiedAt}
        and ${table.verifiedAt} <= ${table.committedAt}`
    ),
    index("finance_settlement_pages_history_idx").on(
      table.settlementCursorId,
      table.windowGeneration,
      table.committedAt,
      table.id
    )
  ]
);

export const financeSettlementLedgerEntries = pgTable(
  "finance_settlement_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerEntryId: varchar("provider_entry_id", { length: 200 }).notNull(),
    firstSeenPageId: uuid("first_seen_page_id").notNull(),
    amountMinor: financeSignedInt64String("amount_minor").notNull(),
    currency: varchar("currency", { length: 500 }).notNull(),
    direction: varchar("direction", { length: 500 }).notNull(),
    entryType: varchar("entry_type", { length: 500 }).notNull(),
    referenceType: varchar("reference_type", { length: 500 }).notNull(),
    referenceId: varchar("reference_id", { length: 500 }).notNull(),
    feeAmountMinor: financeSignedInt64String("fee_amount_minor"),
    balanceAfterMinor: financeSignedInt64String("balance_after_minor"),
    occurredAt: varchar("occurred_at", { length: 80 }),
    organizationId: varchar("organization_id", { length: 500 }),
    terminalId: varchar("terminal_id", { length: 500 }),
    bankTerminalId: varchar("bank_terminal_id", { length: 500 }),
    bankCode: varchar("bank_code", { length: 500 }),
    bankRrn: varchar("bank_rrn", { length: 500 }),
    bankAuthCode: varchar("bank_auth_code", { length: 500 }),
    bankInternalReference: varchar("bank_internal_reference", { length: 500 }),
    settlementStatus: varchar("settlement_status", { length: 500 }),
    rawPayloadDigest: varchar("raw_payload_digest", { length: 71 }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion
      ],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_settlement_ledger_entries_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.firstSeenPageId],
      foreignColumns: [financeSettlementPages.id],
      name: "finance_settlement_ledger_entries_first_page_fk"
    }).onDelete("restrict"),
    unique("finance_settlement_ledger_entries_provider_entry_unique").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerEntryId
    ),
    unique("finance_settlement_ledger_entries_exact_owner_unique").on(
      table.id,
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerEntryId
    ),
    check(
      "finance_settlement_ledger_entries_int64_check",
      sql`${table.amountMinor} between ${sql.raw(financeSignedInt64Minimum)} and ${sql.raw(financeSignedInt64Maximum)}
        and (${table.feeAmountMinor} is null or ${table.feeAmountMinor} between ${sql.raw(financeSignedInt64Minimum)} and ${sql.raw(financeSignedInt64Maximum)})
        and (${table.balanceAfterMinor} is null or ${table.balanceAfterMinor} between ${sql.raw(financeSignedInt64Minimum)} and ${sql.raw(financeSignedInt64Maximum)})`
    ),
    check(
      "finance_settlement_ledger_entries_digest_check",
      sql`${table.rawPayloadDigest} ~ ${digestCheck}`
    ),
    index("finance_settlement_ledger_entries_reference_idx").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.referenceType,
      table.referenceId
    )
  ]
);

export const financeSettlementPayouts = pgTable(
  "finance_settlement_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    merchantPayoutId: varchar("merchant_payout_id", { length: 200 }).notNull(),
    firstSeenPageId: uuid("first_seen_page_id").notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    currency: varchar("currency", { length: 500 }).notNull(),
    status: varchar("status", { length: 500 }).notNull(),
    payoutMethod: varchar("payout_method", { length: 500 }),
    bankCode: varchar("bank_code", { length: 500 }),
    bankTerminalId: varchar("bank_terminal_id", { length: 500 }),
    providerBankPayoutId: varchar("provider_bank_payout_id", { length: 500 }),
    bankPayoutStatus: varchar("bank_payout_status", { length: 500 }),
    initiatedAt: varchar("initiated_at", { length: 80 }),
    completedAt: varchar("completed_at", { length: 80 }),
    failedReason: varchar("failed_reason", { length: 500 }),
    rawPayloadDigest: varchar("raw_payload_digest", { length: 71 }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion
      ],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_settlement_payouts_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.firstSeenPageId],
      foreignColumns: [financeSettlementPages.id],
      name: "finance_settlement_payouts_first_page_fk"
    }).onDelete("restrict"),
    unique("finance_settlement_payouts_provider_payout_unique").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.merchantPayoutId
    ),
    unique("finance_settlement_payouts_exact_owner_unique").on(
      table.id,
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.merchantPayoutId
    ),
    unique("finance_settlement_payouts_confirmation_owner_unique").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.merchantPayoutId,
      table.providerBankPayoutId,
      table.amountMinor,
      table.currency
    ),
    check(
      "finance_settlement_payouts_int64_check",
      sql`${table.amountMinor} between ${sql.raw(financeSignedInt64Minimum)} and ${sql.raw(financeSignedInt64Maximum)}`
    ),
    check(
      "finance_settlement_payouts_digest_check",
      sql`${table.rawPayloadDigest} ~ ${digestCheck}`
    ),
    index("finance_settlement_payouts_status_idx").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.status,
      table.merchantPayoutId
    )
  ]
);

export const financeSettlementLedgerPageEntries = pgTable(
  "finance_settlement_ledger_page_entries",
  {
    settlementPageId: uuid("settlement_page_id").notNull(),
    settlementEntryId: uuid("settlement_entry_id").notNull(),
    stream: text("stream").notNull().default("settlement_ledger"),
    rowIndex: integer("row_index").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.settlementPageId, table.settlementEntryId],
      name: "finance_settlement_ledger_page_entries_pk"
    }),
    foreignKey({
      columns: [table.settlementPageId, table.stream],
      foreignColumns: [financeSettlementPages.id, financeSettlementPages.stream],
      name: "finance_settlement_ledger_page_entries_page_stream_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.settlementEntryId],
      foreignColumns: [financeSettlementLedgerEntries.id],
      name: "finance_settlement_ledger_page_entries_entry_fk"
    }).onDelete("restrict"),
    unique("finance_settlement_ledger_page_entries_order_unique").on(
      table.settlementPageId,
      table.rowIndex
    ),
    check(
      "finance_settlement_ledger_page_entries_stream_check",
      sql`${table.stream} = 'settlement_ledger'`
    ),
    check("finance_settlement_ledger_page_entries_row_index_check", sql`${table.rowIndex} >= 0`)
  ]
);

export const financeSettlementPayoutPageEntries = pgTable(
  "finance_settlement_payout_page_entries",
  {
    settlementPageId: uuid("settlement_page_id").notNull(),
    settlementPayoutId: uuid("settlement_payout_id").notNull(),
    stream: text("stream").notNull().default("settlement_payouts"),
    rowIndex: integer("row_index").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.settlementPageId, table.settlementPayoutId],
      name: "finance_settlement_payout_page_entries_pk"
    }),
    foreignKey({
      columns: [table.settlementPageId, table.stream],
      foreignColumns: [financeSettlementPages.id, financeSettlementPages.stream],
      name: "finance_settlement_payout_page_entries_page_stream_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.settlementPayoutId],
      foreignColumns: [financeSettlementPayouts.id],
      name: "finance_settlement_payout_page_entries_payout_fk"
    }).onDelete("restrict"),
    unique("finance_settlement_payout_page_entries_order_unique").on(
      table.settlementPageId,
      table.rowIndex
    ),
    check(
      "finance_settlement_payout_page_entries_stream_check",
      sql`${table.stream} = 'settlement_payouts'`
    ),
    check("finance_settlement_payout_page_entries_row_index_check", sql`${table.rowIndex} >= 0`)
  ]
);

export const financeSettlementPageCheckpoints = pgTable(
  "finance_settlement_page_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    settlementCursorId: uuid("settlement_cursor_id").notNull(),
    windowGeneration: financeRevisionString("window_generation").notNull(),
    checkpointIdentity: varchar("checkpoint_identity", { length: 2_000 }).notNull(),
    providerPageCursor: varchar("provider_page_cursor", { length: 1_000 }),
    nextPageCursor: varchar("next_page_cursor", { length: 1_000 }),
    settlementPageId: uuid("settlement_page_id").notNull(),
    fencingToken: financeRevisionString("fencing_token").notNull(),
    cursorVersionBefore: financeRevisionString("cursor_version_before").notNull(),
    cursorVersionAfter: financeRevisionString("cursor_version_after").notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.settlementCursorId],
      foreignColumns: [financeSettlementCursors.id],
      name: "finance_settlement_page_checkpoints_cursor_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.settlementPageId,
        table.settlementCursorId,
        table.windowGeneration,
        table.checkpointIdentity
      ],
      foreignColumns: [
        financeSettlementPages.id,
        financeSettlementPages.settlementCursorId,
        financeSettlementPages.windowGeneration,
        financeSettlementPages.checkpointIdentity
      ],
      name: "finance_settlement_page_checkpoints_page_fk"
    }).onDelete("restrict"),
    unique("finance_settlement_page_checkpoints_identity_unique").on(
      table.settlementCursorId,
      table.windowGeneration,
      table.checkpointIdentity
    ),
    unique("finance_settlement_page_checkpoints_provider_cursor_unique")
      .on(table.settlementCursorId, table.windowGeneration, table.providerPageCursor)
      .nullsNotDistinct(),
    unique("finance_settlement_page_checkpoints_page_unique").on(table.settlementPageId),
    unique("finance_settlement_page_checkpoints_exact_owner_unique").on(
      table.id,
      table.settlementPageId,
      table.settlementCursorId,
      table.windowGeneration,
      table.checkpointIdentity
    ),
    check(
      "finance_settlement_page_checkpoints_version_check",
      sql`${table.windowGeneration} >= 1
        and ${table.fencingToken} >= 1
        and ${table.cursorVersionBefore} >= 1
        and ${table.cursorVersionAfter} = ${table.cursorVersionBefore} + 1`
    )
  ]
);

export const financeSettlementBatchIngestionCommitReceipts = pgTable(
  "finance_settlement_batch_ingestion_commit_receipts",
  {
    receiptId: varchar("receipt_id", { length: 200 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    receiptVersion: integer("receipt_version").notNull().default(1),
    canonicalPreimage: text("canonical_preimage").notNull().default(""),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull().default(""),
    settlementPageId: uuid("settlement_page_id").notNull(),
    settlementCheckpointId: uuid("settlement_checkpoint_id").notNull(),
    settlementCursorId: uuid("settlement_cursor_id").notNull(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    stream: text("stream").notNull(),
    windowGeneration: financeRevisionString("window_generation").notNull(),
    checkpointIdentity: varchar("checkpoint_identity", { length: 2_000 }).notNull(),
    providerPageCursor: varchar("provider_page_cursor", { length: 1_000 }),
    rawArtifactId: varchar("raw_artifact_id", { length: 160 }).notNull(),
    rawArtifactDigest: varchar("raw_artifact_digest", { length: 71 }).notNull(),
    rawArtifactByteLength: financeNumeric38String("raw_artifact_byte_length").notNull(),
    decodedEntriesDigest: varchar("decoded_entries_digest", { length: 71 }).notNull(),
    insertedEntryCount: integer("inserted_entry_count").notNull(),
    replayedEntryCount: integer("replayed_entry_count").notNull(),
    cursorVersion: financeRevisionString("cursor_version").notNull(),
    fencingToken: financeRevisionString("fencing_token").notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    })
      .notNull()
      .default(""),
    databaseCommittedAt: timestamp("database_committed_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.settlementCheckpointId,
        table.settlementPageId,
        table.settlementCursorId,
        table.windowGeneration,
        table.checkpointIdentity
      ],
      foreignColumns: [
        financeSettlementPageCheckpoints.id,
        financeSettlementPageCheckpoints.settlementPageId,
        financeSettlementPageCheckpoints.settlementCursorId,
        financeSettlementPageCheckpoints.windowGeneration,
        financeSettlementPageCheckpoints.checkpointIdentity
      ],
      name: "finance_settlement_batch_ingestion_receipts_checkpoint_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rawArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_settlement_batch_ingestion_receipts_artifact_fk"
    }).onDelete("restrict"),
    unique("finance_settlement_batch_ingestion_receipts_nominal_ref_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest
    ),
    unique("finance_settlement_batch_ingestion_receipts_page_unique").on(table.settlementPageId),
    unique("finance_settlement_batch_ingestion_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    check(
      "finance_settlement_batch_ingestion_receipts_shape_check",
      sql`${table.receiptVersion} = 1
        and ${table.canonicalDigest} ~ ${digestCheck}
        and ${table.rawArtifactDigest} ~ ${digestCheck}
        and ${table.decodedEntriesDigest} ~ ${digestCheck}
        and ${table.rawArtifactByteLength} >= 0
        and ${table.insertedEntryCount} >= 0
        and ${table.replayedEntryCount} >= 0
        and ${table.cursorVersion} >= 2
        and ${table.fencingToken} >= 1
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'`
    ),
    index("finance_settlement_batch_ingestion_receipts_history_idx").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.stream,
      table.databaseCommittedAt,
      table.receiptId
    )
  ]
);

/**
 * Persistence owner for the nominal authority consumed by Task 8 bank matching. It represents one
 * aggregate ArcPay payout to ElevenHouse and is deliberately unrelated to astrologer withdrawals.
 */
export const financeMerchantPayoutConfirmationCommitReceipts = pgTable(
  "finance_merchant_payout_confirmation_commit_receipts",
  {
    receiptId: varchar("receipt_id", { length: 200 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    receiptVersion: integer("receipt_version").notNull().default(1),
    canonicalPreimage: text("canonical_preimage").notNull().default(""),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull().default(""),
    batchIngestionReceiptId: varchar("batch_ingestion_receipt_id", { length: 200 }).notNull(),
    batchIngestionReceiptVersion: integer("batch_ingestion_receipt_version").notNull(),
    batchIngestionReceiptDigest: varchar("batch_ingestion_receipt_digest", {
      length: 71
    }).notNull(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    merchantPayoutId: varchar("merchant_payout_id", { length: 200 }).notNull(),
    providerBankPayoutId: varchar("provider_bank_payout_id", { length: 500 }).notNull(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    currency: text("currency").notNull(),
    bankReference: varchar("bank_reference", { length: 320 }).notNull(),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }).notNull(),
    providerPositionRevision: financeRevisionString("provider_position_revision").notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    })
      .notNull()
      .default(""),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.batchIngestionReceiptId,
        table.batchIngestionReceiptVersion,
        table.batchIngestionReceiptDigest
      ],
      foreignColumns: [
        financeSettlementBatchIngestionCommitReceipts.receiptId,
        financeSettlementBatchIngestionCommitReceipts.receiptVersion,
        financeSettlementBatchIngestionCommitReceipts.canonicalDigest
      ],
      name: "finance_merchant_payout_confirmation_receipts_batch_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.merchantPayoutId,
        table.providerBankPayoutId,
        table.amountMinor,
        table.currency
      ],
      foreignColumns: [
        financeSettlementPayouts.providerAccountSeriesId,
        financeSettlementPayouts.providerAccountId,
        financeSettlementPayouts.providerIdentityVersion,
        financeSettlementPayouts.merchantPayoutId,
        financeSettlementPayouts.providerBankPayoutId,
        financeSettlementPayouts.amountMinor,
        financeSettlementPayouts.currency
      ],
      name: "finance_merchant_payout_confirmation_receipts_payout_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.bankCashPoolId, table.currency],
      foreignColumns: [financeBankCashPools.id, financeBankCashPools.currency],
      name: "finance_merchant_payout_confirmation_receipts_cash_pool_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.journalTransactionId, table.currency],
      foreignColumns: [financeJournalTransactions.id, financeJournalTransactions.currency],
      name: "finance_merchant_payout_confirmation_receipts_journal_fk"
    }).onDelete("restrict"),
    unique("finance_merchant_payout_confirmation_receipts_nominal_ref_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest
    ),
    unique("finance_merchant_payout_confirmation_receipts_bank_authority_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest,
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.merchantPayoutId,
      table.providerBankPayoutId,
      table.bankCashPoolId,
      table.amountMinor,
      table.currency,
      table.bankReference
    ),
    unique("finance_merchant_payout_confirmation_receipts_payout_unique").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.merchantPayoutId
    ),
    unique("finance_merchant_payout_confirmation_receipts_wire_unique").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerBankPayoutId
    ),
    unique("finance_merchant_payout_confirmation_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    check(
      "finance_merchant_payout_confirmation_receipts_shape_check",
      sql`${table.receiptVersion} = 1
        and ${table.batchIngestionReceiptVersion} = 1
        and ${table.canonicalDigest} ~ ${digestCheck}
        and ${table.batchIngestionReceiptDigest} ~ ${digestCheck}
        and ${table.amountMinor} > 0
        and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}
        and ${table.providerPositionRevision} >= 1
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'`
    )
  ]
);

export const financeSettlementExceptions = pgTable(
  "finance_settlement_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    stream: text("stream").notNull(),
    settlementPageId: uuid("settlement_page_id").notNull(),
    providerEntryId: varchar("provider_entry_id", { length: 200 }),
    merchantPayoutId: varchar("merchant_payout_id", { length: 200 }),
    exceptionCode: varchar("exception_code", { length: 160 }).notNull(),
    evidenceDigest: varchar("evidence_digest", { length: 71 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      columns: [table.settlementPageId, table.stream],
      foreignColumns: [financeSettlementPages.id, financeSettlementPages.stream],
      name: "finance_settlement_exceptions_page_stream_fk"
    }).onDelete("restrict"),
    check(
      "finance_settlement_exceptions_shape_check",
      sql`(
          ${table.stream} = 'settlement_ledger'
          and ${table.providerEntryId} is not null
          and ${table.merchantPayoutId} is null
        ) or (
          ${table.stream} = 'settlement_payouts'
          and ${table.providerEntryId} is null
          and ${table.merchantPayoutId} is not null
        )`
    ),
    check(
      "finance_settlement_exceptions_digest_check",
      sql`${table.evidenceDigest} ~ ${digestCheck}`
    ),
    uniqueIndex("finance_settlement_exceptions_open_ledger_unique")
      .on(
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.providerEntryId,
        table.exceptionCode
      )
      .where(sql`${table.stream} = 'settlement_ledger' and ${table.resolvedAt} is null`),
    uniqueIndex("finance_settlement_exceptions_open_payout_unique")
      .on(
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.merchantPayoutId,
        table.exceptionCode
      )
      .where(sql`${table.stream} = 'settlement_payouts' and ${table.resolvedAt} is null`)
  ]
);

export const financeSettlementPaymentMatchCommitReceipts = pgTable(
  "finance_settlement_payment_match_commit_receipts",
  {
    receiptId: varchar("receipt_id", { length: 200 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    receiptVersion: integer("receipt_version").notNull().default(1),
    canonicalPreimage: text("canonical_preimage").notNull().default(""),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull().default(""),
    batchIngestionReceiptId: varchar("batch_ingestion_receipt_id", { length: 200 }).notNull(),
    batchIngestionReceiptVersion: integer("batch_ingestion_receipt_version").notNull(),
    batchIngestionReceiptDigest: varchar("batch_ingestion_receipt_digest", {
      length: 71
    }).notNull(),
    settlementPageId: uuid("settlement_page_id").notNull(),
    settlementEntryId: uuid("settlement_entry_id").notNull(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerEntryId: varchar("provider_entry_id", { length: 200 }).notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    captureFactId: varchar("capture_fact_id", { length: 160 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    currency: text("currency").notNull(),
    matchResult: text("match_result").notNull(),
    correlationRuleId: varchar("correlation_rule_id", { length: 160 }).notNull(),
    correlationRuleVersion: integer("correlation_rule_version").notNull(),
    correlationRuleDigest: varchar("correlation_rule_digest", { length: 71 }).notNull(),
    ruleReferenceType: varchar("rule_reference_type", { length: 500 }).notNull(),
    ruleDirection: varchar("rule_direction", { length: 500 }).notNull(),
    ruleEntryType: varchar("rule_entry_type", { length: 500 }).notNull(),
    ruleSettlementStatus: varchar("rule_settlement_status", { length: 500 }),
    ruleAmountRelation: text("rule_amount_relation").notNull(),
    clearingVersion: financeRevisionString("clearing_version").notNull(),
    matchEvidenceDigest: varchar("match_evidence_digest", { length: 71 }).notNull().default(""),
    settlementExceptionId: uuid("settlement_exception_id"),
    operationPolicyId: varchar("operation_policy_id", { length: 160 }).notNull(),
    operationPolicyVersion: integer("operation_policy_version").notNull(),
    operationPolicyDigest: varchar("operation_policy_digest", { length: 71 }).notNull(),
    maximumRows: integer("maximum_rows").notNull(),
    maximumDecimalDigits: integer("maximum_decimal_digits").notNull(),
    maximumArtifactBytes: financeNumeric38String("maximum_artifact_bytes").notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    })
      .notNull()
      .default(""),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.batchIngestionReceiptId,
        table.batchIngestionReceiptVersion,
        table.batchIngestionReceiptDigest
      ],
      foreignColumns: [
        financeSettlementBatchIngestionCommitReceipts.receiptId,
        financeSettlementBatchIngestionCommitReceipts.receiptVersion,
        financeSettlementBatchIngestionCommitReceipts.canonicalDigest
      ],
      name: "finance_settlement_payment_match_receipts_batch_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.settlementEntryId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.providerEntryId
      ],
      foreignColumns: [
        financeSettlementLedgerEntries.id,
        financeSettlementLedgerEntries.providerAccountSeriesId,
        financeSettlementLedgerEntries.providerAccountId,
        financeSettlementLedgerEntries.providerIdentityVersion,
        financeSettlementLedgerEntries.providerEntryId
      ],
      name: "finance_settlement_payment_match_receipts_entry_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.settlementPageId, table.settlementEntryId],
      foreignColumns: [
        financeSettlementLedgerPageEntries.settlementPageId,
        financeSettlementLedgerPageEntries.settlementEntryId
      ],
      name: "finance_settlement_payment_match_receipts_page_entry_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.economicPaymentIntentId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion
      ],
      foreignColumns: [
        financeEconomicPaymentIntents.id,
        financeEconomicPaymentIntents.seriesId,
        financeEconomicPaymentIntents.providerAccountId,
        financeEconomicPaymentIntents.providerIdentityVersion
      ],
      name: "finance_settlement_payment_match_receipts_intent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.captureFactId],
      foreignColumns: [financeCaptureFacts.id],
      name: "finance_settlement_payment_match_receipts_capture_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.economicPaymentIntentId],
      foreignColumns: [financePaymentClearingHeads.economicPaymentIntentId],
      name: "finance_settlement_payment_match_receipts_clearing_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.settlementExceptionId],
      foreignColumns: [financeSettlementExceptions.id],
      name: "finance_settlement_payment_match_receipts_exception_fk"
    }).onDelete("restrict"),
    unique("finance_settlement_payment_match_receipts_nominal_ref_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest
    ),
    unique("finance_settlement_payment_match_receipts_exact_authority_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest,
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerEntryId,
      table.economicPaymentIntentId,
      table.captureFactId,
      table.providerPaymentId,
      table.amountMinor,
      table.currency,
      table.matchResult,
      table.correlationRuleId,
      table.correlationRuleVersion,
      table.correlationRuleDigest,
      table.clearingVersion,
      table.matchEvidenceDigest
    ),
    unique("finance_settlement_payment_match_receipts_provider_entry_unique").on(
      table.providerAccountSeriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerEntryId
    ),
    unique("finance_settlement_payment_match_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    uniqueIndex("finance_settlement_payment_match_receipts_matched_capture_unique")
      .on(table.captureFactId)
      .where(sql`${table.matchResult} = 'matched'`),
    check(
      "finance_settlement_payment_match_receipts_shape_check",
      sql`${table.receiptVersion} = 1
        and ${table.batchIngestionReceiptVersion} = 1
        and ${table.canonicalDigest} ~ ${digestCheck}
        and ${table.batchIngestionReceiptDigest} ~ ${digestCheck}
        and ${table.correlationRuleVersion} >= 1
        and ${table.correlationRuleDigest} ~ ${digestCheck}
        and ${table.matchEvidenceDigest} ~ ${digestCheck}
        and ${table.operationPolicyVersion} >= 1
        and ${table.operationPolicyDigest} ~ ${digestCheck}
        and ${table.maximumRows} between 1 and 10000
        and ${table.maximumDecimalDigits} between 1 and 1000
        and ${table.maximumArtifactBytes} > 0
        and ${table.amountMinor} > 0
        and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}
        and ${table.matchResult} in ${sql.raw(
          formatFinanceSqlValues(financeSettlementPaymentMatchResultValues)
        )}
        and ${table.ruleAmountRelation} in ${sql.raw(
          formatFinanceSqlValues(financeSettlementPaymentAmountRelationValues)
        )}
        and ${table.clearingVersion} >= 1
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'
        and (
          (${table.matchResult} = 'matched' and ${table.settlementExceptionId} is null)
          or (${table.matchResult} = 'quarantined_no_effect' and ${table.settlementExceptionId} is not null)
        )`
    ),
    index("finance_settlement_payment_match_receipts_intent_history_idx").on(
      table.economicPaymentIntentId,
      table.committedAt,
      table.receiptId
    )
  ]
);

/** Baseline owner executes this DDL after Drizzle creates the normalized settlement tables. */
export const financeSettlementIntegritySql = `
create or replace function finance_protect_settlement_cursor_transition()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'finance settlement cursor cannot be deleted or truncated'
      using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then
    if new.version <> 1 or new.fencing_token <> 0 or new.lease_token_digest is not null then
      raise exception 'finance settlement cursor must start unleased at version one'
        using errcode = '23514';
    end if;
    new.updated_at := clock_timestamp();
    return new;
  end if;
  if new.id <> old.id
     or new.provider_account_series_id <> old.provider_account_series_id
     or new.provider_account_id <> old.provider_account_id
     or new.provider_identity_version <> old.provider_identity_version
     or new.stream <> old.stream
     or new.initial_backfill_start <> old.initial_backfill_start
     or new.overlap_seconds <> old.overlap_seconds then
    raise exception 'finance settlement cursor identity is immutable' using errcode = '55000';
  end if;
  if new.version <> old.version + 1
     or new.fencing_token < old.fencing_token
     or new.fencing_token > old.fencing_token + 1
     or new.window_generation < old.window_generation
     or new.window_generation > old.window_generation + 1 then
    raise exception 'finance settlement cursor transition lost CAS or fencing order'
      using errcode = '40001';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_protect_settlement_cursor_insert_update_delete
before insert or update or delete on finance_settlement_cursors
for each row execute function finance_protect_settlement_cursor_transition();

create trigger finance_settlement_cursors_no_truncate
before truncate on finance_settlement_cursors
for each statement execute function finance_protect_settlement_cursor_transition();

create or replace function finance_validate_settlement_page_artifact()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1
    from finance_artifacts artifact
    where artifact.id = new.raw_artifact_id
      and artifact.artifact_class = 'provider_settlement_page'
      and artifact.binding_kind = 'provider'
      and artifact.series_id = new.provider_account_series_id
      and artifact.provider_account_id = new.provider_account_id
      and artifact.provider_identity_version = new.provider_identity_version
      and artifact.sha256_digest = new.raw_artifact_digest
      and artifact.byte_length = new.raw_artifact_byte_length
  ) then
    raise exception 'settlement page requires the exact sealed provider artifact ref'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger finance_validate_settlement_page_artifact_insert
before insert on finance_settlement_pages
for each row execute function finance_validate_settlement_page_artifact();

create or replace function finance_validate_settlement_checkpoint_identity()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  identity jsonb;
begin
  begin
    identity := new.checkpoint_identity::jsonb;
  exception when others then
    raise exception 'settlement checkpoint identity must be canonical JSON'
      using errcode = '23514';
  end;
  if jsonb_typeof(identity) <> 'array'
     or jsonb_array_length(identity) <> 6
     or identity ->> 0 <> (
       select provider_account_series_id
       from finance_settlement_cursors where id = new.settlement_cursor_id
     )
     or identity ->> 1 <> (
       select provider_account_id
       from finance_settlement_cursors where id = new.settlement_cursor_id
     )
     or (identity ->> 2)::numeric <> (
       select provider_identity_version
       from finance_settlement_cursors where id = new.settlement_cursor_id
     )
     or identity ->> 3 <> (
       select stream from finance_settlement_cursors where id = new.settlement_cursor_id
     )
     or (identity ->> 4)::numeric <> new.window_generation
     or (
       (new.provider_page_cursor is null and identity -> 5 <> 'null'::jsonb)
       or (new.provider_page_cursor is not null and identity ->> 5 <> new.provider_page_cursor)
     ) then
    raise exception 'checkpoint_identity does not bind exact provider page cursor'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_settlement_page_checkpoint_identity
before insert on finance_settlement_pages
for each row execute function finance_validate_settlement_checkpoint_identity();

create trigger finance_validate_settlement_checkpoint_identity
before insert on finance_settlement_page_checkpoints
for each row execute function finance_validate_settlement_checkpoint_identity();

create or replace function finance_issue_settlement_ingestion_receipt()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  new.receipt_id := gen_random_uuid()::text;
  new.receipt_version := 1;
  new.database_committed_at := clock_timestamp();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.canonical_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'kind', 'settlement_batch_ingestion_commit_receipt',
    'receiptId', new.receipt_id,
    'settlementPageId', new.settlement_page_id,
    'settlementCheckpointId', new.settlement_checkpoint_id,
    'settlementCursorId', new.settlement_cursor_id,
    'providerAccountSeriesId', new.provider_account_series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'stream', new.stream,
    'windowGeneration', new.window_generation::text,
    'checkpointIdentity', new.checkpoint_identity,
    'providerPageCursor', new.provider_page_cursor,
    'rawArtifactId', new.raw_artifact_id,
    'rawArtifactDigest', new.raw_artifact_digest,
    'rawArtifactByteLength', new.raw_artifact_byte_length::text,
    'decodedEntriesDigest', new.decoded_entries_digest,
    'insertedEntryCount', new.inserted_entry_count,
    'replayedEntryCount', new.replayed_entry_count,
    'cursorVersion', new.cursor_version::text,
    'fencingToken', new.fencing_token::text,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref
  ));
  new.canonical_digest := 'sha256:' || encode(
    digest(convert_to(new.canonical_preimage, 'UTF8'), 'sha256'), 'hex'
  );
  return new;
end;
$$;

create trigger finance_issue_settlement_ingestion_receipt_insert
before insert on finance_settlement_batch_ingestion_commit_receipts
for each row execute function finance_issue_settlement_ingestion_receipt();

create or replace function finance_issue_merchant_payout_confirmation_receipt()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if exists (
    select 1 from finance_journal_entries entry
    join finance_accounts account on account.id = entry.account_id
    where entry.journal_transaction_id = new.journal_transaction_id
      and account.code = 'bank_cash'
  ) then
    raise exception 'merchant payout confirmation cannot post bank cash'
      using errcode = '23514';
  end if;
  new.receipt_id := gen_random_uuid()::text;
  new.receipt_version := 1;
  new.committed_at := clock_timestamp();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.canonical_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'kind', 'merchant_payout_confirmation_commit_receipt',
    'receiptId', new.receipt_id,
    'batchIngestionReceiptId', new.batch_ingestion_receipt_id,
    'batchIngestionReceiptVersion', new.batch_ingestion_receipt_version,
    'batchIngestionReceiptDigest', new.batch_ingestion_receipt_digest,
    'providerAccountSeriesId', new.provider_account_series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'merchantPayoutId', new.merchant_payout_id,
    'providerBankPayoutId', new.provider_bank_payout_id,
    'bankCashPoolId', new.bank_cash_pool_id,
    'amountMinor', new.amount_minor::text,
    'currency', new.currency,
    'bankReference', new.bank_reference,
    'journalTransactionId', new.journal_transaction_id,
    'providerPositionRevision', new.provider_position_revision::text,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref
  ));
  new.canonical_digest := 'sha256:' || encode(
    digest(convert_to(new.canonical_preimage, 'UTF8'), 'sha256'), 'hex'
  );
  return new;
end;
$$;

create trigger finance_issue_merchant_payout_confirmation_receipt_insert
before insert on finance_merchant_payout_confirmation_commit_receipts
for each row execute function finance_issue_merchant_payout_confirmation_receipt();

create or replace function finance_issue_settlement_payment_match_receipt()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  ingestion finance_settlement_batch_ingestion_commit_receipts%rowtype;
  settlement_entry finance_settlement_ledger_entries%rowtype;
  economic_intent finance_economic_payment_intents%rowtype;
  capture_fact finance_capture_facts%rowtype;
  clearing_head finance_payment_clearing_heads%rowtype;
  rule_preimage text;
  expected_rule_digest text;
  evidence_preimage text;
  rule_matched boolean;
begin
  select * into ingestion
  from finance_settlement_batch_ingestion_commit_receipts
  where receipt_id = new.batch_ingestion_receipt_id
    and receipt_version = new.batch_ingestion_receipt_version
    and canonical_digest = new.batch_ingestion_receipt_digest
  for share;
  if not found
     or ingestion.stream <> 'settlement_ledger'
     or ingestion.settlement_page_id <> new.settlement_page_id
     or ingestion.provider_account_series_id <> new.provider_account_series_id
     or ingestion.provider_account_id <> new.provider_account_id
     or ingestion.provider_identity_version <> new.provider_identity_version then
    raise exception 'settlement payment match requires the exact ledger ingestion receipt'
      using errcode = '23503';
  end if;

  select entry.* into settlement_entry
  from finance_settlement_ledger_entries entry
  join finance_settlement_ledger_page_entries page_entry
    on page_entry.settlement_entry_id = entry.id
   and page_entry.settlement_page_id = new.settlement_page_id
   and page_entry.stream = 'settlement_ledger'
  where entry.id = new.settlement_entry_id
    and entry.provider_account_series_id = new.provider_account_series_id
    and entry.provider_account_id = new.provider_account_id
    and entry.provider_identity_version = new.provider_identity_version
    and entry.provider_entry_id = new.provider_entry_id
  for share of entry, page_entry;
  if not found then
    raise exception 'settlement payment match requires the exact ingested provider entry'
      using errcode = '23503';
  end if;

  select * into economic_intent
  from finance_economic_payment_intents
  where id = new.economic_payment_intent_id
  for share;
  select * into capture_fact
  from finance_capture_facts
  where id = new.capture_fact_id
  for share;
  select * into clearing_head
  from finance_payment_clearing_heads
  where economic_payment_intent_id = new.economic_payment_intent_id
  for share;

  if economic_intent.id is null
     or economic_intent.series_id <> new.provider_account_series_id
     or economic_intent.provider_account_id <> new.provider_account_id
     or economic_intent.provider_identity_version <> new.provider_identity_version
     or economic_intent.state <> 'captured'
     or economic_intent.amount_minor <> new.amount_minor
     or economic_intent.currency <> new.currency then
    raise exception 'settlement payment match requires the exact captured economic payment'
      using errcode = '23514';
  end if;
  if capture_fact.id is null
     or capture_fact.economic_payment_intent_id <> new.economic_payment_intent_id
     or capture_fact.series_id <> new.provider_account_series_id
     or capture_fact.provider_account_id <> new.provider_account_id
     or capture_fact.provider_identity_version <> new.provider_identity_version
     or capture_fact.provider_payment_id <> new.provider_payment_id
     or capture_fact.amount_minor <> new.amount_minor
     or capture_fact.currency <> new.currency then
    raise exception 'settlement payment match requires the exact provider capture'
      using errcode = '23514';
  end if;
  if clearing_head.economic_payment_intent_id is null
     or clearing_head.series_id <> new.provider_account_series_id
     or clearing_head.provider_account_id <> new.provider_account_id
     or clearing_head.provider_identity_version <> new.provider_identity_version
     or clearing_head.currency <> new.currency
     or clearing_head.state <> 'settlement_seen'
     or clearing_head.version <> new.clearing_version then
    raise exception 'settlement payment match lost clearing correlation or expected version'
      using errcode = '40001';
  end if;

  rule_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'kind', 'settlement_payment_correlation_rule',
    'ruleId', new.correlation_rule_id,
    'ruleVersion', new.correlation_rule_version,
    'providerAccount', jsonb_build_object(
      'seriesId', new.provider_account_series_id,
      'providerAccountId', new.provider_account_id,
      'identityVersion', new.provider_identity_version
    ),
    'semantics', jsonb_build_object(
      'referenceType', new.rule_reference_type,
      'direction', new.rule_direction,
      'entryType', new.rule_entry_type,
      'settlementStatus', new.rule_settlement_status,
      'amountRelation', new.rule_amount_relation
    )
  ));
  expected_rule_digest := 'sha256:' || encode(
    digest(convert_to(rule_preimage, 'UTF8'), 'sha256'), 'hex'
  );
  if new.correlation_rule_digest <> expected_rule_digest then
    raise exception 'settlement payment correlation rule digest mismatch'
      using errcode = '23514';
  end if;

  rule_matched := settlement_entry.reference_type = new.rule_reference_type
    and settlement_entry.direction = new.rule_direction
    and settlement_entry.entry_type = new.rule_entry_type
    and settlement_entry.settlement_status is not distinct from new.rule_settlement_status
    and settlement_entry.reference_id = capture_fact.provider_payment_id
    and settlement_entry.currency = capture_fact.currency
    and (
      (new.rule_amount_relation = 'same_minor'
        and settlement_entry.amount_minor = capture_fact.amount_minor)
      or (new.rule_amount_relation = 'negated_minor'
        and settlement_entry.amount_minor = -capture_fact.amount_minor)
    );
  if (rule_matched and new.match_result <> 'matched')
     or (not rule_matched and new.match_result <> 'quarantined_no_effect') then
    raise exception 'settlement payment match result does not follow the pinned rule'
      using errcode = '23514';
  end if;

  if new.match_result = 'matched' then
    if new.settlement_exception_id is not null then
      raise exception 'matched settlement payment cannot own an exception'
        using errcode = '23514';
    end if;
  elsif new.settlement_exception_id is null or not exists (
    select 1
    from finance_settlement_exceptions exception_row
    where exception_row.id = new.settlement_exception_id
      and exception_row.provider_account_series_id = new.provider_account_series_id
      and exception_row.provider_account_id = new.provider_account_id
      and exception_row.provider_identity_version = new.provider_identity_version
      and exception_row.stream = 'settlement_ledger'
      and exception_row.settlement_page_id = new.settlement_page_id
      and exception_row.provider_entry_id = new.provider_entry_id
      and exception_row.merchant_payout_id is null
      and exception_row.exception_code = 'settlement_payment_correlation_mismatch'
      and exception_row.evidence_digest = settlement_entry.raw_payload_digest
      and exception_row.resolved_at is null
  ) then
    raise exception 'quarantined settlement payment requires its exact open exception'
      using errcode = '23514';
  end if;

  evidence_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'kind', 'settlement_payment_match_evidence',
    'batchIngestionReceiptId', new.batch_ingestion_receipt_id,
    'batchIngestionReceiptVersion', new.batch_ingestion_receipt_version,
    'batchIngestionReceiptDigest', new.batch_ingestion_receipt_digest,
    'settlementPageId', new.settlement_page_id,
    'settlementEntryId', new.settlement_entry_id,
    'providerAccountSeriesId', new.provider_account_series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'providerEntryId', new.provider_entry_id,
    'settlementEntryDigest', settlement_entry.raw_payload_digest,
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'captureFactId', new.capture_fact_id,
    'providerPaymentId', new.provider_payment_id,
    'amountMinor', new.amount_minor::text,
    'currency', new.currency,
    'matchResult', new.match_result,
    'correlationRuleId', new.correlation_rule_id,
    'correlationRuleVersion', new.correlation_rule_version,
    'correlationRuleDigest', new.correlation_rule_digest,
    'clearingVersion', new.clearing_version::text
  ));
  new.match_evidence_digest := 'sha256:' || encode(
    digest(convert_to(evidence_preimage, 'UTF8'), 'sha256'), 'hex'
  );
  new.receipt_id := gen_random_uuid()::text;
  new.receipt_version := 1;
  new.committed_at := clock_timestamp();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.canonical_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'kind', 'settlement_payment_match_commit_receipt',
    'receiptId', new.receipt_id,
    'batchIngestionReceiptId', new.batch_ingestion_receipt_id,
    'batchIngestionReceiptVersion', new.batch_ingestion_receipt_version,
    'batchIngestionReceiptDigest', new.batch_ingestion_receipt_digest,
    'settlementPageId', new.settlement_page_id,
    'settlementEntryId', new.settlement_entry_id,
    'providerAccountSeriesId', new.provider_account_series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'providerEntryId', new.provider_entry_id,
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'captureFactId', new.capture_fact_id,
    'providerPaymentId', new.provider_payment_id,
    'amountMinor', new.amount_minor::text,
    'currency', new.currency,
    'matchResult', new.match_result,
    'correlationRuleId', new.correlation_rule_id,
    'correlationRuleVersion', new.correlation_rule_version,
    'correlationRuleDigest', new.correlation_rule_digest,
    'ruleReferenceType', new.rule_reference_type,
    'ruleDirection', new.rule_direction,
    'ruleEntryType', new.rule_entry_type,
    'ruleSettlementStatus', new.rule_settlement_status,
    'ruleAmountRelation', new.rule_amount_relation,
    'clearingVersion', new.clearing_version::text,
    'matchEvidenceDigest', new.match_evidence_digest,
    'settlementExceptionId', new.settlement_exception_id,
    'operationPolicyId', new.operation_policy_id,
    'operationPolicyVersion', new.operation_policy_version,
    'operationPolicyDigest', new.operation_policy_digest,
    'maximumRows', new.maximum_rows,
    'maximumDecimalDigits', new.maximum_decimal_digits,
    'maximumArtifactBytes', new.maximum_artifact_bytes::text,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref
  ));
  new.canonical_digest := 'sha256:' || encode(
    digest(convert_to(new.canonical_preimage, 'UTF8'), 'sha256'), 'hex'
  );
  return new;
end;
$$;

create trigger finance_issue_settlement_payment_match_receipt_insert
before insert on finance_settlement_payment_match_commit_receipts
for each row execute function finance_issue_settlement_payment_match_receipt();

create or replace function finance_reject_settlement_history_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  raise exception 'finance settlement evidence and receipts are immutable' using errcode = '55000';
end;
$$;

create trigger finance_settlement_pages_immutable
before update or delete on finance_settlement_pages
for each row execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_pages_no_truncate
before truncate on finance_settlement_pages
for each statement execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_ledger_entries_immutable
before update or delete on finance_settlement_ledger_entries
for each row execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_ledger_entries_no_truncate
before truncate on finance_settlement_ledger_entries
for each statement execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_payouts_immutable
before update or delete on finance_settlement_payouts
for each row execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_payouts_no_truncate
before truncate on finance_settlement_payouts
for each statement execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_ledger_page_entries_immutable
before update or delete on finance_settlement_ledger_page_entries
for each row execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_ledger_page_entries_no_truncate
before truncate on finance_settlement_ledger_page_entries
for each statement execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_payout_page_entries_immutable
before update or delete on finance_settlement_payout_page_entries
for each row execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_payout_page_entries_no_truncate
before truncate on finance_settlement_payout_page_entries
for each statement execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_page_checkpoints_immutable
before update or delete on finance_settlement_page_checkpoints
for each row execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_page_checkpoints_no_truncate
before truncate on finance_settlement_page_checkpoints
for each statement execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_batch_receipts_immutable
before update or delete on finance_settlement_batch_ingestion_commit_receipts
for each row execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_batch_receipts_no_truncate
before truncate on finance_settlement_batch_ingestion_commit_receipts
for each statement execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_payment_match_receipts_immutable
before update or delete on finance_settlement_payment_match_commit_receipts
for each row execute function finance_reject_settlement_history_mutation();
create trigger finance_settlement_payment_match_receipts_no_truncate
before truncate on finance_settlement_payment_match_commit_receipts
for each statement execute function finance_reject_settlement_history_mutation();
create trigger finance_merchant_payout_confirmation_receipts_immutable
before update or delete on finance_merchant_payout_confirmation_commit_receipts
for each row execute function finance_reject_settlement_history_mutation();
create trigger finance_merchant_payout_confirmation_receipts_no_truncate
before truncate on finance_merchant_payout_confirmation_commit_receipts
for each statement execute function finance_reject_settlement_history_mutation();
`;
