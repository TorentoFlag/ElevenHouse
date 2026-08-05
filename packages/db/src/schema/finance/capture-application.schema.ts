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
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { outboxEvents } from "../outbox/outbox-events.schema";
import {
  financeOrderEconomicsSnapshots,
  financePaidProductFulfillmentDecisions,
  financeRiskPolicyVersions
} from "./capture-authorities.schema";
import { financeCanonicalJsonV1Sql } from "./canonical-json.sql";
import {
  financeCaptureFacts,
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions,
  financePaymentTransitionFacts
} from "./economic-payments.schema";
import { financeNumeric38String, financeRevisionString } from "./finance-values";
import { financePersistenceCommitReceipts } from "./ledger.schema";
import { financeProviderOperationResultCommitReceipts } from "./provider-operations.schema";
import { financePayableLots, financeWalletCommitBindings } from "./wallet.schema";
import {
  financeProviderSemanticFacts,
  financeWebhookSemanticCommitReceipts
} from "./webhook-inbox.schema";

const digestPattern = sql.raw("'^sha256:[a-f0-9]{64}$'");

/**
 * Cross-contour authority issued only after economic, provider, journal, optional wallet and
 * outbox effects exist in the same PostgreSQL transaction. Provider result evidence itself is
 * intentionally committed earlier, before the capture application transaction starts.
 */
export const financeVerifiedCaptureApplicationReceipts = pgTable(
  "finance_verified_capture_application_receipts",
  {
    receiptId: uuid("receipt_id").primaryKey().defaultRandom(),
    receiptVersion: integer("receipt_version")
      .notNull()
      .default(sql`1`),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 })
      .notNull()
      .default(sql`''`),
    economicPaymentVersion: financeRevisionString("economic_payment_version")
      .notNull()
      .default(sql`0`),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 })
      .notNull()
      .default(sql`''`),
    economicPaymentSessionVersion: financeRevisionString("economic_payment_session_version")
      .notNull()
      .default(sql`0`),
    purpose: text("purpose")
      .notNull()
      .default(sql`''`),
    sourceId: varchar("source_id", { length: 200 })
      .notNull()
      .default(sql`''`),
    economicEffectKind: text("economic_effect_kind")
      .notNull()
      .default(sql`''`),
    captureFactId: varchar("capture_fact_id", { length: 160 }).notNull(),
    captureTransitionFactId: varchar("capture_transition_fact_id", { length: 160 })
      .notNull()
      .default(sql`''`),
    captureEvidenceAuthorityKind: text("capture_evidence_authority_kind")
      .notNull()
      .default(sql`''`),
    captureEvidenceAuthorityId: varchar("capture_evidence_authority_id", { length: 160 })
      .notNull()
      .default(sql`''`),
    /**
     * Platform charge flows are authorized by their persisted provider-operation result. Client
     * HPP captures are instead authorized by the immutable semantic fact produced from the
     * signed webhook and canonical provider read. Exactly one branch is permitted per receipt.
     */
    providerResultReceiptId: uuid("provider_result_receipt_id"),
    providerSemanticFactId: varchar("provider_semantic_fact_id", { length: 160 }),
    providerSemanticCommitReceiptId: uuid("provider_semantic_commit_receipt_id"),
    providerOperationResultId: varchar("provider_operation_result_id", { length: 160 }),
    providerOperationIntentId: varchar("provider_operation_intent_id", { length: 160 }),
    providerOperationIntentVersion: financeRevisionString("provider_operation_intent_version"),
    correlatedEconomicPaymentVersion: financeRevisionString("correlated_economic_payment_version"),
    operationKind: text("operation_kind"),
    providerAccountSeriesId: varchar("provider_account_series_id", { length: 160 })
      .notNull()
      .default(sql`''`),
    providerAccountId: varchar("provider_account_id", { length: 160 })
      .notNull()
      .default(sql`''`),
    providerIdentityVersion: integer("provider_identity_version")
      .notNull()
      .default(sql`0`),
    providerOperationOutcome: text("provider_operation_outcome"),
    providerOperationId: varchar("provider_operation_id", { length: 160 }),
    providerPaymentId: varchar("provider_payment_id", { length: 160 })
      .notNull()
      .default(sql`''`),
    amountMinor: financeNumeric38String("amount_minor")
      .notNull()
      .default(sql`0`),
    currency: text("currency")
      .notNull()
      .default(sql`''`),
    canonicalRequestDigest: varchar("canonical_request_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    evidenceArtifactId: varchar("evidence_artifact_id", { length: 160 })
      .notNull()
      .default(sql`''`),
    evidenceArtifactDigest: varchar("evidence_artifact_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    providerObservedAt: timestamp("provider_observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    astrologerUserId: uuid("astrologer_user_id"),
    orderEconomicsDigest: varchar("order_economics_digest", { length: 71 }),
    rootPayableLotId: varchar("root_payable_lot_id", { length: 200 }),
    riskPolicyId: varchar("risk_policy_id", { length: 160 }),
    riskPolicyVersion: financeRevisionString("risk_policy_version"),
    riskPolicyDigest: varchar("risk_policy_digest", { length: 71 }),
    fulfillmentDecisionId: varchar("fulfillment_decision_id", { length: 200 }),
    fulfillmentDecisionVersion: financeRevisionString("fulfillment_decision_version"),
    fulfillmentDecisionDigest: varchar("fulfillment_decision_digest", { length: 71 }),
    clearingState: text("clearing_state"),
    clearingVersion: financeRevisionString("clearing_version"),
    journalPersistenceReceiptId: varchar("journal_persistence_receipt_id", { length: 200 }),
    journalTransactionId: varchar("journal_transaction_id", { length: 200 }),
    journalTransactionDigest: varchar("journal_transaction_digest", { length: 71 }),
    journalCommitDigest: varchar("journal_commit_digest", { length: 71 }),
    journalLinkProofId: varchar("journal_link_proof_id", { length: 200 }),
    journalLinkProofVersion: integer("journal_link_proof_version"),
    journalLinkProofDigest: varchar("journal_link_proof_digest", { length: 71 }),
    walletCommitReceiptId: varchar("wallet_commit_receipt_id", { length: 200 }),
    walletOperationId: varchar("wallet_operation_id", { length: 200 }),
    walletId: uuid("wallet_id"),
    walletRevision: financeRevisionString("wallet_revision"),
    walletCommitDigest: varchar("wallet_commit_digest", { length: 71 }),
    outboxEventId: uuid("outbox_event_id").notNull().defaultRandom(),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    })
      .notNull()
      .default(sql`''`),
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
      columns: [table.purpose, table.sourceId, table.economicPaymentIntentId],
      foreignColumns: [
        financeEconomicPaymentIntents.purpose,
        financeEconomicPaymentIntents.sourceId,
        financeEconomicPaymentIntents.id
      ],
      name: "finance_verified_capture_receipts_economic_intent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.economicPaymentSessionId,
        table.economicPaymentIntentId,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion
      ],
      foreignColumns: [
        financeEconomicPaymentSessions.id,
        financeEconomicPaymentSessions.economicPaymentIntentId,
        financeEconomicPaymentSessions.seriesId,
        financeEconomicPaymentSessions.providerAccountId,
        financeEconomicPaymentSessions.providerIdentityVersion
      ],
      name: "finance_verified_capture_receipts_economic_session_fk"
    }).onDelete("restrict"),
    foreignKey({
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
        table.captureEvidenceAuthorityKind,
        table.captureEvidenceAuthorityId,
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
      ],
      name: "finance_verified_capture_receipts_capture_fact_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.captureTransitionFactId],
      foreignColumns: [financePaymentTransitionFacts.id],
      name: "finance_verified_capture_receipts_transition_fact_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.providerResultReceiptId,
        table.providerOperationResultId,
        table.providerOperationIntentId,
        table.providerOperationIntentVersion,
        table.economicPaymentIntentId,
        table.correlatedEconomicPaymentVersion,
        table.economicPaymentSessionId,
        table.purpose,
        table.sourceId,
        table.operationKind,
        table.providerAccountSeriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.providerOperationOutcome,
        table.providerOperationId,
        table.providerPaymentId,
        table.amountMinor,
        table.currency,
        table.canonicalRequestDigest,
        table.evidenceArtifactId,
        table.evidenceArtifactDigest,
        table.providerObservedAt
      ],
      foreignColumns: [
        financeProviderOperationResultCommitReceipts.id,
        financeProviderOperationResultCommitReceipts.providerOperationResultId,
        financeProviderOperationResultCommitReceipts.providerOperationIntentId,
        financeProviderOperationResultCommitReceipts.providerOperationIntentVersion,
        financeProviderOperationResultCommitReceipts.economicPaymentIntentId,
        financeProviderOperationResultCommitReceipts.correlatedEconomicPaymentVersion,
        financeProviderOperationResultCommitReceipts.economicPaymentSessionId,
        financeProviderOperationResultCommitReceipts.purpose,
        financeProviderOperationResultCommitReceipts.sourceId,
        financeProviderOperationResultCommitReceipts.operationKind,
        financeProviderOperationResultCommitReceipts.seriesId,
        financeProviderOperationResultCommitReceipts.providerAccountId,
        financeProviderOperationResultCommitReceipts.providerIdentityVersion,
        financeProviderOperationResultCommitReceipts.outcome,
        financeProviderOperationResultCommitReceipts.providerOperationId,
        financeProviderOperationResultCommitReceipts.providerPaymentId,
        financeProviderOperationResultCommitReceipts.amountMinor,
        financeProviderOperationResultCommitReceipts.currency,
        financeProviderOperationResultCommitReceipts.canonicalRequestDigest,
        financeProviderOperationResultCommitReceipts.evidenceArtifactId,
        financeProviderOperationResultCommitReceipts.evidenceArtifactDigest,
        financeProviderOperationResultCommitReceipts.observedAt
      ],
      name: "finance_verified_capture_receipts_provider_result_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.providerSemanticFactId],
      foreignColumns: [financeProviderSemanticFacts.id],
      name: "finance_verified_capture_receipts_provider_semantic_fact_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.providerSemanticCommitReceiptId],
      foreignColumns: [financeWebhookSemanticCommitReceipts.id],
      name: "finance_verified_capture_receipts_provider_semantic_commit_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.sourceId, table.orderEconomicsDigest],
      foreignColumns: [
        financeOrderEconomicsSnapshots.orderId,
        financeOrderEconomicsSnapshots.canonicalDigest
      ],
      name: "finance_verified_capture_receipts_economics_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.rootPayableLotId],
      foreignColumns: [financePayableLots.lotId],
      name: "finance_verified_capture_receipts_root_lot_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.riskPolicyId, table.riskPolicyVersion, table.riskPolicyDigest],
      foreignColumns: [
        financeRiskPolicyVersions.policyId,
        financeRiskPolicyVersions.policyVersion,
        financeRiskPolicyVersions.canonicalDigest
      ],
      name: "finance_verified_capture_receipts_risk_policy_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.fulfillmentDecisionId,
        table.fulfillmentDecisionVersion,
        table.fulfillmentDecisionDigest
      ],
      foreignColumns: [
        financePaidProductFulfillmentDecisions.registryKey,
        financePaidProductFulfillmentDecisions.registryRevision,
        financePaidProductFulfillmentDecisions.canonicalDigest
      ],
      name: "finance_verified_capture_receipts_fulfillment_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.journalPersistenceReceiptId],
      foreignColumns: [financePersistenceCommitReceipts.receiptId],
      name: "finance_verified_capture_receipts_journal_commit_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.walletCommitReceiptId,
        table.walletOperationId,
        table.walletId,
        table.walletRevision,
        table.walletCommitDigest
      ],
      foreignColumns: [
        financeWalletCommitBindings.commitReceiptId,
        financeWalletCommitBindings.operationId,
        financeWalletCommitBindings.nextWalletId,
        financeWalletCommitBindings.nextWalletRevision,
        financeWalletCommitBindings.commitReceiptCanonicalDigest
      ],
      name: "finance_verified_capture_receipts_wallet_commit_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.outboxEventId],
      foreignColumns: [outboxEvents.id],
      name: "finance_verified_capture_receipts_outbox_fk"
    }).onDelete("restrict"),
    unique("finance_verified_capture_receipts_exact_owner_unique").on(
      table.receiptId,
      table.receiptVersion,
      table.canonicalDigest
    ),
    check(
      "finance_verified_capture_receipts_effect_shape_check",
      sql`${table.receiptVersion} = 1
        and ${table.currency} = 'RUB'
        and (
          (${table.purpose} = 'client_order'
            and ${table.economicEffectKind} = 'client_sale_captured'
            and ${table.amountMinor} > 0
            and ${table.orderEconomicsDigest} ~ ${digestPattern}
            and ${table.astrologerUserId} is not null
            and ${table.providerResultReceiptId} is null
            and ${table.providerSemanticFactId} is not null
            and ${table.providerSemanticCommitReceiptId} is not null
            and ${table.providerOperationResultId} is null
            and ${table.providerOperationIntentId} is null
            and ${table.providerOperationIntentVersion} is null
            and ${table.correlatedEconomicPaymentVersion} is null
            and ${table.operationKind} is null
            and ${table.providerOperationOutcome} is null
            and ${table.providerOperationId} is null
            and ${table.captureEvidenceAuthorityKind} = 'provider_semantic_fact'
            and ${table.captureEvidenceAuthorityId} = ${table.providerSemanticFactId}
            and ${table.clearingState} = 'unmatched'
            and ${table.clearingVersion} = 1
            and ${table.journalPersistenceReceiptId} is not null)
          or (${table.purpose} = 'platform_invoice'
            and ${table.economicEffectKind} = 'platform_invoice_captured'
            and ${table.amountMinor} > 0
            and ${table.orderEconomicsDigest} is null
            and ${table.providerResultReceiptId} is not null
            and ${table.providerSemanticFactId} is null
            and ${table.providerSemanticCommitReceiptId} is null
            and ${table.providerOperationResultId} is not null
            and ${table.providerOperationIntentId} is not null
            and ${table.providerOperationIntentVersion} >= 1
            and ${table.correlatedEconomicPaymentVersion} >= 1
            and ${table.operationKind} = 'saved_card_charge'
            and ${table.providerOperationOutcome} = 'succeeded'
            and ${table.providerOperationId} is not null
            and ${table.captureEvidenceAuthorityKind} = 'provider_operation_result'
            and ${table.captureEvidenceAuthorityId} = ${table.providerOperationResultId}
            and ${table.economicPaymentVersion} = ${table.correlatedEconomicPaymentVersion} + 1
            and ${table.astrologerUserId} is null
            and ${table.clearingState} = 'unmatched'
            and ${table.clearingVersion} = 1
            and ${table.journalPersistenceReceiptId} is not null
            and ${table.walletCommitReceiptId} is null)
          or (${table.purpose} = 'platform_card_setup'
            and ${table.economicEffectKind} = 'platform_card_setup_captured'
            and ${table.amountMinor} = 0
            and ${table.orderEconomicsDigest} is null
            and ${table.providerResultReceiptId} is not null
            and ${table.providerSemanticFactId} is null
            and ${table.providerSemanticCommitReceiptId} is null
            and ${table.providerOperationResultId} is not null
            and ${table.providerOperationIntentId} is not null
            and ${table.providerOperationIntentVersion} >= 1
            and ${table.correlatedEconomicPaymentVersion} >= 1
            and ${table.operationKind} = 'card_setup'
            and ${table.providerOperationOutcome} = 'succeeded'
            and ${table.providerOperationId} is not null
            and ${table.captureEvidenceAuthorityKind} = 'provider_operation_result'
            and ${table.captureEvidenceAuthorityId} = ${table.providerOperationResultId}
            and ${table.economicPaymentVersion} = ${table.correlatedEconomicPaymentVersion} + 1
            and ${table.astrologerUserId} is null
            and ${table.clearingState} is null
            and ${table.clearingVersion} is null
            and ${table.journalPersistenceReceiptId} is null
            and ${table.walletCommitReceiptId} is null)
        )
        and (
          (${table.journalPersistenceReceiptId} is null
            and ${table.journalTransactionId} is null
            and ${table.journalTransactionDigest} is null
            and ${table.journalCommitDigest} is null
            and ${table.journalLinkProofId} is null
            and ${table.journalLinkProofVersion} is null
            and ${table.journalLinkProofDigest} is null)
          or (${table.journalPersistenceReceiptId} is not null
            and ${table.journalTransactionId} is not null
            and ${table.journalTransactionDigest} ~ ${digestPattern}
            and ${table.journalCommitDigest} ~ ${digestPattern}
            and ${table.journalLinkProofId} is not null
            and ${table.journalLinkProofVersion} = 1
            and ${table.journalLinkProofDigest} ~ ${digestPattern})
        )
        and (
          (${table.walletCommitReceiptId} is null
            and ${table.walletOperationId} is null
            and ${table.walletId} is null
            and ${table.walletRevision} is null
            and ${table.walletCommitDigest} is null)
          or (${table.walletCommitReceiptId} is not null
            and ${table.walletOperationId} is not null
            and ${table.walletId} is not null
            and ${table.walletRevision} >= 1
            and ${table.walletCommitDigest} ~ ${digestPattern}
            and ${table.journalPersistenceReceiptId} is not null)
        )
        and (
          (${table.rootPayableLotId} is null
            and ${table.riskPolicyId} is null
            and ${table.riskPolicyVersion} is null
            and ${table.riskPolicyDigest} is null
            and ${table.fulfillmentDecisionId} is null
            and ${table.fulfillmentDecisionVersion} is null
            and ${table.fulfillmentDecisionDigest} is null)
          or (${table.rootPayableLotId} is not null
            and ${table.riskPolicyId} is not null
            and ${table.riskPolicyVersion} >= 1
            and ${table.riskPolicyDigest} ~ ${digestPattern}
            and ${table.fulfillmentDecisionId} is not null
            and ${table.fulfillmentDecisionVersion} >= 1
            and ${table.fulfillmentDecisionDigest} ~ ${digestPattern}
            and ${table.walletCommitReceiptId} is not null)
        )`
    ),
    check(
      "finance_verified_capture_receipts_digest_boundary_check",
      sql`${table.canonicalRequestDigest} ~ ${digestPattern}
        and ${table.evidenceArtifactDigest} ~ ${digestPattern}
        and ${table.canonicalDigest} ~ ${digestPattern}
        and length(${table.canonicalPreimage}) between 1 and 32000
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'
        and length(btrim(${table.economicPaymentIntentId})) between 1 and 160
        and length(btrim(${table.economicPaymentSessionId})) between 1 and 160
        and length(btrim(${table.sourceId})) between 1 and 200
        and length(btrim(${table.providerPaymentId})) between 1 and 160
        and ${table.committedAt} >= ${table.providerObservedAt}`
    ),
    uniqueIndex("finance_verified_capture_receipts_capture_unique").on(table.captureFactId),
    uniqueIndex("finance_verified_capture_receipts_provider_result_unique")
      .on(table.providerResultReceiptId)
      .where(sql`${table.providerResultReceiptId} is not null`),
    uniqueIndex("finance_verified_capture_receipts_provider_semantic_commit_unique").on(
      table.providerSemanticCommitReceiptId
    ),
    uniqueIndex("finance_verified_capture_receipts_journal_unique")
      .on(table.journalPersistenceReceiptId)
      .where(sql`${table.journalPersistenceReceiptId} is not null`),
    uniqueIndex("finance_verified_capture_receipts_wallet_commit_unique")
      .on(table.walletCommitReceiptId)
      .where(sql`${table.walletCommitReceiptId} is not null`),
    uniqueIndex("finance_verified_capture_receipts_outbox_unique").on(table.outboxEventId),
    uniqueIndex("finance_verified_capture_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    uniqueIndex("finance_verified_capture_receipts_digest_unique").on(table.canonicalDigest),
    index("finance_verified_capture_receipts_source_lookup_idx").on(
      table.purpose,
      table.sourceId,
      table.committedAt
    )
  ]
);

/** Baseline owner executes this DDL after all referenced finance and outbox tables exist. */
export const financeVerifiedCaptureApplicationIntegritySql = `
create extension if not exists pgcrypto;
${financeCanonicalJsonV1Sql}

create unique index finance_payable_lots_one_root_per_capture_unique
on finance_payable_lots (canonical_capture_evidence_id)
where lineage_depth = 0;

create or replace function finance_issue_verified_capture_application_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  capture_row finance_capture_facts%rowtype;
  result_receipt finance_provider_operation_result_commit_receipts%rowtype;
  semantic_fact finance_provider_semantic_facts%rowtype;
  semantic_receipt finance_webhook_semantic_commit_receipts%rowtype;
  intent_row finance_economic_payment_intents%rowtype;
  session_row finance_economic_payment_sessions%rowtype;
  transition_row finance_payment_transition_facts%rowtype;
  clearing_row finance_payment_clearing_heads%rowtype;
  economics_row finance_order_economics_snapshots%rowtype;
  journal_receipt finance_persistence_commit_receipts%rowtype;
  journal_row finance_journal_transactions%rowtype;
  proof_row finance_allocation_link_proofs%rowtype;
  wallet_binding finance_wallet_commit_bindings%rowtype;
  root_lot finance_payable_lots%rowtype;
begin
  begin
  select * into strict capture_row from finance_capture_facts where id = new.capture_fact_id;
  select * into strict intent_row
    from finance_economic_payment_intents
    where id = capture_row.economic_payment_intent_id;
  select * into strict session_row
    from finance_economic_payment_sessions
    where id = capture_row.economic_payment_session_id;
  select * into strict transition_row
    from finance_payment_transition_facts transition_fact
    where transition_fact.economic_payment_intent_id = capture_row.economic_payment_intent_id
      and transition_fact.economic_payment_session_id = capture_row.economic_payment_session_id
      and transition_fact.to_state = 'captured'
      and transition_fact.authority_kind = capture_row.evidence_authority_kind
      and transition_fact.authority_id = capture_row.evidence_authority_id
      and transition_fact.evidence_artifact_id = capture_row.evidence_artifact_id
      and transition_fact.evidence_artifact_digest = capture_row.evidence_artifact_digest;

  if intent_row.purpose = 'client_order' then
    select * into strict semantic_fact
      from finance_provider_semantic_facts
      where id = new.provider_semantic_fact_id;
    select * into strict semantic_receipt
      from finance_webhook_semantic_commit_receipts
      where id = new.provider_semantic_commit_receipt_id;

    if new.provider_result_receipt_id is not null
       or semantic_receipt.semantic_fact_id <> semantic_fact.id
       or semantic_receipt.processing_status <> 'completed'
       or semantic_receipt.effect_disposition <> 'applied_once'
       or semantic_receipt.semantic_source_kind <> 'payment_transition'
       or semantic_fact.inbox_item_id <> semantic_receipt.inbox_item_id
       or semantic_fact.series_id <> capture_row.series_id
       or semantic_fact.provider_account_id <> capture_row.provider_account_id
       or semantic_fact.provider_identity_version <> capture_row.provider_identity_version
       or semantic_fact.economic_payment_intent_id <> capture_row.economic_payment_intent_id
       or semantic_fact.economic_payment_session_id is distinct from capture_row.economic_payment_session_id
       or semantic_fact.provider_payment_id is distinct from capture_row.provider_payment_id
       or semantic_fact.amount_minor is distinct from capture_row.amount_minor
       or semantic_fact.currency is distinct from capture_row.currency
       or semantic_fact.purpose <> intent_row.purpose
       or semantic_fact.evidence_artifact_id <> capture_row.evidence_artifact_id
       or semantic_fact.evidence_artifact_digest <> capture_row.evidence_artifact_digest
       or capture_row.evidence_authority_kind <> 'provider_semantic_fact'
       or capture_row.evidence_authority_id <> semantic_fact.id
       or capture_row.captured_at <> semantic_fact.observed_at
       or transition_row.intent_version_to <> intent_row.version
       or transition_row.session_version_to <> session_row.version
       or transition_row.series_id <> capture_row.series_id
       or transition_row.provider_account_id <> capture_row.provider_account_id
       or transition_row.provider_identity_version <> capture_row.provider_identity_version then
      raise exception 'capture application receipt semantic and economic facts are cross-wired'
        using errcode = '23514';
    end if;
  else
    select * into strict result_receipt
      from finance_provider_operation_result_commit_receipts
      where id = new.provider_result_receipt_id;

    if new.provider_semantic_fact_id is not null
       or new.provider_semantic_commit_receipt_id is not null
       or result_receipt.outcome <> 'succeeded'
       or result_receipt.economic_payment_intent_id <> capture_row.economic_payment_intent_id
       or result_receipt.economic_payment_session_id is distinct from capture_row.economic_payment_session_id
       or result_receipt.series_id <> capture_row.series_id
       or result_receipt.provider_account_id <> capture_row.provider_account_id
       or result_receipt.provider_identity_version <> capture_row.provider_identity_version
       or result_receipt.provider_payment_id is distinct from capture_row.provider_payment_id
       or result_receipt.amount_minor is distinct from capture_row.amount_minor
       or result_receipt.currency is distinct from capture_row.currency
       or result_receipt.evidence_artifact_id <> capture_row.evidence_artifact_id
       or result_receipt.evidence_artifact_digest <> capture_row.evidence_artifact_digest
       or capture_row.evidence_authority_kind <> 'provider_operation_result'
       or capture_row.evidence_authority_id <> result_receipt.provider_operation_result_id
       or capture_row.captured_at <> result_receipt.observed_at
       or transition_row.intent_version_to <> intent_row.version
       or transition_row.session_version_to <> session_row.version
       or transition_row.series_id <> capture_row.series_id
       or transition_row.provider_account_id <> capture_row.provider_account_id
       or transition_row.provider_identity_version <> capture_row.provider_identity_version then
      raise exception 'capture application receipt provider and economic facts are cross-wired'
        using errcode = '23514';
    end if;

    if not (
      (intent_row.purpose = 'platform_invoice'
        and result_receipt.operation_kind = 'saved_card_charge')
      or (intent_row.purpose = 'platform_card_setup'
        and result_receipt.operation_kind = 'card_setup')
    ) then
      raise exception 'capture application operation is not enabled for this launch purpose'
        using errcode = '23514';
    end if;
  end if;

  new.receipt_id := gen_random_uuid();
  new.outbox_event_id := gen_random_uuid();
  new.receipt_version := 1;
  new.economic_payment_intent_id := capture_row.economic_payment_intent_id;
  new.economic_payment_version := intent_row.version;
  new.economic_payment_session_id := capture_row.economic_payment_session_id;
  new.economic_payment_session_version := session_row.version;
  new.purpose := intent_row.purpose;
  new.source_id := intent_row.source_id;
  new.economic_effect_kind := case intent_row.purpose
    when 'client_order' then 'client_sale_captured'
    when 'platform_invoice' then 'platform_invoice_captured'
    when 'platform_card_setup' then 'platform_card_setup_captured'
    else null
  end;
  new.capture_transition_fact_id := transition_row.id;
  new.capture_evidence_authority_kind := capture_row.evidence_authority_kind;
  new.capture_evidence_authority_id := capture_row.evidence_authority_id;
  if intent_row.purpose = 'client_order' then
    new.provider_result_receipt_id := null;
    new.provider_operation_result_id := null;
    new.provider_operation_intent_id := null;
    new.provider_operation_intent_version := null;
    new.correlated_economic_payment_version := null;
    new.operation_kind := null;
    new.provider_account_series_id := semantic_fact.series_id;
    new.provider_account_id := semantic_fact.provider_account_id;
    new.provider_identity_version := semantic_fact.provider_identity_version;
    new.provider_operation_outcome := null;
    new.provider_operation_id := null;
    new.provider_payment_id := semantic_fact.provider_payment_id;
    new.amount_minor := semantic_fact.amount_minor;
    new.currency := semantic_fact.currency;
    new.canonical_request_digest := semantic_fact.canonical_fact_digest;
    new.evidence_artifact_id := semantic_fact.evidence_artifact_id;
    new.evidence_artifact_digest := semantic_fact.evidence_artifact_digest;
    new.provider_observed_at := semantic_fact.observed_at;
  else
    new.provider_semantic_fact_id := null;
    new.provider_semantic_commit_receipt_id := null;
    new.provider_operation_result_id := result_receipt.provider_operation_result_id;
    new.provider_operation_intent_id := result_receipt.provider_operation_intent_id;
    new.provider_operation_intent_version := result_receipt.provider_operation_intent_version;
    new.correlated_economic_payment_version := result_receipt.correlated_economic_payment_version;
    new.operation_kind := result_receipt.operation_kind;
    new.provider_account_series_id := result_receipt.series_id;
    new.provider_account_id := result_receipt.provider_account_id;
    new.provider_identity_version := result_receipt.provider_identity_version;
    new.provider_operation_outcome := result_receipt.outcome;
    new.provider_operation_id := result_receipt.provider_operation_id;
    new.provider_payment_id := result_receipt.provider_payment_id;
    new.amount_minor := result_receipt.amount_minor;
    new.currency := result_receipt.currency;
    new.canonical_request_digest := result_receipt.canonical_request_digest;
    new.evidence_artifact_id := result_receipt.evidence_artifact_id;
    new.evidence_artifact_digest := result_receipt.evidence_artifact_digest;
    new.provider_observed_at := result_receipt.observed_at;
  end if;

  if intent_row.purpose = 'platform_card_setup' then
    if result_receipt.amount_minor <> 0 or result_receipt.currency <> 'RUB' then
      raise exception 'card setup capture must be the exact zero RUB provider result'
        using errcode = '23514';
    end if;
    new.clearing_state := null;
    new.clearing_version := null;
  else
    select * into strict clearing_row
      from finance_payment_clearing_heads
      where economic_payment_intent_id = intent_row.id;
    new.clearing_state := clearing_row.state;
    new.clearing_version := clearing_row.version;
  end if;

  if intent_row.purpose = 'client_order' then
    select * into strict economics_row
      from finance_order_economics_snapshots
      where order_id = intent_row.source_id;
    new.astrologer_user_id := economics_row.astrologer_user_id;
    new.order_economics_digest := economics_row.canonical_digest;
  else
    new.astrologer_user_id := null;
    new.order_economics_digest := null;
  end if;

  if new.journal_persistence_receipt_id is not null then
    select * into strict journal_receipt
      from finance_persistence_commit_receipts
      where receipt_id = new.journal_persistence_receipt_id;
    select * into strict journal_row
      from finance_journal_transactions
      where id = journal_receipt.journal_transaction_id;
    select * into strict proof_row
      from finance_allocation_link_proofs
      where id = journal_receipt.proof_record_id;
    new.journal_transaction_id := journal_receipt.journal_transaction_id;
    new.journal_transaction_digest := journal_row.canonical_digest;
    new.journal_commit_digest := journal_receipt.canonical_digest;
    new.journal_link_proof_id := proof_row.proof_id;
    new.journal_link_proof_version := proof_row.version;
    new.journal_link_proof_digest := proof_row.proof_digest;
  else
    new.journal_transaction_id := null;
    new.journal_transaction_digest := null;
    new.journal_commit_digest := null;
    new.journal_link_proof_id := null;
    new.journal_link_proof_version := null;
    new.journal_link_proof_digest := null;
  end if;

  if new.wallet_commit_receipt_id is not null then
    select * into strict wallet_binding
      from finance_wallet_commit_bindings
      where commit_receipt_id = new.wallet_commit_receipt_id;
    new.wallet_operation_id := wallet_binding.operation_id;
    new.wallet_id := wallet_binding.next_wallet_id;
    new.wallet_revision := wallet_binding.next_wallet_revision;
    new.wallet_commit_digest := wallet_binding.commit_receipt_canonical_digest;

    select * into strict root_lot
      from finance_payable_lots lot
      where lot.lineage_depth = 0
        and lot.root_lot_id = lot.lot_id
        and lot.wallet_id = wallet_binding.next_wallet_id
        and lot.created_by_operation_id = wallet_binding.operation_id
        and lot.original_sale_id = intent_row.source_id
        and lot.capture_intent_id = capture_row.economic_payment_intent_id
        and lot.canonical_capture_evidence_id = capture_row.id;
    new.root_payable_lot_id := root_lot.lot_id;
    new.risk_policy_id := root_lot.risk_policy_id;
    new.risk_policy_version := root_lot.risk_policy_version;
    new.risk_policy_digest := root_lot.risk_policy_digest;
    new.fulfillment_decision_id := root_lot.fulfillment_decision_id;
    new.fulfillment_decision_version := root_lot.fulfillment_decision_version;
    new.fulfillment_decision_digest := root_lot.fulfillment_decision_digest;
  else
    new.wallet_operation_id := null;
    new.wallet_id := null;
    new.wallet_revision := null;
    new.wallet_commit_digest := null;
    new.root_payable_lot_id := null;
    new.risk_policy_id := null;
    new.risk_policy_version := null;
    new.risk_policy_digest := null;
    new.fulfillment_decision_id := null;
    new.fulfillment_decision_version := null;
    new.fulfillment_decision_digest := null;
  end if;

  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := finance_canonical_jsonb_v1(
    jsonb_build_object(
    'kind', 'verified_capture_application_commit_receipt',
    'schemaVersion', new.receipt_version,
    'receiptId', new.receipt_id::text,
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'economicPaymentVersion', new.economic_payment_version::text,
    'economicPaymentSessionId', new.economic_payment_session_id,
    'economicPaymentSessionVersion', new.economic_payment_session_version::text,
    'purpose', new.purpose,
    'sourceId', new.source_id,
    'economicEffectKind', new.economic_effect_kind,
    'captureFactId', new.capture_fact_id,
    'captureTransitionFactId', new.capture_transition_fact_id,
    'captureEvidenceAuthorityKind', new.capture_evidence_authority_kind,
    'captureEvidenceAuthorityId', new.capture_evidence_authority_id,
    'providerResultReceiptId', new.provider_result_receipt_id::text,
    'providerSemanticFactId', new.provider_semantic_fact_id,
    'providerSemanticCommitReceiptId', new.provider_semantic_commit_receipt_id::text,
    'providerOperationResultId', new.provider_operation_result_id,
    'providerOperationIntentId', new.provider_operation_intent_id,
    'providerOperationIntentVersion', new.provider_operation_intent_version::text,
    'correlatedEconomicPaymentVersion', new.correlated_economic_payment_version::text,
    'operationKind', new.operation_kind,
    'providerAccountSeriesId', new.provider_account_series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'providerOperationOutcome', new.provider_operation_outcome,
    'providerOperationId', new.provider_operation_id,
    'providerPaymentId', new.provider_payment_id,
    'amountMinor', new.amount_minor::text,
    'currency', new.currency,
    'canonicalRequestDigest', new.canonical_request_digest,
    'evidenceArtifactId', new.evidence_artifact_id,
      'evidenceArtifactDigest', new.evidence_artifact_digest,
      'providerObservedAt', to_char(new.provider_observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ) || jsonb_build_object(
    'astrologerUserId', new.astrologer_user_id::text,
    'orderEconomicsDigest', new.order_economics_digest,
    'rootPayableLotId', new.root_payable_lot_id,
    'riskPolicyId', new.risk_policy_id,
    'riskPolicyVersion', new.risk_policy_version::text,
    'riskPolicyDigest', new.risk_policy_digest,
    'fulfillmentDecisionId', new.fulfillment_decision_id,
    'fulfillmentDecisionVersion', new.fulfillment_decision_version::text,
    'fulfillmentDecisionDigest', new.fulfillment_decision_digest,
    'clearingState', new.clearing_state,
    'clearingVersion', new.clearing_version::text,
    'journalPersistenceReceiptId', new.journal_persistence_receipt_id,
    'journalTransactionId', new.journal_transaction_id,
    'journalTransactionDigest', new.journal_transaction_digest,
    'journalCommitDigest', new.journal_commit_digest,
    'journalLinkProofId', new.journal_link_proof_id,
    'journalLinkProofVersion', new.journal_link_proof_version,
    'journalLinkProofDigest', new.journal_link_proof_digest,
    'walletCommitReceiptId', new.wallet_commit_receipt_id,
    'walletOperationId', new.wallet_operation_id,
    'walletId', new.wallet_id::text,
    'walletRevision', new.wallet_revision::text,
    'walletCommitDigest', new.wallet_commit_digest,
    'outboxEventId', new.outbox_event_id::text,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
      'committedAt', to_char(new.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    )
  );
  new.canonical_digest := 'sha256:' || encode(
    digest(convert_to(new.canonical_preimage, 'UTF8'), 'sha256'),
    'hex'
  );
  exception
    when no_data_found or too_many_rows then
      raise exception 'capture application authority graph is incomplete or ambiguous'
        using errcode = '23514';
  end;

  insert into outbox_events (id, event_type, aggregate_id, payload)
  values (
    new.outbox_event_id,
    'finance.economic_payment.capture_applied',
    new.receipt_id,
    jsonb_build_object('captureApplicationReceiptId', new.receipt_id::text)
  );
  return new;
end;
$$;

create trigger finance_issue_verified_capture_application_receipt
before insert on finance_verified_capture_application_receipts
for each row execute function finance_issue_verified_capture_application_receipt();

create or replace function finance_capture_application_journal_matches(
  application_row finance_verified_capture_application_receipts
)
returns boolean language plpgsql stable set search_path = pg_catalog, public as $$
declare
  economics_row finance_order_economics_snapshots%rowtype;
  expected_entry_count integer;
begin
  if application_row.purpose = 'platform_card_setup' then
    return application_row.journal_persistence_receipt_id is null;
  end if;
  if application_row.journal_persistence_receipt_id is null then
    return false;
  end if;

  if application_row.purpose = 'client_order' then
    select * into strict economics_row
      from finance_order_economics_snapshots
      where order_id = application_row.source_id;
    expected_entry_count := 1
      + case when economics_row.payable_amount_minor > 0 then 1 else 0 end
      + case when economics_row.commission_amount_minor > 0 then 1 else 0 end;
    return exists (
      select 1
      from finance_journal_transactions journal_transaction
      join finance_source_identities source_identity
        on source_identity.id = journal_transaction.source_identity_id
      where journal_transaction.id = application_row.journal_transaction_id
        and journal_transaction.reverses_journal_transaction_id is null
        and journal_transaction.currency = application_row.currency
        and journal_transaction.entry_count = expected_entry_count
        and journal_transaction.total_debit_minor = application_row.amount_minor
        and journal_transaction.total_credit_minor = application_row.amount_minor
        and source_identity.source_kind = 'order'
        and source_identity.source_id = application_row.source_id
        and source_identity.source_operation_key = 'sale_captured'
        and source_identity.source_scope_kind = 'provider_account_and_astrologer'
        and source_identity.provider_account_series_id = application_row.provider_account_series_id
        and source_identity.provider_account_id = application_row.provider_account_id
        and source_identity.provider_identity_version = application_row.provider_identity_version
        and source_identity.astrologer_user_id = application_row.astrologer_user_id
        and source_identity.bank_cash_pool_id is null
        and source_identity.refund_id is null
        and source_identity.payout_request_id is null
        and (select count(*) from finance_journal_entries entry
             where entry.journal_transaction_id = journal_transaction.id) = expected_entry_count
        and (select count(*)
             from finance_journal_entries entry
             join finance_accounts account on account.id = entry.account_id
             where entry.journal_transaction_id = journal_transaction.id
               and account.code = 'arc_provider_clearing'
               and account.provider_account_series_id = application_row.provider_account_series_id
               and account.provider_account_id = application_row.provider_account_id
               and account.provider_identity_version = application_row.provider_identity_version
               and entry.side = 'debit'
               and entry.amount_minor = economics_row.gross_amount_minor
               and entry.currency = application_row.currency
               and entry.original_sale_id = application_row.source_id
               and entry.component_id is not null
               and entry.payable_lot_id is null
               and entry.payout_allocation_id is null) = 1
        and (select count(*)
             from finance_journal_entries entry
             join finance_accounts account on account.id = entry.account_id
             where entry.journal_transaction_id = journal_transaction.id
               and account.code = 'astrologer_pending'
               and account.astrologer_user_id = application_row.astrologer_user_id
               and entry.side = 'credit'
               and entry.amount_minor = economics_row.payable_amount_minor
               and entry.currency = application_row.currency
               and entry.original_sale_id = application_row.source_id
               and entry.component_id is not null
               and entry.payable_lot_id is null
               and entry.payout_allocation_id is null) =
          case when economics_row.payable_amount_minor > 0 then 1 else 0 end
        and (select count(*)
             from finance_journal_entries entry
             join finance_accounts account on account.id = entry.account_id
             where entry.journal_transaction_id = journal_transaction.id
               and account.code = 'platform_commission_deferred'
               and account.scope_kind = 'platform'
               and entry.side = 'credit'
               and entry.amount_minor = economics_row.commission_amount_minor
               and entry.currency = application_row.currency
               and entry.original_sale_id = application_row.source_id
               and entry.component_id is not null
               and entry.payable_lot_id is null
               and entry.payout_allocation_id is null) =
          case when economics_row.commission_amount_minor > 0 then 1 else 0 end
        and not exists (
          select 1
          from finance_journal_entries entry
          join finance_accounts account on account.id = entry.account_id
          where entry.journal_transaction_id = journal_transaction.id
            and account.code = 'bank_cash'
        )
    );
  end if;

  if application_row.purpose = 'platform_invoice' then
    return exists (
      select 1
      from finance_journal_transactions journal_transaction
      join finance_source_identities source_identity
        on source_identity.id = journal_transaction.source_identity_id
      where journal_transaction.id = application_row.journal_transaction_id
        and journal_transaction.reverses_journal_transaction_id is null
        and journal_transaction.currency = application_row.currency
        and journal_transaction.entry_count = 2
        and journal_transaction.total_debit_minor = application_row.amount_minor
        and journal_transaction.total_credit_minor = application_row.amount_minor
        and source_identity.source_kind = 'platform_invoice'
        and source_identity.source_id = application_row.source_id
        and source_identity.source_operation_key = 'captured'
        and source_identity.source_scope_kind = 'provider_account'
        and source_identity.provider_account_series_id = application_row.provider_account_series_id
        and source_identity.provider_account_id = application_row.provider_account_id
        and source_identity.provider_identity_version = application_row.provider_identity_version
        and source_identity.bank_cash_pool_id is null
        and source_identity.astrologer_user_id is null
        and source_identity.refund_id is null
        and source_identity.payout_request_id is null
        and (select count(*) from finance_journal_entries entry
             where entry.journal_transaction_id = journal_transaction.id) = 2
        and (select count(*)
             from finance_journal_entries entry
             join finance_accounts account on account.id = entry.account_id
             where entry.journal_transaction_id = journal_transaction.id
               and account.code = 'arc_provider_clearing'
               and account.provider_account_series_id = application_row.provider_account_series_id
               and account.provider_account_id = application_row.provider_account_id
               and account.provider_identity_version = application_row.provider_identity_version
               and entry.side = 'debit'
               and entry.amount_minor = application_row.amount_minor
               and entry.currency = application_row.currency
               and entry.original_sale_id is null
               and entry.component_id is null
               and entry.payable_lot_id is null
               and entry.payout_allocation_id is null) = 1
        and (select count(*)
             from finance_journal_entries entry
             join finance_accounts account on account.id = entry.account_id
             where entry.journal_transaction_id = journal_transaction.id
               and account.code = 'platform_subscription_deferred'
               and account.scope_kind = 'platform'
               and entry.side = 'credit'
               and entry.amount_minor = application_row.amount_minor
               and entry.currency = application_row.currency
               and entry.original_sale_id is null
               and entry.component_id is null
               and entry.payable_lot_id is null
               and entry.payout_allocation_id is null) = 1
        and not exists (
          select 1
          from finance_journal_entries entry
          join finance_accounts account on account.id = entry.account_id
          where entry.journal_transaction_id = journal_transaction.id
            and account.code = 'bank_cash'
        )
    );
  end if;
  return false;
exception
  when no_data_found or too_many_rows then
    return false;
end;
$$;

create or replace function finance_validate_verified_capture_application_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  economics_row finance_order_economics_snapshots%rowtype;
  journal_receipt finance_persistence_commit_receipts%rowtype;
  wallet_binding finance_wallet_commit_bindings%rowtype;
begin
  if not exists (
    select 1 from outbox_events event
    where event.id = new.outbox_event_id
      and event.event_type = 'finance.economic_payment.capture_applied'
      and event.aggregate_id = new.receipt_id
      and event.payload = jsonb_build_object('captureApplicationReceiptId', new.receipt_id::text)
      and event.status = 'pending'
      and event.attempts = 0
      and event.xmin = pg_current_xact_id()::xid
  ) then
    raise exception 'capture application receipt requires the exact IDs-only outbox event'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from finance_economic_payment_intents intent
    join finance_economic_payment_sessions session
      on session.id = new.economic_payment_session_id
     and session.economic_payment_intent_id = intent.id
    where intent.id = new.economic_payment_intent_id
      and intent.version = new.economic_payment_version
      and intent.state = 'captured'
      and intent.purpose = new.purpose
      and intent.source_id = new.source_id
      and session.version = new.economic_payment_session_version
      and session.state = 'captured'
      and session.terminal_at is not null
  ) then
    raise exception 'capture application receipt requires the exact committed economic head'
      using errcode = '40001';
  end if;

  if not exists (
    select 1
    from finance_economic_payment_intents intent
    join finance_economic_payment_sessions session
      on session.id = new.economic_payment_session_id
     and session.economic_payment_intent_id = intent.id
    join finance_payment_transition_facts transition_fact
      on transition_fact.id = new.capture_transition_fact_id
     and transition_fact.economic_payment_intent_id = intent.id
     and transition_fact.economic_payment_session_id = session.id
     and transition_fact.intent_version_to = new.economic_payment_version
     and transition_fact.session_version_to = new.economic_payment_session_version
     and transition_fact.to_state = 'captured'
     and transition_fact.authority_kind = new.capture_evidence_authority_kind
     and transition_fact.authority_id = new.capture_evidence_authority_id
     and transition_fact.evidence_artifact_id = new.evidence_artifact_id
     and transition_fact.evidence_artifact_digest = new.evidence_artifact_digest
    join finance_capture_facts capture
      on capture.id = new.capture_fact_id
     and capture.economic_payment_intent_id = intent.id
     and capture.economic_payment_session_id = session.id
    where intent.id = new.economic_payment_intent_id
      and intent.xmin = pg_current_xact_id()::xid
      and session.xmin = pg_current_xact_id()::xid
      and transition_fact.xmin = pg_current_xact_id()::xid
      and capture.xmin = pg_current_xact_id()::xid
      and (
        (new.purpose = 'platform_card_setup' and not exists (
          select 1 from finance_payment_clearing_heads clearing
          where clearing.economic_payment_intent_id = new.economic_payment_intent_id
        ))
        or (new.purpose <> 'platform_card_setup' and exists (
          select 1 from finance_payment_clearing_heads clearing
          where clearing.economic_payment_intent_id = new.economic_payment_intent_id
            and clearing.series_id = new.provider_account_series_id
            and clearing.provider_account_id = new.provider_account_id
            and clearing.provider_identity_version = new.provider_identity_version
            and clearing.currency = new.currency
            and clearing.state = new.clearing_state
            and clearing.version = new.clearing_version
            and clearing.state = 'unmatched'
            and clearing.version = 1
            and clearing.xmin = pg_current_xact_id()::xid
        ))
      )
  ) then
    raise exception 'capture application effects must share the current PostgreSQL transaction'
      using errcode = '40001';
  end if;

  if new.journal_persistence_receipt_id is not null then
    select * into strict journal_receipt
      from finance_persistence_commit_receipts
      where receipt_id = new.journal_persistence_receipt_id;
    if journal_receipt.persistence_transaction_boundary_ref <> new.persistence_transaction_boundary_ref
       or journal_receipt.journal_transaction_id <> new.journal_transaction_id
       or journal_receipt.canonical_digest <> new.journal_commit_digest
       or not exists (
         select 1 from finance_persistence_commit_receipts current_receipt
         where current_receipt.receipt_id = new.journal_persistence_receipt_id
           and current_receipt.xmin = pg_current_xact_id()::xid
       ) then
      raise exception 'capture application journal must share the persistence transaction boundary'
        using errcode = '23514';
    end if;
  end if;

  if not finance_capture_application_journal_matches(new) then
    raise exception 'capture application journal does not match its exact economic posting'
      using errcode = '23514';
  end if;

  if new.purpose = 'client_order' then
    select * into strict economics_row
      from finance_order_economics_snapshots
      where order_id = new.source_id;
    if economics_row.canonical_digest <> new.order_economics_digest
       or economics_row.astrologer_user_id <> new.astrologer_user_id
       or economics_row.gross_amount_minor <> new.amount_minor
       or economics_row.gross_currency <> new.currency
       or ((economics_row.payable_amount_minor > 0) <> (new.wallet_commit_receipt_id is not null)) then
      raise exception 'client capture financial path must match the immutable order economics'
        using errcode = '23514';
    end if;

    if new.wallet_commit_receipt_id is not null then
      select * into strict wallet_binding
        from finance_wallet_commit_bindings
        where commit_receipt_id = new.wallet_commit_receipt_id;
      if wallet_binding.operation_id <> new.capture_fact_id
         or wallet_binding.persistence_transaction_boundary_ref <> new.persistence_transaction_boundary_ref
         or wallet_binding.journal_persistence_receipt_id <> new.journal_persistence_receipt_id
         or wallet_binding.journal_transaction_id <> new.journal_transaction_id
         or wallet_binding.journal_transaction_digest <> new.journal_transaction_digest
         or wallet_binding.journal_link_proof_id <> new.journal_link_proof_id
         or wallet_binding.journal_link_proof_digest <> new.journal_link_proof_digest
         or wallet_binding.astrologer_user_id <> new.astrologer_user_id
         or not exists (
           select 1 from finance_wallet_commit_bindings current_binding
           where current_binding.commit_receipt_id = new.wallet_commit_receipt_id
             and current_binding.xmin = pg_current_xact_id()::xid
         ) then
        raise exception 'capture application wallet and journal commits are cross-wired'
          using errcode = '23514';
      end if;
      if (select count(*) from finance_payable_lots lot
        where lot.lot_id = new.root_payable_lot_id
          and lot.lineage_depth = 0
          and lot.root_lot_id = lot.lot_id
          and lot.parent_lot_id is null
          and lot.wallet_id = new.wallet_id
          and lot.astrologer_user_id = new.astrologer_user_id
          and lot.created_by_operation_id = new.wallet_operation_id
          and lot.created_by_receipt_id = wallet_binding.operation_receipt_id
          and lot.created_effect_id = new.wallet_operation_id || ':effect:1'
          and lot.component_slot_id = new.wallet_operation_id || ':component-slot:1'
          and lot.original_sale_id = new.source_id
          and lot.amount_minor = economics_row.payable_amount_minor
          and lot.currency = new.currency
          and lot.bucket = 'pending'
          and lot.captured_at = new.provider_observed_at
          and lot.created_at = lot.captured_at
          and lot.became_available_at is null
          and lot.capture_intent_id = new.economic_payment_intent_id
          and lot.capture_session_id = new.economic_payment_session_id
          and lot.provider_account_series_id = new.provider_account_series_id
          and lot.provider_account_id = new.provider_account_id
          and lot.provider_identity_version = new.provider_identity_version
          and lot.provider_payment_id = new.provider_payment_id
          and lot.canonical_capture_evidence_id = new.capture_fact_id
          and lot.capture_amount_minor = new.amount_minor
          and lot.capture_currency = new.currency
          and lot.capture_evidence_authority_kind = new.capture_evidence_authority_kind
          and lot.capture_evidence_authority_id = new.capture_evidence_authority_id
          and lot.capture_evidence_artifact_id = new.evidence_artifact_id
          and lot.capture_evidence_artifact_digest = new.evidence_artifact_digest
          and lot.economics_snapshot_digest = new.order_economics_digest
          and lot.risk_policy_id = new.risk_policy_id
          and lot.risk_policy_version = new.risk_policy_version
          and lot.risk_policy_digest = new.risk_policy_digest
          and lot.fulfillment_decision_id = new.fulfillment_decision_id
          and lot.fulfillment_decision_version = new.fulfillment_decision_version
          and lot.fulfillment_decision_digest = new.fulfillment_decision_digest
          and lot.payout_request_id is null
          and lot.payout_allocation_id is null
          and lot.refund_id is null
          and lot.xmin = pg_current_xact_id()::xid
      ) <> 1 then
        raise exception 'capture application wallet commit requires exactly one exact persisted root lot'
          using errcode = '23514';
      end if;
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_verified_capture_application_receipt
after insert on finance_verified_capture_application_receipts
deferrable initially deferred
for each row execute function finance_validate_verified_capture_application_receipt();

create or replace function finance_require_verified_capture_application_for_capture_fact()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  verified_application_count integer;
  online_sale_application_count integer := 0;
begin
  select count(*) into verified_application_count
       from finance_verified_capture_application_receipts receipt
      where receipt.capture_fact_id = new.id
        and receipt.economic_payment_intent_id = new.economic_payment_intent_id
        and receipt.economic_payment_session_id = new.economic_payment_session_id
        and receipt.provider_account_series_id = new.series_id
        and receipt.provider_account_id = new.provider_account_id
        and receipt.provider_identity_version = new.provider_identity_version
        and receipt.provider_payment_id = new.provider_payment_id
        and receipt.amount_minor = new.amount_minor
        and receipt.currency = new.currency
        and receipt.capture_evidence_authority_kind = new.evidence_authority_kind
        and receipt.capture_evidence_authority_id = new.evidence_authority_id
        and receipt.evidence_artifact_id = new.evidence_artifact_id
        and receipt.evidence_artifact_digest = new.evidence_artifact_digest
        and receipt.xmin = pg_current_xact_id()::xid;
  -- Older focused authority fixtures intentionally do not install the distinct v2 graph.
  -- Production baseline always does; dynamic SQL keeps the v1 fixture a valid isolated proof
  -- without weakening full-schema enforcement.
  if to_regclass('public.finance_online_sale_capture_applications') is not null then
    execute $online_sale_application$
      select count(*)
        from finance_online_sale_capture_applications application
       where application.capture_fact_id = $1
         and application.economic_payment_intent_id = $2
         and application.economic_payment_session_id = $3
         and application.provider_account_series_id = $4
         and application.provider_account_id = $5
         and application.provider_identity_version = $6
         and application.provider_payment_id = $7
         and application.amount_minor = $8
         and application.currency = $9
         and application.evidence_authority_kind = $10
         and application.semantic_fact_id = $11
         and application.evidence_artifact_id = $12
         and application.evidence_artifact_digest = $13
         and application.xmin = pg_current_xact_id()::xid
    $online_sale_application$
    into online_sale_application_count
    using new.id, new.economic_payment_intent_id, new.economic_payment_session_id,
      new.series_id, new.provider_account_id, new.provider_identity_version,
      new.provider_payment_id, new.amount_minor, new.currency, new.evidence_authority_kind,
      new.evidence_authority_id, new.evidence_artifact_id, new.evidence_artifact_digest;
  end if;
  if verified_application_count + online_sale_application_count <> 1 then
    raise exception 'capture fact requires its DB-issued verified application receipt or v2 online-sale application'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_verified_capture_application_for_capture_fact
after insert on finance_capture_facts
deferrable initially deferred
for each row execute function finance_require_verified_capture_application_for_capture_fact();

create or replace function finance_reject_verified_capture_application_receipt_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'verified capture application receipts are immutable' using errcode = '55000';
end;
$$;

create trigger finance_verified_capture_application_receipts_immutable
before update or delete on finance_verified_capture_application_receipts
for each row execute function finance_reject_verified_capture_application_receipt_mutation();
create trigger finance_verified_capture_application_receipts_no_truncate
before truncate on finance_verified_capture_application_receipts
for each statement execute function finance_reject_verified_capture_application_receipt_mutation();
`;
