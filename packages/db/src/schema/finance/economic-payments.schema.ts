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
import { financeProviderAccounts } from "./provider-accounts.schema";
import { platformTariffInvoices } from "../platform-billing/tariff-authority.schema";

const economicPaymentPurposeValues = [
  "client_order",
  "platform_invoice",
  "platform_card_setup"
] as const;
const economicPaymentStateValues = [
  "created",
  "checkout_opened",
  "pending",
  "pending_3ds",
  "authorized",
  "captured",
  "declined",
  "failed",
  "expired",
  "voided",
  "timeout",
  "provider_unknown"
] as const;
const economicPaymentSessionStateValues = economicPaymentStateValues.filter(
  (value) => value !== "created"
);
const definitiveTerminalSessionStateValues = [
  "captured",
  "declined",
  "failed",
  "expired",
  "voided"
] as const;
const transitionEvidenceKindValues = [
  "canonical_provider_result",
  "ambiguous_provider_result"
] as const;
const transitionAuthorityKindValues = [
  "provider_operation_result",
  "provider_semantic_fact"
] as const;
const paymentClearingStateValues = [
  "unmatched",
  "settlement_seen",
  "provider_matched",
  "bank_matched"
] as const;

export const financeEconomicPaymentIntents = pgTable(
  "finance_economic_payment_intents",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    purpose: text("purpose").notNull(),
    sourceId: varchar("source_id", { length: 160 }).notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    currency: text("currency").notNull(),
    state: text("state").notNull(),
    version: financeRevisionString("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
      name: "finance_economic_payment_intents_provider_identity_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_economic_payment_intents_purpose_source_unique").on(
      table.purpose,
      table.sourceId
    ),
    unique("finance_economic_payment_intents_exact_identity_unique").on(
      table.id,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion
    ),
    unique("finance_economic_payment_intents_source_owner_unique").on(
      table.purpose,
      table.sourceId,
      table.id
    ),
    unique("finance_economic_payment_intents_creation_owner_unique").on(
      table.id,
      table.purpose,
      table.sourceId,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.amountMinor,
      table.currency
    ),
    check(
      "finance_economic_payment_intents_purpose_check",
      sql`${table.purpose} in ${sql.raw(formatFinanceSqlValues(economicPaymentPurposeValues))}`
    ),
    check(
      "finance_economic_payment_intents_identifier_check",
      sql`length(trim(${table.id})) between 1 and 160
        and ${table.id} = trim(${table.id})
        and ${table.id} !~ '[[:cntrl:]]'
        and length(trim(${table.sourceId})) between 1 and 160
        and ${table.sourceId} = trim(${table.sourceId})
        and ${table.sourceId} !~ '[[:cntrl:]]'`
    ),
    check(
      "finance_economic_payment_intents_amount_purpose_check",
      sql`${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}
        and (
          (${table.purpose} = 'platform_card_setup' and ${table.amountMinor} = 0)
          or (${table.purpose} in ('client_order', 'platform_invoice') and ${table.amountMinor} > 0)
        )`
    ),
    check(
      "finance_economic_payment_intents_version_state_time_check",
      sql`${table.version} >= 1
        and ${table.state} in ${sql.raw(formatFinanceSqlValues(economicPaymentStateValues))}
        and ${table.updatedAt} >= ${table.createdAt}`
    ),
    index("finance_economic_payment_intents_source_lookup_idx").on(
      table.purpose,
      table.sourceId,
      table.version
    ),
    index("finance_economic_payment_intents_state_idx").on(table.state, table.updatedAt, table.id)
  ]
);

/**
 * The only bridge from a tariff invoice to an ArcPay economic payment intent.
 * It prevents a provider result for an arbitrary source ID from activating a tariff.
 */
export const financePlatformInvoicePaymentBindings = pgTable(
  "finance_platform_invoice_payment_bindings",
  {
    invoiceId: varchar("invoice_id", { length: 160 }).primaryKey(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.invoiceId],
      foreignColumns: [platformTariffInvoices.id],
      name: "finance_platform_invoice_payment_binding_invoice_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.economicPaymentIntentId],
      foreignColumns: [financeEconomicPaymentIntents.id],
      name: "finance_platform_invoice_payment_binding_intent_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_platform_invoice_payment_binding_intent_unique").on(
      table.economicPaymentIntentId
    )
  ]
);

export const financeEconomicPaymentSourceHeads = pgTable(
  "finance_economic_payment_source_heads",
  {
    purpose: text("purpose").notNull(),
    sourceId: varchar("source_id", { length: 160 }).notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    headVersion: financeRevisionString("head_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.purpose, table.sourceId],
      name: "finance_economic_payment_source_heads_pk"
    }),
    foreignKey({
      columns: [table.purpose, table.sourceId, table.economicPaymentIntentId],
      foreignColumns: [
        financeEconomicPaymentIntents.purpose,
        financeEconomicPaymentIntents.sourceId,
        financeEconomicPaymentIntents.id
      ],
      name: "finance_economic_payment_source_heads_intent_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_economic_payment_source_heads_intent_unique").on(
      table.economicPaymentIntentId
    ),
    unique("finance_economic_payment_source_heads_receipt_owner_unique").on(
      table.purpose,
      table.sourceId,
      table.economicPaymentIntentId,
      table.headVersion
    ),
    check(
      "finance_economic_payment_source_heads_purpose_check",
      sql`${table.purpose} in ${sql.raw(formatFinanceSqlValues(economicPaymentPurposeValues))}`
    ),
    check(
      "finance_economic_payment_source_heads_identifier_version_check",
      sql`length(trim(${table.sourceId})) between 1 and 160
        and ${table.sourceId} = trim(${table.sourceId})
        and ${table.sourceId} !~ '[[:cntrl:]]'
        and length(trim(${table.economicPaymentIntentId})) between 1 and 160
        and ${table.economicPaymentIntentId} = trim(${table.economicPaymentIntentId})
        and ${table.economicPaymentIntentId} !~ '[[:cntrl:]]'
        and ${table.headVersion} = 1`
    )
  ]
);

export const financeEconomicPaymentIntentCreationReceipts = pgTable(
  "finance_economic_payment_intent_creation_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    purpose: text("purpose").notNull(),
    sourceId: varchar("source_id", { length: 160 }).notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    currency: text("currency").notNull(),
    economicPaymentVersion: financeRevisionString("economic_payment_version").notNull(),
    sourceUniquenessVersion: financeRevisionString("source_uniqueness_version").notNull(),
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
        table.economicPaymentIntentId,
        table.purpose,
        table.sourceId,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.amountMinor,
        table.currency
      ],
      foreignColumns: [
        financeEconomicPaymentIntents.id,
        financeEconomicPaymentIntents.purpose,
        financeEconomicPaymentIntents.sourceId,
        financeEconomicPaymentIntents.seriesId,
        financeEconomicPaymentIntents.providerAccountId,
        financeEconomicPaymentIntents.providerIdentityVersion,
        financeEconomicPaymentIntents.amountMinor,
        financeEconomicPaymentIntents.currency
      ],
      name: "finance_economic_intent_creation_receipts_intent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.purpose,
        table.sourceId,
        table.economicPaymentIntentId,
        table.sourceUniquenessVersion
      ],
      foreignColumns: [
        financeEconomicPaymentSourceHeads.purpose,
        financeEconomicPaymentSourceHeads.sourceId,
        financeEconomicPaymentSourceHeads.economicPaymentIntentId,
        financeEconomicPaymentSourceHeads.headVersion
      ],
      name: "finance_economic_intent_creation_receipts_source_head_fk"
    }).onDelete("restrict"),
    unique("finance_economic_intent_creation_receipts_intent_unique").on(
      table.economicPaymentIntentId
    ),
    uniqueIndex("finance_economic_intent_creation_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    uniqueIndex("finance_economic_intent_creation_receipts_digest_unique").on(
      table.canonicalDigest
    ),
    check(
      "finance_economic_intent_creation_receipts_shape_check",
      sql`${table.economicPaymentVersion} = 1
        and ${table.sourceUniquenessVersion} = 1
        and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.canonicalPreimage}) between 1 and 8000
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'`
    )
  ]
);

export const financeEconomicPaymentSessions = pgTable(
  "finance_economic_payment_sessions",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    state: text("state").notNull(),
    version: financeRevisionString("version").notNull(),
    intentVersionOpened: financeRevisionString("intent_version_opened").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    terminalAt: timestamp("terminal_at", { withTimezone: true })
  },
  (table) => [
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
      name: "finance_economic_payment_sessions_intent_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_economic_payment_sessions_provider_identity_fk"
    }).onDelete("restrict"),
    unique("finance_economic_payment_sessions_exact_owner_unique").on(
      table.id,
      table.economicPaymentIntentId,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion
    ),
    uniqueIndex("finance_economic_payment_sessions_intent_open_version_unique").on(
      table.economicPaymentIntentId,
      table.intentVersionOpened
    ),
    uniqueIndex("finance_economic_payment_sessions_one_active_or_unknown_unique")
      .on(table.economicPaymentIntentId)
      .where(
        sql`${table.state} not in ${sql.raw(
          formatFinanceSqlValues(definitiveTerminalSessionStateValues)
        )}`
      ),
    check(
      "finance_economic_payment_sessions_identifier_check",
      sql`length(trim(${table.id})) between 1 and 160
        and ${table.id} = trim(${table.id})
        and ${table.id} !~ '[[:cntrl:]]'`
    ),
    check(
      "finance_economic_payment_sessions_state_check",
      sql`${table.state} in ${sql.raw(formatFinanceSqlValues(economicPaymentSessionStateValues))}`
    ),
    check(
      "finance_economic_payment_sessions_version_time_check",
      sql`${table.version} >= 1
        and ${table.intentVersionOpened} >= 2
        and ${table.updatedAt} >= ${table.openedAt}
        and (
          (${table.state} in ${sql.raw(
            formatFinanceSqlValues(definitiveTerminalSessionStateValues)
          )} and ${table.terminalAt} is not null and ${table.terminalAt} >= ${table.openedAt})
          or (${table.state} not in ${sql.raw(
            formatFinanceSqlValues(definitiveTerminalSessionStateValues)
          )} and ${table.terminalAt} is null)
        )`
    ),
    index("finance_economic_payment_sessions_intent_state_idx").on(
      table.economicPaymentIntentId,
      table.state,
      table.openedAt,
      table.id
    )
  ]
);

/**
 * Immutable persistence-issued authority that an economic attempt was opened. This is distinct
 * from an HPP/provider session: opening it prevents concurrent client checkouts from creating
 * conflicting attempts, but cannot prove provider acceptance or payment capture.
 */
export const financeEconomicPaymentSessionOpenReceipts = pgTable(
  "finance_economic_payment_session_open_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }).notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    economicPaymentVersion: financeRevisionString("economic_payment_version").notNull(),
    economicPaymentSessionVersion: financeRevisionString(
      "economic_payment_session_version"
    ).notNull(),
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
      name: "finance_economic_session_open_receipts_session_fk"
    }).onDelete("restrict"),
    unique("finance_economic_session_open_receipts_session_unique").on(
      table.economicPaymentSessionId
    ),
    uniqueIndex("finance_economic_session_open_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    uniqueIndex("finance_economic_session_open_receipts_digest_unique").on(table.canonicalDigest),
    check(
      "finance_economic_session_open_receipts_shape_check",
      sql`${table.economicPaymentVersion} >= 2
        and ${table.economicPaymentSessionVersion} = 1
        and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.canonicalPreimage}) between 1 and 8000
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'`
    )
  ]
);

export const financePaymentTransitionFacts = pgTable(
  "finance_payment_transition_facts",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }).notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    evidenceKind: text("evidence_kind").notNull(),
    authorityKind: text("authority_kind").notNull(),
    authorityId: varchar("authority_id", { length: 160 }).notNull(),
    evidenceArtifactId: varchar("evidence_artifact_id", { length: 160 }).notNull(),
    evidenceArtifactDigest: varchar("evidence_artifact_digest", { length: 71 }).notNull(),
    intentVersionFrom: financeRevisionString("intent_version_from").notNull(),
    intentVersionTo: financeRevisionString("intent_version_to").notNull(),
    sessionVersionFrom: financeRevisionString("session_version_from").notNull(),
    sessionVersionTo: financeRevisionString("session_version_to").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
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
      name: "finance_payment_transition_facts_intent_fk"
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
      name: "finance_payment_transition_facts_session_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.evidenceArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_payment_transition_facts_artifact_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_payment_transition_facts_intent_version_unique").on(
      table.economicPaymentIntentId,
      table.intentVersionTo
    ),
    uniqueIndex("finance_payment_transition_facts_session_version_unique").on(
      table.economicPaymentSessionId,
      table.sessionVersionTo
    ),
    uniqueIndex("finance_payment_transition_facts_authority_unique").on(
      table.authorityKind,
      table.authorityId
    ),
    check(
      "finance_payment_transition_facts_identifier_check",
      sql`length(trim(${table.id})) between 1 and 160
        and ${table.id} = trim(${table.id})
        and ${table.id} !~ '[[:cntrl:]]'
        and length(trim(${table.authorityId})) between 1 and 160
        and ${table.authorityId} = trim(${table.authorityId})
        and ${table.authorityId} !~ '[[:cntrl:]]'
        and length(trim(${table.evidenceArtifactId})) between 1 and 160
        and ${table.evidenceArtifactId} = trim(${table.evidenceArtifactId})
        and ${table.evidenceArtifactId} !~ '[[:cntrl:]]'`
    ),
    check(
      "finance_payment_transition_facts_state_evidence_check",
      sql`${table.fromState} in ${sql.raw(
        formatFinanceSqlValues(economicPaymentSessionStateValues)
      )}
        and ${table.toState} in ${sql.raw(
          formatFinanceSqlValues(economicPaymentSessionStateValues)
        )}
        and ${table.fromState} <> ${table.toState}
        and ${table.evidenceKind} in ${sql.raw(
          formatFinanceSqlValues(transitionEvidenceKindValues)
        )}
        and ${table.authorityKind} in ${sql.raw(
          formatFinanceSqlValues(transitionAuthorityKindValues)
        )}
        and (
          (${table.toState} in ('timeout', 'provider_unknown') and ${table.evidenceKind} = 'ambiguous_provider_result')
          or (${table.toState} not in ('timeout', 'provider_unknown') and ${table.evidenceKind} = 'canonical_provider_result')
        )`
    ),
    check(
      "finance_payment_transition_facts_version_digest_time_check",
      sql`${table.intentVersionFrom} >= 1
        and ${table.intentVersionTo} = ${table.intentVersionFrom} + 1
        and ${table.sessionVersionFrom} >= 1
        and ${table.sessionVersionTo} = ${table.sessionVersionFrom} + 1
        and ${table.evidenceArtifactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.committedAt} >= ${table.observedAt}`
    ),
    index("finance_payment_transition_facts_session_time_idx").on(
      table.economicPaymentSessionId,
      table.committedAt,
      table.id
    )
  ]
);

export const financeCaptureFacts = pgTable(
  "finance_capture_facts",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }).notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }).notNull(),
    amountMinor: financeNumeric38String("amount_minor").notNull(),
    currency: text("currency").notNull(),
    evidenceAuthorityKind: text("evidence_authority_kind").notNull(),
    evidenceAuthorityId: varchar("evidence_authority_id", { length: 160 }).notNull(),
    evidenceArtifactId: varchar("evidence_artifact_id", { length: 160 }).notNull(),
    evidenceArtifactDigest: varchar("evidence_artifact_digest", { length: 71 }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
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
      name: "finance_capture_facts_intent_fk"
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
      name: "finance_capture_facts_session_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.evidenceArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_capture_facts_artifact_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_capture_facts_one_capture_per_intent_unique").on(
      table.economicPaymentIntentId
    ),
    uniqueIndex("finance_capture_facts_provider_payment_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerPaymentId
    ),
    unique("finance_capture_facts_exact_receipt_owner_unique").on(
      table.id,
      table.economicPaymentIntentId,
      table.economicPaymentSessionId,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerPaymentId,
      table.amountMinor,
      table.currency,
      table.evidenceAuthorityKind,
      table.evidenceAuthorityId,
      table.evidenceArtifactId,
      table.evidenceArtifactDigest
    ),
    uniqueIndex("finance_capture_facts_authority_unique").on(
      table.evidenceAuthorityKind,
      table.evidenceAuthorityId
    ),
    check(
      "finance_capture_facts_identifier_check",
      sql`length(trim(${table.id})) between 1 and 160
        and ${table.id} = trim(${table.id})
        and ${table.id} !~ '[[:cntrl:]]'
        and length(trim(${table.providerPaymentId})) between 1 and 160
        and ${table.providerPaymentId} = trim(${table.providerPaymentId})
        and ${table.providerPaymentId} !~ '[[:cntrl:]]'
        and length(trim(${table.evidenceAuthorityId})) between 1 and 160
        and ${table.evidenceAuthorityId} = trim(${table.evidenceAuthorityId})
        and ${table.evidenceAuthorityId} !~ '[[:cntrl:]]'
        and length(trim(${table.evidenceArtifactId})) between 1 and 160
        and ${table.evidenceArtifactId} = trim(${table.evidenceArtifactId})
        and ${table.evidenceArtifactId} !~ '[[:cntrl:]]'`
    ),
    check(
      "finance_capture_facts_amount_evidence_time_check",
      sql`${table.amountMinor} >= 0
        and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}
        and ${table.evidenceAuthorityKind} in ${sql.raw(
          formatFinanceSqlValues(transitionAuthorityKindValues)
        )}
        and ${table.evidenceArtifactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.committedAt} >= ${table.capturedAt}`
    ),
    index("finance_capture_facts_provider_payment_lookup_idx").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerPaymentId,
      table.committedAt
    )
  ]
);

export const financePaymentClearingHeads = pgTable(
  "finance_payment_clearing_heads",
  {
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).primaryKey(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    currency: text("currency").notNull(),
    state: text("state").notNull(),
    version: financeRevisionString("version").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("finance_payment_clearing_heads_exact_identity_unique").on(
      table.economicPaymentIntentId,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.currency,
      table.state,
      table.version
    ),
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
      name: "finance_payment_clearing_heads_intent_fk"
    }).onDelete("restrict"),
    check(
      "finance_payment_clearing_heads_state_version_check",
      sql`${table.state} in ${sql.raw(formatFinanceSqlValues(paymentClearingStateValues))}
        and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}
        and ${table.version} >= 1`
    ),
    index("finance_payment_clearing_heads_state_idx").on(
      table.state,
      table.updatedAt,
      table.economicPaymentIntentId
    )
  ]
);

export const financePaymentClearingHistory = pgTable(
  "finance_payment_clearing_history",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    versionFrom: financeRevisionString("version_from").notNull(),
    versionTo: financeRevisionString("version_to").notNull(),
    evidenceAuthorityKind: varchar("evidence_authority_kind", { length: 160 }).notNull(),
    evidenceAuthorityId: varchar("evidence_authority_id", { length: 160 }).notNull(),
    evidenceDigest: varchar("evidence_digest", { length: 71 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.economicPaymentIntentId],
      foreignColumns: [financePaymentClearingHeads.economicPaymentIntentId],
      name: "finance_payment_clearing_history_head_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_payment_clearing_history_version_unique").on(
      table.economicPaymentIntentId,
      table.versionTo
    ),
    uniqueIndex("finance_payment_clearing_history_authority_unique").on(
      table.evidenceAuthorityKind,
      table.evidenceAuthorityId
    ),
    check(
      "finance_payment_clearing_history_identifier_check",
      sql`length(trim(${table.id})) between 1 and 160
        and ${table.id} = trim(${table.id})
        and ${table.id} !~ '[[:cntrl:]]'
        and length(trim(${table.evidenceAuthorityKind})) between 1 and 160
        and ${table.evidenceAuthorityKind} = trim(${table.evidenceAuthorityKind})
        and ${table.evidenceAuthorityKind} !~ '[[:cntrl:]]'
        and length(trim(${table.evidenceAuthorityId})) between 1 and 160
        and ${table.evidenceAuthorityId} = trim(${table.evidenceAuthorityId})
        and ${table.evidenceAuthorityId} !~ '[[:cntrl:]]'`
    ),
    check(
      "finance_payment_clearing_history_transition_check",
      sql`${table.fromState} in ${sql.raw(formatFinanceSqlValues(paymentClearingStateValues))}
        and ${table.toState} in ${sql.raw(formatFinanceSqlValues(paymentClearingStateValues))}
        and (
          (${table.fromState} = 'unmatched' and ${table.toState} = 'settlement_seen')
          or (${table.fromState} = 'settlement_seen' and ${table.toState} = 'provider_matched')
          or (${table.fromState} = 'provider_matched' and ${table.toState} = 'bank_matched')
        )
        and ${table.versionFrom} >= 1
        and ${table.versionTo} = ${table.versionFrom} + 1
        and ${table.evidenceDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.committedAt} >= ${table.occurredAt}`
    ),
    index("finance_payment_clearing_history_time_idx").on(
      table.economicPaymentIntentId,
      table.committedAt,
      table.versionTo
    )
  ]
);

/** Baseline owner executes this reviewed DDL after every normalized Task 2 table exists. */
export const financeEconomicPaymentIntegritySql = `
create extension if not exists pgcrypto;

create or replace function finance_reject_economic_payment_history_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'economic payment source and facts are immutable' using errcode = '55000';
end;
$$;

create trigger finance_economic_payment_source_heads_immutable before update or delete on finance_economic_payment_source_heads
for each row execute function finance_reject_economic_payment_history_mutation();
create trigger finance_economic_payment_source_heads_no_truncate before truncate on finance_economic_payment_source_heads
for each statement execute function finance_reject_economic_payment_history_mutation();
create trigger finance_economic_payment_intents_no_delete before delete on finance_economic_payment_intents
for each row execute function finance_reject_economic_payment_history_mutation();
create trigger finance_economic_payment_intents_no_truncate before truncate on finance_economic_payment_intents
for each statement execute function finance_reject_economic_payment_history_mutation();
create trigger finance_economic_payment_sessions_no_delete before delete on finance_economic_payment_sessions
for each row execute function finance_reject_economic_payment_history_mutation();
create trigger finance_economic_payment_sessions_no_truncate before truncate on finance_economic_payment_sessions
for each statement execute function finance_reject_economic_payment_history_mutation();
create trigger finance_payment_transition_facts_immutable before update or delete on finance_payment_transition_facts
for each row execute function finance_reject_economic_payment_history_mutation();
create trigger finance_payment_transition_facts_no_truncate before truncate on finance_payment_transition_facts
for each statement execute function finance_reject_economic_payment_history_mutation();
create trigger finance_capture_facts_immutable before update or delete on finance_capture_facts
for each row execute function finance_reject_economic_payment_history_mutation();
create trigger finance_capture_facts_no_truncate before truncate on finance_capture_facts
for each statement execute function finance_reject_economic_payment_history_mutation();
create trigger finance_payment_clearing_heads_no_delete before delete on finance_payment_clearing_heads
for each row execute function finance_reject_economic_payment_history_mutation();
create trigger finance_payment_clearing_heads_no_truncate before truncate on finance_payment_clearing_heads
for each statement execute function finance_reject_economic_payment_history_mutation();
create trigger finance_payment_clearing_history_immutable before update or delete on finance_payment_clearing_history
for each row execute function finance_reject_economic_payment_history_mutation();
create trigger finance_payment_clearing_history_no_truncate before truncate on finance_payment_clearing_history
for each statement execute function finance_reject_economic_payment_history_mutation();
create trigger finance_economic_intent_creation_receipts_immutable before update or delete on finance_economic_payment_intent_creation_receipts
for each row execute function finance_reject_economic_payment_history_mutation();
create trigger finance_economic_intent_creation_receipts_no_truncate before truncate on finance_economic_payment_intent_creation_receipts
for each statement execute function finance_reject_economic_payment_history_mutation();
create trigger finance_economic_session_open_receipts_immutable before update or delete on finance_economic_payment_session_open_receipts
for each row execute function finance_reject_economic_payment_history_mutation();
create trigger finance_economic_session_open_receipts_no_truncate before truncate on finance_economic_payment_session_open_receipts
for each statement execute function finance_reject_economic_payment_history_mutation();

create or replace function finance_issue_economic_payment_persistence_time()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_table_name = 'finance_economic_payment_source_heads' then
    new.created_at := clock_timestamp();
  elsif tg_table_name in ('finance_payment_transition_facts', 'finance_capture_facts', 'finance_payment_clearing_history') then
    new.committed_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger finance_economic_payment_source_heads_issue_time
before insert on finance_economic_payment_source_heads
for each row execute function finance_issue_economic_payment_persistence_time();
create trigger finance_payment_transition_facts_issue_time
before insert on finance_payment_transition_facts
for each row execute function finance_issue_economic_payment_persistence_time();
create trigger finance_capture_facts_issue_time
before insert on finance_capture_facts
for each row execute function finance_issue_economic_payment_persistence_time();
create trigger finance_payment_clearing_history_issue_time
before insert on finance_payment_clearing_history
for each row execute function finance_issue_economic_payment_persistence_time();

create or replace function finance_issue_economic_payment_intent_creation_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  intent finance_economic_payment_intents%rowtype;
  source_head finance_economic_payment_source_heads%rowtype;
begin
  select * into strict intent from finance_economic_payment_intents
    where id = new.economic_payment_intent_id;
  select * into strict source_head from finance_economic_payment_source_heads
    where purpose = intent.purpose and source_id = intent.source_id;
  new.purpose := intent.purpose;
  new.source_id := intent.source_id;
  new.series_id := intent.series_id;
  new.provider_account_id := intent.provider_account_id;
  new.provider_identity_version := intent.provider_identity_version;
  new.amount_minor := intent.amount_minor;
  new.currency := intent.currency;
  new.economic_payment_version := intent.version;
  new.source_uniqueness_version := source_head.head_version;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'economic_payment_intent_creation_receipt',
    'schemaVersion', 1,
    'receiptId', new.id::text,
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'purpose', new.purpose,
    'sourceId', new.source_id,
    'seriesId', new.series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'amountMinor', new.amount_minor::text,
    'currency', new.currency,
    'economicPaymentVersion', new.economic_payment_version::text,
    'sourceUniquenessVersion', new.source_uniqueness_version::text,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'committedAt', to_char(new.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger finance_issue_economic_payment_intent_creation_receipt
before insert on finance_economic_payment_intent_creation_receipts
for each row execute function finance_issue_economic_payment_intent_creation_receipt();

create or replace function finance_issue_economic_payment_session_open_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  intent finance_economic_payment_intents%rowtype;
  session finance_economic_payment_sessions%rowtype;
begin
  select * into strict intent from finance_economic_payment_intents
    where id = new.economic_payment_intent_id;
  select * into strict session from finance_economic_payment_sessions
    where id = new.economic_payment_session_id;
  if session.economic_payment_intent_id <> intent.id
     or session.series_id <> intent.series_id
     or session.provider_account_id <> intent.provider_account_id
     or session.provider_identity_version <> intent.provider_identity_version
     or intent.state <> 'checkout_opened'
     or session.state <> 'checkout_opened'
     or session.intent_version_opened <> intent.version
     or session.version <> 1 then
    raise exception 'economic payment session-open receipt does not match checkout head' using errcode = '23514';
  end if;
  new.series_id := intent.series_id;
  new.provider_account_id := intent.provider_account_id;
  new.provider_identity_version := intent.provider_identity_version;
  new.economic_payment_version := intent.version;
  new.economic_payment_session_version := session.version;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'economic_payment_session_open_receipt',
    'schemaVersion', 1,
    'receiptId', new.id::text,
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'economicPaymentSessionId', new.economic_payment_session_id,
    'seriesId', new.series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'economicPaymentVersion', new.economic_payment_version::text,
    'economicPaymentSessionVersion', new.economic_payment_session_version::text,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'committedAt', to_char(new.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger finance_issue_economic_payment_session_open_receipt
before insert on finance_economic_payment_session_open_receipts
for each row execute function finance_issue_economic_payment_session_open_receipt();

create or replace function finance_validate_economic_payment_intent_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    if new.version <> 1 or new.state <> 'created' then
      raise exception 'economic payment intent must start created at version one' using errcode = '23514';
    end if;
    return new;
  end if;
  new.updated_at := clock_timestamp();
  if new.id <> old.id
     or new.purpose <> old.purpose
     or new.source_id <> old.source_id
     or new.series_id <> old.series_id
     or new.provider_account_id <> old.provider_account_id
     or new.provider_identity_version <> old.provider_identity_version
     or new.amount_minor <> old.amount_minor
     or new.currency <> old.currency
     or new.created_at <> old.created_at then
    raise exception 'economic payment identity is immutable' using errcode = '55000';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'economic payment version conflict' using errcode = '40001';
  end if;
  if old.state = 'captured' then
    raise exception 'captured economic payment cannot transition' using errcode = '23514';
  end if;
  if new.state = old.state or new.state = 'created' then
    raise exception 'economic payment transition is not allowed' using errcode = '23514';
  end if;
  if new.state = 'checkout_opened' then
    if old.state not in ('created', 'declined', 'failed', 'expired', 'voided') then
      raise exception 'new payment session requires a definitive prior session' using errcode = '23514';
    end if;
    return new;
  end if;
  if old.state in ('created', 'declined', 'failed', 'expired', 'voided') then
    raise exception 'payment state requires a newly opened session' using errcode = '23514';
  end if;
  if old.state = 'authorized' and new.state not in ('captured', 'voided', 'timeout', 'provider_unknown') then
    raise exception 'authorized economic payment transition is not allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_economic_payment_intent_head
before insert or update on finance_economic_payment_intents
for each row execute function finance_validate_economic_payment_intent_head();

create or replace function finance_validate_economic_payment_session_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    new.opened_at := clock_timestamp();
    new.updated_at := new.opened_at;
    if new.version <> 1 or new.state <> 'checkout_opened' or new.terminal_at is not null then
      raise exception 'economic payment session must start checkout_opened at version one' using errcode = '23514';
    end if;
    return new;
  end if;
  new.updated_at := clock_timestamp();
  if new.id <> old.id
     or new.economic_payment_intent_id <> old.economic_payment_intent_id
     or new.series_id <> old.series_id
     or new.provider_account_id <> old.provider_account_id
     or new.provider_identity_version <> old.provider_identity_version
     or new.intent_version_opened <> old.intent_version_opened
     or new.opened_at <> old.opened_at then
    raise exception 'economic payment session identity is immutable' using errcode = '55000';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'economic payment session version conflict' using errcode = '40001';
  end if;
  if old.state in ('captured', 'declined', 'failed', 'expired', 'voided')
     or new.state = old.state
     or new.state = 'checkout_opened' then
    raise exception 'economic payment session transition is not allowed' using errcode = '23514';
  end if;
  if old.state = 'authorized' and new.state not in ('captured', 'voided', 'timeout', 'provider_unknown') then
    raise exception 'authorized payment session transition is not allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_economic_payment_session_head
before insert or update on finance_economic_payment_sessions
for each row execute function finance_validate_economic_payment_session_head();

create or replace function finance_require_economic_payment_head_evidence()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  latest_session finance_economic_payment_sessions%rowtype;
  matching_transition_exists boolean;
  capture_exists boolean;
begin
  if new.state = 'created' then
    if exists (select 1 from finance_economic_payment_sessions where economic_payment_intent_id = new.id) then
      raise exception 'created payment cannot already have a session' using errcode = '23514';
    end if;
    if not exists (
      select 1 from finance_economic_payment_intent_creation_receipts receipt
      where receipt.economic_payment_intent_id = new.id
        and receipt.purpose = new.purpose
        and receipt.source_id = new.source_id
        and receipt.series_id = new.series_id
        and receipt.provider_account_id = new.provider_account_id
        and receipt.provider_identity_version = new.provider_identity_version
        and receipt.amount_minor = new.amount_minor
        and receipt.currency = new.currency
        and receipt.economic_payment_version = new.version
        and receipt.source_uniqueness_version = 1
    ) then
      raise exception 'created payment requires its DB-issued creation receipt' using errcode = '23514';
    end if;
    return null;
  end if;
  select * into latest_session from finance_economic_payment_sessions
    where economic_payment_intent_id = new.id
    order by intent_version_opened desc
    limit 1;
  if not found or latest_session.state <> new.state then
    raise exception 'economic payment head must match its latest session' using errcode = '23514';
  end if;
  if new.state = 'checkout_opened' then
    if latest_session.intent_version_opened <> new.version or latest_session.version <> 1
       or not exists (
         select 1 from finance_economic_payment_session_open_receipts receipt
          where receipt.economic_payment_intent_id = new.id
            and receipt.economic_payment_session_id = latest_session.id
            and receipt.series_id = new.series_id
            and receipt.provider_account_id = new.provider_account_id
            and receipt.provider_identity_version = new.provider_identity_version
            and receipt.economic_payment_version = new.version
            and receipt.economic_payment_session_version = latest_session.version
       ) then
      raise exception 'new payment session must match the committed intent version' using errcode = '23514';
    end if;
    return null;
  end if;
  select exists (
    select 1 from finance_payment_transition_facts transition_fact
    where transition_fact.economic_payment_intent_id = new.id
      and transition_fact.economic_payment_session_id = latest_session.id
      and transition_fact.intent_version_to = new.version
      and transition_fact.session_version_to = latest_session.version
      and transition_fact.to_state = new.state
  ) into matching_transition_exists;
  if not matching_transition_exists then
    raise exception 'economic payment head transition requires an immutable fact' using errcode = '23514';
  end if;
  if new.state = 'captured' then
    select exists (
      select 1 from finance_capture_facts capture
      where capture.economic_payment_intent_id = new.id
        and capture.economic_payment_session_id = latest_session.id
    ) into capture_exists;
    if not capture_exists then
      raise exception 'captured payment head requires one capture fact' using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_economic_payment_head_evidence
after insert or update on finance_economic_payment_intents
deferrable initially deferred
for each row execute function finance_require_economic_payment_head_evidence();

create or replace function finance_require_economic_payment_session_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_payment_transition_facts transition_fact
    where transition_fact.economic_payment_session_id = new.id
      and transition_fact.session_version_to = new.version
      and transition_fact.to_state = new.state
  ) then
    raise exception 'payment session head update requires an immutable transition fact' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_economic_payment_session_transition
after update on finance_economic_payment_sessions
deferrable initially deferred
for each row execute function finance_require_economic_payment_session_transition();

create or replace function finance_validate_payment_transition_heads()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  intent_head finance_economic_payment_intents%rowtype;
  session_head finance_economic_payment_sessions%rowtype;
  artifact finance_artifacts%rowtype;
  authority_matches boolean;
begin
  select * into intent_head from finance_economic_payment_intents where id = new.economic_payment_intent_id;
  select * into session_head from finance_economic_payment_sessions where id = new.economic_payment_session_id;
  select * into artifact from finance_artifacts where id = new.evidence_artifact_id;
  if intent_head.version <> new.intent_version_to or intent_head.state <> new.to_state
     or session_head.version <> new.session_version_to or session_head.state <> new.to_state then
    raise exception 'payment transition fact must match committed heads' using errcode = '23514';
  end if;
  if artifact.binding_kind <> 'provider'
     or artifact.series_id <> new.series_id
     or artifact.provider_account_id <> new.provider_account_id
     or artifact.provider_identity_version <> new.provider_identity_version
     or artifact.sha256_digest <> new.evidence_artifact_digest then
    raise exception 'payment transition artifact binding mismatch' using errcode = '23514';
  end if;
  if new.authority_kind = 'provider_operation_result' then
    select exists (
      select 1
      from finance_provider_operation_results authority
      join finance_provider_operation_result_commit_receipts receipt
        on receipt.provider_operation_result_id = authority.id
       and receipt.provider_operation_intent_id = authority.provider_operation_intent_id
       and receipt.provider_operation_intent_version = authority.provider_operation_intent_version
       and receipt.series_id = authority.series_id
       and receipt.provider_account_id = authority.provider_account_id
       and receipt.provider_identity_version = authority.provider_identity_version
       and receipt.outcome = authority.outcome
       and receipt.evidence_artifact_id = authority.evidence_artifact_id
       and receipt.evidence_artifact_digest = authority.evidence_artifact_digest
      join finance_provider_operation_intents operation
        on operation.id = authority.provider_operation_intent_id
      where authority.id = new.authority_id
        and authority.series_id = new.series_id
        and authority.provider_account_id = new.provider_account_id
        and authority.provider_identity_version = new.provider_identity_version
        and authority.evidence_artifact_id = new.evidence_artifact_id
        and authority.evidence_artifact_digest = new.evidence_artifact_digest
        and operation.economic_payment_intent_id = new.economic_payment_intent_id
        and operation.economic_payment_session_id = new.economic_payment_session_id
        and (
          (new.evidence_kind = 'ambiguous_provider_result' and authority.outcome = 'ambiguous')
          or (new.evidence_kind = 'canonical_provider_result' and authority.outcome in ('succeeded', 'failed'))
        )
    ) into authority_matches;
  else
    select exists (
      select 1
      from finance_provider_semantic_facts authority
      join finance_webhook_semantic_commit_receipts receipt
        on receipt.semantic_fact_id = authority.id
       and receipt.inbox_item_id = authority.inbox_item_id
       and receipt.series_id = authority.series_id
       and receipt.provider_account_id = authority.provider_account_id
       and receipt.provider_identity_version = authority.provider_identity_version
       and receipt.economic_payment_intent_id = authority.economic_payment_intent_id
       and receipt.economic_payment_session_id is not distinct from authority.economic_payment_session_id
       and receipt.canonical_fact_digest = authority.canonical_fact_digest
       and receipt.evidence_artifact_id = authority.evidence_artifact_id
       and receipt.evidence_artifact_digest = authority.evidence_artifact_digest
       and receipt.effect_disposition = authority.effect_disposition
      where authority.id = new.authority_id
        and authority.series_id = new.series_id
        and authority.provider_account_id = new.provider_account_id
        and authority.provider_identity_version = new.provider_identity_version
        and authority.semantic_source_kind = 'payment_transition'
        and authority.economic_payment_intent_id = new.economic_payment_intent_id
        and authority.economic_payment_session_id = new.economic_payment_session_id
        and authority.evidence_artifact_id = new.evidence_artifact_id
        and authority.evidence_artifact_digest = new.evidence_artifact_digest
        and authority.effect_disposition = 'applied_once'
        and new.evidence_kind = 'canonical_provider_result'
    ) into authority_matches;
  end if;
  if not authority_matches then
    raise exception 'payment transition authority is missing or mismatched' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_payment_transition_heads
after insert on finance_payment_transition_facts
deferrable initially deferred
for each row execute function finance_validate_payment_transition_heads();

create or replace function finance_validate_economic_payment_capture()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  intent_head finance_economic_payment_intents%rowtype;
  session_head finance_economic_payment_sessions%rowtype;
  matching_transition finance_payment_transition_facts%rowtype;
  provider_capture_matches boolean;
begin
  select * into intent_head from finance_economic_payment_intents where id = new.economic_payment_intent_id;
  select * into session_head from finance_economic_payment_sessions where id = new.economic_payment_session_id;
  select * into matching_transition from finance_payment_transition_facts transition_fact
    where transition_fact.economic_payment_intent_id = new.economic_payment_intent_id
      and transition_fact.economic_payment_session_id = new.economic_payment_session_id
      and transition_fact.to_state = 'captured'
      and transition_fact.authority_kind = new.evidence_authority_kind
      and transition_fact.authority_id = new.evidence_authority_id
      and transition_fact.evidence_artifact_id = new.evidence_artifact_id
      and transition_fact.evidence_artifact_digest = new.evidence_artifact_digest;
  if intent_head.state <> 'captured' or session_head.state <> 'captured'
     or intent_head.series_id <> new.series_id
     or intent_head.provider_account_id <> new.provider_account_id
     or intent_head.provider_identity_version <> new.provider_identity_version
     or intent_head.amount_minor <> new.amount_minor
     or intent_head.currency <> new.currency
     or not found then
    raise exception 'capture must exactly match intent, session and transition authority' using errcode = '23514';
  end if;
  if (intent_head.purpose = 'platform_card_setup' and new.amount_minor <> 0)
     or (intent_head.purpose <> 'platform_card_setup' and new.amount_minor <= 0) then
    raise exception 'capture amount does not match payment purpose' using errcode = '23514';
  end if;
  if new.evidence_authority_kind = 'provider_operation_result' then
    select exists (
      select 1
      from finance_provider_operation_results result
      join finance_provider_operation_result_commit_receipts receipt
        on receipt.provider_operation_result_id = result.id
       and receipt.provider_operation_intent_id = result.provider_operation_intent_id
       and receipt.provider_operation_intent_version = result.provider_operation_intent_version
       and receipt.series_id = result.series_id
       and receipt.provider_account_id = result.provider_account_id
       and receipt.provider_identity_version = result.provider_identity_version
       and receipt.outcome = result.outcome
       and receipt.evidence_artifact_id = result.evidence_artifact_id
       and receipt.evidence_artifact_digest = result.evidence_artifact_digest
      join finance_provider_operation_intents operation
        on operation.id = result.provider_operation_intent_id
      where result.id = new.evidence_authority_id
        and result.outcome = 'succeeded'
        and result.provider_payment_id = new.provider_payment_id
        and (
          (intent_head.purpose = 'platform_card_setup'
            and ((result.amount_minor is null and result.currency is null)
              or (result.amount_minor = 0 and result.currency = new.currency)))
          or (intent_head.purpose <> 'platform_card_setup'
            and result.amount_minor = new.amount_minor
            and result.currency = new.currency)
        )
        and operation.economic_payment_intent_id = new.economic_payment_intent_id
        and operation.economic_payment_session_id = new.economic_payment_session_id
    ) into provider_capture_matches;
    if not provider_capture_matches then
      raise exception 'capture does not match the verified provider result' using errcode = '23514';
    end if;
  else
    select exists (
      select 1
      from finance_provider_semantic_facts semantic
      join finance_webhook_semantic_commit_receipts receipt
        on receipt.semantic_fact_id = semantic.id
       and receipt.inbox_item_id = semantic.inbox_item_id
       and receipt.series_id = semantic.series_id
       and receipt.provider_account_id = semantic.provider_account_id
       and receipt.provider_identity_version = semantic.provider_identity_version
       and receipt.economic_payment_intent_id = semantic.economic_payment_intent_id
       and receipt.economic_payment_session_id is not distinct from semantic.economic_payment_session_id
       and receipt.canonical_fact_digest = semantic.canonical_fact_digest
       and receipt.evidence_artifact_id = semantic.evidence_artifact_id
       and receipt.evidence_artifact_digest = semantic.evidence_artifact_digest
       and receipt.effect_disposition = semantic.effect_disposition
      where semantic.id = new.evidence_authority_id
        and semantic.semantic_source_kind = 'payment_transition'
        and semantic.effect_disposition = 'applied_once'
        and semantic.economic_payment_intent_id = new.economic_payment_intent_id
        and semantic.economic_payment_session_id = new.economic_payment_session_id
        and semantic.series_id = new.series_id
        and semantic.provider_account_id = new.provider_account_id
        and semantic.provider_identity_version = new.provider_identity_version
        and semantic.provider_payment_id = new.provider_payment_id
        and semantic.amount_minor = new.amount_minor
        and semantic.currency = new.currency
        and semantic.evidence_artifact_id = new.evidence_artifact_id
        and semantic.evidence_artifact_digest = new.evidence_artifact_digest
    ) into provider_capture_matches;
    if not provider_capture_matches then
      raise exception 'capture does not match the verified provider semantic fact' using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_economic_payment_capture
after insert on finance_capture_facts
deferrable initially deferred
for each row execute function finance_validate_economic_payment_capture();

create or replace function finance_validate_payment_clearing_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'INSERT' then
    if new.version <> 1 or new.state <> 'unmatched' then
      raise exception 'payment clearing head must start unmatched at version one' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.economic_payment_intent_id <> old.economic_payment_intent_id
     or new.series_id <> old.series_id
     or new.provider_account_id <> old.provider_account_id
     or new.provider_identity_version <> old.provider_identity_version
     or new.currency <> old.currency
     or new.version <> old.version + 1 then
    raise exception 'payment clearing identity is immutable and version must advance' using errcode = '40001';
  end if;
  return new;
end;
$$;

create trigger finance_validate_payment_clearing_head
before insert or update on finance_payment_clearing_heads
for each row execute function finance_validate_payment_clearing_head();

create or replace function finance_require_payment_clearing_history()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_payment_clearing_history history
    where history.economic_payment_intent_id = new.economic_payment_intent_id
      and history.version_from = old.version
      and history.version_to = new.version
      and history.from_state = old.state
      and history.to_state = new.state
  ) then
    raise exception 'payment clearing head update requires immutable history' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_payment_clearing_history
after update on finance_payment_clearing_heads
deferrable initially deferred
for each row execute function finance_require_payment_clearing_history();

create or replace function finance_validate_payment_clearing_history_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  current_head finance_payment_clearing_heads%rowtype;
begin
  select * into current_head from finance_payment_clearing_heads
    where economic_payment_intent_id = new.economic_payment_intent_id;
  if current_head.version <> new.version_to or current_head.state <> new.to_state then
    raise exception 'payment clearing history must match current head' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_payment_clearing_history_head
after insert on finance_payment_clearing_history
deferrable initially deferred
for each row execute function finance_validate_payment_clearing_history_head();

create or replace function finance_validate_platform_invoice_payment_binding()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  invoice_amount numeric(38, 0);
  invoice_currency text;
  invoice_state text;
  intent_purpose text;
  intent_source_id text;
  intent_amount numeric(38, 0);
  intent_currency text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'platform invoice payment binding is immutable' using errcode = '55000';
  end if;
  select amount_minor, currency, state
    into strict invoice_amount, invoice_currency, invoice_state
    from platform_tariff_invoices
   where id = new.invoice_id;
  select purpose, source_id, amount_minor, currency
    into strict intent_purpose, intent_source_id, intent_amount, intent_currency
    from finance_economic_payment_intents
   where id = new.economic_payment_intent_id;
  if invoice_state not in ('open', 'payment_pending')
     or intent_purpose <> 'platform_invoice'
     or intent_source_id <> new.invoice_id
     or intent_amount <> invoice_amount
     or intent_currency <> invoice_currency then
    raise exception 'tariff invoice payment binding does not match exact invoice authority' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_platform_invoice_payment_binding
before insert or update or delete on finance_platform_invoice_payment_bindings
for each row execute function finance_validate_platform_invoice_payment_binding();
`;
