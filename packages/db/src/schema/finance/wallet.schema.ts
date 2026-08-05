import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
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

import { users } from "../identity/accounts.schema";
import {
  financeOrderEconomicsSnapshots,
  financePaidProductFulfillmentDecisions,
  financeRiskPolicyVersions
} from "./capture-authorities.schema";
import { financeCaptureFacts } from "./economic-payments.schema";
import {
  financeAllocationLinkProofs,
  financeJournalTransactions,
  financePersistenceCommitReceipts,
  financeSourceIdentities
} from "./ledger.schema";
import { financeProviderAccounts } from "./provider-accounts.schema";
import {
  financeNumeric38String,
  financeRevisionString,
  formatFinanceSqlValues
} from "./finance-values";

const walletHistoryKindValues = [
  "sale_capture",
  "hold_release",
  "reserve_release",
  "payout_requested",
  "payout_released",
  "payout_paid",
  "payout_returned_reserved",
  "refund_approved",
  "refund_confirmed",
  "refund_failed",
  "refund_bridge_payout_failed",
  "chargeback_confirmed",
  "chargeback_principal_allocated",
  "chargeback_recovery_collected",
  "chargeback_won_reserved"
] as const;

const payableLotBucketValues = [
  "pending",
  "available",
  "reserved",
  "payout_pending",
  "refund_pending"
] as const;
const walletLotBalanceBucketValues = [...payableLotBucketValues, "recovery_receivable"] as const;

const lotTransitionRelationValues = ["root_created", "created", "consumed", "referenced"] as const;
const ledgerSideValues = ["debit", "credit"] as const;
const lotAuthorityKindValues = [
  "canonical_capture",
  "reserve_allocation",
  "payment_capture_integrity",
  "release_blocks",
  "hold_release_evidence",
  "reserve_release",
  "payout_request",
  "payout_no_transfer_outcome",
  "payout_paid",
  "payout_return",
  "refund_approval",
  "refund_confirmed",
  "refund_failed",
  "refund_bridge_payout_failed",
  "chargeback_confirmed",
  "chargeback_principal_allocation",
  "chargeback_recovery_collection",
  "chargeback_won"
] as const;
const digestExpression = "^sha256:[a-f0-9]{64}$";
const digestSqlPattern = sql.raw(`'${digestExpression}'`);

export const financeWalletHeads = pgTable(
  "finance_wallet_heads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    astrologerUserId: uuid("astrologer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    currency: text("currency").notNull(),
    revision: financeRevisionString("revision").notNull(),
    mutationSequence: financeRevisionString("mutation_sequence").notNull(),
    pendingMinor: financeNumeric38String("pending_minor").notNull(),
    availableMinor: financeNumeric38String("available_minor").notNull(),
    reservedMinor: financeNumeric38String("reserved_minor").notNull(),
    payoutPendingMinor: financeNumeric38String("payout_pending_minor").notNull(),
    refundPendingMinor: financeNumeric38String("refund_pending_minor").notNull(),
    recoveryReceivableMinor: financeNumeric38String("recovery_receivable_minor").notNull(),
    lotStateVersion: financeRevisionString("lot_state_version").notNull(),
    lotStateDigest: varchar("lot_state_digest", { length: 71 }).notNull(),
    snapshotDigest: varchar("snapshot_digest", { length: 71 }).notNull(),
    lastOperationId: varchar("last_operation_id", { length: 200 }).notNull(),
    lastCommitBindingId: varchar("last_commit_binding_id", { length: 200 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("finance_wallet_heads_owner_currency_unique").on(table.astrologerUserId, table.currency),
    unique("finance_wallet_heads_exact_scope_unique").on(
      table.id,
      table.astrologerUserId,
      table.currency
    ),
    check("finance_wallet_heads_currency_check", sql`${table.currency} = 'RUB'`),
    check(
      "finance_wallet_heads_revision_check",
      sql`${table.revision} >= 1
        and ${table.mutationSequence} = ${table.revision}
        and ${table.lotStateVersion} = ${table.revision} + 1`
    ),
    check(
      "finance_wallet_heads_balance_check",
      sql`${table.pendingMinor} >= 0
        and ${table.availableMinor} >= 0
        and ${table.reservedMinor} >= 0
        and ${table.payoutPendingMinor} >= 0
        and ${table.refundPendingMinor} >= 0
        and ${table.recoveryReceivableMinor} >= 0`
    ),
    check(
      "finance_wallet_heads_digest_check",
      sql`${table.lotStateDigest} ~ ${digestSqlPattern} and ${table.snapshotDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_wallet_heads_identifier_check",
      identifierCheck(table.lastOperationId, table.lastCommitBindingId)
    ),
    index("finance_wallet_heads_owner_lookup_idx").on(
      table.astrologerUserId,
      table.currency,
      table.revision
    )
  ]
);

export const financePayableLotOperationReceipts = pgTable(
  "finance_payable_lot_operation_receipts",
  {
    receiptId: varchar("receipt_id", { length: 200 }).primaryKey(),
    schemaVersion: integer("schema_version").notNull(),
    verificationStatus: text("verification_status").notNull(),
    operationId: varchar("operation_id", { length: 200 }).notNull(),
    operationKind: text("operation_kind").notNull(),
    sourceIdentityId: uuid("source_identity_id")
      .notNull()
      .references(() => financeSourceIdentities.id, { onDelete: "restrict" }),
    walletId: uuid("wallet_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    currency: text("currency").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    previousLotStateVersion: financeRevisionString("previous_lot_state_version").notNull(),
    nextLotStateVersion: financeRevisionString("next_lot_state_version").notNull(),
    previousLotStateDigest: varchar("previous_lot_state_digest", { length: 71 }).notNull(),
    nextLotStateDigest: varchar("next_lot_state_digest", { length: 71 }).notNull(),
    historyRecordKind: text("history_record_kind").notNull(),
    historyRecordDigest: varchar("history_record_digest", { length: 71 }).notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    digestPurpose: text("digest_purpose").notNull(),
    mutationSequence: financeRevisionString("mutation_sequence").notNull(),
    authorityCount: integer("authority_count").notNull(),
    effectCount: integer("effect_count").notNull(),
    lineageCount: integer("lineage_count").notNull(),
    componentSlotCount: integer("component_slot_count").notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_payable_lot_operation_receipts_wallet_fk",
      columns: [table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financeWalletHeads.id,
        financeWalletHeads.astrologerUserId,
        financeWalletHeads.currency
      ]
    }).onDelete("restrict"),
    unique("finance_payable_lot_operation_receipts_operation_unique").on(table.operationId),
    unique("finance_payable_lot_operation_receipts_source_unique").on(table.sourceIdentityId),
    unique("finance_payable_lot_operation_receipts_exact_scope_unique").on(
      table.receiptId,
      table.walletId,
      table.astrologerUserId,
      table.currency
    ),
    check(
      "finance_payable_lot_operation_receipts_kind_check",
      sql`${table.operationKind} in ${sql.raw(formatFinanceSqlValues(walletHistoryKindValues))}
        and ${table.historyRecordKind} = ${table.operationKind}`
    ),
    check(
      "finance_payable_lot_operation_receipts_revision_check",
      sql`${table.previousLotStateVersion} >= 1
        and ${table.nextLotStateVersion} = ${table.previousLotStateVersion} + 1
        and ${table.mutationSequence} + 1 = ${table.nextLotStateVersion}`
    ),
    check(
      "finance_payable_lot_operation_receipts_digest_check",
      sql`${table.previousLotStateDigest} ~ ${digestSqlPattern}
        and ${table.nextLotStateDigest} ~ ${digestSqlPattern}
        and ${table.historyRecordDigest} ~ ${digestSqlPattern}
        and ${table.canonicalDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_payable_lot_operation_receipts_verified_check",
      sql`${table.schemaVersion} = 1
        and ${table.verificationStatus} = 'verified_by_persistence'
        and ${table.digestPurpose} = 'drift_detection_only'
        and ${table.currency} = 'RUB'`
    ),
    check(
      "finance_payable_lot_operation_receipts_count_check",
      sql`${table.authorityCount} >= 1
        and ${table.effectCount} >= 0
        and ${table.lineageCount} >= 0
        and ${table.componentSlotCount} = ${table.effectCount}`
    ),
    check(
      "finance_payable_lot_operation_receipts_time_check",
      sql`${table.committedAt} >= ${table.occurredAt}`
    ),
    check(
      "finance_payable_lot_operation_receipts_identifier_check",
      identifierCheck(table.receiptId, table.operationId)
    ),
    index("finance_payable_lot_operation_receipts_wallet_history_idx").on(
      table.walletId,
      table.mutationSequence,
      table.receiptId
    )
  ]
);

export const financePayableLots = pgTable(
  "finance_payable_lots",
  {
    lotId: varchar("lot_id", { length: 200 }).primaryKey(),
    walletId: uuid("wallet_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    currency: text("currency").notNull(),
    rootLotId: varchar("root_lot_id", { length: 200 }).notNull(),
    parentLotId: varchar("parent_lot_id", { length: 200 }),
    lineageDepth: integer("lineage_depth").notNull(),
    originalSaleId: varchar("original_sale_id", { length: 200 }).notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    bucket: text("bucket").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    becameAvailableAt: timestamp("became_available_at", { withTimezone: true }),
    createdByOperationId: varchar("created_by_operation_id", { length: 200 }).notNull(),
    createdByReceiptId: varchar("created_by_receipt_id", { length: 200 }).notNull(),
    createdEffectId: varchar("created_effect_id", { length: 200 }),
    componentSlotId: varchar("component_slot_id", { length: 200 }),
    captureIntentId: varchar("capture_intent_id", { length: 160 }).notNull(),
    captureSessionId: varchar("capture_session_id", { length: 160 }).notNull(),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    canonicalCaptureEvidenceId: varchar("canonical_capture_evidence_id", {
      length: 160
    }).notNull(),
    captureAmountMinor: financeNumeric38String("capture_amount_minor").notNull(),
    captureCurrency: text("capture_currency").notNull(),
    captureEvidenceAuthorityKind: text("capture_evidence_authority_kind").notNull(),
    captureEvidenceAuthorityId: varchar("capture_evidence_authority_id", {
      length: 160
    }).notNull(),
    captureEvidenceArtifactId: varchar("capture_evidence_artifact_id", {
      length: 160
    }).notNull(),
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
    payoutRequestId: varchar("payout_request_id", { length: 160 }),
    payoutAllocationId: varchar("payout_allocation_id", { length: 200 }),
    refundId: varchar("refund_id", { length: 160 })
  },
  (table) => [
    foreignKey({
      name: "finance_payable_lots_wallet_fk",
      columns: [table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financeWalletHeads.id,
        financeWalletHeads.astrologerUserId,
        financeWalletHeads.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_payable_lots_parent_fk",
      columns: [table.parentLotId, table.walletId],
      foreignColumns: [table.lotId, table.walletId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_payable_lots_root_fk",
      columns: [table.rootLotId, table.walletId],
      foreignColumns: [table.lotId, table.walletId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_payable_lots_provider_identity_fk",
      columns: [
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion
      ],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_payable_lots_operation_receipt_fk",
      columns: [table.createdByReceiptId, table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financePayableLotOperationReceipts.receiptId,
        financePayableLotOperationReceipts.walletId,
        financePayableLotOperationReceipts.astrologerUserId,
        financePayableLotOperationReceipts.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_payable_lots_capture_fact_fk",
      columns: [
        table.canonicalCaptureEvidenceId,
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
      name: "finance_payable_lots_economics_snapshot_fk",
      columns: [table.originalSaleId, table.economicsSnapshotDigest],
      foreignColumns: [
        financeOrderEconomicsSnapshots.orderId,
        financeOrderEconomicsSnapshots.canonicalDigest
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_payable_lots_risk_policy_fk",
      columns: [table.riskPolicyId, table.riskPolicyVersion, table.riskPolicyDigest],
      foreignColumns: [
        financeRiskPolicyVersions.policyId,
        financeRiskPolicyVersions.policyVersion,
        financeRiskPolicyVersions.canonicalDigest
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_payable_lots_fulfillment_decision_fk",
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
    unique("finance_payable_lots_exact_wallet_unique").on(table.lotId, table.walletId),
    uniqueIndex("finance_payable_lots_creation_effect_unique")
      .on(table.createdEffectId)
      .where(sql`${table.createdEffectId} is not null`),
    uniqueIndex("finance_payable_lots_component_slot_unique")
      .on(table.componentSlotId)
      .where(sql`${table.componentSlotId} is not null`),
    check("finance_payable_lots_amount_check", sql`${table.amountMinor} > 0`),
    check(
      "finance_payable_lots_bucket_currency_check",
      sql`${table.bucket} in ${sql.raw(formatFinanceSqlValues(payableLotBucketValues))}
        and ${table.currency} = 'RUB'
        and ${table.captureCurrency} = ${table.currency}
        and ${table.captureAmountMinor} >= ${table.amountMinor}
        and ${table.captureEvidenceAuthorityKind} in ('provider_operation_result', 'provider_semantic_fact')`
    ),
    check(
      "finance_payable_lots_lineage_shape_check",
      sql`(
        ${table.lineageDepth} = 0
        and ${table.rootLotId} = ${table.lotId}
        and ${table.parentLotId} is null
      ) or (
        ${table.lineageDepth} > 0
        and ${table.rootLotId} <> ${table.lotId}
        and ${table.parentLotId} is not null
        and ${table.parentLotId} <> ${table.lotId}
      )`
    ),
    check(
      "finance_payable_lots_creation_effect_shape_check",
      sql`(${table.createdEffectId} is null) = (${table.componentSlotId} is null)
        and (${table.parentLotId} is not null or ${table.createdEffectId} is not null)`
    ),
    check(
      "finance_payable_lots_time_check",
      sql`${table.createdAt} >= ${table.capturedAt}
        and (${table.becameAvailableAt} is null or ${table.becameAvailableAt} between ${table.capturedAt} and ${table.createdAt})
        and (${table.bucket} <> 'available' or ${table.becameAvailableAt} is not null)`
    ),
    check(
      "finance_payable_lots_digest_check",
      sql`${table.economicsSnapshotDigest} ~ ${digestSqlPattern}
        and ${table.captureEvidenceArtifactDigest} ~ ${digestSqlPattern}
        and ${table.riskPolicyDigest} ~ ${digestSqlPattern}
        and ${table.fulfillmentDecisionDigest} ~ ${digestSqlPattern}
        and ${table.riskPolicyVersion} >= 1
        and ${table.fulfillmentDecisionVersion} >= 1
        and ${table.providerIdentityVersion} >= 1`
    ),
    check(
      "finance_payable_lots_optional_link_shape_check",
      sql`(${table.payoutRequestId} is null and ${table.payoutAllocationId} is null)
        or (${table.payoutRequestId} is not null and ${table.payoutAllocationId} is not null)`
    ),
    check(
      "finance_payable_lots_identifier_check",
      identifierCheck(
        table.lotId,
        table.rootLotId,
        table.originalSaleId,
        table.createdByOperationId,
        table.createdByReceiptId,
        table.captureIntentId,
        table.captureSessionId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerPaymentId,
        table.canonicalCaptureEvidenceId,
        table.captureEvidenceAuthorityId,
        table.captureEvidenceArtifactId,
        table.riskPolicyId,
        table.fulfillmentDecisionId
      )
    ),
    check(
      "finance_payable_lots_optional_identifier_check",
      nullableIdentifierCheck(
        table.parentLotId,
        table.createdEffectId,
        table.componentSlotId,
        table.payoutRequestId,
        table.payoutAllocationId,
        table.refundId
      )
    ),
    index("finance_payable_lots_spendable_idx").on(
      table.walletId,
      table.bucket,
      table.originalSaleId,
      table.lotId
    ),
    index("finance_payable_lots_hold_release_idx").on(
      table.bucket,
      table.capturedAt,
      table.walletId,
      table.lotId
    )
  ]
);

export const financePayableLotOperationAuthorityBindings = pgTable(
  "finance_payable_lot_operation_authority_bindings",
  {
    receiptId: varchar("receipt_id", { length: 200 })
      .notNull()
      .references(() => financePayableLotOperationReceipts.receiptId, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    authorityKind: varchar("authority_kind", { length: 160 }).notNull(),
    authorityId: varchar("authority_id", { length: 200 }).notNull(),
    authorityVersion: financeRevisionString("authority_version").notNull(),
    evidenceId: varchar("evidence_id", { length: 200 }),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      name: "finance_payable_lot_operation_authority_bindings_pk",
      columns: [table.receiptId, table.ordinal]
    }),
    unique("finance_payable_lot_operation_authority_bindings_exact_unique").on(
      table.receiptId,
      table.authorityKind,
      table.authorityId,
      table.authorityVersion
    ),
    check(
      "finance_payable_lot_operation_authority_bindings_shape_check",
      sql`${table.ordinal} >= 0
        and ${table.authorityVersion} >= 1
        and ${table.authorityKind} in ${sql.raw(formatFinanceSqlValues(lotAuthorityKindValues))}
        and ${table.canonicalDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_lot_operation_authority_identifier_check",
      identifierCheck(table.receiptId, table.authorityKind, table.authorityId)
    ),
    check(
      "finance_lot_operation_authority_optional_id_check",
      nullableIdentifierCheck(table.evidenceId)
    )
  ]
);

export const financePayableLotOperationEffects = pgTable(
  "finance_payable_lot_operation_effects",
  {
    receiptId: varchar("receipt_id", { length: 200 })
      .notNull()
      .references(() => financePayableLotOperationReceipts.receiptId, { onDelete: "restrict" }),
    effectId: varchar("effect_id", { length: 200 }).notNull(),
    lotAllocationId: varchar("lot_allocation_id", { length: 200 }).notNull(),
    bucket: text("bucket").notNull(),
    side: text("side").notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    originalSaleId: varchar("original_sale_id", { length: 200 }).notNull(),
    rootLotId: varchar("root_lot_id", { length: 200 }).notNull(),
    payableLotId: varchar("payable_lot_id", { length: 200 }).notNull(),
    payoutAllocationId: varchar("payout_allocation_id", { length: 200 }),
    componentSlotId: varchar("component_slot_id", { length: 200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_payable_lot_operation_effects_root_fk",
      columns: [table.rootLotId],
      foreignColumns: [financePayableLots.lotId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_payable_lot_operation_effects_lot_fk",
      columns: [table.payableLotId],
      foreignColumns: [financePayableLots.lotId]
    }).onDelete("restrict"),
    unique("finance_payable_lot_operation_effects_receipt_effect_unique").on(
      table.receiptId,
      table.effectId
    ),
    uniqueIndex("finance_payable_lot_operation_effects_allocation_unique").on(
      table.lotAllocationId
    ),
    uniqueIndex("finance_payable_lot_operation_effects_component_slot_unique").on(
      table.componentSlotId
    ),
    check(
      "finance_payable_lot_operation_effects_shape_check",
      sql`${table.bucket} in ${sql.raw(formatFinanceSqlValues(walletLotBalanceBucketValues))}
        and ${table.side} in ${sql.raw(formatFinanceSqlValues(ledgerSideValues))}
        and ${table.amountMinor} > 0`
    ),
    check(
      "finance_payable_lot_operation_effects_identifier_check",
      identifierCheck(
        table.receiptId,
        table.effectId,
        table.lotAllocationId,
        table.originalSaleId,
        table.rootLotId,
        table.payableLotId,
        table.componentSlotId
      )
    ),
    check(
      "finance_payable_lot_operation_effects_optional_identifier_check",
      nullableIdentifierCheck(table.payoutAllocationId)
    )
  ]
);

export const financePayableLotOperationLineage = pgTable(
  "finance_payable_lot_operation_lineage",
  {
    receiptId: varchar("receipt_id", { length: 200 })
      .notNull()
      .references(() => financePayableLotOperationReceipts.receiptId, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(),
    relation: text("relation").notNull(),
    lotId: varchar("lot_id", { length: 200 })
      .notNull()
      .references(() => financePayableLots.lotId, { onDelete: "restrict" }),
    rootLotId: varchar("root_lot_id", { length: 200 })
      .notNull()
      .references(() => financePayableLots.lotId, { onDelete: "restrict" }),
    parentLotId: varchar("parent_lot_id", { length: 200 }).references(
      () => financePayableLots.lotId,
      { onDelete: "restrict" }
    ),
    bucket: text("bucket"),
    amountMinor: financeNumeric38String("amount_minor"),
    economicEffectId: varchar("economic_effect_id", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      name: "finance_payable_lot_operation_lineage_pk",
      columns: [table.receiptId, table.ordinal]
    }),
    unique("finance_payable_lot_operation_lineage_exact_unique").on(
      table.receiptId,
      table.relation,
      table.lotId
    ),
    foreignKey({
      name: "finance_payable_lot_operation_lineage_effect_fk",
      columns: [table.receiptId, table.economicEffectId],
      foreignColumns: [
        financePayableLotOperationEffects.receiptId,
        financePayableLotOperationEffects.effectId
      ]
    }).onDelete("restrict"),
    check(
      "finance_payable_lot_operation_lineage_shape_check",
      sql`${table.ordinal} >= 0
        and ${table.relation} in ${sql.raw(formatFinanceSqlValues(lotTransitionRelationValues))}
        and (
          ${table.relation} = 'referenced'
          and ${table.bucket} is null
          and ${table.amountMinor} is null
          and ${table.economicEffectId} is null
          or ${table.relation} <> 'referenced'
          and ${table.bucket} in ${sql.raw(formatFinanceSqlValues(payableLotBucketValues))}
          and ${table.amountMinor} > 0
        )`
    ),
    check(
      "finance_payable_lot_operation_lineage_identifier_check",
      identifierCheck(table.receiptId, table.lotId, table.rootLotId)
    ),
    check(
      "finance_payable_lot_operation_lineage_optional_identifier_check",
      nullableIdentifierCheck(table.parentLotId, table.economicEffectId)
    )
  ]
);

export const financePayableLotOperationComponentSlots = pgTable(
  "finance_payable_lot_operation_component_slots",
  {
    slotId: varchar("slot_id", { length: 200 }).primaryKey(),
    receiptId: varchar("receipt_id", { length: 200 }).notNull(),
    effectId: varchar("effect_id", { length: 200 }).notNull(),
    field: text("field").notNull(),
    operationKind: text("operation_kind").notNull(),
    bucket: text("bucket").notNull(),
    side: text("side").notNull(),
    originalSaleId: varchar("original_sale_id", { length: 200 }).notNull(),
    rootLotId: varchar("root_lot_id", { length: 200 }).notNull(),
    payableLotId: varchar("payable_lot_id", { length: 200 }).notNull(),
    payoutAllocationId: varchar("payout_allocation_id", { length: 200 }),
    resolvedComponentId: varchar("resolved_component_id", { length: 200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_payable_lot_operation_component_slots_effect_fk",
      columns: [table.receiptId, table.effectId],
      foreignColumns: [
        financePayableLotOperationEffects.receiptId,
        financePayableLotOperationEffects.effectId
      ]
    }).onDelete("restrict"),
    unique("finance_payable_lot_operation_component_slots_effect_unique").on(
      table.receiptId,
      table.effectId
    ),
    check(
      "finance_payable_lot_operation_component_slots_shape_check",
      sql`${table.field} = 'componentId'
        and ${table.operationKind} in ${sql.raw(formatFinanceSqlValues(walletHistoryKindValues))}
        and ${table.bucket} in ${sql.raw(formatFinanceSqlValues(walletLotBalanceBucketValues))}
        and ${table.side} in ${sql.raw(formatFinanceSqlValues(ledgerSideValues))}`
    ),
    check(
      "finance_payable_lot_operation_component_slots_identifier_check",
      identifierCheck(
        table.slotId,
        table.receiptId,
        table.effectId,
        table.originalSaleId,
        table.rootLotId,
        table.payableLotId,
        table.resolvedComponentId
      )
    ),
    check(
      "finance_lot_operation_component_slot_optional_id_check",
      nullableIdentifierCheck(table.payoutAllocationId)
    )
  ]
);

export const financePayableLotTransitions = pgTable(
  "finance_payable_lot_transitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: varchar("receipt_id", { length: 200 })
      .notNull()
      .references(() => financePayableLotOperationReceipts.receiptId, { onDelete: "restrict" }),
    operationId: varchar("operation_id", { length: 200 }).notNull(),
    mutationSequence: financeRevisionString("mutation_sequence").notNull(),
    relation: text("relation").notNull(),
    lotId: varchar("lot_id", { length: 200 })
      .notNull()
      .references(() => financePayableLots.lotId, { onDelete: "restrict" }),
    rootLotId: varchar("root_lot_id", { length: 200 })
      .notNull()
      .references(() => financePayableLots.lotId, { onDelete: "restrict" }),
    parentLotId: varchar("parent_lot_id", { length: 200 }).references(
      () => financePayableLots.lotId,
      { onDelete: "restrict" }
    ),
    bucket: text("bucket"),
    amountMinor: financeNumeric38String("amount_minor"),
    economicEffectId: varchar("economic_effect_id", { length: 200 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull()
  },
  (table) => [
    foreignKey({
      name: "finance_payable_lot_transitions_lineage_fk",
      columns: [table.receiptId, table.relation, table.lotId],
      foreignColumns: [
        financePayableLotOperationLineage.receiptId,
        financePayableLotOperationLineage.relation,
        financePayableLotOperationLineage.lotId
      ]
    }).onDelete("restrict"),
    unique("finance_payable_lot_transitions_receipt_lot_relation_unique").on(
      table.receiptId,
      table.lotId,
      table.relation
    ),
    uniqueIndex("finance_payable_lot_transitions_one_creation_unique")
      .on(table.lotId)
      .where(sql`${table.relation} in ('root_created', 'created')`),
    uniqueIndex("finance_payable_lot_transitions_one_consumption_unique")
      .on(table.lotId)
      .where(sql`${table.relation} = 'consumed'`),
    check(
      "finance_payable_lot_transitions_shape_check",
      sql`${table.relation} in ${sql.raw(formatFinanceSqlValues(lotTransitionRelationValues))}
        and ${table.mutationSequence} >= 1
        and (
          ${table.relation} = 'referenced'
          and ${table.bucket} is null
          and ${table.amountMinor} is null
          and ${table.economicEffectId} is null
          or ${table.relation} <> 'referenced'
          and ${table.bucket} in ${sql.raw(formatFinanceSqlValues(payableLotBucketValues))}
          and ${table.amountMinor} > 0
        )`
    ),
    check(
      "finance_payable_lot_transitions_identifier_check",
      identifierCheck(table.receiptId, table.operationId, table.lotId, table.rootLotId)
    ),
    check(
      "finance_payable_lot_transitions_optional_identifier_check",
      nullableIdentifierCheck(table.parentLotId, table.economicEffectId)
    ),
    index("finance_payable_lot_transitions_spendable_history_idx").on(
      table.lotId,
      table.mutationSequence,
      table.relation,
      table.id
    )
  ]
);

export const financeWalletHistory = pgTable(
  "finance_wallet_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    currency: text("currency").notNull(),
    operationId: varchar("operation_id", { length: 200 }).notNull(),
    operationReceiptId: varchar("operation_receipt_id", { length: 200 }).notNull(),
    previousRevision: financeRevisionString("previous_revision").notNull(),
    nextRevision: financeRevisionString("next_revision").notNull(),
    mutationSequence: financeRevisionString("mutation_sequence").notNull(),
    previousPendingMinor: financeNumeric38String("previous_pending_minor").notNull(),
    nextPendingMinor: financeNumeric38String("next_pending_minor").notNull(),
    previousAvailableMinor: financeNumeric38String("previous_available_minor").notNull(),
    nextAvailableMinor: financeNumeric38String("next_available_minor").notNull(),
    previousReservedMinor: financeNumeric38String("previous_reserved_minor").notNull(),
    nextReservedMinor: financeNumeric38String("next_reserved_minor").notNull(),
    previousPayoutPendingMinor: financeNumeric38String("previous_payout_pending_minor").notNull(),
    nextPayoutPendingMinor: financeNumeric38String("next_payout_pending_minor").notNull(),
    previousRefundPendingMinor: financeNumeric38String("previous_refund_pending_minor").notNull(),
    nextRefundPendingMinor: financeNumeric38String("next_refund_pending_minor").notNull(),
    previousRecoveryReceivableMinor: financeNumeric38String(
      "previous_recovery_receivable_minor"
    ).notNull(),
    nextRecoveryReceivableMinor: financeNumeric38String("next_recovery_receivable_minor").notNull(),
    previousLotStateVersion: financeRevisionString("previous_lot_state_version").notNull(),
    nextLotStateVersion: financeRevisionString("next_lot_state_version").notNull(),
    previousLotStateDigest: varchar("previous_lot_state_digest", { length: 71 }).notNull(),
    nextLotStateDigest: varchar("next_lot_state_digest", { length: 71 }).notNull(),
    previousSnapshotDigest: varchar("previous_snapshot_digest", { length: 71 }).notNull(),
    nextSnapshotDigest: varchar("next_snapshot_digest", { length: 71 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_wallet_history_wallet_fk",
      columns: [table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financeWalletHeads.id,
        financeWalletHeads.astrologerUserId,
        financeWalletHeads.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_wallet_history_operation_receipt_fk",
      columns: [table.operationReceiptId, table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financePayableLotOperationReceipts.receiptId,
        financePayableLotOperationReceipts.walletId,
        financePayableLotOperationReceipts.astrologerUserId,
        financePayableLotOperationReceipts.currency
      ]
    }).onDelete("restrict"),
    unique("finance_wallet_history_wallet_revision_unique").on(table.walletId, table.nextRevision),
    unique("finance_wallet_history_operation_unique").on(table.operationId),
    unique("finance_wallet_history_receipt_unique").on(table.operationReceiptId),
    unique("finance_wallet_history_exact_scope_unique").on(
      table.id,
      table.walletId,
      table.astrologerUserId,
      table.currency
    ),
    check("finance_wallet_history_currency_check", sql`${table.currency} = 'RUB'`),
    check(
      "finance_wallet_history_revision_check",
      sql`${table.previousRevision} >= 0
        and ${table.nextRevision} = ${table.previousRevision} + 1
        and ${table.previousLotStateVersion} = ${table.previousRevision} + 1
        and ${table.nextLotStateVersion} = ${table.previousLotStateVersion} + 1
        and ${table.nextLotStateVersion} = ${table.nextRevision} + 1
        and ${table.mutationSequence} = ${table.nextRevision}`
    ),
    check(
      "finance_wallet_history_balance_check",
      sql`${table.previousPendingMinor} >= 0 and ${table.nextPendingMinor} >= 0
        and ${table.previousAvailableMinor} >= 0 and ${table.nextAvailableMinor} >= 0
        and ${table.previousReservedMinor} >= 0 and ${table.nextReservedMinor} >= 0
        and ${table.previousPayoutPendingMinor} >= 0 and ${table.nextPayoutPendingMinor} >= 0
        and ${table.previousRefundPendingMinor} >= 0 and ${table.nextRefundPendingMinor} >= 0
        and ${table.previousRecoveryReceivableMinor} >= 0 and ${table.nextRecoveryReceivableMinor} >= 0`
    ),
    check(
      "finance_wallet_history_digest_check",
      sql`${table.previousLotStateDigest} ~ ${digestSqlPattern}
        and ${table.nextLotStateDigest} ~ ${digestSqlPattern}
        and ${table.previousSnapshotDigest} ~ ${digestSqlPattern}
        and ${table.nextSnapshotDigest} ~ ${digestSqlPattern}`
    ),
    check("finance_wallet_history_time_check", sql`${table.committedAt} >= ${table.occurredAt}`),
    check(
      "finance_wallet_history_identifier_check",
      identifierCheck(table.operationId, table.operationReceiptId)
    ),
    index("finance_wallet_history_rebuild_idx").on(table.walletId, table.nextRevision, table.id)
  ]
);

export const financeWalletCommitBindings = pgTable(
  "finance_wallet_commit_bindings",
  {
    bindingId: varchar("binding_id", { length: 200 }).primaryKey(),
    schemaVersion: integer("schema_version").notNull(),
    walletHistoryId: uuid("wallet_history_id").notNull(),
    operationId: varchar("operation_id", { length: 200 }).notNull(),
    operationReceiptId: varchar("operation_receipt_id", { length: 200 }).notNull(),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }).notNull(),
    journalTransactionDigest: varchar("journal_transaction_digest", { length: 71 }).notNull(),
    journalPersistenceReceiptId: varchar("journal_persistence_receipt_id", {
      length: 200
    }).notNull(),
    journalLinkProofId: varchar("journal_link_proof_id", { length: 200 }).notNull(),
    journalLinkProofVersion: integer("journal_link_proof_version").notNull(),
    journalLinkProofDigest: varchar("journal_link_proof_digest", { length: 71 }).notNull(),
    operationSnapshotId: varchar("operation_snapshot_id", { length: 200 }).notNull(),
    operationSnapshotDigest: varchar("operation_snapshot_digest", { length: 71 }).notNull(),
    limitPolicyId: varchar("limit_policy_id", { length: 160 }).notNull(),
    limitPolicyVersion: financeRevisionString("limit_policy_version").notNull(),
    limitPolicyDigest: varchar("limit_policy_digest", { length: 71 }).notNull(),
    historyRecordDigest: varchar("history_record_digest", { length: 71 }).notNull(),
    previousLotStateDigest: varchar("previous_lot_state_digest", { length: 71 }).notNull(),
    nextLotStateDigest: varchar("next_lot_state_digest", { length: 71 }).notNull(),
    previousWalletId: uuid("previous_wallet_id").notNull(),
    nextWalletId: uuid("next_wallet_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    currency: text("currency").notNull(),
    previousWalletRevision: financeRevisionString("previous_wallet_revision").notNull(),
    nextWalletRevision: financeRevisionString("next_wallet_revision").notNull(),
    previousWalletSnapshotDigest: varchar("previous_wallet_snapshot_digest", {
      length: 71
    }).notNull(),
    nextWalletSnapshotDigest: varchar("next_wallet_snapshot_digest", { length: 71 }).notNull(),
    mutationSequence: financeRevisionString("mutation_sequence").notNull(),
    bindingDigest: varchar("binding_digest", { length: 71 }).notNull(),
    commitReceiptId: varchar("commit_receipt_id", { length: 200 })
      .notNull()
      .default(sql`gen_random_uuid()::text`),
    commitReceiptVersion: financeRevisionString("commit_receipt_version").notNull(),
    commitReceiptCanonicalPreimage: text("commit_receipt_canonical_preimage")
      .notNull()
      .default(sql`''`),
    commitReceiptCanonicalDigest: varchar("commit_receipt_canonical_digest", {
      length: 71
    })
      .notNull()
      .default(sql`''`),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    }).notNull(),
    boundAt: timestamp("bound_at", { withTimezone: true }).notNull().defaultNow(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_wallet_commit_bindings_history_fk",
      columns: [table.walletHistoryId, table.nextWalletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financeWalletHistory.id,
        financeWalletHistory.walletId,
        financeWalletHistory.astrologerUserId,
        financeWalletHistory.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_wallet_commit_bindings_journal_fk",
      columns: [table.journalTransactionId, table.journalTransactionDigest],
      foreignColumns: [financeJournalTransactions.id, financeJournalTransactions.canonicalDigest]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_wallet_commit_bindings_proof_fk",
      columns: [table.journalLinkProofId],
      foreignColumns: [financeAllocationLinkProofs.proofId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_wallet_commit_bindings_lot_receipt_fk",
      columns: [table.operationReceiptId],
      foreignColumns: [financePayableLotOperationReceipts.receiptId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_wallet_commit_bindings_journal_receipt_fk",
      columns: [table.journalPersistenceReceiptId],
      foreignColumns: [financePersistenceCommitReceipts.receiptId]
    }).onDelete("restrict"),
    unique("finance_wallet_commit_bindings_history_unique").on(table.walletHistoryId),
    unique("finance_wallet_commit_bindings_operation_unique").on(table.operationId),
    unique("finance_wallet_commit_bindings_receipt_unique").on(table.commitReceiptId),
    unique("finance_wallet_commit_bindings_exact_receipt_projection_unique").on(
      table.commitReceiptId,
      table.operationId,
      table.nextWalletId,
      table.nextWalletRevision,
      table.commitReceiptCanonicalDigest
    ),
    unique("finance_wallet_commit_bindings_lot_receipt_unique").on(table.operationReceiptId),
    unique("finance_wallet_commit_bindings_journal_unique").on(table.journalTransactionId),
    unique("finance_wallet_commit_bindings_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    check(
      "finance_wallet_commit_bindings_shape_check",
      sql`${table.schemaVersion} = 1
        and ${table.journalLinkProofVersion} = 1
        and ${table.previousWalletId} = ${table.nextWalletId}
        and ${table.currency} = 'RUB'
        and ${table.previousWalletRevision} >= 0
        and ${table.nextWalletRevision} = ${table.previousWalletRevision} + 1
        and ${table.mutationSequence} = ${table.nextWalletRevision}
        and ${table.commitReceiptVersion} = 1
        and ${table.limitPolicyVersion} >= 1
        and ${table.commitReceiptId} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'`
    ),
    check(
      "finance_wallet_commit_bindings_digest_check",
      sql`${table.journalTransactionDigest} ~ ${digestSqlPattern}
        and ${table.journalLinkProofDigest} ~ ${digestSqlPattern}
        and ${table.operationSnapshotDigest} ~ ${digestSqlPattern}
        and ${table.limitPolicyDigest} ~ ${digestSqlPattern}
        and ${table.historyRecordDigest} ~ ${digestSqlPattern}
        and ${table.previousLotStateDigest} ~ ${digestSqlPattern}
        and ${table.nextLotStateDigest} ~ ${digestSqlPattern}
        and ${table.previousWalletSnapshotDigest} ~ ${digestSqlPattern}
        and ${table.nextWalletSnapshotDigest} ~ ${digestSqlPattern}
        and ${table.bindingDigest} ~ ${digestSqlPattern}
        and ${table.commitReceiptCanonicalDigest} ~ ${digestSqlPattern}
        and length(${table.commitReceiptCanonicalPreimage}) between 1 and 8000`
    ),
    check("finance_wallet_commit_bindings_time_check", sql`${table.issuedAt} >= ${table.boundAt}`),
    check(
      "finance_wallet_commit_bindings_identifier_check",
      identifierCheck(
        table.bindingId,
        table.operationId,
        table.operationReceiptId,
        table.journalTransactionId,
        table.journalPersistenceReceiptId,
        table.journalLinkProofId,
        table.operationSnapshotId,
        table.limitPolicyId,
        table.commitReceiptId,
        table.persistenceTransactionBoundaryRef
      )
    ),
    index("finance_wallet_commit_bindings_wallet_revision_idx").on(
      table.nextWalletId,
      table.nextWalletRevision,
      table.bindingId
    )
  ]
);

/**
 * Immutable checkpoint proving which exact source-lot digest was committed at a wallet revision.
 *
 * This is deliberately a compact commitment, not a hydrated source-lot aggregate: online wallet
 * mutation remains bounded to locked normalized rows and a revision CAS. Reconciliation can use
 * the checkpoint to prove that the normalized receipt/history/binding graph agrees with a head.
 */
export const financeWalletLotStateSnapshots = pgTable(
  "finance_wallet_lot_state_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    currency: text("currency").notNull(),
    walletRevision: financeRevisionString("wallet_revision").notNull(),
    lotStateVersion: financeRevisionString("lot_state_version").notNull(),
    lotStateDigest: varchar("lot_state_digest", { length: 71 }).notNull(),
    walletHistoryId: uuid("wallet_history_id").notNull(),
    operationReceiptId: varchar("operation_receipt_id", { length: 200 }).notNull(),
    commitBindingId: varchar("commit_binding_id", { length: 200 }).notNull(),
    commitReceiptId: varchar("commit_receipt_id", { length: 200 }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_wallet_lot_state_snapshots_history_fk",
      columns: [table.walletHistoryId, table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financeWalletHistory.id,
        financeWalletHistory.walletId,
        financeWalletHistory.astrologerUserId,
        financeWalletHistory.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_wallet_lot_state_snapshots_receipt_fk",
      columns: [table.operationReceiptId, table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financePayableLotOperationReceipts.receiptId,
        financePayableLotOperationReceipts.walletId,
        financePayableLotOperationReceipts.astrologerUserId,
        financePayableLotOperationReceipts.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_wallet_lot_state_snapshots_binding_fk",
      columns: [table.commitBindingId],
      foreignColumns: [financeWalletCommitBindings.bindingId]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_wallet_lot_state_snapshots_commit_receipt_fk",
      columns: [table.commitReceiptId],
      foreignColumns: [financeWalletCommitBindings.commitReceiptId]
    }).onDelete("restrict"),
    unique("finance_wallet_lot_state_snapshots_wallet_revision_unique").on(
      table.walletId,
      table.walletRevision
    ),
    unique("finance_wallet_lot_state_snapshots_history_unique").on(table.walletHistoryId),
    unique("finance_wallet_lot_state_snapshots_receipt_unique").on(table.operationReceiptId),
    unique("finance_wallet_lot_state_snapshots_binding_unique").on(table.commitBindingId),
    unique("finance_wallet_lot_state_snapshots_commit_receipt_unique").on(table.commitReceiptId),
    check("finance_wallet_lot_state_snapshots_currency_check", sql`${table.currency} = 'RUB'`),
    check(
      "finance_wallet_lot_state_snapshots_revision_check",
      sql`${table.walletRevision} >= 1 and ${table.lotStateVersion} = ${table.walletRevision} + 1`
    ),
    check(
      "finance_wallet_lot_state_snapshots_digest_check",
      sql`${table.lotStateDigest} ~ ${digestSqlPattern}`
    ),
    check(
      "finance_wallet_lot_state_snapshots_identifier_check",
      identifierCheck(table.operationReceiptId, table.commitBindingId, table.commitReceiptId)
    ),
    index("finance_wallet_lot_state_snapshots_wallet_lookup_idx").on(
      table.walletId,
      table.walletRevision,
      table.lotStateDigest
    )
  ]
);

/**
 * Database-issued bounded-operation chain for online serialization. This does not replace the
 * source-lot full-state digest: that digest remains an offline reconciliation oracle. The chain
 * commits only one predecessor, exact receipt graph and commit binding per wallet revision.
 */
export const financeWalletLotCommitmentChain = pgTable(
  "finance_wallet_lot_commitment_chain",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    currency: text("currency").notNull(),
    walletRevision: financeRevisionString("wallet_revision").notNull(),
    walletHistoryId: uuid("wallet_history_id").notNull(),
    operationReceiptId: varchar("operation_receipt_id", { length: 200 }).notNull(),
    operationReceiptDigest: varchar("operation_receipt_digest", { length: 71 }).notNull(),
    commitBindingId: varchar("commit_binding_id", { length: 200 }).notNull(),
    commitBindingDigest: varchar("commit_binding_digest", { length: 71 }).notNull(),
    previousCommitmentDigest: varchar("previous_commitment_digest", { length: 71 }),
    commitmentCanonicalPreimage: text("commitment_canonical_preimage")
      .notNull()
      .default(sql`''`),
    commitmentDigest: varchar("commitment_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      name: "finance_wallet_lot_commitment_chain_history_fk",
      columns: [table.walletHistoryId, table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financeWalletHistory.id,
        financeWalletHistory.walletId,
        financeWalletHistory.astrologerUserId,
        financeWalletHistory.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_wallet_lot_commitment_chain_receipt_fk",
      columns: [table.operationReceiptId, table.walletId, table.astrologerUserId, table.currency],
      foreignColumns: [
        financePayableLotOperationReceipts.receiptId,
        financePayableLotOperationReceipts.walletId,
        financePayableLotOperationReceipts.astrologerUserId,
        financePayableLotOperationReceipts.currency
      ]
    }).onDelete("restrict"),
    foreignKey({
      name: "finance_wallet_lot_commitment_chain_binding_fk",
      columns: [table.commitBindingId],
      foreignColumns: [financeWalletCommitBindings.bindingId]
    }).onDelete("restrict"),
    unique("finance_wallet_lot_commitment_chain_wallet_revision_unique").on(
      table.walletId,
      table.walletRevision
    ),
    unique("finance_wallet_lot_commitment_chain_history_unique").on(table.walletHistoryId),
    unique("finance_wallet_lot_commitment_chain_receipt_unique").on(table.operationReceiptId),
    unique("finance_wallet_lot_commitment_chain_binding_unique").on(table.commitBindingId),
    check("finance_wallet_lot_commitment_chain_currency_check", sql`${table.currency} = 'RUB'`),
    check("finance_wallet_lot_commitment_chain_revision_check", sql`${table.walletRevision} >= 1`),
    check(
      "finance_wallet_lot_commitment_chain_digest_check",
      sql`${table.operationReceiptDigest} ~ ${digestSqlPattern}
        and ${table.commitBindingDigest} ~ ${digestSqlPattern}
        and (${table.previousCommitmentDigest} is null or ${table.previousCommitmentDigest} ~ ${digestSqlPattern})
        and ${table.commitmentDigest} ~ ${digestSqlPattern}
        and length(${table.commitmentCanonicalPreimage}) between 1 and 8000`
    ),
    check(
      "finance_wallet_lot_commitment_chain_identifier_check",
      identifierCheck(table.operationReceiptId, table.commitBindingId)
    ),
    index("finance_wallet_lot_commitment_chain_wallet_lookup_idx").on(
      table.walletId,
      table.walletRevision,
      table.commitmentDigest
    )
  ]
);

/** Baseline owner executes this DDL after all normalized wallet and journal tables exist. */
export const financeWalletIntegritySql = `
create or replace function finance_reject_wallet_history_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'normalized wallet history is append-only' using errcode = '55000';
end;
$$;

create or replace function finance_protect_wallet_head_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'finance wallet heads cannot be deleted' using errcode = '55000';
  end if;
  new.updated_at := clock_timestamp();
  if tg_op = 'INSERT' then
    if new.revision <> 1 or new.mutation_sequence <> 1 or new.lot_state_version <> 2 then
      raise exception 'wallet head must start at revision one' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.id <> old.id
     or new.astrologer_user_id <> old.astrologer_user_id
     or new.currency <> old.currency then
    raise exception 'wallet head identity is immutable' using errcode = '55000';
  end if;
  if new.revision <> old.revision + 1
     or new.mutation_sequence <> old.mutation_sequence + 1
     or new.lot_state_version <> old.lot_state_version + 1 then
    raise exception 'wallet head revision and mutation sequence must advance by one' using errcode = '40001';
  end if;
  return new;
end;
$$;

create trigger finance_wallet_heads_protected_mutation
before insert or update or delete on finance_wallet_heads
for each row execute function finance_protect_wallet_head_mutation();

create or replace function finance_issue_wallet_persistence_times()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_table_name = 'finance_payable_lot_operation_receipts' then
    new.committed_at := clock_timestamp();
  elsif tg_table_name = 'finance_wallet_history' then
    new.committed_at := clock_timestamp();
  elsif tg_table_name = 'finance_wallet_commit_bindings' then
    new.bound_at := clock_timestamp();
    new.issued_at := new.bound_at;
    new.commit_receipt_canonical_preimage := jsonb_build_object(
      'kind', 'verified_wallet_operation_commit_receipt',
      'schemaVersion', 1,
      'receiptId', new.commit_receipt_id,
      'version', new.commit_receipt_version::text,
      'bindingRecordId', new.binding_id,
      'bindingDigest', new.binding_digest,
      'payableLotOperationReceiptId', new.operation_receipt_id,
      'payableLotOperationReceiptDigest', (
        select receipt.canonical_digest
        from finance_payable_lot_operation_receipts receipt
        where receipt.receipt_id = new.operation_receipt_id
      ),
      'historyRecordDigest', new.history_record_digest,
      'journalTransactionId', new.journal_transaction_id,
      'journalTransactionDigest', new.journal_transaction_digest,
      'journalPersistenceReceiptId', new.journal_persistence_receipt_id,
      'journalPersistenceReceiptDigest', (
        select receipt.canonical_digest
        from finance_persistence_commit_receipts receipt
        where receipt.receipt_id = new.journal_persistence_receipt_id
      ),
      'financeJournalLinkProofId', new.journal_link_proof_id,
      'financeJournalLinkProofVersion', new.journal_link_proof_version,
      'financeJournalLinkProofDigest', new.journal_link_proof_digest,
      'walletId', new.next_wallet_id,
      'previousWalletRevision', new.previous_wallet_revision::text,
      'nextWalletRevision', new.next_wallet_revision::text,
      'mutationSequence', new.mutation_sequence::text,
      'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
      'issuedAt', to_char(new.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    )::text;
    new.commit_receipt_canonical_digest := 'sha256:' || encode(
      digest(new.commit_receipt_canonical_preimage, 'sha256'),
      'hex'
    );
  end if;
  return new;
end;
$$;

create trigger finance_payable_lot_operation_receipts_issue_time
before insert on finance_payable_lot_operation_receipts
for each row execute function finance_issue_wallet_persistence_times();
create trigger finance_wallet_history_issue_time
before insert on finance_wallet_history
for each row execute function finance_issue_wallet_persistence_times();
create trigger finance_wallet_commit_bindings_00_issue_time
before insert on finance_wallet_commit_bindings
for each row execute function finance_issue_wallet_persistence_times();

comment on column finance_wallet_commit_bindings.commit_receipt_canonical_digest
is 'wallet commit receipt digest is database-issued';

create or replace function finance_assert_payable_lot_lineage()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  parent_row finance_payable_lots%rowtype;
  root_row finance_payable_lots%rowtype;
begin
  if new.lineage_depth = 0 then
    if new.root_lot_id <> new.lot_id or new.parent_lot_id is not null then
      raise exception 'payable lot lineage must resolve to one bounded root tree' using errcode = '23514';
    end if;
  else
    select * into strict parent_row from finance_payable_lots
      where lot_id = new.parent_lot_id and wallet_id = new.wallet_id;
    select * into strict root_row from finance_payable_lots
      where lot_id = new.root_lot_id and wallet_id = new.wallet_id and lineage_depth = 0;
    if parent_row.root_lot_id <> new.root_lot_id
       or parent_row.lineage_depth + 1 <> new.lineage_depth
       or parent_row.astrologer_user_id <> new.astrologer_user_id
       or parent_row.currency <> new.currency
       or root_row.root_lot_id <> root_row.lot_id then
      raise exception 'payable lot lineage must resolve to one bounded root tree' using errcode = '23514';
    end if;
    if new.original_sale_id <> parent_row.original_sale_id
       or new.captured_at <> parent_row.captured_at
       or new.created_at < parent_row.created_at
       or new.capture_intent_id <> parent_row.capture_intent_id
       or new.capture_session_id <> parent_row.capture_session_id
       or new.provider_account_series_id <> parent_row.provider_account_series_id
       or new.provider_account_id <> parent_row.provider_account_id
       or new.provider_identity_version <> parent_row.provider_identity_version
       or new.provider_payment_id <> parent_row.provider_payment_id
       or new.canonical_capture_evidence_id <> parent_row.canonical_capture_evidence_id
       or new.capture_amount_minor <> parent_row.capture_amount_minor
       or new.capture_currency <> parent_row.capture_currency
       or new.capture_evidence_authority_kind <> parent_row.capture_evidence_authority_kind
       or new.capture_evidence_authority_id <> parent_row.capture_evidence_authority_id
       or new.capture_evidence_artifact_id <> parent_row.capture_evidence_artifact_id
       or new.capture_evidence_artifact_digest <> parent_row.capture_evidence_artifact_digest
       or new.economics_snapshot_digest <> parent_row.economics_snapshot_digest
       or new.risk_policy_id <> parent_row.risk_policy_id
       or new.risk_policy_version <> parent_row.risk_policy_version
       or new.risk_policy_digest <> parent_row.risk_policy_digest
       or new.fulfillment_decision_id <> parent_row.fulfillment_decision_id
       or new.fulfillment_decision_version <> parent_row.fulfillment_decision_version
       or new.fulfillment_decision_digest <> parent_row.fulfillment_decision_digest then
      raise exception 'payable lot child does not preserve immutable capture provenance' using errcode = '23514';
    end if;
  end if;
  if not exists (
    select 1
    from finance_payable_lot_transitions transition_row
    where transition_row.lot_id = new.lot_id
      and transition_row.receipt_id = new.created_by_receipt_id
      and transition_row.operation_id = new.created_by_operation_id
      and transition_row.relation = case when new.lineage_depth = 0 then 'root_created' else 'created' end
      and transition_row.root_lot_id = new.root_lot_id
      and transition_row.parent_lot_id is not distinct from new.parent_lot_id
      and transition_row.bucket = new.bucket
      and transition_row.amount_minor = new.amount_minor
      and transition_row.economic_effect_id is not distinct from new.created_effect_id
      and transition_row.occurred_at = new.created_at
  ) then
    raise exception 'payable lot must have exactly one creation edge' using errcode = '23514';
  end if;

  if new.created_effect_id is null then
    if new.parent_lot_id is null
       or parent_row.bucket <> new.bucket
       or new.amount_minor >= parent_row.amount_minor
       or (
         select count(*)
         from finance_payable_lots remainder
         where remainder.parent_lot_id = new.parent_lot_id
           and remainder.created_by_receipt_id = new.created_by_receipt_id
           and remainder.created_effect_id is null
       ) <> 1
       or not exists (
         select 1
         from finance_payable_lot_transitions consumed
         join finance_payable_lot_operation_effects debit_effect
           on debit_effect.receipt_id = consumed.receipt_id
          and debit_effect.effect_id = consumed.economic_effect_id
         where consumed.receipt_id = new.created_by_receipt_id
           and consumed.operation_id = new.created_by_operation_id
           and consumed.relation = 'consumed'
           and consumed.lot_id = new.parent_lot_id
           and consumed.root_lot_id = new.root_lot_id
           and consumed.bucket = parent_row.bucket
           and consumed.amount_minor = parent_row.amount_minor
           and debit_effect.side = 'debit'
           and debit_effect.bucket = parent_row.bucket
           and debit_effect.amount_minor = parent_row.amount_minor - new.amount_minor
           and debit_effect.original_sale_id = parent_row.original_sale_id
           and debit_effect.root_lot_id = parent_row.root_lot_id
           and debit_effect.payable_lot_id = parent_row.lot_id
       ) then
      raise exception 'structural remainder must consume its same-bucket parent' using errcode = '23514';
    end if;
  elsif not exists (
    select 1
    from finance_payable_lot_operation_effects creation_effect
    join finance_payable_lot_operation_component_slots component_slot
      on component_slot.slot_id = new.component_slot_id
     and component_slot.receipt_id = creation_effect.receipt_id
     and component_slot.effect_id = creation_effect.effect_id
    join finance_payable_lot_operation_receipts operation_receipt
      on operation_receipt.receipt_id = creation_effect.receipt_id
    where creation_effect.receipt_id = new.created_by_receipt_id
      and creation_effect.effect_id = new.created_effect_id
      and creation_effect.component_slot_id = new.component_slot_id
      and creation_effect.side = 'credit'
      and creation_effect.bucket = new.bucket
      and creation_effect.amount_minor = new.amount_minor
      and creation_effect.original_sale_id = new.original_sale_id
      and creation_effect.root_lot_id = new.root_lot_id
      and creation_effect.payable_lot_id = new.lot_id
      and component_slot.operation_kind = operation_receipt.operation_kind
      and component_slot.bucket = creation_effect.bucket
      and component_slot.side = creation_effect.side
      and component_slot.original_sale_id = creation_effect.original_sale_id
      and component_slot.root_lot_id = creation_effect.root_lot_id
      and component_slot.payable_lot_id = creation_effect.payable_lot_id
      and component_slot.payout_allocation_id is not distinct from creation_effect.payout_allocation_id
  ) then
    raise exception 'payable lot creation effect is missing or cross-wired' using errcode = '23514';
  end if;
  return null;
exception
  when no_data_found or too_many_rows then
    raise exception 'payable lot lineage must resolve to one bounded root tree' using errcode = '23514';
end;
$$;

create constraint trigger finance_payable_lots_lineage_integrity
after insert on finance_payable_lots
deferrable initially deferred for each row
execute function finance_assert_payable_lot_lineage();

create or replace function finance_assert_payable_lot_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  receipt_row finance_payable_lot_operation_receipts%rowtype;
  lot_row finance_payable_lots%rowtype;
  structural_remainder_minor numeric(38, 0);
begin
  select * into strict receipt_row from finance_payable_lot_operation_receipts
    where receipt_id = new.receipt_id;
  select * into strict lot_row from finance_payable_lots where lot_id = new.lot_id;
  if new.operation_id <> receipt_row.operation_id
     or new.mutation_sequence <> receipt_row.mutation_sequence
     or new.occurred_at <> receipt_row.occurred_at
     or new.root_lot_id <> lot_row.root_lot_id
     or (new.relation <> 'referenced' and (
       new.parent_lot_id is distinct from lot_row.parent_lot_id
       or new.bucket <> lot_row.bucket
       or new.amount_minor <> lot_row.amount_minor
     )) then
    raise exception 'payable lot transition does not mirror its receipt and immutable lot' using errcode = '23514';
  end if;

  if new.relation in ('root_created', 'created') and (
    new.receipt_id <> lot_row.created_by_receipt_id
    or new.operation_id <> lot_row.created_by_operation_id
    or new.occurred_at <> lot_row.created_at
    or new.economic_effect_id is distinct from lot_row.created_effect_id
    or new.relation <> case when lot_row.parent_lot_id is null then 'root_created' else 'created' end
  ) then
    raise exception 'payable lot creation transition is not authoritative' using errcode = '23514';
  end if;

  if new.relation = 'consumed' then
    select coalesce(sum(remainder.amount_minor), 0)
      into structural_remainder_minor
    from finance_payable_lots remainder
    where remainder.parent_lot_id = lot_row.lot_id
      and remainder.created_by_receipt_id = new.receipt_id
      and remainder.created_effect_id is null;
    if new.receipt_id = lot_row.created_by_receipt_id
       or new.occurred_at < lot_row.created_at
       or new.economic_effect_id is null
       or structural_remainder_minor >= lot_row.amount_minor
       or not exists (
         select 1
         from finance_payable_lot_operation_effects debit_effect
         where debit_effect.receipt_id = new.receipt_id
           and debit_effect.effect_id = new.economic_effect_id
           and debit_effect.side = 'debit'
           and debit_effect.bucket = lot_row.bucket
           and debit_effect.amount_minor = lot_row.amount_minor - structural_remainder_minor
           and debit_effect.original_sale_id = lot_row.original_sale_id
           and debit_effect.root_lot_id = lot_row.root_lot_id
           and debit_effect.payable_lot_id = lot_row.lot_id
       )
       or (
         select count(*) from finance_payable_lot_transitions
         where lot_id = new.lot_id and relation = 'consumed'
       ) <> 1 then
      raise exception 'payable lot consumption is globally exclusive' using errcode = '23514';
    end if;
  end if;

  if new.relation = 'referenced' and (
    new.parent_lot_id is not null
    or new.bucket is not null
    or new.amount_minor is not null
    or new.economic_effect_id is not null
    or (
      select count(*)
      from finance_payable_lots child
      where child.parent_lot_id = lot_row.lot_id
        and child.created_by_receipt_id = new.receipt_id
        and child.root_lot_id = lot_row.root_lot_id
        and child.created_effect_id is not null
    ) <> 1
  ) then
    raise exception 'referenced payable lot must authorize exactly one created child' using errcode = '23514';
  end if;
  return null;
exception
  when no_data_found or too_many_rows then
    raise exception 'payable lot transition graph is incomplete' using errcode = '23514';
end;
$$;

create constraint trigger finance_payable_lot_transition_integrity
after insert on finance_payable_lot_transitions
deferrable initially deferred for each row
execute function finance_assert_payable_lot_transition();

create or replace function finance_assert_lot_receipt_graph()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if exists (
    select 1
    from finance_payable_lot_operation_effects effect
    left join finance_payable_lot_operation_component_slots slot
      on slot.receipt_id = effect.receipt_id
     and slot.effect_id = effect.effect_id
    where effect.receipt_id = new.receipt_id
      and (
        slot.slot_id is null
        or slot.slot_id <> effect.component_slot_id
        or slot.operation_kind <> new.operation_kind
        or slot.bucket <> effect.bucket
        or slot.side <> effect.side
        or slot.original_sale_id <> effect.original_sale_id
        or slot.root_lot_id <> effect.root_lot_id
        or slot.payable_lot_id <> effect.payable_lot_id
        or slot.payout_allocation_id is distinct from effect.payout_allocation_id
      )
  ) then
    raise exception 'payable lot component slot is missing or cross-wired' using errcode = '23514';
  end if;

  if (select count(*) from finance_payable_lot_operation_authority_bindings where receipt_id = new.receipt_id) <> new.authority_count
     or (select count(*) from finance_payable_lot_operation_effects where receipt_id = new.receipt_id) <> new.effect_count
     or (select count(*) from finance_payable_lot_operation_lineage where receipt_id = new.receipt_id) <> new.lineage_count
     or (select count(*) from finance_payable_lot_operation_component_slots where receipt_id = new.receipt_id) <> new.component_slot_count
     or not exists (
       select 1 from finance_wallet_history history where history.operation_receipt_id = new.receipt_id
     )
     or exists (
       select 1 from finance_payable_lot_operation_lineage lineage
       left join finance_payable_lot_transitions transition_row
         on transition_row.receipt_id = lineage.receipt_id
        and transition_row.relation = lineage.relation
        and transition_row.lot_id = lineage.lot_id
       where lineage.receipt_id = new.receipt_id
         and (
           transition_row.id is null
           or transition_row.root_lot_id is distinct from lineage.root_lot_id
           or transition_row.parent_lot_id is distinct from lineage.parent_lot_id
           or transition_row.bucket is distinct from lineage.bucket
           or transition_row.amount_minor is distinct from lineage.amount_minor
           or transition_row.economic_effect_id is distinct from lineage.economic_effect_id
         )
     ) then
    raise exception 'payable lot operation receipt graph is incomplete or cross-wired' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_payable_lot_operation_receipt_integrity
after insert on finance_payable_lot_operation_receipts
deferrable initially deferred for each row
execute function finance_assert_lot_receipt_graph();

create or replace function finance_assert_wallet_history_chain()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  current_head finance_wallet_heads%rowtype;
  previous_history finance_wallet_history%rowtype;
  receipt_row finance_payable_lot_operation_receipts%rowtype;
begin
  select * into strict current_head from finance_wallet_heads where id = new.wallet_id;
  select * into strict receipt_row from finance_payable_lot_operation_receipts
    where receipt_id = new.operation_receipt_id;

  if new.previous_revision = 0 then
    if new.previous_pending_minor <> 0
       or new.previous_available_minor <> 0
       or new.previous_reserved_minor <> 0
       or new.previous_payout_pending_minor <> 0
       or new.previous_refund_pending_minor <> 0
       or new.previous_recovery_receivable_minor <> 0
       or new.previous_lot_state_version <> 1
       or exists (
         select 1 from finance_wallet_history prior where prior.wallet_id = new.wallet_id and prior.id <> new.id
       ) then
      raise exception 'wallet history chain does not match its prior committed revision' using errcode = '23514';
    end if;
    if receipt_row.operation_kind <> 'sale_capture'
       or not exists (
         select 1
         from finance_payable_lots root_lot
         where root_lot.wallet_id = new.wallet_id
           and root_lot.created_by_receipt_id = new.operation_receipt_id
           and root_lot.lineage_depth = 0
           and root_lot.parent_lot_id is null
           and root_lot.root_lot_id = root_lot.lot_id
       ) then
      raise exception 'first wallet mutation must be a payable sale capture' using errcode = '23514';
    end if;
  else
    select * into strict previous_history
      from finance_wallet_history
      where wallet_id = new.wallet_id and next_revision = new.previous_revision;
    if new.previous_pending_minor <> previous_history.next_pending_minor
       or new.previous_available_minor <> previous_history.next_available_minor
       or new.previous_reserved_minor <> previous_history.next_reserved_minor
       or new.previous_payout_pending_minor <> previous_history.next_payout_pending_minor
       or new.previous_refund_pending_minor <> previous_history.next_refund_pending_minor
       or new.previous_recovery_receivable_minor <> previous_history.next_recovery_receivable_minor
       or new.previous_lot_state_version <> previous_history.next_lot_state_version
       or new.previous_lot_state_digest <> previous_history.next_lot_state_digest
       or new.previous_snapshot_digest <> previous_history.next_snapshot_digest
       or new.occurred_at < previous_history.occurred_at then
      raise exception 'wallet history chain does not match its prior committed revision' using errcode = '23514';
    end if;
  end if;

  if current_head.revision <> new.next_revision
     or current_head.mutation_sequence <> new.mutation_sequence
     or current_head.last_operation_id <> new.operation_id
     or receipt_row.operation_id <> new.operation_id
     or receipt_row.wallet_id <> new.wallet_id
     or receipt_row.astrologer_user_id <> new.astrologer_user_id
     or receipt_row.currency <> new.currency
     or receipt_row.mutation_sequence <> new.mutation_sequence
     or receipt_row.previous_lot_state_version <> new.previous_lot_state_version
     or receipt_row.next_lot_state_version <> new.next_lot_state_version
     or receipt_row.previous_lot_state_digest <> new.previous_lot_state_digest
     or receipt_row.next_lot_state_digest <> new.next_lot_state_digest
     or receipt_row.occurred_at <> new.occurred_at
     or new.committed_at < receipt_row.committed_at then
    raise exception 'wallet history chain does not match its prior committed revision' using errcode = '23514';
  end if;
  return null;
exception
  when no_data_found or too_many_rows then
    raise exception 'wallet history chain does not match its prior committed revision' using errcode = '23514';
end;
$$;

create constraint trigger finance_wallet_history_chain_integrity
after insert on finance_wallet_history
deferrable initially deferred for each row
execute function finance_assert_wallet_history_chain();

create or replace function finance_assert_wallet_commit_binding_graph()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  history_row finance_wallet_history%rowtype;
  receipt_row finance_payable_lot_operation_receipts%rowtype;
  journal_row finance_journal_transactions%rowtype;
  proof_row finance_allocation_link_proofs%rowtype;
  journal_receipt_row finance_persistence_commit_receipts%rowtype;
begin
  select * into strict history_row from finance_wallet_history where id = new.wallet_history_id;
  select * into strict receipt_row from finance_payable_lot_operation_receipts where receipt_id = new.operation_receipt_id;
  select * into strict journal_row from finance_journal_transactions where id = new.journal_transaction_id and sealed_at is not null;
  select * into strict proof_row from finance_allocation_link_proofs where proof_id = new.journal_link_proof_id and journal_transaction_id = new.journal_transaction_id;
  select * into strict journal_receipt_row from finance_persistence_commit_receipts where receipt_id = new.journal_persistence_receipt_id and journal_transaction_id = new.journal_transaction_id and proof_record_id = proof_row.id;
  if exists (
    select 1
    from finance_payable_lot_operation_effects effect
    join finance_payable_lot_operation_component_slots slot
      on slot.receipt_id = effect.receipt_id
     and slot.effect_id = effect.effect_id
    left join finance_allocation_link_proof_entries proof_entry
      on proof_entry.proof_record_id = proof_row.id
     and proof_entry.semantic_edge_id = effect.effect_id
     and proof_entry.lot_allocation_id = effect.lot_allocation_id
    where effect.receipt_id = receipt_row.receipt_id
      and (
        proof_entry.id is null
        or proof_entry.side <> effect.side
        or proof_entry.amount_minor <> effect.amount_minor
        or proof_entry.currency <> receipt_row.currency
        or proof_entry.original_sale_id <> effect.original_sale_id
        or proof_entry.component_id <> slot.resolved_component_id
        or proof_entry.payable_lot_id <> effect.payable_lot_id
        or proof_entry.payout_allocation_id is distinct from effect.payout_allocation_id
      )
  ) or exists (
    select 1
    from finance_allocation_link_proof_entries proof_entry
    left join finance_payable_lot_operation_effects effect
      on effect.receipt_id = receipt_row.receipt_id
     and effect.effect_id = proof_entry.semantic_edge_id
     and effect.lot_allocation_id = proof_entry.lot_allocation_id
    where proof_entry.proof_record_id = proof_row.id
      and proof_entry.semantic_edge_id is not null
      and effect.effect_id is null
  ) then
    raise exception 'wallet journal proof does not exactly cover payable lot effects' using errcode = '23514';
  end if;
  if new.operation_id <> history_row.operation_id
     or new.operation_id <> receipt_row.operation_id
     or new.operation_id <> proof_row.operation_id
     or new.operation_receipt_id <> history_row.operation_receipt_id
     or new.next_wallet_id <> history_row.wallet_id
     or new.previous_wallet_id <> history_row.wallet_id
     or new.astrologer_user_id <> history_row.astrologer_user_id
     or new.currency <> history_row.currency
     or new.previous_wallet_revision <> history_row.previous_revision
     or new.next_wallet_revision <> history_row.next_revision
     or new.mutation_sequence <> history_row.mutation_sequence
     or new.previous_wallet_snapshot_digest <> history_row.previous_snapshot_digest
     or new.next_wallet_snapshot_digest <> history_row.next_snapshot_digest
     or new.previous_lot_state_digest <> history_row.previous_lot_state_digest
     or new.next_lot_state_digest <> history_row.next_lot_state_digest
     or new.history_record_digest <> receipt_row.history_record_digest
     or new.journal_link_proof_version <> proof_row.version
     or new.journal_link_proof_digest <> proof_row.proof_digest
     or new.operation_snapshot_id is distinct from proof_row.operation_snapshot_id
     or new.operation_snapshot_digest is distinct from proof_row.operation_snapshot_digest
     or proof_row.operation_snapshot_operation_id is distinct from new.operation_id
     or proof_row.operation_snapshot_previous_wallet_revision is distinct from new.previous_wallet_revision
     or proof_row.operation_snapshot_next_wallet_revision is distinct from new.next_wallet_revision
     or proof_row.operation_snapshot_previous_lot_state_digest is distinct from new.previous_lot_state_digest
     or proof_row.operation_snapshot_next_lot_state_digest is distinct from new.next_lot_state_digest
     or proof_row.operation_snapshot_history_record_digest is distinct from new.history_record_digest
     or journal_row.source_identity_id <> receipt_row.source_identity_id
     or journal_row.canonical_digest <> new.journal_transaction_digest
     or journal_receipt_row.source_identity_id <> receipt_row.source_identity_id
     or journal_receipt_row.persistence_transaction_boundary_ref <> new.persistence_transaction_boundary_ref
     or new.issued_at < journal_row.sealed_at
     or new.issued_at < journal_receipt_row.issued_at then
    raise exception 'wallet commit binding graph is incomplete or cross-wired' using errcode = '23514';
  end if;
  return new;
exception
  when no_data_found or too_many_rows then
    raise exception 'wallet commit binding graph is incomplete or cross-wired' using errcode = '23514';
end;
$$;

create trigger finance_wallet_commit_bindings_graph_integrity
before insert on finance_wallet_commit_bindings
for each row execute function finance_assert_wallet_commit_binding_graph();

create or replace function finance_assert_wallet_lot_state_snapshot()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  history_row finance_wallet_history%rowtype;
  receipt_row finance_payable_lot_operation_receipts%rowtype;
  binding_row finance_wallet_commit_bindings%rowtype;
  current_head finance_wallet_heads%rowtype;
begin
  select * into strict history_row from finance_wallet_history where id = new.wallet_history_id;
  select * into strict receipt_row from finance_payable_lot_operation_receipts
    where receipt_id = new.operation_receipt_id;
  select * into strict binding_row from finance_wallet_commit_bindings
    where binding_id = new.commit_binding_id;
  select * into strict current_head from finance_wallet_heads where id = new.wallet_id;

  if new.wallet_id <> history_row.wallet_id
     or new.astrologer_user_id <> history_row.astrologer_user_id
     or new.currency <> history_row.currency
     or new.wallet_revision <> history_row.next_revision
     or new.lot_state_version <> history_row.next_lot_state_version
     or new.lot_state_digest <> history_row.next_lot_state_digest
     or new.operation_receipt_id <> history_row.operation_receipt_id
     or new.wallet_id <> receipt_row.wallet_id
     or new.astrologer_user_id <> receipt_row.astrologer_user_id
     or new.currency <> receipt_row.currency
     or new.lot_state_version <> receipt_row.next_lot_state_version
     or new.lot_state_digest <> receipt_row.next_lot_state_digest
     or new.commit_binding_id <> binding_row.binding_id
     or new.commit_receipt_id <> binding_row.commit_receipt_id
     or binding_row.wallet_history_id <> history_row.id
     or binding_row.operation_receipt_id <> receipt_row.receipt_id
     or binding_row.next_wallet_id <> new.wallet_id
     or binding_row.astrologer_user_id <> new.astrologer_user_id
     or binding_row.currency <> new.currency
     or binding_row.next_wallet_revision <> new.wallet_revision
     or binding_row.next_lot_state_digest <> new.lot_state_digest
     or current_head.astrologer_user_id <> new.astrologer_user_id
     or current_head.currency <> new.currency
     or current_head.revision < new.wallet_revision
     or (current_head.revision = new.wallet_revision and (
       current_head.lot_state_version <> new.lot_state_version
       or current_head.lot_state_digest <> new.lot_state_digest
       or current_head.last_commit_binding_id <> new.commit_binding_id
     )) then
    raise exception 'wallet lot-state snapshot is not bound to one committed wallet graph' using errcode = '23514';
  end if;
  return new;
exception
  when no_data_found or too_many_rows then
    raise exception 'wallet lot-state snapshot is not bound to one committed wallet graph' using errcode = '23514';
end;
$$;

create trigger finance_wallet_lot_state_snapshots_graph_integrity
before insert on finance_wallet_lot_state_snapshots
for each row execute function finance_assert_wallet_lot_state_snapshot();

create or replace function finance_assert_wallet_history_snapshot()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  snapshot_row finance_wallet_lot_state_snapshots%rowtype;
begin
  select * into strict snapshot_row from finance_wallet_lot_state_snapshots
    where wallet_history_id = new.id;
  if snapshot_row.wallet_id <> new.wallet_id
     or snapshot_row.astrologer_user_id <> new.astrologer_user_id
     or snapshot_row.currency <> new.currency
     or snapshot_row.wallet_revision <> new.next_revision
     or snapshot_row.lot_state_version <> new.next_lot_state_version
     or snapshot_row.lot_state_digest <> new.next_lot_state_digest
     or snapshot_row.operation_receipt_id <> new.operation_receipt_id then
    raise exception 'wallet history must retain one exact immutable lot-state snapshot' using errcode = '23514';
  end if;
  return null;
exception
  when no_data_found or too_many_rows then
    raise exception 'wallet history must retain one exact immutable lot-state snapshot' using errcode = '23514';
end;
$$;

create constraint trigger finance_wallet_history_snapshot_integrity
after insert on finance_wallet_history
deferrable initially deferred for each row
execute function finance_assert_wallet_history_snapshot();

create or replace function finance_issue_wallet_lot_commitment()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  prior_row finance_wallet_lot_commitment_chain%rowtype;
  history_row finance_wallet_history%rowtype;
  receipt_row finance_payable_lot_operation_receipts%rowtype;
  binding_row finance_wallet_commit_bindings%rowtype;
begin
  select * into strict history_row from finance_wallet_history where id = new.wallet_history_id;
  select * into strict receipt_row from finance_payable_lot_operation_receipts
    where receipt_id = new.operation_receipt_id;
  select * into strict binding_row from finance_wallet_commit_bindings
    where binding_id = new.commit_binding_id;
  if new.wallet_id <> history_row.wallet_id
     or new.astrologer_user_id <> history_row.astrologer_user_id
     or new.currency <> history_row.currency
     or new.wallet_revision <> history_row.next_revision
     or new.operation_receipt_id <> history_row.operation_receipt_id
     or new.wallet_id <> receipt_row.wallet_id
     or new.astrologer_user_id <> receipt_row.astrologer_user_id
     or new.currency <> receipt_row.currency
     or new.operation_receipt_digest <> receipt_row.canonical_digest
     or new.commit_binding_id <> binding_row.binding_id
     or new.commit_binding_digest <> binding_row.binding_digest
     or binding_row.wallet_history_id <> history_row.id
     or binding_row.operation_receipt_id <> receipt_row.receipt_id
     or binding_row.next_wallet_id <> new.wallet_id
     or binding_row.astrologer_user_id <> new.astrologer_user_id
     or binding_row.currency <> new.currency
     or binding_row.next_wallet_revision <> new.wallet_revision then
    raise exception 'wallet lot commitment is not bound to one exact receipt and commit graph' using errcode = '23514';
  end if;

  if new.wallet_revision = 1 then
    if exists (select 1 from finance_wallet_lot_commitment_chain prior where prior.wallet_id = new.wallet_id) then
      raise exception 'wallet lot commitment genesis has an unexpected predecessor' using errcode = '23514';
    end if;
    new.previous_commitment_digest := null;
  else
    select * into strict prior_row from finance_wallet_lot_commitment_chain
      where wallet_id = new.wallet_id and wallet_revision = new.wallet_revision - 1;
    new.previous_commitment_digest := prior_row.commitment_digest;
  end if;
  new.committed_at := clock_timestamp();
  new.commitment_canonical_preimage := jsonb_build_object(
    'kind', 'finance_wallet_lot_commitment',
    'schemaVersion', 1,
    'walletId', new.wallet_id,
    'astrologerUserId', new.astrologer_user_id,
    'currency', new.currency,
    'walletRevision', new.wallet_revision::text,
    'previousCommitmentDigest', new.previous_commitment_digest,
    'walletHistoryId', new.wallet_history_id,
    'operationReceiptId', new.operation_receipt_id,
    'operationReceiptDigest', new.operation_receipt_digest,
    'commitBindingId', new.commit_binding_id,
    'commitBindingDigest', new.commit_binding_digest,
    'committedAt', to_char(new.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.commitment_digest := 'sha256:' || encode(
    digest(new.commitment_canonical_preimage, 'sha256'),
    'hex'
  );
  return new;
exception
  when no_data_found or too_many_rows then
    raise exception 'wallet lot commitment is not bound to one exact receipt and commit graph' using errcode = '23514';
end;
$$;

create trigger finance_wallet_lot_commitment_chain_issue
before insert on finance_wallet_lot_commitment_chain
for each row execute function finance_issue_wallet_lot_commitment();

create or replace function finance_assert_wallet_lot_commitment_predecessor()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  prior_row finance_wallet_lot_commitment_chain%rowtype;
begin
  if new.wallet_revision = 1 then
    if new.previous_commitment_digest is not null
       or exists (
         select 1 from finance_wallet_lot_commitment_chain prior
         where prior.wallet_id = new.wallet_id and prior.id <> new.id
       ) then
      raise exception 'wallet lot commitment genesis has an unexpected predecessor' using errcode = '23514';
    end if;
  else
    select * into strict prior_row from finance_wallet_lot_commitment_chain
      where wallet_id = new.wallet_id and wallet_revision = new.wallet_revision - 1;
    if new.previous_commitment_digest <> prior_row.commitment_digest then
      raise exception 'wallet lot commitment predecessor is missing or mismatched' using errcode = '23514';
    end if;
  end if;
  return null;
exception
  when no_data_found or too_many_rows then
    raise exception 'wallet lot commitment predecessor is missing or mismatched' using errcode = '23514';
end;
$$;

create constraint trigger finance_wallet_lot_commitment_chain_predecessor_integrity
after insert on finance_wallet_lot_commitment_chain
deferrable initially deferred for each row
execute function finance_assert_wallet_lot_commitment_predecessor();

create or replace function finance_assert_wallet_head_history()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  current_head finance_wallet_heads%rowtype;
  history_row finance_wallet_history%rowtype;
  binding_row finance_wallet_commit_bindings%rowtype;
  snapshot_row finance_wallet_lot_state_snapshots%rowtype;
  commitment_row finance_wallet_lot_commitment_chain%rowtype;
  active_pending numeric(38, 0);
  active_available numeric(38, 0);
  active_reserved numeric(38, 0);
  active_payout_pending numeric(38, 0);
  active_refund_pending numeric(38, 0);
  ledger_recovery numeric(38, 0);
begin
  select * into strict current_head from finance_wallet_heads where id = new.id;
  select * into strict history_row from finance_wallet_history
    where wallet_id = current_head.id and next_revision = current_head.revision;
  select * into strict binding_row from finance_wallet_commit_bindings
    where wallet_history_id = history_row.id and binding_id = current_head.last_commit_binding_id;
  select * into strict snapshot_row from finance_wallet_lot_state_snapshots
    where wallet_history_id = history_row.id;
  select * into strict commitment_row from finance_wallet_lot_commitment_chain
    where wallet_history_id = history_row.id;
  if current_head.last_operation_id <> history_row.operation_id
     or history_row.operation_id <> binding_row.operation_id
     or current_head.revision <> history_row.next_revision
     or current_head.mutation_sequence <> history_row.mutation_sequence
     or current_head.lot_state_version <> history_row.next_lot_state_version
     or current_head.lot_state_digest <> history_row.next_lot_state_digest
     or current_head.snapshot_digest <> history_row.next_snapshot_digest
     or snapshot_row.wallet_id <> current_head.id
     or snapshot_row.astrologer_user_id <> current_head.astrologer_user_id
     or snapshot_row.currency <> current_head.currency
     or snapshot_row.wallet_revision <> current_head.revision
     or snapshot_row.lot_state_version <> current_head.lot_state_version
     or snapshot_row.lot_state_digest <> current_head.lot_state_digest
     or snapshot_row.commit_binding_id <> binding_row.binding_id
     or snapshot_row.commit_receipt_id <> binding_row.commit_receipt_id
     or commitment_row.wallet_id <> current_head.id
     or commitment_row.astrologer_user_id <> current_head.astrologer_user_id
     or commitment_row.currency <> current_head.currency
     or commitment_row.wallet_revision <> current_head.revision
     or commitment_row.wallet_history_id <> history_row.id
     or commitment_row.operation_receipt_id <> history_row.operation_receipt_id
     or commitment_row.commit_binding_id <> binding_row.binding_id
     or commitment_row.operation_receipt_digest <> receipt_row.canonical_digest
     or commitment_row.commit_binding_digest <> binding_row.binding_digest
     or current_head.pending_minor <> history_row.next_pending_minor
     or current_head.available_minor <> history_row.next_available_minor
     or current_head.reserved_minor <> history_row.next_reserved_minor
     or current_head.payout_pending_minor <> history_row.next_payout_pending_minor
     or current_head.refund_pending_minor <> history_row.next_refund_pending_minor
     or current_head.recovery_receivable_minor <> history_row.next_recovery_receivable_minor then
    raise exception 'wallet head must exactly match its committed history revision' using errcode = '23514';
  end if;

  select
    coalesce(sum(lot.amount_minor) filter (where lot.bucket = 'pending'), 0),
    coalesce(sum(lot.amount_minor) filter (where lot.bucket = 'available'), 0),
    coalesce(sum(lot.amount_minor) filter (where lot.bucket = 'reserved'), 0),
    coalesce(sum(lot.amount_minor) filter (where lot.bucket = 'payout_pending'), 0),
    coalesce(sum(lot.amount_minor) filter (where lot.bucket = 'refund_pending'), 0)
  into active_pending, active_available, active_reserved, active_payout_pending, active_refund_pending
  from finance_payable_lots lot
  where lot.wallet_id = current_head.id
    and not exists (
      select 1 from finance_payable_lot_transitions consumed
      where consumed.lot_id = lot.lot_id and consumed.relation = 'consumed'
    );

  if current_head.pending_minor <> active_pending
     or current_head.available_minor <> active_available
     or current_head.reserved_minor <> active_reserved
     or current_head.payout_pending_minor <> active_payout_pending
     or current_head.refund_pending_minor <> active_refund_pending then
    raise exception 'wallet payable buckets must equal active normalized lots' using errcode = '23514';
  end if;

  select coalesce(sum(case entry.side when 'debit' then entry.amount_minor else -entry.amount_minor end), 0)
    into ledger_recovery
  from finance_accounts account
  join finance_journal_entries entry on entry.account_id = account.id
  join finance_journal_transactions journal on journal.id = entry.journal_transaction_id and journal.sealed_at is not null
  where account.code = 'astrologer_recovery_receivable'
    and account.astrologer_user_id = current_head.astrologer_user_id
    and account.currency = current_head.currency;
  if current_head.recovery_receivable_minor <> ledger_recovery then
    raise exception 'wallet recovery receivable must equal sealed journal history' using errcode = '23514';
  end if;
  return null;
exception
  when no_data_found or too_many_rows then
    raise exception 'wallet head must exactly match its committed history revision' using errcode = '23514';
end;
$$;

create constraint trigger finance_wallet_head_history_integrity
after insert or update on finance_wallet_heads
deferrable initially deferred for each row
execute function finance_assert_wallet_head_history();

create trigger finance_wallet_heads_no_truncate before truncate on finance_wallet_heads
for each statement execute function finance_reject_wallet_history_mutation();
create trigger finance_wallet_history_immutable before update or delete on finance_wallet_history
for each row execute function finance_reject_wallet_history_mutation();
create trigger finance_wallet_history_no_truncate before truncate on finance_wallet_history
for each statement execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lots_immutable before update or delete on finance_payable_lots
for each row execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lots_no_truncate before truncate on finance_payable_lots
for each statement execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lot_transitions_immutable before update or delete on finance_payable_lot_transitions
for each row execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lot_transitions_no_truncate before truncate on finance_payable_lot_transitions
for each statement execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lot_operation_receipts_immutable before update or delete on finance_payable_lot_operation_receipts
for each row execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lot_operation_receipts_no_truncate before truncate on finance_payable_lot_operation_receipts
for each statement execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lot_operation_authority_bindings_immutable before update or delete on finance_payable_lot_operation_authority_bindings
for each row execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lot_operation_authority_bindings_no_truncate before truncate on finance_payable_lot_operation_authority_bindings
for each statement execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lot_operation_effects_immutable before update or delete on finance_payable_lot_operation_effects
for each row execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lot_operation_effects_no_truncate before truncate on finance_payable_lot_operation_effects
for each statement execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lot_operation_lineage_immutable before update or delete on finance_payable_lot_operation_lineage
for each row execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lot_operation_lineage_no_truncate before truncate on finance_payable_lot_operation_lineage
for each statement execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lot_operation_component_slots_immutable before update or delete on finance_payable_lot_operation_component_slots
for each row execute function finance_reject_wallet_history_mutation();
create trigger finance_payable_lot_operation_component_slots_no_truncate before truncate on finance_payable_lot_operation_component_slots
for each statement execute function finance_reject_wallet_history_mutation();
create trigger finance_wallet_commit_bindings_immutable before update or delete on finance_wallet_commit_bindings
for each row execute function finance_reject_wallet_history_mutation();
create trigger finance_wallet_commit_bindings_no_truncate before truncate on finance_wallet_commit_bindings
for each statement execute function finance_reject_wallet_history_mutation();
create trigger finance_wallet_lot_state_snapshots_immutable before update or delete on finance_wallet_lot_state_snapshots
for each row execute function finance_reject_wallet_history_mutation();
create trigger finance_wallet_lot_state_snapshots_no_truncate before truncate on finance_wallet_lot_state_snapshots
for each statement execute function finance_reject_wallet_history_mutation();
create trigger finance_wallet_lot_commitment_chain_immutable before update or delete on finance_wallet_lot_commitment_chain
for each row execute function finance_reject_wallet_history_mutation();
create trigger finance_wallet_lot_commitment_chain_no_truncate before truncate on finance_wallet_lot_commitment_chain
for each statement execute function finance_reject_wallet_history_mutation();
`;

/** Added only when its normalized component-registry owner exists. */
export const financeWalletDeferredForeignKeys = [
  {
    sourceTable: "finance_payable_lot_operation_component_slots",
    sourceColumns: ["resolved_component_id"],
    targetTable: "finance_component_registry",
    targetColumns: ["component_id"]
  }
] as const;

function identifierCheck(...columns: SQLWrapper[]): SQL {
  const checks = columns.map(
    (column) =>
      sql`length(${column}) between 1 and 200 and btrim(${column}) = ${column} and ${column} !~ '[[:cntrl:]]'`
  );
  return sql.join(checks, sql` and `);
}

function nullableIdentifierCheck(...columns: SQLWrapper[]): SQL {
  const checks = columns.map(
    (column) =>
      sql`(${column} is null or (length(${column}) between 1 and 200 and btrim(${column}) = ${column} and ${column} !~ '[[:cntrl:]]'))`
  );
  return sql.join(checks, sql` and `);
}
