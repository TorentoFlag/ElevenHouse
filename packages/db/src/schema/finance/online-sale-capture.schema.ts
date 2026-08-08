import { type SQLWrapper, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
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
  financeOrderEconomicsSnapshots,
  financePaidProductFulfillmentDecisions,
  financeRiskPolicyVersions
} from "./capture-authorities.schema";
import { financeCanonicalJsonV1Sql } from "./canonical-json.sql";
import { financeCaptureFacts, financePaymentClearingHeads } from "./economic-payments.schema";
import {
  financeProviderSemanticFacts,
  financeWebhookSemanticCommitReceipts
} from "./webhook-inbox.schema";
import { financeNumeric38String, financeRevisionString } from "./finance-values";
import { financeJournalEntries, financeJournalTransactions } from "./ledger.schema";

const digestSqlPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");

/**
 * The online v2 aggregate deliberately has a separate head from the legacy full-state wallet.
 * Its commitment chain serializes bounded writes; it is not a rolling substitute for the legacy
 * source-lot state digest. The legacy aggregate can therefore remain an audit/reconciliation
 * oracle while the v2 sale-capture path is migrated as one complete graph.
 */
export const financeOnlineWalletHeads = pgTable(
  "finance_online_wallet_heads",
  {
    id: uuid("id").primaryKey(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    currency: text("currency").notNull(),
    revision: financeRevisionString("revision").notNull(),
    pendingMinor: financeNumeric38String("pending_minor").notNull(),
    availableMinor: financeNumeric38String("available_minor").notNull(),
    reservedMinor: financeNumeric38String("reserved_minor").notNull(),
    payoutPendingMinor: financeNumeric38String("payout_pending_minor").notNull(),
    refundPendingMinor: financeNumeric38String("refund_pending_minor").notNull(),
    recoveryReceivableMinor: financeNumeric38String("recovery_receivable_minor").notNull(),
    lastCommitmentId: uuid("last_commitment_id"),
    lastCommitmentDigest: varchar("last_commitment_digest", { length: 71 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("finance_online_wallet_heads_owner_currency_unique").on(
      table.astrologerUserId,
      table.currency
    ),
    unique("finance_online_wallet_heads_exact_scope_unique").on(
      table.id,
      table.astrologerUserId,
      table.currency
    ),
    check("finance_online_wallet_heads_currency_check", sql`${table.currency} = 'RUB'`),
    check("finance_online_wallet_heads_revision_check", sql`${table.revision} >= 1`),
    check(
      "finance_online_wallet_heads_balance_check",
      sql`${table.pendingMinor} >= 0
        and ${table.availableMinor} >= 0
        and ${table.reservedMinor} >= 0
        and ${table.payoutPendingMinor} >= 0
        and ${table.refundPendingMinor} >= 0
        and ${table.recoveryReceivableMinor} >= 0`
    ),
    check(
      "finance_online_wallet_heads_commitment_shape_check",
      sql`(${table.lastCommitmentId} is null and ${table.lastCommitmentDigest} is null)
        or (${table.lastCommitmentId} is not null and ${table.lastCommitmentDigest} ~ ${digestSqlPattern})`
    )
  ]
);

/**
 * Domain-issued receipt v2. It contains only the bounded source transition and the previous
 * database-issued commitment; it intentionally has no legacy lot-state digest columns.
 */
export const financeOnlineSaleCaptureReceipts = pgTable(
  "finance_online_sale_capture_receipts",
  {
    receiptId: varchar("receipt_id", { length: 200 }).primaryKey(),
    schemaVersion: integer("schema_version").notNull(),
    operationId: varchar("operation_id", { length: 200 }).notNull(),
    walletId: uuid("wallet_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    currency: text("currency").notNull(),
    expectedWalletRevision: financeRevisionString("expected_wallet_revision").notNull(),
    nextWalletRevision: financeRevisionString("next_wallet_revision").notNull(),
    previousCommitmentId: uuid("previous_commitment_id"),
    previousCommitmentDigest: varchar("previous_commitment_digest", { length: 71 }),
    orderId: varchar("order_id", { length: 200 }).notNull(),
    rootLotId: varchar("root_lot_id", { length: 200 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_online_sale_capture_receipts_wallet_fk",
      columns: [table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financeOnlineWalletHeads.id,
        financeOnlineWalletHeads.astrologerUserId,
        financeOnlineWalletHeads.currency
      ]
    }).onDelete("restrict"),
    unique("finance_online_sale_capture_receipts_operation_unique").on(table.operationId),
    unique("finance_online_sale_capture_receipts_wallet_revision_unique").on(
      table.walletId,
      table.nextWalletRevision
    ),
    unique("finance_online_sale_capture_receipts_order_digest_unique").on(
      table.orderId,
      table.canonicalDigest
    ),
    unique("finance_online_sale_capture_receipts_receipt_order_unique").on(
      table.receiptId,
      table.orderId
    ),
    unique("finance_online_sale_capture_receipts_exact_wallet_owner_unique").on(
      table.receiptId,
      table.walletId,
      table.astrologerUserId,
      table.currency
    ),
    unique("finance_online_sale_capture_receipts_exact_wallet_revision_unique").on(
      table.receiptId,
      table.walletId,
      table.nextWalletRevision
    ),
    unique("finance_online_sale_capture_receipts_root_lot_unique").on(table.rootLotId),
    check("finance_online_sale_capture_receipts_version_check", sql`${table.schemaVersion} = 2`),
    check("finance_online_sale_capture_receipts_currency_check", sql`${table.currency} = 'RUB'`),
    check(
      "finance_online_sale_capture_receipts_revision_check",
      sql`${table.expectedWalletRevision} >= 0
        and ${table.nextWalletRevision} = ${table.expectedWalletRevision} + 1`
    ),
    check(
      "finance_online_sale_capture_receipts_predecessor_shape_check",
      sql`(${table.expectedWalletRevision} = 0
          and ${table.previousCommitmentId} is null
          and ${table.previousCommitmentDigest} is null)
        or (${table.expectedWalletRevision} > 0
          and ${table.previousCommitmentId} is not null
          and ${table.previousCommitmentDigest} ~ ${digestSqlPattern})`
    ),
    check(
      "finance_online_sale_capture_receipts_digest_check",
      sql`${table.canonicalDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_online_sale_capture_receipts_identifier_check",
      identifierCheck(table.receiptId, table.operationId, table.orderId, table.rootLotId)
    ),
    index("finance_online_sale_capture_receipts_wallet_history_idx").on(
      table.walletId,
      table.nextWalletRevision
    )
  ]
);

/** Exact immutable authority tuple that the root lot is allowed to use. */
export const financeOnlineSaleCaptureAuthorityBindings = pgTable(
  "finance_online_sale_capture_authority_bindings",
  {
    receiptId: varchar("receipt_id", { length: 200 }).primaryKey(),
    orderId: varchar("order_id", { length: 200 }).notNull(),
    captureFactId: varchar("capture_fact_id", { length: 160 }).notNull(),
    captureIntentId: varchar("capture_intent_id", { length: 160 }).notNull(),
    captureSessionId: varchar("capture_session_id", { length: 160 }).notNull(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    captureAmountMinor: financeNumeric38String("capture_amount_minor").notNull(),
    captureCurrency: text("capture_currency").notNull(),
    captureEvidenceAuthorityKind: text("capture_evidence_authority_kind").notNull(),
    captureEvidenceAuthorityId: varchar("capture_evidence_authority_id", { length: 160 }).notNull(),
    captureEvidenceArtifactId: varchar("capture_evidence_artifact_id", { length: 160 }).notNull(),
    captureEvidenceArtifactDigest: varchar("capture_evidence_artifact_digest", {
      length: 71
    }).notNull(),
    economicsSnapshotDigest: varchar("economics_snapshot_digest", { length: 71 }).notNull(),
    riskPolicyId: varchar("risk_policy_id", { length: 160 }).notNull(),
    riskPolicyVersion: financeRevisionString("risk_policy_version").notNull(),
    riskPolicyDigest: varchar("risk_policy_digest", { length: 71 }).notNull(),
    fulfillmentDecisionId: varchar("fulfillment_decision_id", { length: 200 }).notNull(),
    fulfillmentDecisionVersion: financeRevisionString("fulfillment_decision_version").notNull(),
    fulfillmentDecisionDigest: varchar("fulfillment_decision_digest", { length: 71 }).notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    boundAt: timestamp("bound_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_online_sale_capture_authority_receipt_order_fk",
      columns: [table.receiptId, table.orderId],
      foreignColumns: [
        financeOnlineSaleCaptureReceipts.receiptId,
        financeOnlineSaleCaptureReceipts.orderId
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_authority_capture_fact_fk",
      columns: [
        table.captureFactId,
        table.captureIntentId,
        table.captureSessionId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.providerPaymentId,
        table.captureAmountMinor,
        table.captureCurrency,
        table.captureEvidenceAuthorityKind,
        table.captureEvidenceAuthorityId,
        table.captureEvidenceArtifactId,
        table.captureEvidenceArtifactDigest
      ],
      foreignColumns: [
        financeCaptureFacts.id,
        financeCaptureFacts.economicPaymentIntentId,
        financeCaptureFacts.economicPaymentSessionId,
        financeCaptureFacts.seriesId,
        financeCaptureFacts.providerAccountId,
        financeCaptureFacts.providerIdentityVersion,
        financeCaptureFacts.providerPaymentId,
        financeCaptureFacts.amountMinor,
        financeCaptureFacts.currency,
        financeCaptureFacts.evidenceAuthorityKind,
        financeCaptureFacts.evidenceAuthorityId,
        financeCaptureFacts.evidenceArtifactId,
        financeCaptureFacts.evidenceArtifactDigest
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_authority_economics_fk",
      columns: [table.orderId, table.economicsSnapshotDigest],
      foreignColumns: [
        financeOrderEconomicsSnapshots.orderId,
        financeOrderEconomicsSnapshots.canonicalDigest
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_authority_risk_fk",
      columns: [table.riskPolicyId, table.riskPolicyVersion, table.riskPolicyDigest],
      foreignColumns: [
        financeRiskPolicyVersions.policyId,
        financeRiskPolicyVersions.policyVersion,
        financeRiskPolicyVersions.canonicalDigest
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_authority_fulfillment_fk",
      columns: [
        table.fulfillmentDecisionId,
        table.fulfillmentDecisionVersion,
        table.fulfillmentDecisionDigest
      ],
      foreignColumns: [
        financePaidProductFulfillmentDecisions.registryKey,
        financePaidProductFulfillmentDecisions.registryRevision,
        financePaidProductFulfillmentDecisions.canonicalDigest
      ]
    }).onDelete("restrict"),
    unique("finance_online_sale_capture_authority_bindings_exact_capture_unique").on(
      table.receiptId,
      table.captureFactId
    ),
    check(
      "finance_online_sale_capture_authority_order_identifier_check",
      identifierCheck(table.orderId)
    ),
    check(
      "finance_online_sale_capture_authority_currency_check",
      sql`${table.captureCurrency} = 'RUB'`
    ),
    check(
      "finance_online_sale_capture_authority_digest_check",
      sql`${table.captureEvidenceArtifactDigest} ~ ${digestSqlPattern}
        and ${table.economicsSnapshotDigest} ~ ${digestSqlPattern}
        and ${table.riskPolicyDigest} ~ ${digestSqlPattern}
        and ${table.fulfillmentDecisionDigest} ~ ${digestSqlPattern}
        and ${table.canonicalDigest} ~ ${digestSqlPattern}`
    )
  ]
);

/** One bounded active pending root. Later v2 lot operations must consume this root by FK. */
export const financeOnlineSaleCaptureRootLots = pgTable(
  "finance_online_sale_capture_root_lots",
  {
    lotId: varchar("lot_id", { length: 200 }).primaryKey(),
    receiptId: varchar("receipt_id", { length: 200 }).notNull(),
    walletId: uuid("wallet_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    currency: text("currency").notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    bucket: text("bucket").notNull(),
    status: text("status").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    createdByOperationId: varchar("created_by_operation_id", { length: 200 }).notNull(),
    authorityReceiptId: varchar("authority_receipt_id", { length: 200 }).notNull(),
    createdAtDb: timestamp("created_at_db", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_online_sale_capture_root_lots_receipt_fk",
      columns: [table.receiptId, table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financeOnlineSaleCaptureReceipts.receiptId,
        financeOnlineSaleCaptureReceipts.walletId,
        financeOnlineSaleCaptureReceipts.astrologerUserId,
        financeOnlineSaleCaptureReceipts.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_root_lots_authority_fk",
      columns: [table.authorityReceiptId],
      foreignColumns: [financeOnlineSaleCaptureAuthorityBindings.receiptId]
    }).onDelete("restrict"),
    unique("finance_online_sale_capture_root_lots_receipt_unique").on(table.receiptId),
    check(
      "finance_online_sale_capture_root_lots_shape_check",
      sql`${table.amountMinor} > 0 and ${table.currency} = 'RUB'
        and ${table.bucket} = 'pending' and ${table.status} = 'active'
        and ${table.authorityReceiptId} = ${table.receiptId}`
    ),
    check(
      "finance_online_sale_capture_root_lots_time_check",
      sql`${table.createdAt} >= ${table.capturedAt}`
    ),
    check(
      "finance_online_sale_capture_root_lots_identifier_check",
      identifierCheck(table.lotId, table.receiptId, table.createdByOperationId)
    ),
    index("finance_online_sale_capture_root_lots_wallet_pending_idx").on(
      table.walletId,
      table.capturedAt,
      table.lotId
    )
  ]
);

/**
 * Separate v2 proof for the sealed journal. It does not reference v1 allocation-link or
 * persistence-receipt tables, whose optional operation snapshot means something different.
 */
export const financeOnlineSaleCaptureJournalProofs = pgTable(
  "finance_online_sale_capture_journal_proofs",
  {
    proofId: uuid("proof_id").primaryKey().defaultRandom(),
    receiptId: varchar("receipt_id", { length: 200 }).notNull(),
    version: integer("version").notNull(),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }).notNull(),
    journalTransactionDigest: varchar("journal_transaction_digest", { length: 71 }).notNull(),
    proofCanonicalPreimage: text("proof_canonical_preimage").notNull(),
    proofDigest: varchar("proof_digest", { length: 71 }).notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_online_sale_capture_journal_proofs_receipt_fk",
      columns: [table.receiptId],
      foreignColumns: [financeOnlineSaleCaptureReceipts.receiptId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_journal_proofs_transaction_fk",
      columns: [table.journalTransactionId, table.journalTransactionDigest],
      foreignColumns: [financeJournalTransactions.id, financeJournalTransactions.canonicalDigest]
    }).onDelete("restrict"),
    unique("finance_online_sale_capture_journal_proofs_receipt_unique").on(table.receiptId),
    unique("finance_online_sale_capture_journal_proofs_exact_owner_unique").on(
      table.proofId,
      table.receiptId
    ),
    unique("finance_online_sale_capture_journal_proofs_transaction_unique").on(
      table.journalTransactionId
    ),
    check("finance_online_sale_capture_journal_proofs_version_check", sql`${table.version} = 2`),
    check(
      "finance_online_sale_capture_journal_proofs_digest_check",
      sql`${table.journalTransactionDigest} ~ ${digestSqlPattern}
        and ${table.proofDigest} ~ ${digestSqlPattern}
        and length(${table.proofCanonicalPreimage}) between 1 and 8000
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'`
    )
  ]
);

export const financeOnlineSaleCaptureJournalProofEntries = pgTable(
  "finance_online_sale_capture_journal_proof_entries",
  {
    proofId: uuid("proof_id")
      .notNull()
      .references(() => financeOnlineSaleCaptureJournalProofs.proofId, { onDelete: "restrict" }),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => financeJournalEntries.id, { onDelete: "restrict" }),
    entryIndex: integer("entry_index").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull()
  },
  (table) => [
    unique("finance_online_sale_capture_journal_proof_entries_proof_order_unique").on(
      table.proofId,
      table.entryIndex
    ),
    unique("finance_online_sale_capture_journal_proof_entries_entry_unique").on(
      table.journalEntryId
    ),
    check(
      "finance_online_sale_capture_journal_proof_entries_shape_check",
      sql`${table.entryIndex} >= 0 and ${table.canonicalDigest} ~ ${digestSqlPattern}`
    )
  ]
);

/** Database-issued chain record. Receipt fields bind its predecessor; this table binds its proof. */
export const financeOnlineWalletCommitments = pgTable(
  "finance_online_wallet_commitments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: varchar("receipt_id", { length: 200 }).notNull(),
    walletId: uuid("wallet_id").notNull(),
    walletRevision: financeRevisionString("wallet_revision").notNull(),
    previousCommitmentId: uuid("previous_commitment_id"),
    previousCommitmentDigest: varchar("previous_commitment_digest", { length: 71 }),
    journalProofId: uuid("journal_proof_id").notNull(),
    commitmentCanonicalPreimage: text("commitment_canonical_preimage").notNull(),
    commitmentDigest: varchar("commitment_digest", { length: 71 }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_online_wallet_commitments_receipt_fk",
      columns: [table.receiptId, table.walletId, table.walletRevision],
      foreignColumns: [
        financeOnlineSaleCaptureReceipts.receiptId,
        financeOnlineSaleCaptureReceipts.walletId,
        financeOnlineSaleCaptureReceipts.nextWalletRevision
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_wallet_commitments_proof_fk",
      columns: [table.journalProofId],
      foreignColumns: [financeOnlineSaleCaptureJournalProofs.proofId]
    }).onDelete("restrict"),
    unique("finance_online_wallet_commitments_receipt_unique").on(table.receiptId),
    unique("finance_online_wallet_commitments_proof_unique").on(table.journalProofId),
    unique("finance_online_wallet_commitments_wallet_revision_unique").on(
      table.walletId,
      table.walletRevision
    ),
    unique("finance_online_wallet_commitments_exact_identity_unique").on(
      table.id,
      table.walletId,
      table.walletRevision,
      table.commitmentDigest
    ),
    unique("finance_online_wallet_commitments_predecessor_identity_unique").on(
      table.id,
      table.walletId,
      table.commitmentDigest
    ),
    unique("finance_online_wallet_commitments_application_owner_unique").on(
      table.id,
      table.receiptId,
      table.walletId,
      table.walletRevision,
      table.commitmentDigest
    ),
    check("finance_online_wallet_commitments_revision_check", sql`${table.walletRevision} >= 1`),
    check(
      "finance_online_wallet_commitments_predecessor_shape_check",
      sql`(${table.walletRevision} = 1
          and ${table.previousCommitmentId} is null
          and ${table.previousCommitmentDigest} is null)
        or (${table.walletRevision} > 1
          and ${table.previousCommitmentId} is not null
          and ${table.previousCommitmentDigest} ~ ${digestSqlPattern})`
    ),
    check(
      "finance_online_wallet_commitments_digest_check",
      sql`${table.commitmentDigest} ~ ${digestSqlPattern}
        and length(${table.commitmentCanonicalPreimage}) between 1 and 8000`
    ),
    index("finance_online_wallet_commitments_wallet_lookup_idx").on(
      table.walletId,
      table.walletRevision,
      table.commitmentDigest
    )
  ]
);

/**
 * Append-only v2 application receipt for the completed business effect. It deliberately has no
 * FK to v1 journal receipts, wallet bindings or payable lots: those prove a different graph.
 */
export const financeOnlineSaleCaptureApplications = pgTable(
  "finance_online_sale_capture_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    semanticCommitReceiptId: uuid("semantic_commit_receipt_id").notNull(),
    semanticFactId: varchar("semantic_fact_id", { length: 160 }).notNull(),
    captureFactId: varchar("capture_fact_id", { length: 160 }).notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    economicPaymentVersion: financeRevisionString("economic_payment_version").notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }).notNull(),
    economicPaymentSessionVersion: financeRevisionString(
      "economic_payment_session_version"
    ).notNull(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    currency: text("currency").notNull(),
    evidenceAuthorityKind: text("evidence_authority_kind").notNull(),
    evidenceArtifactId: varchar("evidence_artifact_id", { length: 160 }).notNull(),
    evidenceArtifactDigest: varchar("evidence_artifact_digest", { length: 71 }).notNull(),
    clearingState: text("clearing_state").notNull(),
    clearingVersion: financeRevisionString("clearing_version").notNull(),
    onlineSaleReceiptId: varchar("online_sale_receipt_id", { length: 200 }).notNull(),
    onlineSaleJournalProofId: uuid("online_sale_journal_proof_id").notNull(),
    onlineWalletCommitmentId: uuid("online_wallet_commitment_id").notNull(),
    onlineWalletId: uuid("online_wallet_id").notNull(),
    onlineWalletRevision: financeRevisionString("online_wallet_revision").notNull(),
    onlineWalletCommitmentDigest: varchar("online_wallet_commitment_digest", {
      length: 71
    }).notNull(),
    canonicalPreimage: text("canonical_preimage").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_online_sale_capture_applications_semantic_receipt_fk",
      columns: [table.semanticCommitReceiptId, table.semanticFactId],
      foreignColumns: [
        financeWebhookSemanticCommitReceipts.id,
        financeWebhookSemanticCommitReceipts.semanticFactId
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_applications_semantic_fact_fk",
      columns: [table.semanticFactId],
      foreignColumns: [financeProviderSemanticFacts.id]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_applications_capture_fact_fk",
      columns: [
        table.captureFactId,
        table.economicPaymentIntentId,
        table.economicPaymentSessionId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.providerPaymentId,
        table.amountMinor,
        table.currency,
        table.evidenceAuthorityKind,
        table.semanticFactId,
        table.evidenceArtifactId,
        table.evidenceArtifactDigest
      ],
      foreignColumns: [
        financeCaptureFacts.id,
        financeCaptureFacts.economicPaymentIntentId,
        financeCaptureFacts.economicPaymentSessionId,
        financeCaptureFacts.seriesId,
        financeCaptureFacts.providerAccountId,
        financeCaptureFacts.providerIdentityVersion,
        financeCaptureFacts.providerPaymentId,
        financeCaptureFacts.amountMinor,
        financeCaptureFacts.currency,
        financeCaptureFacts.evidenceAuthorityKind,
        financeCaptureFacts.evidenceAuthorityId,
        financeCaptureFacts.evidenceArtifactId,
        financeCaptureFacts.evidenceArtifactDigest
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_applications_clearing_fk",
      columns: [
        table.economicPaymentIntentId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.currency,
        table.clearingState,
        table.clearingVersion
      ],
      foreignColumns: [
        financePaymentClearingHeads.economicPaymentIntentId,
        financePaymentClearingHeads.seriesId,
        financePaymentClearingHeads.providerAccountId,
        financePaymentClearingHeads.providerIdentityVersion,
        financePaymentClearingHeads.currency,
        financePaymentClearingHeads.state,
        financePaymentClearingHeads.version
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_applications_receipt_fk",
      columns: [table.onlineSaleReceiptId],
      foreignColumns: [financeOnlineSaleCaptureReceipts.receiptId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_applications_receipt_capture_fk",
      columns: [table.onlineSaleReceiptId, table.captureFactId],
      foreignColumns: [
        financeOnlineSaleCaptureAuthorityBindings.receiptId,
        financeOnlineSaleCaptureAuthorityBindings.captureFactId
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_applications_journal_proof_fk",
      columns: [table.onlineSaleJournalProofId, table.onlineSaleReceiptId],
      foreignColumns: [
        financeOnlineSaleCaptureJournalProofs.proofId,
        financeOnlineSaleCaptureJournalProofs.receiptId
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_online_sale_capture_applications_commitment_fk",
      columns: [
        table.onlineWalletCommitmentId,
        table.onlineSaleReceiptId,
        table.onlineWalletId,
        table.onlineWalletRevision,
        table.onlineWalletCommitmentDigest
      ],
      foreignColumns: [
        financeOnlineWalletCommitments.id,
        financeOnlineWalletCommitments.receiptId,
        financeOnlineWalletCommitments.walletId,
        financeOnlineWalletCommitments.walletRevision,
        financeOnlineWalletCommitments.commitmentDigest
      ]
    }).onDelete("restrict"),
    unique("finance_online_sale_capture_applications_semantic_receipt_unique").on(
      table.semanticCommitReceiptId
    ),
    unique("finance_online_sale_capture_applications_capture_fact_unique").on(table.captureFactId),
    unique("finance_online_sale_capture_applications_sale_receipt_unique").on(
      table.onlineSaleReceiptId
    ),
    unique("finance_online_sale_capture_applications_commitment_unique").on(
      table.onlineWalletCommitmentId
    ),
    uniqueIndex("finance_online_sale_capture_applications_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    uniqueIndex("finance_online_sale_capture_applications_digest_unique").on(table.canonicalDigest),
    check(
      "finance_online_sale_capture_applications_shape_check",
      sql`${table.currency} = 'RUB'
        and ${table.amountMinor} > 0
        and ${table.evidenceAuthorityKind} = 'provider_semantic_fact'
        and ${table.evidenceArtifactDigest} ~ ${digestSqlPattern}
        and ${table.economicPaymentVersion} >= 2
        and ${table.economicPaymentSessionVersion} >= 2
        and ${table.clearingState} = 'unmatched'
        and ${table.clearingVersion} = 1
        and ${table.onlineWalletRevision} >= 1
        and ${table.onlineWalletCommitmentDigest} ~ ${digestSqlPattern}
        and ${table.canonicalDigest} ~ ${digestSqlPattern}
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'
        and length(${table.canonicalPreimage}) between 1 and 12000`
    ),
    check(
      "finance_online_sale_capture_applications_identifier_check",
      identifierCheck(
        table.semanticFactId,
        table.captureFactId,
        table.economicPaymentIntentId,
        table.economicPaymentSessionId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerPaymentId,
        table.evidenceArtifactId,
        table.onlineSaleReceiptId
      )
    ),
    index("finance_online_sale_capture_applications_intent_lookup_idx").on(
      table.economicPaymentIntentId,
      table.committedAt
    )
  ]
);

/** Baseline owner installs this only after the complete v2 graph is created. */
export const financeOnlineSaleCaptureIntegritySql = `
${financeCanonicalJsonV1Sql}

create or replace function finance_reject_online_sale_capture_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'online sale-capture v2 evidence is append-only' using errcode = '55000';
end;
$$;

create or replace function finance_protect_online_wallet_head_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'online wallet heads cannot be deleted' using errcode = '55000';
  end if;
  new.updated_at := clock_timestamp();
  if tg_op = 'INSERT' then
    if new.revision <> 1 then
      raise exception 'online wallet head must start at revision one' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.id <> old.id
     or new.astrologer_user_id <> old.astrologer_user_id
     or new.currency <> old.currency
     or new.revision <> old.revision + 1 then
    raise exception 'online wallet head update has an invalid identity or revision' using errcode = '40001';
  end if;
  if new.last_commitment_id is null or new.last_commitment_digest is null then
    raise exception 'online wallet head update requires its exact next commitment' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from finance_online_wallet_commitments capture_commitment
    where capture_commitment.id = new.last_commitment_id
      and capture_commitment.wallet_id = new.id
      and capture_commitment.wallet_revision = new.revision
      and capture_commitment.commitment_digest = new.last_commitment_digest
  ) and not exists (
    select 1
    from finance_online_wallet_mutations mutation
    where mutation.mutation_id = new.last_commitment_id
      and mutation.wallet_id = new.id
      and mutation.next_wallet_revision = new.revision
      and mutation.commitment_digest = new.last_commitment_digest
  ) then
    raise exception 'online wallet head update does not reference its exact committed mutation' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_online_wallet_heads_protected_mutation
before insert or update or delete on finance_online_wallet_heads
for each row execute function finance_protect_online_wallet_head_mutation();

create or replace function finance_validate_online_wallet_commitment_predecessor()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.wallet_revision = 1 then
    return new;
  end if;
  if exists (
    select 1
    from finance_online_wallet_commitments capture_commitment
    where capture_commitment.id = new.previous_commitment_id
      and capture_commitment.wallet_id = new.wallet_id
      and capture_commitment.wallet_revision = new.wallet_revision - 1
      and capture_commitment.commitment_digest = new.previous_commitment_digest
  ) or exists (
    select 1
    from finance_online_wallet_mutations mutation
    where mutation.mutation_id = new.previous_commitment_id
      and mutation.wallet_id = new.wallet_id
      and mutation.next_wallet_revision = new.wallet_revision - 1
      and mutation.commitment_digest = new.previous_commitment_digest
  ) then
    return new;
  end if;
  raise exception 'online wallet commitment predecessor is not the exact prior wallet state'
    using errcode = '23514';
end;
$$;

create trigger finance_online_wallet_commitments_predecessor_guard
before insert on finance_online_wallet_commitments
for each row execute function finance_validate_online_wallet_commitment_predecessor();

create trigger finance_online_sale_capture_receipts_immutable
before update or delete on finance_online_sale_capture_receipts
for each row execute function finance_reject_online_sale_capture_mutation();
create trigger finance_online_sale_capture_authority_bindings_immutable
before update or delete on finance_online_sale_capture_authority_bindings
for each row execute function finance_reject_online_sale_capture_mutation();
create trigger finance_online_sale_capture_root_lots_immutable
before update or delete on finance_online_sale_capture_root_lots
for each row execute function finance_reject_online_sale_capture_mutation();
create trigger finance_online_sale_capture_journal_proofs_immutable
before update or delete on finance_online_sale_capture_journal_proofs
for each row execute function finance_reject_online_sale_capture_mutation();
create trigger finance_online_sale_capture_journal_proof_entries_immutable
before update or delete on finance_online_sale_capture_journal_proof_entries
for each row execute function finance_reject_online_sale_capture_mutation();
create trigger finance_online_wallet_commitments_immutable
before update or delete on finance_online_wallet_commitments
for each row execute function finance_reject_online_sale_capture_mutation();
create trigger finance_online_sale_capture_applications_immutable
before update or delete on finance_online_sale_capture_applications
for each row execute function finance_reject_online_sale_capture_mutation();
`;

function identifierCheck(...columns: SQLWrapper[]): ReturnType<typeof sql> {
  return sql.join(
    columns.map(
      (column) =>
        sql`length(${column}) between 1 and 200 and btrim(${column}) = ${column} and ${column} !~ '[[:cntrl:]]'`
    ),
    sql` and `
  );
}
