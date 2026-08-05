import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { financeBankCashPools, financeBankStatementRows } from "./bank-cash.schema";
import { financeNumeric38String, financeRevisionString } from "./finance-values";

const digestPattern = "^sha256:[0-9a-f]{64}$";
const digestSqlPattern = sql.raw(`'${digestPattern}'`);
const liquidityMutationKindValues = [
  "snapshot_adopted",
  "payout_exposure_committed",
  "payout_exposure_advanced",
  "bank_statement_matched",
  "safety_buffer_changed"
] as const;
const payoutExposureStateValues = [
  "committed",
  "initiated_unreflected",
  "paid_unreflected",
  "statement_reflected",
  "returned_reflected",
  "released",
  "returned_without_debit"
] as const;
const payoutExposureTransitionValues = [
  "approval_committed",
  "bank_work_initiated",
  "paid_proven",
  "statement_debit_reflected",
  "pre_transfer_released",
  "returned_without_debit",
  "return_credit_reflected"
] as const;

function valuesSql(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

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

export const financeBankLiquiditySnapshots = pgTable(
  "finance_bank_liquidity_snapshots",
  {
    snapshotId: varchar("snapshot_id", { length: 200 }).primaryKey(),
    snapshotVersion: financeRevisionString("snapshot_version").notNull(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    balanceBasis: text("balance_basis").notNull(),
    unrestrictedAvailableMinor: financeNumeric38String("unrestricted_available_minor").notNull(),
    sourceCheckpoint: varchar("source_checkpoint", { length: 320 }).notNull(),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    evidenceDigest: varchar("evidence_digest", { length: 71 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_liquidity_snapshots_pool_fk",
      columns: [table.bankCashPoolId, table.currency],
      foreignColumns: [financeBankCashPools.id, financeBankCashPools.currency]
    }).onDelete("restrict"),
    unique("finance_bank_liquidity_snapshots_checkpoint_unique").on(
      table.bankCashPoolId,
      table.currency,
      table.sourceCheckpoint,
      table.snapshotVersion
    ),
    unique("finance_bank_liquidity_snapshots_identity_unique").on(
      table.snapshotId,
      table.bankCashPoolId,
      table.currency,
      table.snapshotVersion,
      table.evidenceDigest
    ),
    unique("finance_bank_liquidity_snapshots_receipt_binding_unique").on(
      table.snapshotId,
      table.bankCashPoolId,
      table.currency,
      table.snapshotVersion,
      table.evidenceDigest,
      table.sourceCheckpoint
    ),
    unique("finance_bank_liquidity_snapshots_exact_unique").on(
      table.snapshotId,
      table.bankCashPoolId,
      table.currency,
      table.snapshotVersion,
      table.evidenceDigest,
      table.sourceCheckpoint,
      table.expiresAt
    ),
    check(
      "finance_bank_liquidity_snapshots_basis_check",
      sql`${table.balanceBasis} = 'unrestricted_available'`
    ),
    check("finance_bank_liquidity_snapshots_expiry_check", sql`${table.expiresAt} > ${table.asOf}`),
    check(
      "finance_bank_liquidity_snapshots_digest_check",
      sql`${table.snapshotVersion} >= 1 and ${table.evidenceDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_bank_liquidity_snapshots_identifier_check",
      identifierCheck(table.snapshotId, table.bankCashPoolId, table.sourceCheckpoint)
    ),
    index("finance_bank_liquidity_snapshots_expiry_idx").on(
      table.bankCashPoolId,
      table.currency,
      table.expiresAt,
      table.snapshotId
    )
  ]
);

export const financeBankLiquiditySnapshotAdoptionReceipts = pgTable(
  "finance_bank_liquidity_snapshot_adoption_receipts",
  {
    receiptId: varchar("receipt_id", { length: 200 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    receiptVersion: integer("receipt_version").notNull().default(1),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    snapshotId: varchar("snapshot_id", { length: 200 }).notNull(),
    snapshotVersion: financeRevisionString("snapshot_version").notNull(),
    snapshotDigest: varchar("snapshot_digest", { length: 71 }).notNull(),
    sourceCheckpoint: varchar("source_checkpoint", { length: 320 }).notNull(),
    expectedBankLiquidityRevision: financeRevisionString(
      "expected_bank_liquidity_revision"
    ).notNull(),
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
    adoptedAt: timestamp("adopted_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_liquidity_snapshot_adoption_receipts_snapshot_fk",
      columns: [
        table.snapshotId,
        table.bankCashPoolId,
        table.currency,
        table.snapshotVersion,
        table.snapshotDigest,
        table.sourceCheckpoint
      ],
      foreignColumns: [
        financeBankLiquiditySnapshots.snapshotId,
        financeBankLiquiditySnapshots.bankCashPoolId,
        financeBankLiquiditySnapshots.currency,
        financeBankLiquiditySnapshots.snapshotVersion,
        financeBankLiquiditySnapshots.evidenceDigest,
        financeBankLiquiditySnapshots.sourceCheckpoint
      ]
    }).onDelete("restrict"),
    unique("finance_bank_liquidity_snapshot_adoption_receipts_exact_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest
    ),
    unique("finance_bank_liq_snapshot_adoptions_snapshot_unique").on(table.snapshotId),
    unique("finance_bank_liq_snapshot_adoptions_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    check(
      "finance_bank_liq_snapshot_adoptions_revision_check",
      sql`${table.receiptVersion} = 1
        and ${table.expectedBankLiquidityRevision} >= 0
        and ${table.bankLiquidityRevision} = ${table.expectedBankLiquidityRevision} + 1`
    ),
    check(
      "finance_bank_liquidity_snapshot_adoption_receipts_digest_check",
      sql`length(${table.canonicalPreimage}) > 0
        and ${table.canonicalDigest} ~ ${digestSqlPattern}
        and ${table.snapshotDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_bank_liq_snapshot_adoptions_identifier_check",
      identifierCheck(
        table.receiptId,
        table.bankCashPoolId,
        table.snapshotId,
        table.sourceCheckpoint,
        table.persistenceTransactionBoundaryRef
      )
    )
  ]
);

export const financeBankLiquidityHistory = pgTable(
  "finance_bank_liquidity_history",
  {
    historyId: uuid("history_id").primaryKey().defaultRandom(),
    previousHistoryId: uuid("previous_history_id"),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    expectedRevision: financeRevisionString("expected_revision").notNull(),
    revision: financeRevisionString("revision").notNull(),
    mutationKind: text("mutation_kind").notNull(),
    mutationRefId: varchar("mutation_ref_id", { length: 200 }).notNull(),
    snapshotState: text("snapshot_state").notNull(),
    currentSnapshotId: varchar("current_snapshot_id", { length: 200 }),
    currentSnapshotVersion: financeRevisionString("current_snapshot_version"),
    currentSnapshotDigest: varchar("current_snapshot_digest", { length: 71 }),
    unrestrictedAvailableMinor: financeNumeric38String("unrestricted_available_minor"),
    openPayoutExposureMinor: financeNumeric38String("open_payout_exposure_minor").notNull(),
    unresolvedDebitExposureMinor: financeNumeric38String(
      "unresolved_debit_exposure_minor"
    ).notNull(),
    safetyBufferMinor: financeNumeric38String("safety_buffer_minor").notNull(),
    availableLiquidityMinor: financeNumeric38String("available_liquidity_minor"),
    adoptionReceiptId: varchar("adoption_receipt_id", { length: 200 }),
    adoptionReceiptVersion: integer("adoption_receipt_version"),
    adoptionReceiptDigest: varchar("adoption_receipt_digest", { length: 71 }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_liquidity_history_previous_fk",
      columns: [table.previousHistoryId],
      foreignColumns: [table.historyId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_liquidity_history_pool_fk",
      columns: [table.bankCashPoolId, table.currency],
      foreignColumns: [financeBankCashPools.id, financeBankCashPools.currency]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_liquidity_history_snapshot_fk",
      columns: [
        table.currentSnapshotId,
        table.bankCashPoolId,
        table.currency,
        table.currentSnapshotVersion,
        table.currentSnapshotDigest
      ],
      foreignColumns: [
        financeBankLiquiditySnapshots.snapshotId,
        financeBankLiquiditySnapshots.bankCashPoolId,
        financeBankLiquiditySnapshots.currency,
        financeBankLiquiditySnapshots.snapshotVersion,
        financeBankLiquiditySnapshots.evidenceDigest
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_liquidity_history_adoption_receipt_fk",
      columns: [table.adoptionReceiptId, table.adoptionReceiptVersion, table.adoptionReceiptDigest],
      foreignColumns: [
        financeBankLiquiditySnapshotAdoptionReceipts.receiptId,
        financeBankLiquiditySnapshotAdoptionReceipts.receiptVersion,
        financeBankLiquiditySnapshotAdoptionReceipts.canonicalDigest
      ]
    }).onDelete("restrict"),
    unique("finance_bank_liquidity_history_pool_revision_unique").on(
      table.bankCashPoolId,
      table.currency,
      table.revision
    ),
    unique("finance_bank_liquidity_history_mutation_unique").on(
      table.mutationKind,
      table.mutationRefId
    ),
    unique("finance_bank_liquidity_history_receipt_unique").on(table.adoptionReceiptId),
    unique("finance_bank_liquidity_history_exact_head_unique").on(
      table.historyId,
      table.bankCashPoolId,
      table.currency,
      table.revision
    ),
    check(
      "finance_bank_liquidity_history_revision_check",
      sql`${table.expectedRevision} >= 0 and ${table.revision} = ${table.expectedRevision} + 1`
    ),
    check(
      "finance_bank_liquidity_history_mutation_check",
      sql`${table.mutationKind} in ${sql.raw(valuesSql(liquidityMutationKindValues))}`
    ),
    check(
      "finance_bank_liquidity_history_amount_check",
      sql`${table.openPayoutExposureMinor} >= 0
        and ${table.unresolvedDebitExposureMinor} >= 0
        and ${table.safetyBufferMinor} >= 0`
    ),
    check(
      "finance_bank_liquidity_history_receipt_shape_check",
      sql`(
          ${table.mutationKind} = 'snapshot_adopted'
          and ${table.adoptionReceiptId} is not null
          and ${table.adoptionReceiptVersion} = 1
          and ${table.adoptionReceiptDigest} ~ ${digestSqlPattern}
        ) or (
          ${table.mutationKind} <> 'snapshot_adopted'
          and ${table.adoptionReceiptId} is null
          and ${table.adoptionReceiptVersion} is null
          and ${table.adoptionReceiptDigest} is null
        )`
    ),
    check(
      "finance_bank_liquidity_history_identifier_check",
      identifierCheck(table.bankCashPoolId, table.mutationRefId)
    ),
    check(
      "finance_bank_liquidity_history_optional_identifier_check",
      nullableIdentifierCheck(table.currentSnapshotId, table.adoptionReceiptId)
    ),
    check(
      "finance_bank_liquidity_history_snapshot_shape_check",
      sql`(
          ${table.snapshotState} = 'unadopted'
          and ${table.currentSnapshotId} is null
          and ${table.currentSnapshotVersion} is null
          and ${table.currentSnapshotDigest} is null
          and ${table.unrestrictedAvailableMinor} is null
          and ${table.availableLiquidityMinor} is null
          and ${table.mutationKind} <> 'snapshot_adopted'
        ) or (
          ${table.snapshotState} = 'adopted'
          and ${table.currentSnapshotId} is not null
          and ${table.currentSnapshotVersion} >= 1
          and ${table.currentSnapshotDigest} ~ ${digestSqlPattern}
          and ${table.unrestrictedAvailableMinor} is not null
          and ${table.availableLiquidityMinor} is not null
          and ${table.availableLiquidityMinor} = ${table.unrestrictedAvailableMinor}
            - ${table.openPayoutExposureMinor}
            - ${table.unresolvedDebitExposureMinor}
            - ${table.safetyBufferMinor}
        )`
    )
  ]
);

export const financeBankLiquidityHeads = pgTable(
  "finance_bank_liquidity_heads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    snapshotState: text("snapshot_state").notNull(),
    currentSnapshotId: varchar("current_snapshot_id", { length: 200 }),
    currentSnapshotVersion: financeRevisionString("current_snapshot_version"),
    currentSnapshotDigest: varchar("current_snapshot_digest", { length: 71 }),
    revision: financeRevisionString("revision").notNull(),
    lastHistoryId: uuid("last_history_id").notNull(),
    unrestrictedAvailableMinor: financeNumeric38String("unrestricted_available_minor"),
    openPayoutExposureMinor: financeNumeric38String("open_payout_exposure_minor").notNull(),
    unresolvedDebitExposureMinor: financeNumeric38String(
      "unresolved_debit_exposure_minor"
    ).notNull(),
    safetyBufferMinor: financeNumeric38String("safety_buffer_minor").notNull(),
    availableLiquidityMinor: financeNumeric38String("available_liquidity_minor"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_liquidity_heads_pool_fk",
      columns: [table.bankCashPoolId, table.currency],
      foreignColumns: [financeBankCashPools.id, financeBankCashPools.currency]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_liquidity_heads_snapshot_fk",
      columns: [
        table.currentSnapshotId,
        table.bankCashPoolId,
        table.currency,
        table.currentSnapshotVersion,
        table.currentSnapshotDigest
      ],
      foreignColumns: [
        financeBankLiquiditySnapshots.snapshotId,
        financeBankLiquiditySnapshots.bankCashPoolId,
        financeBankLiquiditySnapshots.currency,
        financeBankLiquiditySnapshots.snapshotVersion,
        financeBankLiquiditySnapshots.evidenceDigest
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_liquidity_heads_history_fk",
      columns: [table.lastHistoryId, table.bankCashPoolId, table.currency, table.revision],
      foreignColumns: [
        financeBankLiquidityHistory.historyId,
        financeBankLiquidityHistory.bankCashPoolId,
        financeBankLiquidityHistory.currency,
        financeBankLiquidityHistory.revision
      ]
    }).onDelete("restrict"),
    unique("finance_bank_liquidity_heads_pool_currency_unique").on(
      table.bankCashPoolId,
      table.currency
    ),
    check("finance_bank_liquidity_heads_revision_check", sql`${table.revision} >= 1`),
    check(
      "finance_bank_liquidity_heads_amount_check",
      sql`${table.openPayoutExposureMinor} >= 0
        and ${table.unresolvedDebitExposureMinor} >= 0
        and ${table.safetyBufferMinor} >= 0`
    ),
    check(
      "finance_bank_liquidity_heads_snapshot_shape_check",
      sql`(
          ${table.snapshotState} = 'unadopted'
          and ${table.currentSnapshotId} is null
          and ${table.currentSnapshotVersion} is null
          and ${table.currentSnapshotDigest} is null
          and ${table.unrestrictedAvailableMinor} is null
          and ${table.availableLiquidityMinor} is null
        ) or (
          ${table.snapshotState} = 'adopted'
          and ${table.currentSnapshotId} is not null
          and ${table.currentSnapshotVersion} >= 1
          and ${table.currentSnapshotDigest} ~ ${digestSqlPattern}
          and ${table.unrestrictedAvailableMinor} is not null
          and ${table.availableLiquidityMinor} is not null
          and ${table.availableLiquidityMinor} = ${table.unrestrictedAvailableMinor}
            - ${table.openPayoutExposureMinor}
            - ${table.unresolvedDebitExposureMinor}
            - ${table.safetyBufferMinor}
        )`
    ),
    index("finance_bank_liquidity_heads_available_idx").on(
      table.currency,
      table.availableLiquidityMinor,
      table.bankCashPoolId
    )
  ]
);

export const financeBankExposures = pgTable(
  "finance_bank_exposures",
  {
    exposureId: varchar("exposure_id", { length: 200 }).primaryKey(),
    payoutRequestId: varchar("payout_request_id", { length: 160 }).notNull(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    approvalSnapshotId: varchar("approval_snapshot_id", { length: 200 }).notNull(),
    approvalSnapshotVersion: financeRevisionString("approval_snapshot_version").notNull(),
    approvalSnapshotDigest: varchar("approval_snapshot_digest", { length: 71 }).notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    state: text("state").notNull(),
    version: financeRevisionString("version").notNull(),
    approvedByActorId: varchar("approved_by_actor_id", { length: 160 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_exposures_pool_fk",
      columns: [table.bankCashPoolId, table.currency],
      foreignColumns: [financeBankCashPools.id, financeBankCashPools.currency]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_exposures_snapshot_fk",
      columns: [
        table.approvalSnapshotId,
        table.bankCashPoolId,
        table.currency,
        table.approvalSnapshotVersion,
        table.approvalSnapshotDigest
      ],
      foreignColumns: [
        financeBankLiquiditySnapshots.snapshotId,
        financeBankLiquiditySnapshots.bankCashPoolId,
        financeBankLiquiditySnapshots.currency,
        financeBankLiquiditySnapshots.snapshotVersion,
        financeBankLiquiditySnapshots.evidenceDigest
      ]
    }).onDelete("restrict"),
    unique("finance_bank_exposures_payout_unique").on(table.payoutRequestId),
    unique("finance_bank_exposures_id_pool_currency_unique").on(
      table.exposureId,
      table.bankCashPoolId,
      table.currency
    ),
    unique("finance_bank_exposures_exact_head_unique").on(
      table.exposureId,
      table.payoutRequestId,
      table.bankCashPoolId,
      table.currency,
      table.amountMinor
    ),
    check(
      "finance_bank_exposures_state_check",
      sql`${table.state} in ${sql.raw(valuesSql(payoutExposureStateValues))}`
    ),
    check(
      "finance_bank_exposures_shape_check",
      sql`${table.version} >= 1
        and ${table.amountMinor} > 0
        and ${table.approvalSnapshotVersion} >= 1
        and ${table.approvalSnapshotDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_bank_exposures_identifier_check",
      identifierCheck(
        table.exposureId,
        table.payoutRequestId,
        table.bankCashPoolId,
        table.approvalSnapshotId,
        table.approvedByActorId
      )
    ),
    index("finance_bank_exposures_open_idx").on(
      table.bankCashPoolId,
      table.currency,
      table.state,
      table.createdAt,
      table.exposureId
    )
  ]
);

export const financeBankExposureHistory = pgTable(
  "finance_bank_exposure_history",
  {
    historyId: uuid("history_id").primaryKey().defaultRandom(),
    previousHistoryId: uuid("previous_history_id"),
    exposureId: varchar("exposure_id", { length: 200 }).notNull(),
    payoutRequestId: varchar("payout_request_id", { length: 160 }).notNull(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    version: financeRevisionString("version").notNull(),
    previousState: text("previous_state"),
    state: text("state").notNull(),
    transitionKind: text("transition_kind").notNull(),
    transitionAuthorityKind: varchar("transition_authority_kind", { length: 160 }).notNull(),
    transitionAuthorityId: varchar("transition_authority_id", { length: 200 }).notNull(),
    transitionAuthorityVersion: integer("transition_authority_version").notNull(),
    transitionAuthorityDigest: varchar("transition_authority_digest", { length: 71 }).notNull(),
    bankStatementEntryId: varchar("bank_statement_entry_id", { length: 200 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_exposure_history_previous_fk",
      columns: [table.previousHistoryId],
      foreignColumns: [table.historyId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_exposure_history_exposure_fk",
      columns: [
        table.exposureId,
        table.payoutRequestId,
        table.bankCashPoolId,
        table.currency,
        table.amountMinor
      ],
      foreignColumns: [
        financeBankExposures.exposureId,
        financeBankExposures.payoutRequestId,
        financeBankExposures.bankCashPoolId,
        financeBankExposures.currency,
        financeBankExposures.amountMinor
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_exposure_history_statement_row_fk",
      columns: [table.bankStatementEntryId, table.bankCashPoolId, table.currency],
      foreignColumns: [
        financeBankStatementRows.bankStatementEntryId,
        financeBankStatementRows.bankCashPoolId,
        financeBankStatementRows.currency
      ]
    }).onDelete("restrict"),
    unique("finance_bank_exposure_history_exposure_version_unique").on(
      table.exposureId,
      table.version
    ),
    unique("finance_bank_exposure_history_authority_unique").on(
      table.transitionAuthorityKind,
      table.transitionAuthorityId,
      table.transitionAuthorityVersion,
      table.transitionAuthorityDigest
    ),
    unique("finance_bank_exposure_history_statement_row_unique").on(table.bankStatementEntryId),
    check(
      "finance_bank_exposure_history_state_check",
      sql`${table.state} in ${sql.raw(valuesSql(payoutExposureStateValues))}
        and (${table.previousState} is null or ${table.previousState} in ${sql.raw(
          valuesSql(payoutExposureStateValues)
        )})`
    ),
    check(
      "finance_bank_exposure_history_transition_check",
      sql`(
          ${table.transitionKind} = 'approval_committed'
          and ${table.version} = 1
          and ${table.previousHistoryId} is null
          and ${table.previousState} is null
          and ${table.state} = 'committed'
          and ${table.bankStatementEntryId} is null
        ) or (
          ${table.transitionKind} = 'bank_work_initiated'
          and ${table.previousHistoryId} is not null
          and ${table.previousState} = 'committed'
          and ${table.state} = 'initiated_unreflected'
          and ${table.bankStatementEntryId} is null
        ) or (
          ${table.transitionKind} = 'paid_proven'
          and ${table.previousHistoryId} is not null
          and ${table.previousState} = 'initiated_unreflected'
          and ${table.state} = 'paid_unreflected'
          and ${table.bankStatementEntryId} is null
        ) or (
          ${table.transitionKind} = 'statement_debit_reflected'
          and ${table.previousHistoryId} is not null
          and ${table.previousState} = 'paid_unreflected'
          and ${table.state} = 'statement_reflected'
          and ${table.bankStatementEntryId} is not null
        ) or (
          ${table.transitionKind} = 'pre_transfer_released'
          and ${table.previousHistoryId} is not null
          and ${table.previousState} in ('committed', 'initiated_unreflected')
          and ${table.state} = 'released'
          and ${table.bankStatementEntryId} is null
        ) or (
          ${table.transitionKind} = 'returned_without_debit'
          and ${table.previousHistoryId} is not null
          and ${table.previousState} = 'paid_unreflected'
          and ${table.state} = 'returned_without_debit'
          and ${table.bankStatementEntryId} is null
        ) or (
          ${table.transitionKind} = 'return_credit_reflected'
          and ${table.previousHistoryId} is not null
          and ${table.previousState} = 'statement_reflected'
          and ${table.state} = 'returned_reflected'
          and ${table.bankStatementEntryId} is not null
        )`
    ),
    check(
      "finance_bank_exposure_history_digest_check",
      sql`${table.transitionKind} in ${sql.raw(valuesSql(payoutExposureTransitionValues))}
        and ${table.transitionAuthorityVersion} >= 1
        and ${table.transitionAuthorityDigest} ~ ${digestSqlPattern}
        and ${table.amountMinor} > 0`
    ),
    check(
      "finance_bank_exposure_history_identifier_check",
      identifierCheck(
        table.exposureId,
        table.payoutRequestId,
        table.bankCashPoolId,
        table.transitionAuthorityKind,
        table.transitionAuthorityId
      )
    ),
    check(
      "finance_bank_exposure_history_optional_identifier_check",
      nullableIdentifierCheck(table.bankStatementEntryId)
    ),
    index("finance_bank_exposure_history_pool_time_idx").on(
      table.bankCashPoolId,
      table.currency,
      table.recordedAt,
      table.exposureId
    )
  ]
);

export const financeBankSnapshotExposureCoverage = pgTable(
  "finance_bank_snapshot_exposure_coverage",
  {
    coverageId: uuid("coverage_id").primaryKey().defaultRandom(),
    exposureId: varchar("exposure_id", { length: 200 }).notNull(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    snapshotId: varchar("snapshot_id", { length: 200 }).notNull(),
    snapshotVersion: financeRevisionString("snapshot_version").notNull(),
    snapshotDigest: varchar("snapshot_digest", { length: 71 }).notNull(),
    bankStatementEntryId: varchar("bank_statement_entry_id", { length: 200 }).notNull(),
    coveredAmountMinor: financeNumeric38String("covered_amount_minor").notNull(),
    coverageKind: text("coverage_kind").notNull().default("included_in_snapshot"),
    evidenceDigest: varchar("evidence_digest", { length: 71 }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_bank_snapshot_exposure_coverage_exposure_fk",
      columns: [table.exposureId, table.bankCashPoolId, table.currency],
      foreignColumns: [
        financeBankExposures.exposureId,
        financeBankExposures.bankCashPoolId,
        financeBankExposures.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_snapshot_exposure_coverage_snapshot_fk",
      columns: [
        table.snapshotId,
        table.bankCashPoolId,
        table.currency,
        table.snapshotVersion,
        table.snapshotDigest
      ],
      foreignColumns: [
        financeBankLiquiditySnapshots.snapshotId,
        financeBankLiquiditySnapshots.bankCashPoolId,
        financeBankLiquiditySnapshots.currency,
        financeBankLiquiditySnapshots.snapshotVersion,
        financeBankLiquiditySnapshots.evidenceDigest
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_bank_snapshot_exposure_coverage_statement_row_fk",
      columns: [table.bankStatementEntryId, table.bankCashPoolId, table.currency],
      foreignColumns: [
        financeBankStatementRows.bankStatementEntryId,
        financeBankStatementRows.bankCashPoolId,
        financeBankStatementRows.currency
      ]
    }).onDelete("restrict"),
    unique("finance_bank_snapshot_exposure_coverage_exact_unique").on(
      table.exposureId,
      table.snapshotId,
      table.bankStatementEntryId
    ),
    check(
      "finance_bank_snapshot_exposure_coverage_shape_check",
      sql`${table.snapshotVersion} >= 1
        and ${table.coveredAmountMinor} > 0
        and ${table.coverageKind} = 'included_in_snapshot'
        and ${table.snapshotDigest} ~ ${digestSqlPattern}
        and ${table.evidenceDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_bank_snapshot_exposure_coverage_identifier_check",
      identifierCheck(
        table.exposureId,
        table.bankCashPoolId,
        table.snapshotId,
        table.bankStatementEntryId
      )
    ),
    index("finance_bank_snapshot_exposure_coverage_snapshot_idx").on(
      table.snapshotId,
      table.bankCashPoolId,
      table.exposureId
    )
  ]
);

/** Baseline owner installs this DDL after both bank schema files and pgcrypto exist. */
export const financeBankLiquidityIntegritySql = `
create extension if not exists pgcrypto;

create or replace function finance_reject_bank_liquidity_history_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  raise exception 'bank liquidity evidence and history rows are append-only' using errcode = '55000';
end;
$$;

create or replace function finance_prepare_bank_liquidity_snapshot()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  verified timestamptz;
  pool_activated_at timestamptz;
begin
  select pool.activated_at into strict pool_activated_at
    from finance_bank_cash_pools pool
    where pool.id = new.bank_cash_pool_id
      and pool.currency = new.currency
      and pool.retired_at is null;
  verified := clock_timestamp();
  if new.as_of < pool_activated_at then
    raise exception 'bank liquidity snapshot predates cash pool activation'
      using errcode = '23514';
  end if;
  if new.as_of > verified then
    raise exception 'bank liquidity snapshot as-of cannot be in the future'
      using errcode = '23514';
  end if;
  new.verified_at := verified;
  new.created_at := verified;
  return new;
exception
  when no_data_found then
    raise exception 'bank liquidity snapshot requires an active exact cash pool'
      using errcode = '23503';
end;
$$;

create trigger finance_bank_liquidity_snapshots_prepare
before insert on finance_bank_liquidity_snapshots
for each row execute function finance_prepare_bank_liquidity_snapshot();

create or replace function finance_issue_bank_liquidity_adoption_receipt()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  snapshot finance_bank_liquidity_snapshots%rowtype;
  current_revision numeric(38, 0);
  adopted timestamptz;
begin
  select * into strict snapshot
    from finance_bank_liquidity_snapshots
    where snapshot_id = new.snapshot_id
      and bank_cash_pool_id = new.bank_cash_pool_id
      and currency = new.currency
      and snapshot_version = new.snapshot_version
      and evidence_digest = new.snapshot_digest
      and source_checkpoint = new.source_checkpoint;
  adopted := clock_timestamp();
  if snapshot.balance_basis <> 'unrestricted_available'
     or adopted < snapshot.as_of
     or adopted >= snapshot.expires_at then
    raise exception 'snapshot must still be eligible when adopted' using errcode = '23514';
  end if;
  select head.revision into current_revision
    from finance_bank_liquidity_heads head
    where head.bank_cash_pool_id = new.bank_cash_pool_id
      and head.currency = new.currency
    for update;
  if not found then
    current_revision := 0;
  end if;
  if current_revision <> new.expected_bank_liquidity_revision then
    raise exception 'bank liquidity snapshot adoption expected revision is stale'
      using errcode = '40001';
  end if;
  new.receipt_version := 1;
  new.bank_liquidity_revision := current_revision + 1;
  new.adopted_at := adopted;
  new.canonical_preimage := jsonb_build_object(
    'kind', 'bank_liquidity_snapshot_adoption_receipt',
    'receiptId', new.receipt_id,
    'version', new.receipt_version,
    'bankCashPoolId', new.bank_cash_pool_id,
    'currency', new.currency,
    'snapshotId', new.snapshot_id,
    'snapshotVersion', new.snapshot_version,
    'snapshotDigest', new.snapshot_digest,
    'sourceCheckpoint', new.source_checkpoint,
    'expectedBankLiquidityRevision', new.expected_bank_liquidity_revision,
    'bankLiquidityRevision', new.bank_liquidity_revision,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'databaseAdoptedAt', to_char(new.adopted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
exception
  when no_data_found then
    raise exception 'snapshot adoption receipt requires exact verified snapshot evidence'
      using errcode = '23503';
end;
$$;

create trigger finance_bank_liquidity_snapshot_adoption_receipts_issue
before insert on finance_bank_liquidity_snapshot_adoption_receipts
for each row execute function finance_issue_bank_liquidity_adoption_receipt();

create or replace function finance_validate_bank_liquidity_history_insert()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  previous finance_bank_liquidity_history%rowtype;
  current_head finance_bank_liquidity_heads%rowtype;
  snapshot finance_bank_liquidity_snapshots%rowtype;
  expected_open_payout numeric(38, 0);
  expected_unresolved_debit numeric(38, 0);
  ambiguous_coverage_count bigint;
  now_at timestamptz;
begin
  now_at := clock_timestamp();
  if new.revision <> new.expected_revision + 1 then
    raise exception 'liquidity history revision must advance by one' using errcode = '40001';
  end if;
  if new.expected_revision = 0 then
    if new.mutation_kind not in ('bank_statement_matched', 'snapshot_adopted') then
      raise exception 'initial liquidity head requires a real bank fact or snapshot'
        using errcode = '23514';
    end if;
    if new.previous_history_id is not null or exists (
      select 1 from finance_bank_liquidity_heads head
      where head.bank_cash_pool_id = new.bank_cash_pool_id and head.currency = new.currency
    ) then
      raise exception 'liquidity history cannot restart an existing head' using errcode = '40001';
    end if;
  else
    select * into strict current_head
      from finance_bank_liquidity_heads head
      where head.bank_cash_pool_id = new.bank_cash_pool_id
        and head.currency = new.currency
      for update;
    if current_head.revision <> new.expected_revision
       or current_head.last_history_id <> new.previous_history_id then
      raise exception 'liquidity history expected_revision fence is stale' using errcode = '40001';
    end if;
    select * into strict previous
      from finance_bank_liquidity_history history
      where history.history_id = new.previous_history_id
        and history.bank_cash_pool_id = new.bank_cash_pool_id
        and history.currency = new.currency
        and history.revision = new.expected_revision;
  end if;
  if new.mutation_kind = 'bank_statement_matched' and not exists (
    select 1 from finance_bank_matches matched
    where matched.match_id = new.mutation_ref_id
      and matched.bank_cash_pool_id = new.bank_cash_pool_id
      and matched.currency = new.currency
      and matched.expected_bank_liquidity_revision = new.expected_revision
      and matched.bank_liquidity_revision = new.revision
  ) then
    raise exception 'liquidity history requires the exact bank cash match'
      using errcode = '23503';
  end if;
  if new.snapshot_state = 'adopted' then
    select * into strict snapshot
      from finance_bank_liquidity_snapshots source_snapshot
      where source_snapshot.snapshot_id = new.current_snapshot_id
        and source_snapshot.bank_cash_pool_id = new.bank_cash_pool_id
        and source_snapshot.currency = new.currency
        and source_snapshot.snapshot_version = new.current_snapshot_version
        and source_snapshot.evidence_digest = new.current_snapshot_digest;
    if snapshot.unrestricted_available_minor <> new.unrestricted_available_minor then
      raise exception 'liquidity history must retain the exact verified snapshot amount'
        using errcode = '23514';
    end if;
  end if;
  if new.mutation_kind = 'snapshot_adopted' then
    if new.snapshot_state <> 'adopted'
       or snapshot.balance_basis <> 'unrestricted_available'
       or now_at < snapshot.as_of
       or now_at >= snapshot.expires_at then
      raise exception 'snapshot must still be eligible when adopted' using errcode = '23514';
    end if;
    if not exists (
      select 1 from finance_bank_liquidity_snapshot_adoption_receipts receipt
      where receipt.receipt_id = new.adoption_receipt_id
        and receipt.receipt_version = new.adoption_receipt_version
        and receipt.canonical_digest = new.adoption_receipt_digest
        and receipt.snapshot_id = new.current_snapshot_id
        and receipt.bank_cash_pool_id = new.bank_cash_pool_id
        and receipt.currency = new.currency
        and receipt.expected_bank_liquidity_revision = new.expected_revision
        and receipt.bank_liquidity_revision = new.revision
    ) then
      raise exception 'liquidity history requires the exact snapshot adoption receipt'
        using errcode = '23503';
    end if;
  elsif new.expected_revision = 0 then
    if new.snapshot_state <> 'unadopted' then
      raise exception 'initial liquidity from a bank fact cannot imply a pre-adopted snapshot'
        using errcode = '23514';
    end if;
  elsif new.snapshot_state is distinct from current_head.snapshot_state
     or new.current_snapshot_id is distinct from current_head.current_snapshot_id
     or new.current_snapshot_version is distinct from current_head.current_snapshot_version
     or new.current_snapshot_digest is distinct from current_head.current_snapshot_digest
     or new.unrestricted_available_minor is distinct from current_head.unrestricted_available_minor then
    raise exception 'only snapshot adoption may change liquidity snapshot authority'
      using errcode = '23514';
  end if;
  select count(*) into ambiguous_coverage_count
    from (
      select exposure.exposure_id,
             exposure.amount_minor,
             coalesce(sum(coverage.covered_amount_minor), 0) as covered_minor
        from finance_bank_exposures exposure
        left join finance_bank_snapshot_exposure_coverage coverage
          on coverage.exposure_id = exposure.exposure_id
         and coverage.snapshot_id = new.current_snapshot_id
       where exposure.bank_cash_pool_id = new.bank_cash_pool_id
         and exposure.currency = new.currency
         and exposure.state in (
           'committed', 'initiated_unreflected', 'paid_unreflected', 'statement_reflected'
         )
       group by exposure.exposure_id, exposure.amount_minor
      having coalesce(sum(coverage.covered_amount_minor), 0) > 0
         and coalesce(sum(coverage.covered_amount_minor), 0) < exposure.amount_minor
    ) ambiguous;
  if ambiguous_coverage_count > 0 then
    raise exception 'snapshot coverage is ambiguous' using errcode = '23514';
  end if;
  select coalesce(sum(open_exposure.amount_minor), 0) into expected_open_payout
    from (
      select exposure.exposure_id,
             exposure.amount_minor,
             coalesce(sum(coverage.covered_amount_minor), 0) as covered_minor
        from finance_bank_exposures exposure
        left join finance_bank_snapshot_exposure_coverage coverage
          on coverage.exposure_id = exposure.exposure_id
         and coverage.snapshot_id = new.current_snapshot_id
       where exposure.bank_cash_pool_id = new.bank_cash_pool_id
         and exposure.currency = new.currency
         and exposure.state in (
           'committed', 'initiated_unreflected', 'paid_unreflected', 'statement_reflected'
         )
       group by exposure.exposure_id, exposure.amount_minor
    ) open_exposure
    where open_exposure.covered_minor = 0;
  select coalesce(sum(matched.amount_minor), 0) into expected_unresolved_debit
    from finance_bank_matches matched
    where matched.bank_cash_pool_id = new.bank_cash_pool_id
      and matched.currency = new.currency
      and matched.match_result = 'unmatched_debit'
      and not exists (
        select 1 from finance_bank_exceptions exception_event
        where exception_event.bank_match_id = matched.match_id
          and exception_event.state = 'resolved'
      );
  if new.open_payout_exposure_minor <> expected_open_payout
     or new.unresolved_debit_exposure_minor <> expected_unresolved_debit then
    raise exception 'liquidity history does not match open exposure coverage'
      using errcode = '23514';
  end if;
  new.recorded_at := now_at;
  return new;
exception
  when no_data_found then
    raise exception 'liquidity history requires the exact prior head and adopted snapshot'
      using errcode = '23503';
end;
$$;

create trigger finance_bank_liquidity_history_validate
before insert on finance_bank_liquidity_history
for each row execute function finance_validate_bank_liquidity_history_insert();

create or replace function finance_protect_bank_liquidity_head()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'bank liquidity heads cannot be deleted' using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then
    if new.revision <> 1 then
      raise exception 'bank liquidity head must start at revision one' using errcode = '40001';
    end if;
    new.updated_at := clock_timestamp();
    return new;
  end if;
  if new.id <> old.id
     or new.bank_cash_pool_id <> old.bank_cash_pool_id
     or new.currency <> old.currency then
    raise exception 'bank liquidity head identity is immutable' using errcode = '55000';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'liquidity head revision must advance by one' using errcode = '40001';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_bank_liquidity_heads_protected
before insert or update or delete on finance_bank_liquidity_heads
for each row execute function finance_protect_bank_liquidity_head();

create or replace function finance_require_bank_liquidity_history_head()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_bank_liquidity_heads head
    where head.bank_cash_pool_id = new.bank_cash_pool_id
      and head.currency = new.currency
      and head.revision >= new.revision
  ) then
    raise exception 'liquidity history requires its committed head revision'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_bank_liquidity_history_requires_head
after insert on finance_bank_liquidity_history
deferrable initially deferred for each row
execute function finance_require_bank_liquidity_history_head();

create or replace function finance_assert_bank_liquidity_head_history()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_bank_liquidity_history history
    where history.history_id = new.last_history_id
      and history.bank_cash_pool_id = new.bank_cash_pool_id
      and history.currency = new.currency
      and history.revision = new.revision
      and history.snapshot_state = new.snapshot_state
      and history.current_snapshot_id is not distinct from new.current_snapshot_id
      and history.current_snapshot_version is not distinct from new.current_snapshot_version
      and history.current_snapshot_digest is not distinct from new.current_snapshot_digest
      and history.unrestricted_available_minor is not distinct from new.unrestricted_available_minor
      and history.open_payout_exposure_minor = new.open_payout_exposure_minor
      and history.unresolved_debit_exposure_minor = new.unresolved_debit_exposure_minor
      and history.safety_buffer_minor = new.safety_buffer_minor
      and history.available_liquidity_minor is not distinct from new.available_liquidity_minor
  ) then
    raise exception 'liquidity head must exactly match its committed history revision'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_bank_liquidity_heads_history_integrity
after insert or update on finance_bank_liquidity_heads
deferrable initially deferred for each row
execute function finance_assert_bank_liquidity_head_history();

create or replace function finance_require_bank_liquidity_adoption_commit()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1
      from finance_bank_liquidity_history history
      join finance_bank_liquidity_heads head
        on head.bank_cash_pool_id = history.bank_cash_pool_id
       and head.currency = history.currency
       and head.revision >= history.revision
     where history.mutation_kind = 'snapshot_adopted'
       and history.adoption_receipt_id = new.receipt_id
       and history.adoption_receipt_version = new.receipt_version
       and history.adoption_receipt_digest = new.canonical_digest
       and history.bank_cash_pool_id = new.bank_cash_pool_id
       and history.currency = new.currency
       and history.revision = new.bank_liquidity_revision
       and history.current_snapshot_id = new.snapshot_id
       and history.current_snapshot_version = new.snapshot_version
       and history.current_snapshot_digest = new.snapshot_digest
  ) then
    raise exception 'snapshot adoption receipt requires its committed liquidity revision'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_bank_liquidity_adoptions_require_commit
after insert on finance_bank_liquidity_snapshot_adoption_receipts
deferrable initially deferred for each row
execute function finance_require_bank_liquidity_adoption_commit();

create or replace function finance_protect_bank_exposure_head()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  liquidity_head finance_bank_liquidity_heads%rowtype;
  authorized_at timestamptz;
  existing_open_payout numeric(38, 0);
begin
  if tg_op = 'DELETE' then
    raise exception 'bank exposure heads cannot be deleted' using errcode = '55000';
  end if;
  if tg_op = 'INSERT' then
    if new.version <> 1 or new.state <> 'committed' then
      raise exception 'bank exposure must start committed at version one' using errcode = '23514';
    end if;
    authorized_at := clock_timestamp();
    select * into liquidity_head
      from finance_bank_liquidity_heads head
      where head.bank_cash_pool_id = new.bank_cash_pool_id
        and head.currency = new.currency
      for update;
    select coalesce(sum(open_exposure.amount_minor), 0) into existing_open_payout
      from (
        select exposure.exposure_id,
               exposure.amount_minor,
               coalesce(sum(coverage.covered_amount_minor), 0) as covered_minor
          from finance_bank_exposures exposure
          left join finance_bank_snapshot_exposure_coverage coverage
            on coverage.exposure_id = exposure.exposure_id
           and coverage.snapshot_id = liquidity_head.current_snapshot_id
         where exposure.bank_cash_pool_id = new.bank_cash_pool_id
           and exposure.currency = new.currency
           and exposure.state in (
             'committed', 'initiated_unreflected', 'paid_unreflected', 'statement_reflected'
           )
         group by exposure.exposure_id, exposure.amount_minor
      ) open_exposure
      where open_exposure.covered_minor < open_exposure.amount_minor;
    if liquidity_head.id is null
       or liquidity_head.snapshot_state <> 'adopted'
       or liquidity_head.current_snapshot_id is distinct from new.approval_snapshot_id
       or liquidity_head.current_snapshot_version is distinct from new.approval_snapshot_version
       or liquidity_head.current_snapshot_digest is distinct from new.approval_snapshot_digest
       or liquidity_head.available_liquidity_minor is null
       or liquidity_head.available_liquidity_minor < new.amount_minor
       or liquidity_head.unrestricted_available_minor
          - existing_open_payout
          - liquidity_head.unresolved_debit_exposure_minor
          - liquidity_head.safety_buffer_minor < new.amount_minor
       or not exists (
         select 1 from finance_bank_liquidity_snapshots snapshot
         where snapshot.snapshot_id = new.approval_snapshot_id
           and snapshot.bank_cash_pool_id = new.bank_cash_pool_id
           and snapshot.currency = new.currency
           and snapshot.snapshot_version = new.approval_snapshot_version
           and snapshot.evidence_digest = new.approval_snapshot_digest
           and snapshot.balance_basis = 'unrestricted_available'
           and authorized_at >= snapshot.as_of
           and authorized_at < snapshot.expires_at
       ) then
      raise exception 'payout exposure cannot be authorized without an adopted eligible snapshot and sufficient liquidity after all open payout exposures'
        using errcode = '23514';
    end if;
    new.created_at := authorized_at;
    new.updated_at := new.created_at;
    return new;
  end if;
  if new.exposure_id <> old.exposure_id
     or new.payout_request_id <> old.payout_request_id
     or new.bank_cash_pool_id <> old.bank_cash_pool_id
     or new.currency <> old.currency
     or new.approval_snapshot_id <> old.approval_snapshot_id
     or new.approval_snapshot_version <> old.approval_snapshot_version
     or new.approval_snapshot_digest <> old.approval_snapshot_digest
     or new.amount_minor <> old.amount_minor
     or new.approved_by_actor_id <> old.approved_by_actor_id
     or new.created_at <> old.created_at then
    raise exception 'bank exposure identity and amount are immutable' using errcode = '55000';
  end if;
  if new.version <> old.version + 1
     or not (
       (old.state = 'committed' and new.state in ('initiated_unreflected', 'released'))
       or (old.state = 'initiated_unreflected' and new.state in ('paid_unreflected', 'released'))
       or (old.state = 'paid_unreflected' and new.state in ('statement_reflected', 'returned_without_debit'))
       or (old.state = 'statement_reflected' and new.state = 'returned_reflected')
     ) then
    raise exception 'bank exposure transition is invalid' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_bank_exposures_protected
before insert or update or delete on finance_bank_exposures
for each row execute function finance_protect_bank_exposure_head();

create or replace function finance_validate_bank_exposure_history_insert()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  prior finance_bank_exposure_history%rowtype;
  statement_row finance_bank_statement_rows%rowtype;
begin
  if new.version = 1 then
    if new.previous_history_id is not null
       or new.previous_state is not null
       or new.transition_kind <> 'approval_committed'
       or new.state <> 'committed' then
      raise exception 'bank exposure initial history is invalid' using errcode = '23514';
    end if;
  else
    select * into strict prior
      from finance_bank_exposure_history history
      where history.history_id = new.previous_history_id
        and history.exposure_id = new.exposure_id
        and history.version = new.version - 1;
    if prior.payout_request_id <> new.payout_request_id
       or prior.bank_cash_pool_id <> new.bank_cash_pool_id
       or prior.currency <> new.currency
       or prior.amount_minor <> new.amount_minor
       or prior.state <> new.previous_state
       or new.occurred_at < prior.occurred_at then
      raise exception 'bank exposure history chain is invalid' using errcode = '23514';
    end if;
  end if;
  if new.bank_statement_entry_id is not null then
    select * into strict statement_row
      from finance_bank_statement_rows
      where bank_statement_entry_id = new.bank_statement_entry_id
        and bank_cash_pool_id = new.bank_cash_pool_id
        and currency = new.currency;
    if (new.transition_kind = 'statement_debit_reflected' and statement_row.direction <> 'debit')
       or (new.transition_kind = 'return_credit_reflected' and statement_row.direction <> 'credit') then
      raise exception 'bank exposure statement direction is invalid' using errcode = '23514';
    end if;
    if abs(statement_row.signed_amount_minor) <> new.amount_minor then
      raise exception 'bank exposure statement amount is invalid' using errcode = '23514';
    end if;
    if new.transition_kind = 'statement_debit_reflected' and not exists (
      select 1 from finance_bank_matches matched
      where matched.bank_statement_entry_id = new.bank_statement_entry_id
        and matched.bank_cash_pool_id = new.bank_cash_pool_id
        and matched.currency = new.currency
        and matched.match_result = 'manual_payout'
        and matched.amount_minor = new.amount_minor
    ) then
      raise exception 'bank exposure debit requires the exact manual-payout bank match'
        using errcode = '23503';
    end if;
  end if;
  new.recorded_at := clock_timestamp();
  return new;
exception
  when no_data_found then
    raise exception 'bank exposure history requires its exact prior fact and statement evidence'
      using errcode = '23503';
end;
$$;

create trigger finance_bank_exposure_history_validate
before insert on finance_bank_exposure_history
for each row execute function finance_validate_bank_exposure_history_insert();

create or replace function finance_assert_bank_exposure_head_history()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_bank_exposure_history history
    where history.exposure_id = new.exposure_id
      and history.payout_request_id = new.payout_request_id
      and history.bank_cash_pool_id = new.bank_cash_pool_id
      and history.currency = new.currency
      and history.amount_minor = new.amount_minor
      and history.version = new.version
      and history.state = new.state
  ) then
    raise exception 'bank exposure head must exactly match immutable transition history'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_bank_exposures_history_integrity
after insert or update on finance_bank_exposures
deferrable initially deferred for each row
execute function finance_assert_bank_exposure_head_history();

create or replace function finance_assert_bank_exposure_liquidity_head()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  liquidity_head finance_bank_liquidity_heads%rowtype;
  expected_open_payout numeric(38, 0);
begin
  select * into strict liquidity_head
    from finance_bank_liquidity_heads head
    where head.bank_cash_pool_id = new.bank_cash_pool_id
      and head.currency = new.currency;
  select coalesce(sum(open_exposure.amount_minor), 0) into expected_open_payout
    from (
      select exposure.exposure_id,
             exposure.amount_minor,
             coalesce(sum(coverage.covered_amount_minor), 0) as covered_minor
        from finance_bank_exposures exposure
        left join finance_bank_snapshot_exposure_coverage coverage
          on coverage.exposure_id = exposure.exposure_id
         and coverage.snapshot_id = liquidity_head.current_snapshot_id
       where exposure.bank_cash_pool_id = new.bank_cash_pool_id
         and exposure.currency = new.currency
         and exposure.state in (
           'committed', 'initiated_unreflected', 'paid_unreflected', 'statement_reflected'
         )
       group by exposure.exposure_id, exposure.amount_minor
    ) open_exposure
    where open_exposure.covered_minor < open_exposure.amount_minor;
  if liquidity_head.open_payout_exposure_minor <> expected_open_payout then
    raise exception 'liquidity head must cover every open bank exposure'
      using errcode = '23514';
  end if;
  return null;
exception
  when no_data_found then
    raise exception 'bank exposure requires its exact liquidity head' using errcode = '23503';
end;
$$;

create constraint trigger finance_bank_exposures_require_liquidity_head
after insert or update on finance_bank_exposures
deferrable initially deferred for each row
execute function finance_assert_bank_exposure_liquidity_head();

create or replace function finance_validate_snapshot_exposure_coverage_insert()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  exposure finance_bank_exposures%rowtype;
  snapshot finance_bank_liquidity_snapshots%rowtype;
  statement_row finance_bank_statement_rows%rowtype;
  already_covered numeric(38, 0);
  statement_already_covered numeric(38, 0);
begin
  select * into strict exposure
    from finance_bank_exposures
    where exposure_id = new.exposure_id
      and bank_cash_pool_id = new.bank_cash_pool_id
      and currency = new.currency;
  select * into strict snapshot
    from finance_bank_liquidity_snapshots
    where snapshot_id = new.snapshot_id
      and bank_cash_pool_id = new.bank_cash_pool_id
      and currency = new.currency
      and snapshot_version = new.snapshot_version
      and evidence_digest = new.snapshot_digest;
  select * into strict statement_row
    from finance_bank_statement_rows
    where bank_statement_entry_id = new.bank_statement_entry_id
      and bank_cash_pool_id = new.bank_cash_pool_id
      and currency = new.currency;
  if statement_row.direction <> 'debit'
     or statement_row.occurred_at > snapshot.as_of then
    raise exception 'snapshot exposure coverage requires an included debit statement fact'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from finance_bank_exposure_history history
    where history.exposure_id = new.exposure_id
      and history.bank_cash_pool_id = new.bank_cash_pool_id
      and history.currency = new.currency
      and history.transition_kind = 'statement_debit_reflected'
      and history.bank_statement_entry_id = new.bank_statement_entry_id
  ) then
    raise exception 'snapshot exposure coverage requires the exact payout debit transition'
      using errcode = '23503';
  end if;
  select coalesce(sum(covered_amount_minor), 0) into already_covered
    from finance_bank_snapshot_exposure_coverage coverage
    where coverage.exposure_id = new.exposure_id
      and coverage.snapshot_id = new.snapshot_id;
  if already_covered + new.covered_amount_minor > exposure.amount_minor then
    raise exception 'snapshot exposure coverage exceeds the payout exposure'
      using errcode = '23514';
  end if;
  select coalesce(sum(covered_amount_minor), 0) into statement_already_covered
    from finance_bank_snapshot_exposure_coverage coverage
    where coverage.snapshot_id = new.snapshot_id
      and coverage.bank_statement_entry_id = new.bank_statement_entry_id;
  if statement_already_covered + new.covered_amount_minor > abs(statement_row.signed_amount_minor) then
    raise exception 'snapshot exposure coverage exceeds the exact statement amount'
      using errcode = '23514';
  end if;
  if new.covered_amount_minor < exposure.amount_minor and exists (
    select 1 from finance_bank_liquidity_heads head
    where head.bank_cash_pool_id = new.bank_cash_pool_id
      and head.currency = new.currency
      and head.snapshot_state = 'adopted'
      and head.current_snapshot_id = new.snapshot_id
      and head.current_snapshot_version = new.snapshot_version
      and head.current_snapshot_digest = new.snapshot_digest
  ) then
    raise exception 'partial coverage cannot be attached to the adopted liquidity snapshot'
      using errcode = '23514';
  end if;
  new.recorded_at := clock_timestamp();
  return new;
exception
  when no_data_found then
    raise exception 'snapshot exposure coverage requires exact exposure, snapshot and statement facts'
      using errcode = '23503';
end;
$$;

create trigger finance_bank_snapshot_exposure_coverage_validate
before insert on finance_bank_snapshot_exposure_coverage
for each row execute function finance_validate_snapshot_exposure_coverage_insert();

create constraint trigger finance_bank_coverage_requires_liquidity_head
after insert on finance_bank_snapshot_exposure_coverage
deferrable initially deferred for each row
execute function finance_assert_bank_exposure_liquidity_head();

create trigger finance_bank_liquidity_heads_no_truncate
before truncate on finance_bank_liquidity_heads
for each statement execute function finance_reject_bank_liquidity_history_mutation();
create trigger finance_bank_liquidity_snapshots_immutable
before update or delete on finance_bank_liquidity_snapshots
for each row execute function finance_reject_bank_liquidity_history_mutation();
create trigger finance_bank_liquidity_snapshots_no_truncate
before truncate on finance_bank_liquidity_snapshots
for each statement execute function finance_reject_bank_liquidity_history_mutation();
create trigger finance_bank_liquidity_snapshot_adoption_receipts_immutable
before update or delete on finance_bank_liquidity_snapshot_adoption_receipts
for each row execute function finance_reject_bank_liquidity_history_mutation();
create trigger finance_bank_liquidity_snapshot_adoption_receipts_no_truncate
before truncate on finance_bank_liquidity_snapshot_adoption_receipts
for each statement execute function finance_reject_bank_liquidity_history_mutation();
create trigger finance_bank_liquidity_history_immutable
before update or delete on finance_bank_liquidity_history
for each row execute function finance_reject_bank_liquidity_history_mutation();
create trigger finance_bank_liquidity_history_no_truncate
before truncate on finance_bank_liquidity_history
for each statement execute function finance_reject_bank_liquidity_history_mutation();
create trigger finance_bank_exposures_no_truncate
before truncate on finance_bank_exposures
for each statement execute function finance_reject_bank_liquidity_history_mutation();
create trigger finance_bank_exposure_history_immutable
before update or delete on finance_bank_exposure_history
for each row execute function finance_reject_bank_liquidity_history_mutation();
create trigger finance_bank_exposure_history_no_truncate
before truncate on finance_bank_exposure_history
for each statement execute function finance_reject_bank_liquidity_history_mutation();
create trigger finance_bank_snapshot_exposure_coverage_immutable
before update or delete on finance_bank_snapshot_exposure_coverage
for each row execute function finance_reject_bank_liquidity_history_mutation();
create trigger finance_bank_snapshot_exposure_coverage_no_truncate
before truncate on finance_bank_snapshot_exposure_coverage
for each statement execute function finance_reject_bank_liquidity_history_mutation();
`;
