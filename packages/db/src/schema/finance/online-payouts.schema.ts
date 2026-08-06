import { type SQLWrapper, sql } from "drizzle-orm";
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
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import {
  financeBankExposures,
  financeBankLiquiditySnapshotAdoptionReceipts
} from "./bank-liquidity.schema";
import { financeArtifacts } from "./finance-artifacts.schema";
import { financeJournalTransactions } from "./ledger.schema";
import { financeOnlineWalletHeads } from "./online-sale-capture.schema";
import {
  financeCurrencyValues,
  financeNumeric38String,
  financeRevisionString,
  formatFinanceSqlValues,
  payoutRequestStatusValues
} from "./finance-values";
import {
  financeOnlinePayableSourceAllocations,
  financeOnlineWalletMutations
} from "./online-wallet-mutations.schema";
import { payoutMethodVersions, payoutMethods } from "./payouts.schema";

const identifierCheck = (value: SQLWrapper) =>
  sql`length(${value}) between 1 and 160 and btrim(${value}) = ${value} and ${value} !~ '[[:cntrl:]]'`;

/**
 * The v2 manual-payout aggregate. It is deliberately distinct from the legacy `payout_requests`
 * projection, so a new client sale can never create a second mutable money authority.
 */
export const financeOnlinePayoutRequests = pgTable(
  "finance_online_payout_requests",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    /** UUID aggregate identity used exclusively by the sensitive-action authorization boundary. */
    authorizationAggregateId: uuid("authorization_aggregate_id").notNull(),
    walletId: uuid("wallet_id").notNull(),
    /** Exact v2 wallet commitment which reserved this payout. */
    walletMutationId: uuid("wallet_mutation_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    currency: text("currency").notNull(),
    immutableAmountMinor: financeNumeric38String("immutable_amount_minor").notNull(),
    status: text("status").notNull().default("requested"),
    version: financeRevisionString("version").notNull().default("1"),
    payoutMethodId: uuid("payout_method_id").notNull(),
    payoutMethodVersion: integer("payout_method_version").notNull(),
    destinationKind: text("destination_kind").notNull(),
    beneficiaryFingerprint: varchar("beneficiary_fingerprint", { length: 71 }).notNull(),
    redactedDisplay: text("redacted_display").notNull(),
    sealedDestinationRef: text("sealed_destination_ref").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_online_payout_requests_wallet_scope_fk",
      columns: [table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financeOnlineWalletHeads.id,
        financeOnlineWalletHeads.astrologerUserId,
        financeOnlineWalletHeads.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_payout_requests_wallet_mutation_fk",
      columns: [table.walletMutationId],
      foreignColumns: [financeOnlineWalletMutations.mutationId]
    }).onDelete("restrict"),
    unique("finance_online_payout_requests_wallet_mutation_unique").on(table.walletMutationId),
    unique("finance_online_payout_requests_authorization_aggregate_unique").on(
      table.authorizationAggregateId
    ),
    foreignKey({
      name: "finance_online_payout_requests_method_owner_fk",
      columns: [table.payoutMethodId],
      foreignColumns: [payoutMethods.id]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_payout_requests_method_version_fk",
      columns: [table.payoutMethodId, table.payoutMethodVersion],
      foreignColumns: [payoutMethodVersions.payoutMethodId, payoutMethodVersions.version]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_payout_requests_astrologer_fk",
      columns: [table.astrologerUserId],
      foreignColumns: [users.id]
    }).onDelete("restrict"),
    check(
      "finance_online_payout_requests_currency_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}`
    ),
    check(
      "finance_online_payout_requests_status_check",
      sql`${table.status} in ${sql.raw(formatFinanceSqlValues(payoutRequestStatusValues))}`
    ),
    check(
      "finance_online_payout_requests_shape_check",
      sql`${table.immutableAmountMinor} > 0 and ${table.version} >= 1
        and ${table.payoutMethodVersion} >= 1
        and ${table.destinationKind} in ('bank_card', 'bank_account')
        and ${table.beneficiaryFingerprint} ~ '^sha256:[a-f0-9]{64}$'
        and length(btrim(${table.redactedDisplay})) between 8 and 180
        and length(btrim(${table.sealedDestinationRef})) between 12 and 4096`
    ),
    check("finance_online_payout_requests_identifier_check", identifierCheck(table.id)),
    index("finance_online_payout_requests_astrologer_queue_idx").on(
      table.astrologerUserId,
      table.status,
      table.requestedAt,
      table.id
    ),
    index("finance_online_payout_requests_wallet_idx").on(table.walletId, table.requestedAt, table.id)
  ]
);

/** Each v2 available position consumed by a payout request points to its exact new pending child. */
export const financeOnlinePayoutRequestAllocations = pgTable(
  "finance_online_payout_request_allocations",
  {
    payoutRequestId: varchar("payout_request_id", { length: 160 }).notNull(),
    sourceAllocationId: varchar("source_allocation_id", { length: 200 }).notNull(),
    payoutPendingAllocationId: varchar("payout_pending_allocation_id", { length: 200 }).notNull(),
    rootLotId: varchar("root_lot_id", { length: 200 }).notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    ordinal: integer("ordinal").notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.payoutRequestId, table.sourceAllocationId],
      name: "finance_online_payout_request_allocations_pk"
    }),
    foreignKey({
      name: "finance_online_payout_request_allocations_request_fk",
      columns: [table.payoutRequestId],
      foreignColumns: [financeOnlinePayoutRequests.id]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_payout_request_allocations_source_fk",
      columns: [table.sourceAllocationId],
      foreignColumns: [financeOnlinePayableSourceAllocations.allocationId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_payout_request_allocations_pending_fk",
      columns: [table.payoutPendingAllocationId],
      foreignColumns: [financeOnlinePayableSourceAllocations.allocationId]
    }).onDelete("restrict"),
    unique("finance_online_payout_request_allocations_pending_unique").on(
      table.payoutPendingAllocationId
    ),
    check(
      "finance_online_payout_request_allocations_shape_check",
      sql`${table.amountMinor} > 0 and ${table.ordinal} >= 0
        and length(${table.rootLotId}) between 1 and 200
        and btrim(${table.rootLotId}) = ${table.rootLotId}`
    )
  ]
);

/**
 * Immutable, optimistic-versioned payout state history. Review, approval, execution and paid
 * evidence will be bound to these rows rather than overwriting a generic status audit field.
 */
export const financeOnlinePayoutStateTransitions = pgTable(
  "finance_online_payout_state_transitions",
  {
    transitionId: uuid("transition_id").primaryKey().defaultRandom(),
    payoutRequestId: varchar("payout_request_id", { length: 160 }).notNull(),
    payoutVersion: financeRevisionString("payout_version").notNull(),
    previousStatus: text("previous_status"),
    status: text("status").notNull(),
    transitionKind: text("transition_kind").notNull(),
    /** A provider-authoritative automatic cancellation has no human actor. */
    actorKind: text("actor_kind").notNull().default("user"),
    actorUserId: uuid("actor_user_id"),
    authorityId: varchar("authority_id", { length: 200 }).notNull(),
    authorityVersion: financeRevisionString("authority_version").notNull(),
    authorityDigest: varchar("authority_digest", { length: 71 }).notNull(),
    /** Immutable operator rationale; paid bank evidence is modelled separately. */
    adminNote: text("admin_note"),
    /** Required for terminal no-transfer outcomes which restore payout-pending funds. */
    failureReason: text("failure_reason"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_online_payout_state_transitions_request_fk",
      columns: [table.payoutRequestId],
      foreignColumns: [financeOnlinePayoutRequests.id]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_payout_state_transitions_actor_fk",
      columns: [table.actorUserId],
      foreignColumns: [users.id]
    }).onDelete("restrict"),
    unique("finance_online_payout_state_transitions_request_version_unique").on(
      table.payoutRequestId,
      table.payoutVersion
    ),
    unique("finance_online_payout_state_transitions_authority_unique").on(
      table.authorityId,
      table.authorityVersion,
      table.authorityDigest
    ),
    check(
      "finance_online_payout_state_transitions_status_check",
      sql`${table.status} in ${sql.raw(formatFinanceSqlValues(payoutRequestStatusValues))}
        and (${table.previousStatus} is null or ${table.previousStatus} in ${sql.raw(
          formatFinanceSqlValues(payoutRequestStatusValues)
        )})`
    ),
    check(
      "finance_online_payout_state_transitions_shape_check",
      sql`${table.payoutVersion} >= 1 and ${table.authorityVersion} >= 1
        and ${table.actorKind} in ('user', 'system')
        and ((${table.actorKind} = 'user' and ${table.actorUserId} is not null)
          or (${table.actorKind} = 'system' and ${table.actorUserId} is null))
        and ${table.authorityDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.transitionKind}) between 1 and 120
        and btrim(${table.transitionKind}) = ${table.transitionKind}
        and (${table.adminNote} is null or (length(btrim(${table.adminNote})) between 1 and 2000))
        and (${table.failureReason} is null or (length(btrim(${table.failureReason})) between 1 and 2000))
        and ((${table.status} in ('failed', 'rejected') and ${table.failureReason} is not null)
          or (${table.status} not in ('failed', 'rejected') and ${table.failureReason} is null))`
    )
  ]
);

/**
 * The durable V2 approval receipt. It binds the approved payout head to the exact exposure and
 * adopted liquidity snapshot, so a later bank initiation or paid confirmation can never rely on
 * a mutable operator status alone.
 */
export const financeOnlinePayoutApprovalReceipts = pgTable(
  "finance_online_payout_approval_receipts",
  {
    receiptId: uuid("receipt_id").primaryKey(),
    receiptVersion: integer("receipt_version").notNull().default(1),
    payoutRequestId: varchar("payout_request_id", { length: 160 }).notNull(),
    payoutVersion: financeRevisionString("payout_version").notNull(),
    approvalTransitionId: uuid("approval_transition_id").notNull(),
    bankExposureId: varchar("bank_exposure_id", { length: 200 }).notNull(),
    bankExposureVersion: financeRevisionString("bank_exposure_version").notNull(),
    bankLiquidityRevision: financeRevisionString("bank_liquidity_revision").notNull(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    snapshotAdoptionReceiptId: varchar("snapshot_adoption_receipt_id", { length: 200 }).notNull(),
    snapshotAdoptionReceiptVersion: integer("snapshot_adoption_receipt_version").notNull(),
    snapshotAdoptionReceiptDigest: varchar("snapshot_adoption_receipt_digest", { length: 71 }).notNull(),
    approverActorUserId: uuid("approver_actor_user_id").notNull(),
    authorizationId: varchar("authorization_id", { length: 200 }).notNull(),
    authorizationVersion: financeRevisionString("authorization_version").notNull(),
    authorizationDigest: varchar("authorization_digest", { length: 71 }).notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    }).notNull(),
    canonicalPreimage: text("canonical_preimage").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_online_payout_approval_receipts_request_fk",
      columns: [table.payoutRequestId],
      foreignColumns: [financeOnlinePayoutRequests.id]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_payout_approval_receipts_transition_fk",
      columns: [table.approvalTransitionId],
      foreignColumns: [financeOnlinePayoutStateTransitions.transitionId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_payout_approval_receipts_exposure_fk",
      columns: [table.bankExposureId, table.bankCashPoolId, table.currency],
      foreignColumns: [
        financeBankExposures.exposureId,
        financeBankExposures.bankCashPoolId,
        financeBankExposures.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_payout_approval_receipts_snapshot_adoption_fk",
      columns: [
        table.snapshotAdoptionReceiptId,
        table.snapshotAdoptionReceiptVersion,
        table.snapshotAdoptionReceiptDigest
      ],
      foreignColumns: [
        financeBankLiquiditySnapshotAdoptionReceipts.receiptId,
        financeBankLiquiditySnapshotAdoptionReceipts.receiptVersion,
        financeBankLiquiditySnapshotAdoptionReceipts.canonicalDigest
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_payout_approval_receipts_approver_fk",
      columns: [table.approverActorUserId],
      foreignColumns: [users.id]
    }).onDelete("restrict"),
    unique("finance_online_payout_approval_receipts_payout_unique").on(table.payoutRequestId),
    unique("finance_online_payout_approval_receipts_transition_unique").on(
      table.approvalTransitionId
    ),
    unique("finance_online_payout_approval_receipts_exposure_unique").on(table.bankExposureId),
    unique("finance_online_payout_approval_receipts_authorization_unique").on(
      table.authorizationId,
      table.authorizationVersion,
      table.authorizationDigest
    ),
    unique("finance_online_payout_approval_receipts_exact_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest
    ),
    check(
      "finance_online_payout_approval_receipts_shape_check",
      sql`${table.receiptVersion} = 1
        and ${table.payoutVersion} >= 2
        and ${table.bankExposureVersion} = 1
        and ${table.bankLiquidityRevision} >= 1
        and ${table.snapshotAdoptionReceiptVersion} = 1
        and ${table.authorizationVersion} >= 1
        and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}
        and ${table.snapshotAdoptionReceiptDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.authorizationDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.canonicalPreimage}) > 0
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'`
    ),
    check(
      "finance_online_payout_approval_receipts_identifier_check",
      sql`${identifierCheck(table.payoutRequestId)}
        and ${identifierCheck(table.bankExposureId)}
        and ${identifierCheck(table.bankCashPoolId)}
        and ${identifierCheck(table.snapshotAdoptionReceiptId)}
        and ${identifierCheck(table.authorizationId)}
        and ${identifierCheck(table.persistenceTransactionBoundaryRef)}`
    )
  ]
);

/**
 * Immutable execution-start fact. It binds the `processing_manual` transition to exactly the
 * approval and exposure that authorised it; this is deliberately distinct from the later proof
 * that the bank actually transferred money.
 */
export const financeOnlinePayoutExecutionReceipts = pgTable(
  "finance_online_payout_execution_receipts",
  {
    receiptId: uuid("receipt_id").primaryKey(),
    receiptVersion: integer("receipt_version").notNull().default(1),
    payoutRequestId: varchar("payout_request_id", { length: 160 }).notNull(),
    payoutVersion: financeRevisionString("payout_version").notNull(),
    executionTransitionId: uuid("execution_transition_id").notNull(),
    approvalReceiptId: uuid("approval_receipt_id").notNull(),
    bankExposureId: varchar("bank_exposure_id", { length: 200 }).notNull(),
    bankExposureVersion: financeRevisionString("bank_exposure_version").notNull(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    executorActorUserId: uuid("executor_actor_user_id").notNull(),
    authorizationId: varchar("authorization_id", { length: 200 }).notNull(),
    authorizationVersion: financeRevisionString("authorization_version").notNull(),
    authorizationDigest: varchar("authorization_digest", { length: 71 }).notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", { length: 200 }).notNull(),
    canonicalPreimage: text("canonical_preimage").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    foreignKey({ name: "finance_online_payout_execution_receipts_request_fk", columns: [table.payoutRequestId], foreignColumns: [financeOnlinePayoutRequests.id] }).onDelete("restrict"),
    foreignKey({ name: "finance_online_payout_execution_receipts_transition_fk", columns: [table.executionTransitionId], foreignColumns: [financeOnlinePayoutStateTransitions.transitionId] }).onDelete("restrict"),
    foreignKey({ name: "finance_online_payout_execution_receipts_approval_fk", columns: [table.approvalReceiptId], foreignColumns: [financeOnlinePayoutApprovalReceipts.receiptId] }).onDelete("restrict"),
    foreignKey({ name: "finance_online_payout_execution_receipts_executor_fk", columns: [table.executorActorUserId], foreignColumns: [users.id] }).onDelete("restrict"),
    unique("finance_online_payout_execution_receipts_payout_unique").on(table.payoutRequestId),
    unique("finance_online_payout_execution_receipts_transition_unique").on(table.executionTransitionId),
    unique("finance_online_payout_execution_receipts_exposure_unique").on(table.bankExposureId),
    unique("finance_online_payout_execution_receipts_authorization_unique").on(table.authorizationId, table.authorizationVersion, table.authorizationDigest),
    unique("finance_online_payout_execution_receipts_exact_unique").on(table.receiptId, table.receiptVersion, table.canonicalDigest),
    check("finance_online_payout_execution_receipts_shape_check", sql`${table.receiptVersion} = 1 and ${table.payoutVersion} >= 3 and ${table.bankExposureVersion} >= 2 and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))} and ${table.authorizationDigest} ~ '^sha256:[a-f0-9]{64}$' and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$' and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$' and length(${table.canonicalPreimage}) > 0`),
    check("finance_online_payout_execution_receipts_identifier_check", sql`${identifierCheck(table.payoutRequestId)} and ${identifierCheck(table.bankExposureId)} and ${identifierCheck(table.bankCashPoolId)} and ${identifierCheck(table.authorizationId)} and ${identifierCheck(table.persistenceTransactionBoundaryRef)}`)
  ]
);

/**
 * Immutable proof of a manual bank transfer. It records the transfer fact but deliberately does
 * not modify bank cash: statement reconciliation later clears bank_outbound_clearing exactly once.
 */
export const financeOnlinePayoutPaidReceipts = pgTable(
  "finance_online_payout_paid_receipts",
  {
    receiptId: uuid("receipt_id").primaryKey(),
    receiptVersion: integer("receipt_version").notNull().default(1),
    payoutRequestId: varchar("payout_request_id", { length: 160 }).notNull(),
    payoutVersion: financeRevisionString("payout_version").notNull(),
    paidTransitionId: uuid("paid_transition_id").notNull(),
    executionReceiptId: uuid("execution_receipt_id").notNull(),
    walletId: uuid("wallet_id").notNull(),
    walletRevision: financeRevisionString("wallet_revision").notNull(),
    walletMutationId: uuid("wallet_mutation_id").notNull(),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }).notNull(),
    approvalReceiptId: uuid("approval_receipt_id").notNull(),
    bankExposureId: varchar("bank_exposure_id", { length: 200 }).notNull(),
    bankExposureVersion: financeRevisionString("bank_exposure_version").notNull(),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }).notNull(),
    currency: text("currency").notNull(),
    bankReference: varchar("bank_reference", { length: 240 }).notNull(),
    transferredAt: timestamp("transferred_at", { withTimezone: true }).notNull(),
    evidenceArtifactId: varchar("evidence_artifact_id", { length: 160 }).notNull(),
    evidenceArtifactDigest: varchar("evidence_artifact_digest", { length: 71 }).notNull(),
    confirmerActorUserId: uuid("confirmer_actor_user_id").notNull(),
    authorizationId: varchar("authorization_id", { length: 200 }).notNull(),
    authorizationVersion: financeRevisionString("authorization_version").notNull(),
    authorizationDigest: varchar("authorization_digest", { length: 71 }).notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", { length: 200 }).notNull(),
    canonicalPreimage: text("canonical_preimage").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull()
  },
  (table) => [
    foreignKey({ name: "finance_online_payout_paid_receipts_request_fk", columns: [table.payoutRequestId], foreignColumns: [financeOnlinePayoutRequests.id] }).onDelete("restrict"),
    foreignKey({ name: "finance_online_payout_paid_receipts_transition_fk", columns: [table.paidTransitionId], foreignColumns: [financeOnlinePayoutStateTransitions.transitionId] }).onDelete("restrict"),
    foreignKey({ name: "finance_online_payout_paid_receipts_execution_fk", columns: [table.executionReceiptId], foreignColumns: [financeOnlinePayoutExecutionReceipts.receiptId] }).onDelete("restrict"),
    foreignKey({ name: "finance_online_payout_paid_receipts_wallet_fk", columns: [table.walletId], foreignColumns: [financeOnlineWalletHeads.id] }).onDelete("restrict"),
    foreignKey({ name: "finance_online_payout_paid_receipts_wallet_mutation_fk", columns: [table.walletMutationId], foreignColumns: [financeOnlineWalletMutations.mutationId] }).onDelete("restrict"),
    foreignKey({ name: "finance_online_payout_paid_receipts_journal_fk", columns: [table.journalTransactionId], foreignColumns: [financeJournalTransactions.id] }).onDelete("restrict"),
    foreignKey({ name: "finance_online_payout_paid_receipts_approval_fk", columns: [table.approvalReceiptId], foreignColumns: [financeOnlinePayoutApprovalReceipts.receiptId] }).onDelete("restrict"),
    foreignKey({ name: "finance_online_payout_paid_receipts_evidence_fk", columns: [table.evidenceArtifactId], foreignColumns: [financeArtifacts.id] }).onDelete("restrict"),
    foreignKey({ name: "finance_online_payout_paid_receipts_confirmer_fk", columns: [table.confirmerActorUserId], foreignColumns: [users.id] }).onDelete("restrict"),
    unique("finance_online_payout_paid_receipts_payout_unique").on(table.payoutRequestId),
    unique("finance_online_payout_paid_receipts_transition_unique").on(table.paidTransitionId),
    unique("finance_online_payout_paid_receipts_wallet_mutation_unique").on(table.walletMutationId),
    unique("finance_online_payout_paid_receipts_journal_unique").on(table.journalTransactionId),
    unique("finance_online_payout_paid_receipts_exposure_unique").on(table.bankExposureId),
    unique("finance_online_payout_paid_receipts_bank_reference_unique").on(table.bankCashPoolId, table.currency, table.bankReference),
    unique("finance_online_payout_paid_receipts_evidence_unique").on(table.evidenceArtifactId),
    unique("finance_online_payout_paid_receipts_authorization_unique").on(table.authorizationId, table.authorizationVersion, table.authorizationDigest),
    unique("finance_online_payout_paid_receipts_exact_unique").on(table.receiptId, table.receiptVersion, table.canonicalDigest),
    check("finance_online_payout_paid_receipts_shape_check", sql`${table.receiptVersion} = 1 and ${table.payoutVersion} >= 4 and ${table.walletRevision} >= 1 and ${table.bankExposureVersion} >= 1 and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))} and ${table.evidenceArtifactDigest} ~ '^sha256:[a-f0-9]{64}$' and ${table.authorizationDigest} ~ '^sha256:[a-f0-9]{64}$' and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$' and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$' and length(${table.canonicalPreimage}) > 0`),
    check("finance_online_payout_paid_receipts_identifier_check", sql`${identifierCheck(table.payoutRequestId)} and ${identifierCheck(table.bankExposureId)} and ${identifierCheck(table.bankCashPoolId)} and ${identifierCheck(table.bankReference)} and ${identifierCheck(table.evidenceArtifactId)} and ${identifierCheck(table.authorizationId)} and ${identifierCheck(table.persistenceTransactionBoundaryRef)}`)
  ]
);

export const financeOnlinePayoutIntegritySql = `
create or replace function finance_reject_online_payout_history_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'online payout history is append-only' using errcode = '55000';
end;
$$;

create trigger finance_online_payout_request_allocations_immutable
before update or delete on finance_online_payout_request_allocations
for each row execute function finance_reject_online_payout_history_mutation();
create trigger finance_online_payout_state_transitions_immutable
before update or delete on finance_online_payout_state_transitions
for each row execute function finance_reject_online_payout_history_mutation();
create trigger finance_online_payout_approval_receipts_immutable
before update or delete on finance_online_payout_approval_receipts
for each row execute function finance_reject_online_payout_history_mutation();
create trigger finance_online_payout_execution_receipts_immutable
before update or delete on finance_online_payout_execution_receipts
for each row execute function finance_reject_online_payout_history_mutation();
create trigger finance_online_payout_paid_receipts_immutable
before update or delete on finance_online_payout_paid_receipts
for each row execute function finance_reject_online_payout_history_mutation();

create or replace function finance_validate_online_payout_paid_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare transition_row finance_online_payout_state_transitions%rowtype;
declare approval_row finance_online_payout_approval_receipts%rowtype;
declare execution_row finance_online_payout_execution_receipts%rowtype;
declare exposure_row finance_bank_exposures%rowtype;
declare artifact_row finance_artifacts%rowtype;
declare mutation_row finance_online_wallet_mutations%rowtype;
declare journal_row finance_journal_transactions%rowtype;
begin
  select * into strict transition_row from finance_online_payout_state_transitions where transition_id = new.paid_transition_id;
  select * into strict approval_row from finance_online_payout_approval_receipts where receipt_id = new.approval_receipt_id;
  select * into strict execution_row from finance_online_payout_execution_receipts where receipt_id = new.execution_receipt_id;
  select * into strict exposure_row from finance_bank_exposures where exposure_id = new.bank_exposure_id;
  select * into strict artifact_row from finance_artifacts where id = new.evidence_artifact_id;
  select * into strict mutation_row from finance_online_wallet_mutations where mutation_id = new.wallet_mutation_id;
  select * into strict journal_row from finance_journal_transactions where id = new.journal_transaction_id;
  if transition_row.payout_request_id <> new.payout_request_id
     or transition_row.payout_version <> new.payout_version
     or transition_row.previous_status <> 'processing_manual'
     or transition_row.status <> 'paid'
     or transition_row.actor_kind <> 'user'
     or transition_row.actor_user_id <> new.confirmer_actor_user_id
     or transition_row.authority_id <> new.authorization_id
     or transition_row.authority_version <> new.authorization_version
     or transition_row.authority_digest <> new.authorization_digest
     or approval_row.payout_request_id <> new.payout_request_id
     or approval_row.bank_exposure_id <> new.bank_exposure_id
     or approval_row.bank_cash_pool_id <> new.bank_cash_pool_id
     or approval_row.currency <> new.currency
     or execution_row.payout_request_id <> new.payout_request_id
     or execution_row.approval_receipt_id <> new.approval_receipt_id
     or execution_row.bank_exposure_id <> new.bank_exposure_id
     or execution_row.bank_cash_pool_id <> new.bank_cash_pool_id
     or execution_row.currency <> new.currency
     or execution_row.bank_exposure_version <> new.bank_exposure_version - 1
     or new.confirmer_actor_user_id = execution_row.executor_actor_user_id
     or new.confirmer_actor_user_id = approval_row.approver_actor_user_id
     or exposure_row.payout_request_id <> new.payout_request_id
     or exposure_row.version <> new.bank_exposure_version
     or exposure_row.state <> 'paid_unreflected'
     or mutation_row.wallet_id <> new.wallet_id
     or mutation_row.next_wallet_revision <> new.wallet_revision
     or mutation_row.operation_kind <> 'payout_paid'
     or mutation_row.journal_transaction_id <> new.journal_transaction_id
     or journal_row.sealed_at is null
     or artifact_row.binding_kind <> 'bank_cash_pool'
     or artifact_row.bank_cash_pool_id <> new.bank_cash_pool_id
     or artifact_row.currency <> new.currency
     or artifact_row.sha256_digest <> new.evidence_artifact_digest
     or artifact_row.artifact_class <> 'bank_transfer_evidence' then
    raise exception 'online payout paid receipt is not bound to exact manual-transfer facts' using errcode = '23514';
  end if;
  return null;
exception when no_data_found then
  raise exception 'online payout paid receipt requires exact prior payout, exposure and evidence facts' using errcode = '23503';
end;
$$;
create constraint trigger finance_online_payout_paid_receipts_guard
after insert on finance_online_payout_paid_receipts
deferrable initially deferred for each row execute function finance_validate_online_payout_paid_receipt();

create or replace function finance_validate_online_payout_execution_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare transition_row finance_online_payout_state_transitions%rowtype;
declare approval_row finance_online_payout_approval_receipts%rowtype;
declare exposure_row finance_bank_exposures%rowtype;
begin
  select * into strict transition_row from finance_online_payout_state_transitions where transition_id = new.execution_transition_id;
  select * into strict approval_row from finance_online_payout_approval_receipts where receipt_id = new.approval_receipt_id;
  select * into strict exposure_row from finance_bank_exposures where exposure_id = new.bank_exposure_id;
  if transition_row.payout_request_id <> new.payout_request_id
     or transition_row.payout_version <> new.payout_version
     or transition_row.previous_status <> 'approved'
     or transition_row.status <> 'processing_manual'
     or transition_row.actor_kind <> 'user'
     or transition_row.actor_user_id <> new.executor_actor_user_id
     or transition_row.authority_id <> new.authorization_id
     or transition_row.authority_version <> new.authorization_version
     or transition_row.authority_digest <> new.authorization_digest
     or approval_row.payout_request_id <> new.payout_request_id
     or approval_row.bank_exposure_id <> new.bank_exposure_id
     or approval_row.bank_cash_pool_id <> new.bank_cash_pool_id
     or approval_row.currency <> new.currency
     or approval_row.approver_actor_user_id = new.executor_actor_user_id
     or exposure_row.payout_request_id <> new.payout_request_id
     or exposure_row.version <> new.bank_exposure_version
     or exposure_row.state <> 'initiated_unreflected' then
    raise exception 'online payout execution receipt is not bound to exact approved bank work' using errcode = '23514';
  end if;
  return null;
exception when no_data_found then
  raise exception 'online payout execution receipt requires exact prior approval and exposure facts' using errcode = '23503';
end;
$$;
create constraint trigger finance_online_payout_execution_receipts_guard
after insert on finance_online_payout_execution_receipts
deferrable initially deferred for each row execute function finance_validate_online_payout_execution_receipt();

create or replace function finance_validate_online_payout_approval_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  transition_row finance_online_payout_state_transitions%rowtype;
  exposure_row finance_bank_exposures%rowtype;
  snapshot_receipt finance_bank_liquidity_snapshot_adoption_receipts%rowtype;
begin
  select * into strict transition_row
    from finance_online_payout_state_transitions
   where transition_id = new.approval_transition_id;
  select * into strict exposure_row
    from finance_bank_exposures
   where exposure_id = new.bank_exposure_id
     and bank_cash_pool_id = new.bank_cash_pool_id
     and currency = new.currency;
  select * into strict snapshot_receipt
    from finance_bank_liquidity_snapshot_adoption_receipts
   where receipt_id = new.snapshot_adoption_receipt_id
     and receipt_version = new.snapshot_adoption_receipt_version
     and canonical_digest = new.snapshot_adoption_receipt_digest;
  if transition_row.payout_request_id <> new.payout_request_id
     or transition_row.payout_version <> new.payout_version
     or transition_row.status <> 'approved'
     or transition_row.actor_kind <> 'user'
     or transition_row.actor_user_id <> new.approver_actor_user_id
     or transition_row.authority_id <> new.authorization_id
     or transition_row.authority_version <> new.authorization_version
     or transition_row.authority_digest <> new.authorization_digest
     or exposure_row.payout_request_id <> new.payout_request_id
     or exposure_row.version <> new.bank_exposure_version
     or exposure_row.state <> 'committed'
     or snapshot_receipt.bank_cash_pool_id <> new.bank_cash_pool_id
     or snapshot_receipt.currency <> new.currency
     or snapshot_receipt.bank_liquidity_revision >= new.bank_liquidity_revision then
    raise exception 'online payout approval receipt is not bound to its exact payout, authority, exposure and liquidity snapshot'
      using errcode = '23514';
  end if;
  return null;
exception when no_data_found then
  raise exception 'online payout approval receipt requires exact prior approval facts' using errcode = '23503';
end;
$$;
create constraint trigger finance_online_payout_approval_receipts_guard
after insert on finance_online_payout_approval_receipts
deferrable initially deferred for each row execute function finance_validate_online_payout_approval_receipt();

create or replace function finance_validate_online_payout_request_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare transition_row finance_online_payout_state_transitions%rowtype;
declare previous_transition finance_online_payout_state_transitions%rowtype;
begin
  select * into strict transition_row from finance_online_payout_state_transitions
   where payout_request_id = new.id and payout_version = new.version;
  if transition_row.status <> new.status
     or (new.version = 1 and (transition_row.previous_status is not null or new.status <> 'requested'
         or transition_row.transition_kind <> 'requested'
         or transition_row.actor_kind <> 'user'
         or transition_row.actor_user_id <> new.astrologer_user_id))
     or (new.version > 1 and (transition_row.previous_status is null
         or transition_row.transition_kind <> new.status)) then
    raise exception 'online payout request head is not backed by an exact state transition' using errcode = '23514';
  end if;
  if new.version > 1 then
    select * into strict previous_transition from finance_online_payout_state_transitions
     where payout_request_id = new.id and payout_version = new.version - 1;
    if transition_row.previous_status <> previous_transition.status
       or not (
         (previous_transition.status = 'requested' and transition_row.status in ('under_review', 'rejected', 'cancelled'))
         or (previous_transition.status = 'under_review' and transition_row.status in ('approved', 'rejected', 'cancelled'))
         or (previous_transition.status = 'approved' and transition_row.status in ('processing_manual', 'rejected', 'cancelled'))
         or (previous_transition.status = 'processing_manual' and transition_row.status in ('paid', 'failed'))
       )
       or (transition_row.status in ('under_review', 'approved', 'processing_manual') and transition_row.actor_kind <> 'user')
       or (transition_row.status = 'under_review' and transition_row.actor_user_id = new.astrologer_user_id)
       or (transition_row.status = 'approved' and (
         transition_row.actor_user_id = new.astrologer_user_id
         or transition_row.actor_user_id = previous_transition.actor_user_id
       )) then
      raise exception 'online payout transition violates the manual payout state machine' using errcode = '23514';
    end if;
  end if;
  return null;
exception when no_data_found then
  raise exception 'online payout request requires its state transition' using errcode = '23503';
end;
$$;
create constraint trigger finance_online_payout_request_head_guard
after insert or update of status, version on finance_online_payout_requests
deferrable initially deferred for each row execute function finance_validate_online_payout_request_head();

create or replace function finance_validate_online_payout_allocation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare request_row finance_online_payout_requests%rowtype;
declare source_row finance_online_payable_source_allocations%rowtype;
declare pending_row finance_online_payable_source_allocations%rowtype;
begin
  select * into strict request_row from finance_online_payout_requests where id = new.payout_request_id;
  select * into strict source_row from finance_online_payable_source_allocations where allocation_id = new.source_allocation_id;
  select * into strict pending_row from finance_online_payable_source_allocations where allocation_id = new.payout_pending_allocation_id;
  if source_row.wallet_id <> request_row.wallet_id or pending_row.wallet_id <> request_row.wallet_id
     or source_row.root_lot_id <> new.root_lot_id or pending_row.root_lot_id <> new.root_lot_id
     or source_row.bucket <> 'available' or pending_row.bucket <> 'payout_pending'
     or pending_row.amount_minor <> new.amount_minor then
    raise exception 'online payout allocation is cross-wired' using errcode = '23514';
  end if;
  return null;
exception when no_data_found then
  raise exception 'online payout allocation references an incomplete source graph' using errcode = '23503';
end;
$$;
create constraint trigger finance_online_payout_allocation_guard
after insert on finance_online_payout_request_allocations
deferrable initially deferred for each row execute function finance_validate_online_payout_allocation();

create or replace function finance_validate_online_payout_request_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare mutation_row finance_online_wallet_mutations%rowtype;
declare allocation_count integer;
declare consumption_count integer;
declare mapped_amount numeric;
begin
  select * into strict mutation_row from finance_online_wallet_mutations
   where mutation_id = new.wallet_mutation_id;
  if mutation_row.wallet_id <> new.wallet_id or mutation_row.operation_kind <> 'payout_requested' then
    raise exception 'online payout request is not bound to its payout reservation mutation' using errcode = '23514';
  end if;
  select count(*), coalesce(sum(amount_minor), 0)
    into allocation_count, mapped_amount
    from finance_online_payout_request_allocations
   where payout_request_id = new.id;
  select count(*) into consumption_count
    from finance_online_payable_source_consumptions
   where mutation_id = new.wallet_mutation_id and source_kind = 'allocation';
  if allocation_count = 0 or allocation_count <> consumption_count
     or mapped_amount <> new.immutable_amount_minor
     or exists (
       select 1
         from finance_online_payout_request_allocations mapping
         left join finance_online_payable_source_consumptions consumption
           on consumption.mutation_id = new.wallet_mutation_id
          and consumption.source_kind = 'allocation'
          and consumption.source_allocation_id = mapping.source_allocation_id
         left join finance_online_payable_source_allocations pending
           on pending.allocation_id = mapping.payout_pending_allocation_id
          and pending.source_consumption_id = consumption.consumption_id
        where mapping.payout_request_id = new.id
          and (consumption.consumption_id is null or pending.allocation_id is null)
     ) then
    raise exception 'online payout request does not exactly bind every reserved source position' using errcode = '23514';
  end if;
  return null;
exception when no_data_found then
  raise exception 'online payout request mutation is missing' using errcode = '23503';
end;
$$;
create constraint trigger finance_online_payout_request_mutation_guard
after insert on finance_online_payout_requests
deferrable initially deferred for each row execute function finance_validate_online_payout_request_mutation();
`;
