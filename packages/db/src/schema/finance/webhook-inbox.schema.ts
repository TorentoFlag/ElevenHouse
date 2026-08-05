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

import { financeArtifacts } from "./finance-artifacts.schema";
import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions
} from "./economic-payments.schema";
import {
  financeCurrencyValues,
  financeNumeric38String,
  financePaymentProviderEnvironmentValues,
  financePaymentProviderValues,
  financeRevisionString,
  formatFinanceSqlValues
} from "./finance-values";
import { financeProviderAccounts } from "./provider-accounts.schema";

const webhookProcessingStatusValues = ["stored", "processing", "completed", "quarantined"] as const;
const webhookProcessingErrorClassValues = [
  "transient_infrastructure",
  "canonical_provider_read_unavailable",
  "processor_contract_violation",
  "unexpected_internal_failure"
] as const;
const webhookSemanticSourceKindValues = [
  "payment_transition",
  "refund",
  "chargeback",
  "settlement_entry"
] as const;
const webhookPurposeValues = ["client_order", "platform_invoice", "platform_card_setup"] as const;
const webhookSemanticDispositionValues = ["applied_once", "quarantined_no_effect"] as const;

export const financeWebhookInbox = pgTable(
  "finance_webhook_inbox",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    provider: text("provider").notNull(),
    receivingEnvironment: text("receiving_environment").notNull(),
    transportEventId: varchar("transport_event_id", { length: 160 }).notNull(),
    providerEventType: varchar("provider_event_type", { length: 160 }).notNull(),
    artifactId: varchar("artifact_id", { length: 160 }).notNull(),
    rawBodyDigest: varchar("raw_body_digest", { length: 71 }).notNull(),
    signatureStatus: text("signature_status").notNull(),
    signatureScheme: varchar("signature_scheme", { length: 160 }).notNull(),
    verifierContractVersion: varchar("verifier_contract_version", { length: 160 }).notNull(),
    webhookSigningKeyVersionId: varchar("webhook_signing_key_version_id", {
      length: 160
    }).notNull(),
    signedTimestamp: timestamp("signed_timestamp", { withTimezone: true }).notNull(),
    signatureEvidenceDigest: varchar("signature_evidence_digest", { length: 71 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    processingStatus: text("processing_status").notNull(),
    processingAttempts: financeRevisionString("processing_attempts").notNull(),
    lastErrorClass: text("last_error_class"),
    lastCheckpointSequence: financeRevisionString("last_checkpoint_sequence").notNull(),
    lastProcessorVersion: financeRevisionString("last_processor_version"),
    lastCheckpointCode: varchar("last_checkpoint_code", { length: 160 }),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    leaseOwnerId: varchar("lease_owner_id", { length: 160 }),
    leaseFence: financeRevisionString("lease_fence").notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    version: financeRevisionString("version").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_webhook_inbox_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.artifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_webhook_inbox_artifact_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_webhook_inbox_transport_identity_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.transportEventId
    ),
    uniqueIndex("finance_webhook_inbox_artifact_unique").on(table.artifactId),
    unique("finance_webhook_inbox_exact_owner_unique").on(
      table.id,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion
    ),
    unique("finance_webhook_inbox_receipt_owner_unique").on(
      table.id,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.artifactId,
      table.rawBodyDigest,
      table.signatureEvidenceDigest
    ),
    unique("finance_webhook_inbox_terminal_receipt_owner_unique").on(
      table.id,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.version,
      table.lastCheckpointSequence,
      table.processingStatus
    ),
    check(
      "finance_webhook_inbox_identifier_check",
      sql`length(trim(${table.id})) between 1 and 160
        and ${table.id} = trim(${table.id})
        and ${table.id} !~ '[[:cntrl:]]'
        and length(trim(${table.transportEventId})) between 1 and 160
        and ${table.transportEventId} = trim(${table.transportEventId})
        and ${table.transportEventId} !~ '[[:cntrl:]]'
        and length(trim(${table.providerEventType})) between 1 and 160
        and ${table.providerEventType} = trim(${table.providerEventType})
        and ${table.providerEventType} !~ '[[:cntrl:]]'
        and length(trim(${table.signatureScheme})) between 1 and 160
        and ${table.signatureScheme} = trim(${table.signatureScheme})
        and ${table.signatureScheme} !~ '[[:cntrl:]]'
        and length(trim(${table.verifierContractVersion})) between 1 and 160
        and ${table.verifierContractVersion} = trim(${table.verifierContractVersion})
        and ${table.verifierContractVersion} !~ '[[:cntrl:]]'
        and length(trim(${table.webhookSigningKeyVersionId})) between 1 and 160
        and ${table.webhookSigningKeyVersionId} = trim(${table.webhookSigningKeyVersionId})
        and ${table.webhookSigningKeyVersionId} !~ '[[:cntrl:]]'
        and length(trim(${table.artifactId})) between 1 and 160
        and ${table.artifactId} = trim(${table.artifactId})
        and ${table.artifactId} !~ '[[:cntrl:]]'`
    ),
    check(
      "finance_webhook_inbox_signature_check",
      sql`${table.provider} in ${sql.raw(formatFinanceSqlValues(financePaymentProviderValues))}
        and ${table.receivingEnvironment} in ${sql.raw(
          formatFinanceSqlValues(financePaymentProviderEnvironmentValues)
        )}
        and ${table.signatureStatus} = 'verified'
        and ${table.rawBodyDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.signatureEvidenceDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.verifiedAt} <= ${table.receivedAt}`
    ),
    check(
      "finance_webhook_inbox_lease_shape_check",
      sql`${table.leaseFence} >= 0
        and (
          (${table.processingStatus} = 'processing'
            and ${table.leaseOwnerId} is not null
            and length(trim(${table.leaseOwnerId})) between 1 and 160
            and ${table.leaseOwnerId} = trim(${table.leaseOwnerId})
            and ${table.leaseOwnerId} !~ '[[:cntrl:]]'
            and ${table.leaseFence} >= 1
            and ${table.claimedAt} is not null
            and ${table.leaseExpiresAt} > ${table.claimedAt})
          or (${table.processingStatus} <> 'processing'
            and ${table.leaseOwnerId} is null
            and ${table.leaseExpiresAt} is null)
        )`
    ),
    check(
      "finance_webhook_inbox_state_time_check",
      sql`${table.processingStatus} in ${sql.raw(
        formatFinanceSqlValues(webhookProcessingStatusValues)
      )}
        and ${table.version} >= 1
        and ${table.processingAttempts} >= 0
        and ${table.lastCheckpointSequence} >= 0
        and ${table.availableAt} >= ${table.receivedAt}
        and ${table.updatedAt} >= ${table.receivedAt}
        and (${table.claimedAt} is null or ${table.claimedAt} >= ${table.receivedAt})
        and (${table.lastErrorClass} is null or ${table.lastErrorClass} in ${sql.raw(
          formatFinanceSqlValues(webhookProcessingErrorClassValues)
        )})
        and (
          (${table.lastCheckpointSequence} = 0 and ${table.lastProcessorVersion} is null and ${table.lastCheckpointCode} is null)
          or (${table.lastCheckpointSequence} > 0 and ${table.lastProcessorVersion} >= 1 and ${table.lastCheckpointCode} is not null)
        )
        and (
          (${table.processingStatus} = 'completed' and ${table.completedAt} >= ${table.receivedAt} and ${table.quarantinedAt} is null)
          or (${table.processingStatus} = 'quarantined' and ${table.quarantinedAt} >= ${table.receivedAt} and ${table.completedAt} is null)
          or (${table.processingStatus} in ('stored', 'processing') and ${table.completedAt} is null and ${table.quarantinedAt} is null)
        )`
    ),
    index("finance_webhook_inbox_claim_idx").on(
      table.processingStatus,
      table.availableAt,
      table.receivedAt,
      table.id
    ),
    index("finance_webhook_inbox_stale_lease_idx").on(
      table.processingStatus,
      table.leaseExpiresAt,
      table.leaseFence,
      table.id
    ),
    index("finance_webhook_inbox_quarantine_idx").on(
      table.processingStatus,
      table.updatedAt,
      table.id
    )
  ]
);

export const financeWebhookStoredReceipts = pgTable(
  "finance_webhook_stored_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inboxItemId: varchar("inbox_item_id", { length: 160 }).notNull(),
    inboxVersion: financeRevisionString("inbox_version").notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    provider: text("provider").notNull(),
    receivingEnvironment: text("receiving_environment").notNull(),
    transportEventId: varchar("transport_event_id", { length: 160 }).notNull(),
    providerEventType: varchar("provider_event_type", { length: 160 }).notNull(),
    artifactId: varchar("artifact_id", { length: 160 }).notNull(),
    rawBodyDigest: varchar("raw_body_digest", { length: 71 }).notNull(),
    signatureStatus: text("signature_status").notNull(),
    signatureScheme: varchar("signature_scheme", { length: 160 }).notNull(),
    verifierContractVersion: varchar("verifier_contract_version", { length: 160 }).notNull(),
    webhookSigningKeyVersionId: varchar("webhook_signing_key_version_id", {
      length: 160
    }).notNull(),
    signedTimestamp: timestamp("signed_timestamp", { withTimezone: true }).notNull(),
    signatureEvidenceDigest: varchar("signature_evidence_digest", { length: 71 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    canonicalPreimage: text("canonical_preimage")
      .notNull()
      .default(sql`''`),
    canonicalDigest: varchar("canonical_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    })
      .notNull()
      .default(sql`''`),
    storedAt: timestamp("stored_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.inboxItemId,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.artifactId,
        table.rawBodyDigest,
        table.signatureEvidenceDigest
      ],
      foreignColumns: [
        financeWebhookInbox.id,
        financeWebhookInbox.seriesId,
        financeWebhookInbox.providerAccountId,
        financeWebhookInbox.providerIdentityVersion,
        financeWebhookInbox.artifactId,
        financeWebhookInbox.rawBodyDigest,
        financeWebhookInbox.signatureEvidenceDigest
      ],
      name: "finance_webhook_stored_receipts_inbox_fk"
    }).onDelete("restrict"),
    unique("finance_webhook_stored_receipts_inbox_unique").on(table.inboxItemId),
    uniqueIndex("finance_webhook_stored_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    uniqueIndex("finance_webhook_stored_receipts_digest_unique").on(table.canonicalDigest),
    check(
      "finance_webhook_stored_receipts_shape_check",
      sql`${table.inboxVersion} = 1
        and ${table.provider} in ${sql.raw(formatFinanceSqlValues(financePaymentProviderValues))}
        and ${table.receivingEnvironment} in ${sql.raw(
          formatFinanceSqlValues(financePaymentProviderEnvironmentValues)
        )}
        and ${table.signatureStatus} = 'verified'
        and ${table.rawBodyDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.signatureEvidenceDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.canonicalPreimage}) between 1 and 16000
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'
        and ${table.verifiedAt} <= ${table.receivedAt}
        and ${table.storedAt} >= ${table.receivedAt}`
    )
  ]
);

export const financeWebhookProcessingHistory = pgTable(
  "finance_webhook_processing_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inboxItemId: varchar("inbox_item_id", { length: 160 }).notNull(),
    eventSequence: financeRevisionString("event_sequence").notNull(),
    versionFrom: financeRevisionString("version_from").notNull(),
    versionTo: financeRevisionString("version_to").notNull(),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    workerId: varchar("worker_id", { length: 160 }).notNull(),
    leaseFence: financeRevisionString("lease_fence").notNull(),
    checkpointSequence: financeRevisionString("checkpoint_sequence"),
    processorVersion: financeRevisionString("processor_version"),
    checkpointCode: varchar("checkpoint_code", { length: 160 }),
    errorClass: text("error_class"),
    reasonCode: varchar("reason_code", { length: 160 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.inboxItemId],
      foreignColumns: [financeWebhookInbox.id],
      name: "finance_webhook_processing_history_inbox_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_webhook_processing_history_sequence_unique").on(
      table.inboxItemId,
      table.eventSequence
    ),
    uniqueIndex("finance_webhook_processing_history_version_unique").on(
      table.inboxItemId,
      table.versionTo
    ),
    check(
      "finance_webhook_processing_history_identifier_check",
      sql`length(trim(${table.workerId})) between 1 and 160
        and ${table.workerId} = trim(${table.workerId})
        and ${table.workerId} !~ '[[:cntrl:]]'
        and (
          ${table.reasonCode} is null
          or (
            length(trim(${table.reasonCode})) between 1 and 160
            and ${table.reasonCode} = trim(${table.reasonCode})
            and ${table.reasonCode} !~ '[[:cntrl:]]'
          )
        )`
    ),
    check(
      "finance_webhook_processing_history_transition_check",
      sql`${table.eventSequence} >= 1
        and ${table.versionFrom} >= 1
        and ${table.versionTo} = ${table.versionFrom} + 1
        and ${table.leaseFence} >= 1
        and ${table.fromStatus} in ${sql.raw(formatFinanceSqlValues(webhookProcessingStatusValues))}
        and ${table.toStatus} in ${sql.raw(formatFinanceSqlValues(webhookProcessingStatusValues))}
        and (
          (${table.fromStatus} = 'stored' and ${table.toStatus} = 'processing')
          or (${table.fromStatus} = 'processing' and ${table.toStatus} in ('processing', 'stored', 'completed', 'quarantined'))
        )
        and (${table.errorClass} is null or ${table.errorClass} in ${sql.raw(
          formatFinanceSqlValues(webhookProcessingErrorClassValues)
        )})
        and (
          (${table.checkpointSequence} is null and ${table.processorVersion} is null and ${table.checkpointCode} is null)
          or (${table.checkpointSequence} >= 1 and ${table.processorVersion} >= 1 and ${table.checkpointCode} is not null)
        )`
    ),
    index("finance_webhook_processing_history_time_idx").on(
      table.inboxItemId,
      table.occurredAt,
      table.eventSequence
    )
  ]
);

export const financeProviderSemanticFacts = pgTable(
  "finance_provider_semantic_facts",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    inboxItemId: varchar("inbox_item_id", { length: 160 }).notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }),
    semanticSourceKind: text("semantic_source_kind").notNull(),
    semanticSourceId: varchar("semantic_source_id", { length: 160 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }),
    amountMinor: financeNumeric38String("amount_minor"),
    currency: text("currency"),
    purpose: text("purpose").notNull(),
    canonicalFactDigest: varchar("canonical_fact_digest", { length: 71 }).notNull(),
    evidenceArtifactId: varchar("evidence_artifact_id", { length: 160 }).notNull(),
    evidenceArtifactDigest: varchar("evidence_artifact_digest", { length: 71 }).notNull(),
    effectDisposition: text("effect_disposition").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.inboxItemId,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion
      ],
      foreignColumns: [
        financeWebhookInbox.id,
        financeWebhookInbox.seriesId,
        financeWebhookInbox.providerAccountId,
        financeWebhookInbox.providerIdentityVersion
      ],
      name: "finance_provider_semantic_facts_inbox_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_provider_semantic_facts_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.economicPaymentIntentId,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion
      ],
      foreignColumns: [
        financeEconomicPaymentIntents.id,
        financeEconomicPaymentIntents.seriesId,
        financeEconomicPaymentIntents.providerAccountId,
        financeEconomicPaymentIntents.providerIdentityVersion
      ],
      name: "finance_provider_semantic_facts_economic_intent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.economicPaymentSessionId,
        table.economicPaymentIntentId,
        table.seriesId,
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
      name: "finance_provider_semantic_facts_economic_session_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.evidenceArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_provider_semantic_facts_artifact_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_provider_semantic_facts_natural_key_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.semanticSourceKind,
      table.semanticSourceId
    ),
    uniqueIndex("finance_provider_semantic_facts_inbox_source_unique").on(
      table.inboxItemId,
      table.semanticSourceKind,
      table.semanticSourceId,
      table.canonicalFactDigest
    ),
    unique("finance_provider_semantic_facts_receipt_owner_unique").on(
      table.id,
      table.inboxItemId,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.economicPaymentIntentId,
      table.semanticSourceKind,
      table.semanticSourceId,
      table.purpose,
      table.canonicalFactDigest,
      table.evidenceArtifactId,
      table.evidenceArtifactDigest,
      table.effectDisposition,
      table.observedAt,
      table.committedAt
    ),
    check(
      "finance_provider_semantic_facts_identifier_check",
      sql`length(trim(${table.id})) between 1 and 160
        and ${table.id} = trim(${table.id})
        and ${table.id} !~ '[[:cntrl:]]'
        and length(trim(${table.semanticSourceId})) between 1 and 160
        and ${table.semanticSourceId} = trim(${table.semanticSourceId})
        and ${table.semanticSourceId} !~ '[[:cntrl:]]'
        and (
          ${table.providerPaymentId} is null
          or (
            length(trim(${table.providerPaymentId})) between 1 and 160
            and ${table.providerPaymentId} = trim(${table.providerPaymentId})
            and ${table.providerPaymentId} !~ '[[:cntrl:]]'
          )
        )
        and length(trim(${table.economicPaymentIntentId})) between 1 and 160
        and ${table.economicPaymentIntentId} = trim(${table.economicPaymentIntentId})
        and ${table.economicPaymentIntentId} !~ '[[:cntrl:]]'
        and length(trim(${table.evidenceArtifactId})) between 1 and 160
        and ${table.evidenceArtifactId} = trim(${table.evidenceArtifactId})
        and ${table.evidenceArtifactId} !~ '[[:cntrl:]]'`
    ),
    check(
      "finance_provider_semantic_facts_shape_check",
      sql`${table.semanticSourceKind} in ${sql.raw(
        formatFinanceSqlValues(webhookSemanticSourceKindValues)
      )}
        and ${table.purpose} in ${sql.raw(formatFinanceSqlValues(webhookPurposeValues))}
        and ${table.effectDisposition} in ${sql.raw(
          formatFinanceSqlValues(webhookSemanticDispositionValues)
        )}
        and (
          (${table.semanticSourceKind} = 'payment_transition'
            and ${table.economicPaymentSessionId} is not null
            and ${table.providerPaymentId} is not null
            and ${table.amountMinor} >= 0
            and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))})
          or (${table.semanticSourceKind} in ('refund', 'chargeback', 'settlement_entry')
            and ${table.economicPaymentSessionId} is null
            and ${table.providerPaymentId} is null
            and ${table.amountMinor} is null
            and ${table.currency} is null)
        )
        and ${table.canonicalFactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.evidenceArtifactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.committedAt} >= ${table.observedAt}`
    ),
    index("finance_provider_semantic_facts_disposition_idx").on(
      table.effectDisposition,
      table.committedAt,
      table.id
    )
  ]
);

export const financeWebhookSemanticCommitReceipts = pgTable(
  "finance_webhook_semantic_commit_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    semanticFactId: varchar("semantic_fact_id", { length: 160 }).notNull(),
    inboxItemId: varchar("inbox_item_id", { length: 160 }).notNull(),
    inboxVersion: financeRevisionString("inbox_version").notNull(),
    checkpointSequence: financeRevisionString("checkpoint_sequence").notNull(),
    processingStatus: text("processing_status").notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }),
    semanticSourceKind: text("semantic_source_kind").notNull(),
    semanticSourceId: varchar("semantic_source_id", { length: 160 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }),
    amountMinor: financeNumeric38String("amount_minor"),
    currency: text("currency"),
    purpose: text("purpose").notNull(),
    canonicalFactDigest: varchar("canonical_fact_digest", { length: 71 }).notNull(),
    evidenceArtifactId: varchar("evidence_artifact_id", { length: 160 }).notNull(),
    evidenceArtifactDigest: varchar("evidence_artifact_digest", { length: 71 }).notNull(),
    effectDisposition: text("effect_disposition").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    semanticFactCommittedAt: timestamp("semantic_fact_committed_at", {
      withTimezone: true
    }).notNull(),
    canonicalPreimage: text("canonical_preimage")
      .notNull()
      .default(sql`''`),
    canonicalDigest: varchar("canonical_digest", { length: 71 })
      .notNull()
      .default(sql`''`),
    persistenceTransactionBoundaryRef: varchar("persistence_transaction_boundary_ref", {
      length: 200
    })
      .notNull()
      .default(sql`''`),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.semanticFactId,
        table.inboxItemId,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.economicPaymentIntentId,
        table.semanticSourceKind,
        table.semanticSourceId,
        table.purpose,
        table.canonicalFactDigest,
        table.evidenceArtifactId,
        table.evidenceArtifactDigest,
        table.effectDisposition,
        table.observedAt,
        table.semanticFactCommittedAt
      ],
      foreignColumns: [
        financeProviderSemanticFacts.id,
        financeProviderSemanticFacts.inboxItemId,
        financeProviderSemanticFacts.seriesId,
        financeProviderSemanticFacts.providerAccountId,
        financeProviderSemanticFacts.providerIdentityVersion,
        financeProviderSemanticFacts.economicPaymentIntentId,
        financeProviderSemanticFacts.semanticSourceKind,
        financeProviderSemanticFacts.semanticSourceId,
        financeProviderSemanticFacts.purpose,
        financeProviderSemanticFacts.canonicalFactDigest,
        financeProviderSemanticFacts.evidenceArtifactId,
        financeProviderSemanticFacts.evidenceArtifactDigest,
        financeProviderSemanticFacts.effectDisposition,
        financeProviderSemanticFacts.observedAt,
        financeProviderSemanticFacts.committedAt
      ],
      name: "finance_webhook_semantic_commit_receipts_fact_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.inboxItemId,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.inboxVersion,
        table.checkpointSequence,
        table.processingStatus
      ],
      foreignColumns: [
        financeWebhookInbox.id,
        financeWebhookInbox.seriesId,
        financeWebhookInbox.providerAccountId,
        financeWebhookInbox.providerIdentityVersion,
        financeWebhookInbox.version,
        financeWebhookInbox.lastCheckpointSequence,
        financeWebhookInbox.processingStatus
      ],
      name: "finance_webhook_semantic_commit_receipts_inbox_fk"
    }).onDelete("restrict"),
    unique("finance_webhook_semantic_commit_receipts_fact_unique").on(table.semanticFactId),
    unique("finance_webhook_semantic_receipts_exact_fact_owner_unique").on(
      table.id,
      table.semanticFactId
    ),
    uniqueIndex("finance_webhook_semantic_commit_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    uniqueIndex("finance_webhook_semantic_commit_receipts_digest_unique").on(table.canonicalDigest),
    check(
      "finance_webhook_semantic_commit_receipts_shape_check",
      sql`${table.inboxVersion} >= 2
        and ${table.checkpointSequence} >= 1
        and ${table.processingStatus} in ('completed', 'quarantined')
        and ${table.semanticSourceKind} in ${sql.raw(
          formatFinanceSqlValues(webhookSemanticSourceKindValues)
        )}
        and ${table.purpose} in ${sql.raw(formatFinanceSqlValues(webhookPurposeValues))}
        and ${table.effectDisposition} in ${sql.raw(
          formatFinanceSqlValues(webhookSemanticDispositionValues)
        )}
        and ${table.canonicalFactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.evidenceArtifactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.canonicalPreimage}) between 1 and 16000
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'
        and ${table.committedAt} >= ${table.semanticFactCommittedAt}`
    )
  ]
);

/** Baseline owner executes this reviewed DDL; workers call only its fenced DB-clock functions. */
export const financeWebhookInboxIntegritySql = `
create extension if not exists pgcrypto;

create or replace function finance_reject_webhook_evidence_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'webhook transport and semantic evidence cannot be deleted' using errcode = '55000';
end;
$$;

create trigger finance_webhook_inbox_no_delete before delete on finance_webhook_inbox
for each row execute function finance_reject_webhook_evidence_mutation();
create trigger finance_webhook_inbox_no_truncate before truncate on finance_webhook_inbox
for each statement execute function finance_reject_webhook_evidence_mutation();
create trigger finance_webhook_processing_history_immutable before update or delete on finance_webhook_processing_history
for each row execute function finance_reject_webhook_evidence_mutation();
create trigger finance_webhook_processing_history_no_truncate before truncate on finance_webhook_processing_history
for each statement execute function finance_reject_webhook_evidence_mutation();
create trigger finance_provider_semantic_facts_immutable before update or delete on finance_provider_semantic_facts
for each row execute function finance_reject_webhook_evidence_mutation();
create trigger finance_provider_semantic_facts_no_truncate before truncate on finance_provider_semantic_facts
for each statement execute function finance_reject_webhook_evidence_mutation();
create trigger finance_webhook_stored_receipts_immutable before update or delete on finance_webhook_stored_receipts
for each row execute function finance_reject_webhook_evidence_mutation();
create trigger finance_webhook_stored_receipts_no_truncate before truncate on finance_webhook_stored_receipts
for each statement execute function finance_reject_webhook_evidence_mutation();
create trigger finance_webhook_semantic_commit_receipts_immutable before update or delete on finance_webhook_semantic_commit_receipts
for each row execute function finance_reject_webhook_evidence_mutation();
create trigger finance_webhook_semantic_commit_receipts_no_truncate before truncate on finance_webhook_semantic_commit_receipts
for each statement execute function finance_reject_webhook_evidence_mutation();

create or replace function finance_issue_webhook_persistence_time()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_table_name = 'finance_webhook_processing_history' then
    new.occurred_at := clock_timestamp();
  elsif tg_table_name = 'finance_provider_semantic_facts' then
    new.committed_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger finance_webhook_processing_history_issue_time
before insert on finance_webhook_processing_history
for each row execute function finance_issue_webhook_persistence_time();
create trigger finance_provider_semantic_facts_issue_time
before insert on finance_provider_semantic_facts
for each row execute function finance_issue_webhook_persistence_time();

create or replace function finance_issue_webhook_stored_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  inbox finance_webhook_inbox%rowtype;
begin
  select * into strict inbox from finance_webhook_inbox where id = new.inbox_item_id;
  new.inbox_version := inbox.version;
  new.series_id := inbox.series_id;
  new.provider_account_id := inbox.provider_account_id;
  new.provider_identity_version := inbox.provider_identity_version;
  new.provider := inbox.provider;
  new.receiving_environment := inbox.receiving_environment;
  new.transport_event_id := inbox.transport_event_id;
  new.provider_event_type := inbox.provider_event_type;
  new.artifact_id := inbox.artifact_id;
  new.raw_body_digest := inbox.raw_body_digest;
  new.signature_status := inbox.signature_status;
  new.signature_scheme := inbox.signature_scheme;
  new.verifier_contract_version := inbox.verifier_contract_version;
  new.webhook_signing_key_version_id := inbox.webhook_signing_key_version_id;
  new.signed_timestamp := inbox.signed_timestamp;
  new.signature_evidence_digest := inbox.signature_evidence_digest;
  new.verified_at := inbox.verified_at;
  new.received_at := inbox.received_at;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.stored_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'webhook_stored_before_ack_receipt',
    'schemaVersion', 1,
    'receiptId', new.id::text,
    'inboxItemId', new.inbox_item_id,
    'inboxVersion', new.inbox_version::text,
    'seriesId', new.series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'provider', new.provider,
    'receivingEnvironment', new.receiving_environment,
    'transportEventId', new.transport_event_id,
    'providerEventType', new.provider_event_type,
    'artifactId', new.artifact_id,
    'rawBodyDigest', new.raw_body_digest,
    'signatureStatus', new.signature_status,
    'signatureScheme', new.signature_scheme,
    'verifierContractVersion', new.verifier_contract_version,
    'webhookSigningKeyVersionId', new.webhook_signing_key_version_id,
    'signedTimestamp', to_char(new.signed_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'signatureEvidenceDigest', new.signature_evidence_digest,
    'verifiedAt', to_char(new.verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'receivedAt', to_char(new.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'storedAt', to_char(new.stored_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger finance_issue_webhook_stored_receipt
before insert on finance_webhook_stored_receipts
for each row execute function finance_issue_webhook_stored_receipt();

create or replace function finance_issue_webhook_semantic_commit_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  semantic finance_provider_semantic_facts%rowtype;
  inbox finance_webhook_inbox%rowtype;
begin
  select * into strict semantic from finance_provider_semantic_facts
    where id = new.semantic_fact_id;
  select * into strict inbox from finance_webhook_inbox
    where id = semantic.inbox_item_id;
  new.inbox_item_id := semantic.inbox_item_id;
  new.inbox_version := inbox.version;
  new.checkpoint_sequence := inbox.last_checkpoint_sequence;
  new.processing_status := inbox.processing_status;
  new.series_id := semantic.series_id;
  new.provider_account_id := semantic.provider_account_id;
  new.provider_identity_version := semantic.provider_identity_version;
  new.economic_payment_intent_id := semantic.economic_payment_intent_id;
  new.economic_payment_session_id := semantic.economic_payment_session_id;
  new.semantic_source_kind := semantic.semantic_source_kind;
  new.semantic_source_id := semantic.semantic_source_id;
  new.provider_payment_id := semantic.provider_payment_id;
  new.amount_minor := semantic.amount_minor;
  new.currency := semantic.currency;
  new.purpose := semantic.purpose;
  new.canonical_fact_digest := semantic.canonical_fact_digest;
  new.evidence_artifact_id := semantic.evidence_artifact_id;
  new.evidence_artifact_digest := semantic.evidence_artifact_digest;
  new.effect_disposition := semantic.effect_disposition;
  new.observed_at := semantic.observed_at;
  new.semantic_fact_committed_at := semantic.committed_at;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'webhook_semantic_commit_receipt',
    'schemaVersion', 1,
    'receiptId', new.id::text,
    'semanticFactId', new.semantic_fact_id,
    'inboxItemId', new.inbox_item_id,
    'inboxVersion', new.inbox_version::text,
    'checkpointSequence', new.checkpoint_sequence::text,
    'processingStatus', new.processing_status,
    'seriesId', new.series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'economicPaymentSessionId', new.economic_payment_session_id,
    'semanticSourceKind', new.semantic_source_kind,
    'semanticSourceId', new.semantic_source_id,
    'providerPaymentId', new.provider_payment_id,
    'amountMinor', new.amount_minor::text,
    'currency', new.currency,
    'purpose', new.purpose,
    'canonicalFactDigest', new.canonical_fact_digest,
    'evidenceArtifactId', new.evidence_artifact_id,
    'evidenceArtifactDigest', new.evidence_artifact_digest,
    'effectDisposition', new.effect_disposition,
    'observedAt', to_char(new.observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'semanticFactCommittedAt', to_char(new.semantic_fact_committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'committedAt', to_char(new.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger finance_issue_webhook_semantic_commit_receipt
before insert on finance_webhook_semantic_commit_receipts
for each row execute function finance_issue_webhook_semantic_commit_receipt();

create or replace function finance_validate_webhook_inbox_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    new.received_at := clock_timestamp();
    new.available_at := new.received_at;
    new.updated_at := new.received_at;
    if new.version <> 1 or new.processing_status <> 'stored'
       or new.processing_attempts <> 0 or new.lease_fence <> 0
       or new.lease_owner_id is not null or new.lease_expires_at is not null
       or new.claimed_at is not null or new.last_checkpoint_sequence <> 0 then
      raise exception 'webhook inbox must start stored at version one' using errcode = '23514';
    end if;
    return new;
  end if;
  new.updated_at := clock_timestamp();
  if new.id <> old.id
     or new.series_id <> old.series_id
     or new.provider_account_id <> old.provider_account_id
     or new.provider_identity_version <> old.provider_identity_version
     or new.provider <> old.provider
     or new.receiving_environment <> old.receiving_environment
     or new.transport_event_id <> old.transport_event_id
     or new.provider_event_type <> old.provider_event_type
     or new.artifact_id <> old.artifact_id
     or new.raw_body_digest <> old.raw_body_digest
     or new.signature_status <> old.signature_status
     or new.signature_scheme <> old.signature_scheme
     or new.verifier_contract_version <> old.verifier_contract_version
     or new.webhook_signing_key_version_id <> old.webhook_signing_key_version_id
     or new.signed_timestamp <> old.signed_timestamp
     or new.signature_evidence_digest <> old.signature_evidence_digest
     or new.verified_at <> old.verified_at
     or new.received_at <> old.received_at then
    raise exception 'webhook ingress identity and signature evidence are immutable' using errcode = '55000';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'webhook inbox version conflict' using errcode = '40001';
  end if;
  if old.processing_status in ('completed', 'quarantined') then
    raise exception 'terminal webhook inbox cannot transition' using errcode = '23514';
  end if;
  if old.processing_status = 'stored' then
    if new.processing_status <> 'processing'
       or new.processing_attempts <> old.processing_attempts + 1
       or new.lease_fence <> old.lease_fence + 1 then
      raise exception 'stored webhook may only be claimed with a new fence' using errcode = '23514';
    end if;
  elsif new.processing_status = 'processing' then
    if not (
      (new.lease_fence = old.lease_fence and new.processing_attempts = old.processing_attempts)
      or (new.lease_fence = old.lease_fence + 1 and new.processing_attempts = old.processing_attempts + 1)
    ) then
      raise exception 'webhook renew or reclaim fence is invalid' using errcode = '40001';
    end if;
  elsif new.processing_status in ('stored', 'completed', 'quarantined') then
    if new.lease_fence <> old.lease_fence or new.processing_attempts <> old.processing_attempts then
      raise exception 'webhook completion cannot change the issued fence' using errcode = '40001';
    end if;
  else
    raise exception 'webhook transition is not allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_webhook_inbox_head
before insert or update on finance_webhook_inbox
for each row execute function finance_validate_webhook_inbox_head();

create or replace function finance_require_webhook_processing_history()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_webhook_processing_history history
    where history.inbox_item_id = new.id
      and history.version_from = old.version
      and history.version_to = new.version
      and history.from_status = old.processing_status
      and history.to_status = new.processing_status
      and history.lease_fence = new.lease_fence
  ) then
    raise exception 'webhook inbox update requires fenced append-only history' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_webhook_processing_history
after update on finance_webhook_inbox
deferrable initially deferred
for each row execute function finance_require_webhook_processing_history();

create or replace function finance_validate_webhook_artifact()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  artifact finance_artifacts%rowtype;
  provider_account finance_provider_accounts%rowtype;
begin
  select * into artifact from finance_artifacts where id = new.artifact_id;
  select * into provider_account from finance_provider_accounts
    where series_id = new.series_id
      and provider_account_id = new.provider_account_id
      and identity_version = new.provider_identity_version;
  if artifact.artifact_class <> 'provider_webhook'
     or artifact.binding_kind <> 'provider'
     or artifact.series_id <> new.series_id
     or artifact.provider_account_id <> new.provider_account_id
     or artifact.provider_identity_version <> new.provider_identity_version
     or artifact.sha256_digest <> new.raw_body_digest
     or provider_account.provider <> new.provider
     or provider_account.environment <> new.receiving_environment then
    raise exception 'webhook artifact or transport scope mismatch' using errcode = '23514';
  end if;
  if not exists (
    select 1 from finance_webhook_stored_receipts receipt
    where receipt.inbox_item_id = new.id
      and receipt.inbox_version = 1
      and receipt.series_id = new.series_id
      and receipt.provider_account_id = new.provider_account_id
      and receipt.provider_identity_version = new.provider_identity_version
      and receipt.provider = new.provider
      and receipt.receiving_environment = new.receiving_environment
      and receipt.transport_event_id = new.transport_event_id
      and receipt.provider_event_type = new.provider_event_type
      and receipt.artifact_id = new.artifact_id
      and receipt.raw_body_digest = new.raw_body_digest
      and receipt.signature_status = new.signature_status
      and receipt.signature_scheme = new.signature_scheme
      and receipt.verifier_contract_version = new.verifier_contract_version
      and receipt.webhook_signing_key_version_id = new.webhook_signing_key_version_id
      and receipt.signed_timestamp = new.signed_timestamp
      and receipt.signature_evidence_digest = new.signature_evidence_digest
      and receipt.verified_at = new.verified_at
      and receipt.received_at = new.received_at
  ) then
    raise exception 'webhook ingress requires its DB-issued stored-before-ack receipt' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_webhook_artifact
after insert on finance_webhook_inbox
deferrable initially deferred
for each row execute function finance_validate_webhook_artifact();

create or replace function finance_validate_webhook_stored_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  inbox finance_webhook_inbox%rowtype;
begin
  select * into strict inbox from finance_webhook_inbox where id = new.inbox_item_id;
  if inbox.version <> 1
     or inbox.processing_status <> 'stored'
     or inbox.provider <> new.provider
     or inbox.receiving_environment <> new.receiving_environment
     or inbox.transport_event_id <> new.transport_event_id
     or inbox.provider_event_type <> new.provider_event_type
     or inbox.signature_status <> new.signature_status
     or inbox.signature_scheme <> new.signature_scheme
     or inbox.verifier_contract_version <> new.verifier_contract_version
     or inbox.webhook_signing_key_version_id <> new.webhook_signing_key_version_id
     or inbox.signed_timestamp <> new.signed_timestamp
     or inbox.verified_at <> new.verified_at
     or inbox.received_at <> new.received_at then
    raise exception 'webhook stored receipt is cross-wired' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_webhook_stored_receipt
after insert on finance_webhook_stored_receipts
deferrable initially deferred
for each row execute function finance_validate_webhook_stored_receipt();

create or replace function finance_validate_webhook_semantic_artifact()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  artifact finance_artifacts%rowtype;
  economic_intent finance_economic_payment_intents%rowtype;
begin
  select * into artifact from finance_artifacts where id = new.evidence_artifact_id;
  select * into economic_intent from finance_economic_payment_intents
    where id = new.economic_payment_intent_id;
  if artifact.artifact_class not in ('provider_webhook', 'provider_canonical_read')
     or artifact.binding_kind <> 'provider'
     or artifact.series_id <> new.series_id
     or artifact.provider_account_id <> new.provider_account_id
     or artifact.provider_identity_version <> new.provider_identity_version
     or artifact.sha256_digest <> new.evidence_artifact_digest
     or economic_intent.purpose <> new.purpose
     or (new.semantic_source_kind = 'payment_transition'
       and (new.amount_minor <> economic_intent.amount_minor
         or new.currency <> economic_intent.currency)) then
    raise exception 'webhook semantic artifact binding mismatch' using errcode = '23514';
  end if;
  if not exists (
    select 1 from finance_webhook_semantic_commit_receipts receipt
    where receipt.semantic_fact_id = new.id
      and receipt.inbox_item_id = new.inbox_item_id
      and receipt.series_id = new.series_id
      and receipt.provider_account_id = new.provider_account_id
      and receipt.provider_identity_version = new.provider_identity_version
      and receipt.economic_payment_intent_id = new.economic_payment_intent_id
      and receipt.economic_payment_session_id is not distinct from new.economic_payment_session_id
      and receipt.semantic_source_kind = new.semantic_source_kind
      and receipt.semantic_source_id = new.semantic_source_id
      and receipt.provider_payment_id is not distinct from new.provider_payment_id
      and receipt.amount_minor is not distinct from new.amount_minor
      and receipt.currency is not distinct from new.currency
      and receipt.purpose = new.purpose
      and receipt.canonical_fact_digest = new.canonical_fact_digest
      and receipt.evidence_artifact_id = new.evidence_artifact_id
      and receipt.evidence_artifact_digest = new.evidence_artifact_digest
      and receipt.effect_disposition = new.effect_disposition
      and receipt.observed_at = new.observed_at
      and receipt.semantic_fact_committed_at = new.committed_at
  ) then
    raise exception 'provider semantic fact requires its DB-issued commit receipt' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_webhook_semantic_artifact
after insert on finance_provider_semantic_facts
deferrable initially deferred
for each row execute function finance_validate_webhook_semantic_artifact();

create or replace function finance_validate_webhook_semantic_commit_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  semantic finance_provider_semantic_facts%rowtype;
  inbox finance_webhook_inbox%rowtype;
begin
  select * into strict semantic from finance_provider_semantic_facts where id = new.semantic_fact_id;
  select * into strict inbox from finance_webhook_inbox where id = new.inbox_item_id;
  if semantic.economic_payment_session_id is distinct from new.economic_payment_session_id
     or semantic.provider_payment_id is distinct from new.provider_payment_id
     or semantic.amount_minor is distinct from new.amount_minor
     or semantic.currency is distinct from new.currency
     or inbox.processing_status <> new.processing_status
     or inbox.version <> new.inbox_version
     or inbox.last_checkpoint_sequence <> new.checkpoint_sequence
     or (new.effect_disposition = 'applied_once' and new.processing_status <> 'completed')
     or (new.effect_disposition = 'quarantined_no_effect' and new.processing_status <> 'quarantined') then
    raise exception 'webhook semantic commit receipt is cross-wired' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_webhook_semantic_commit_receipt
after insert on finance_webhook_semantic_commit_receipts
deferrable initially deferred
for each row execute function finance_validate_webhook_semantic_commit_receipt();

create or replace function finance_next_webhook_history_sequence(p_inbox_item_id varchar)
returns numeric language sql stable set search_path = pg_catalog, public as $$
  select coalesce(max(event_sequence), 0) + 1
  from finance_webhook_processing_history
  where inbox_item_id = p_inbox_item_id
$$;

create or replace function finance_claim_webhook_inbox(
  p_worker_id varchar,
  p_lease_seconds integer
)
returns table(inbox_item_id varchar, issued_version numeric, issued_lease_fence numeric, issued_lease_expires_at timestamptz)
language plpgsql set search_path = pg_catalog, public as $$
declare
  current_item finance_webhook_inbox%rowtype;
  v_now timestamptz := clock_timestamp();
  history_sequence numeric(38, 0);
begin
  if length(trim(p_worker_id)) not between 1 and 160
     or p_worker_id <> trim(p_worker_id)
     or p_worker_id ~ '[[:cntrl:]]'
     or p_lease_seconds not between 1 and 300 then
    raise exception 'invalid webhook claim input' using errcode = '23514';
  end if;
  select * into current_item
    from finance_webhook_inbox
    where (
      processing_status = 'stored' and available_at <= v_now
    ) or (
      processing_status = 'processing' and lease_expires_at <= v_now
    )
    order by available_at, received_at, id
    for update skip locked
    limit 1;
  if not found then
    return;
  end if;
  history_sequence := finance_next_webhook_history_sequence(current_item.id);
  update finance_webhook_inbox
    set processing_status = 'processing',
        processing_attempts = current_item.processing_attempts + 1,
        lease_owner_id = p_worker_id,
        lease_fence = current_item.lease_fence + 1,
        lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        claimed_at = v_now,
        version = current_item.version + 1,
        updated_at = v_now
    where id = current_item.id;
  insert into finance_webhook_processing_history (
    inbox_item_id, event_sequence, version_from, version_to, from_status, to_status,
    worker_id, lease_fence, occurred_at
  ) values (
    current_item.id, history_sequence, current_item.version, current_item.version + 1,
    current_item.processing_status, 'processing', p_worker_id,
    current_item.lease_fence + 1, v_now
  );
  inbox_item_id := current_item.id;
  issued_version := current_item.version + 1;
  issued_lease_fence := current_item.lease_fence + 1;
  issued_lease_expires_at := v_now + make_interval(secs => p_lease_seconds);
  return next;
end;
$$;

create or replace function finance_renew_webhook_inbox_lease(
  p_inbox_item_id varchar,
  p_worker_id varchar,
  p_expected_version numeric,
  p_expected_lease_fence numeric,
  p_lease_seconds integer
)
returns table(issued_version numeric, issued_lease_fence numeric, issued_lease_expires_at timestamptz)
language plpgsql set search_path = pg_catalog, public as $$
declare
  current_item finance_webhook_inbox%rowtype;
  v_now timestamptz := clock_timestamp();
  history_sequence numeric(38, 0);
begin
  if p_lease_seconds not between 1 and 300 then
    raise exception 'invalid webhook lease duration' using errcode = '23514';
  end if;
  select * into current_item from finance_webhook_inbox
    where id = p_inbox_item_id
      and processing_status = 'processing'
      and lease_owner_id = p_worker_id
      and lease_fence = p_expected_lease_fence
      and version = p_expected_version
      and lease_expires_at > v_now
    for update;
  if not found then
    raise exception 'stale webhook lease or version' using errcode = '40001';
  end if;
  history_sequence := finance_next_webhook_history_sequence(current_item.id);
  update finance_webhook_inbox
    set lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        version = current_item.version + 1,
        updated_at = v_now
    where id = current_item.id
      and lease_fence = p_expected_lease_fence
      and version = p_expected_version;
  insert into finance_webhook_processing_history (
    inbox_item_id, event_sequence, version_from, version_to, from_status, to_status,
    worker_id, lease_fence, occurred_at
  ) values (
    current_item.id, history_sequence, current_item.version, current_item.version + 1,
    'processing', 'processing', p_worker_id, current_item.lease_fence, v_now
  );
  issued_version := current_item.version + 1;
  issued_lease_fence := current_item.lease_fence;
  issued_lease_expires_at := v_now + make_interval(secs => p_lease_seconds);
  return next;
end;
$$;

create or replace function finance_complete_webhook_inbox(
  p_inbox_item_id varchar,
  p_worker_id varchar,
  p_expected_version numeric,
  p_expected_lease_fence numeric,
  p_terminal_status text,
  p_checkpoint_sequence numeric,
  p_processor_version numeric,
  p_checkpoint_code varchar,
  p_reason_code varchar
)
returns table(issued_version numeric, committed_checkpoint_sequence numeric)
language plpgsql set search_path = pg_catalog, public as $$
declare
  current_item finance_webhook_inbox%rowtype;
  v_now timestamptz := clock_timestamp();
  history_sequence numeric(38, 0);
begin
  if p_terminal_status not in ('completed', 'quarantined')
     or p_checkpoint_sequence < 1 or p_processor_version < 1
     or length(trim(p_checkpoint_code)) not between 1 and 160
     or p_checkpoint_code <> trim(p_checkpoint_code)
     or p_checkpoint_code ~ '[[:cntrl:]]' then
    raise exception 'invalid webhook completion input' using errcode = '23514';
  end if;
  select * into current_item from finance_webhook_inbox
    where id = p_inbox_item_id
      and processing_status = 'processing'
      and lease_owner_id = p_worker_id
      and lease_fence = p_expected_lease_fence
      and version = p_expected_version
      and lease_expires_at > v_now
    for update;
  if not found then
    raise exception 'stale webhook completion fence or version' using errcode = '40001';
  end if;
  if p_checkpoint_sequence <> current_item.last_checkpoint_sequence + 1 then
    raise exception 'webhook checkpoint sequence conflict' using errcode = '40001';
  end if;
  history_sequence := finance_next_webhook_history_sequence(current_item.id);
  update finance_webhook_inbox
    set processing_status = p_terminal_status,
        last_checkpoint_sequence = p_checkpoint_sequence,
        last_processor_version = p_processor_version,
        last_checkpoint_code = p_checkpoint_code,
        lease_owner_id = null,
        lease_expires_at = null,
        completed_at = case when p_terminal_status = 'completed' then v_now else null end,
        quarantined_at = case when p_terminal_status = 'quarantined' then v_now else null end,
        version = current_item.version + 1,
        updated_at = v_now
    where id = current_item.id
      and lease_fence = p_expected_lease_fence
      and version = p_expected_version;
  insert into finance_webhook_processing_history (
    inbox_item_id, event_sequence, version_from, version_to, from_status, to_status,
    worker_id, lease_fence, checkpoint_sequence, processor_version, checkpoint_code,
    reason_code, occurred_at
  ) values (
    current_item.id, history_sequence, current_item.version, current_item.version + 1,
    'processing', p_terminal_status, p_worker_id, current_item.lease_fence,
    p_checkpoint_sequence, p_processor_version, p_checkpoint_code, p_reason_code, v_now
  );
  issued_version := current_item.version + 1;
  committed_checkpoint_sequence := p_checkpoint_sequence;
  return next;
end;
$$;
`;
