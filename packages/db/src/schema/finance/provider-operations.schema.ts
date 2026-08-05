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

import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessions
} from "./economic-payments.schema";
import { financeArtifacts } from "./finance-artifacts.schema";
import {
  financeCurrencyValues,
  financeNumeric38String,
  financeRevisionString,
  formatFinanceSqlValues
} from "./finance-values";
import {
  financeRestrictedProviderCredentials,
  financeTransientSecretRefs
} from "./provider-credentials.schema";
import { financeProviderAccounts } from "./provider-accounts.schema";

const providerOperationPurposeValues = [
  "client_order",
  "platform_invoice",
  "platform_card_setup"
] as const;
const providerOperationKindValues = [
  "checkout_session_create",
  "card_setup",
  "card_setup_execute",
  "card_setup_3ds_method_complete",
  "saved_card_charge",
  "saved_card_charge_3ds_method_complete",
  "refund",
  "void"
] as const;
const providerOperationStatusValues = [
  "pending_dispatch",
  "requires_customer_action",
  "provider_unknown",
  "succeeded",
  "failed"
] as const;
const providerOperationOutcomeValues = ["succeeded", "failed", "ambiguous"] as const;

export const financeProviderOperationIntents = pgTable(
  "finance_provider_operation_intents",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    correlatedEconomicPaymentVersion: financeRevisionString(
      "correlated_economic_payment_version"
    ).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    purpose: text("purpose").notNull(),
    sourceId: varchar("source_id", { length: 160 }).notNull(),
    operationKind: text("operation_kind").notNull(),
    dispatchStep: text("dispatch_step"),
    status: text("status").notNull(),
    version: financeRevisionString("version").notNull(),
    sourceChainVersion: financeRevisionString("source_chain_version").notNull(),
    predecessorIntentId: varchar("predecessor_intent_id", { length: 160 }),
    predecessorSourceChainVersion: financeRevisionString("predecessor_source_chain_version"),
    replacementAuthorityDigest: varchar("replacement_authority_digest", { length: 71 }),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    idempotencyRetentionDeadline: timestamp("idempotency_retention_deadline", {
      withTimezone: true
    }).notNull(),
    canonicalRequestDigest: varchar("canonical_request_digest", { length: 71 }).notNull(),
    dispatchAuthorizationId: varchar("dispatch_authorization_id", { length: 160 }).notNull(),
    dispatchAuthorizationVersion: financeRevisionString("dispatch_authorization_version").notNull(),
    dispatchAuthorizationDigest: varchar("dispatch_authorization_digest", {
      length: 71
    }).notNull(),
    operationPolicyId: varchar("operation_policy_id", { length: 160 }).notNull(),
    operationPolicyVersion: integer("operation_policy_version").notNull(),
    operationPolicyDigest: varchar("operation_policy_digest", { length: 71 }).notNull(),
    operationMaximumRows: integer("operation_maximum_rows").notNull(),
    operationMaximumDecimalDigits: integer("operation_maximum_decimal_digits").notNull(),
    operationMaximumArtifactBytes: integer("operation_maximum_artifact_bytes").notNull(),
    restrictedCredentialId: varchar("restricted_credential_id", { length: 160 }),
    restrictedCredentialVersion: financeRevisionString("restricted_credential_version"),
    transientSecretRefId: varchar("transient_secret_ref_id", { length: 160 }),
    providerUnknownObservedAt: timestamp("provider_unknown_observed_at", {
      withTimezone: true
    }),
    terminalAt: timestamp("terminal_at", { withTimezone: true }),
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
      name: "finance_provider_operation_intents_provider_identity_fk"
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
      name: "finance_provider_operation_intents_economic_intent_fk"
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
      name: "finance_provider_operation_intents_economic_session_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.predecessorIntentId,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.purpose,
        table.sourceId,
        table.operationKind,
        table.predecessorSourceChainVersion
      ],
      foreignColumns: [
        table.id,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.purpose,
        table.sourceId,
        table.operationKind,
        table.sourceChainVersion
      ],
      name: "finance_provider_operation_intents_predecessor_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.restrictedCredentialId, table.restrictedCredentialVersion],
      foreignColumns: [
        financeRestrictedProviderCredentials.credentialId,
        financeRestrictedProviderCredentials.credentialVersion
      ],
      name: "finance_provider_operation_intents_restricted_credential_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.transientSecretRefId],
      foreignColumns: [financeTransientSecretRefs.secretRefId],
      name: "finance_provider_operation_intents_transient_secret_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_provider_operation_intents_scoped_idempotency_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.operationKind,
      table.idempotencyKey
    ),
    uniqueIndex("finance_provider_operation_intents_source_chain_version_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.purpose,
      table.sourceId,
      table.operationKind,
      table.sourceChainVersion
    ),
    unique("finance_provider_operation_intents_predecessor_owner_unique").on(
      table.id,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.purpose,
      table.sourceId,
      table.operationKind,
      table.sourceChainVersion
    ),
    uniqueIndex("finance_provider_operation_intents_one_successor_unique")
      .on(table.predecessorIntentId)
      .where(sql`${table.predecessorIntentId} is not null`),
    unique("finance_provider_operation_intents_exact_result_owner_unique").on(
      table.id,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.canonicalRequestDigest,
      table.idempotencyKey
    ),
    unique("finance_provider_operation_intents_receipt_owner_unique").on(
      table.id,
      table.economicPaymentIntentId,
      table.correlatedEconomicPaymentVersion,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.purpose,
      table.sourceId,
      table.operationKind,
      table.sourceChainVersion,
      table.canonicalRequestDigest,
      table.idempotencyKey,
      table.dispatchAuthorizationId,
      table.dispatchAuthorizationVersion,
      table.dispatchAuthorizationDigest
    ),
    check(
      "finance_provider_operation_intents_identifier_check",
      sql`length(trim(${table.id})) between 1 and 160
        and ${table.id} = trim(${table.id})
        and ${table.id} !~ '[[:cntrl:]]'
        and length(trim(${table.sourceId})) between 1 and 160
        and ${table.sourceId} = trim(${table.sourceId})
        and ${table.sourceId} !~ '[[:cntrl:]]'
        and length(trim(${table.dispatchAuthorizationId})) between 1 and 160
        and ${table.dispatchAuthorizationId} = trim(${table.dispatchAuthorizationId})
        and ${table.dispatchAuthorizationId} !~ '[[:cntrl:]]'
        and ${table.idempotencyKey} ~ '^[A-Za-z0-9._:-]{1,160}$'
        and (
          ${table.restrictedCredentialId} is null
          or (
            length(trim(${table.restrictedCredentialId})) between 1 and 160
            and ${table.restrictedCredentialId} = trim(${table.restrictedCredentialId})
            and ${table.restrictedCredentialId} !~ '[[:cntrl:]]'
          )
        )
        and (
          ${table.transientSecretRefId} is null
          or (
            length(trim(${table.transientSecretRefId})) between 1 and 160
            and ${table.transientSecretRefId} = trim(${table.transientSecretRefId})
            and ${table.transientSecretRefId} !~ '[[:cntrl:]]'
          )
        )
        and (
          ${table.predecessorIntentId} is null
          or (
            length(trim(${table.predecessorIntentId})) between 1 and 160
            and ${table.predecessorIntentId} = trim(${table.predecessorIntentId})
            and ${table.predecessorIntentId} !~ '[[:cntrl:]]'
          )
        )`
    ),
    check(
      "finance_provider_operation_intents_kind_session_check",
      sql`${table.purpose} in ${sql.raw(formatFinanceSqlValues(providerOperationPurposeValues))}
        and ${table.operationKind} in ${sql.raw(
          formatFinanceSqlValues(providerOperationKindValues)
        )}
        and (
          (${table.operationKind} in ('checkout_session_create', 'card_setup', 'card_setup_execute', 'card_setup_3ds_method_complete', 'saved_card_charge', 'saved_card_charge_3ds_method_complete') and ${table.economicPaymentSessionId} is not null)
          or (${table.operationKind} in ('refund', 'void') and ${table.economicPaymentSessionId} is null)
        )`
    ),
    check(
      "finance_provider_operation_intents_secret_shape_check",
      sql`(
          ${table.operationKind} = 'card_setup'
          and ${table.dispatchStep} = 'create'
          and ${table.restrictedCredentialId} is null
          and ${table.restrictedCredentialVersion} is null
          and ${table.transientSecretRefId} is null
        ) or (
          ${table.operationKind} = 'card_setup_3ds_method_complete'
          and ${table.dispatchStep} = 'complete_3ds_method'
          and ${table.restrictedCredentialId} is null
          and ${table.restrictedCredentialVersion} is null
          and ${table.transientSecretRefId} is not null
        ) or (
          ${table.operationKind} = 'card_setup_execute'
          and ${table.dispatchStep} = 'execute'
          and ${table.restrictedCredentialId} is null
          and ${table.restrictedCredentialVersion} is null
          and ${table.transientSecretRefId} is not null
        ) or (
          ${table.operationKind} = 'saved_card_charge_3ds_method_complete'
          and ${table.dispatchStep} = 'complete_3ds_method'
          and ${table.restrictedCredentialId} is null
          and ${table.restrictedCredentialVersion} is null
          and ${table.transientSecretRefId} is not null
        ) or (
          ${table.operationKind} = 'saved_card_charge'
          and ${table.dispatchStep} is null
          and ${table.restrictedCredentialId} is not null
          and ${table.restrictedCredentialVersion} is not null
          and ${table.transientSecretRefId} is null
        ) or (
          ${table.operationKind} in ('checkout_session_create', 'refund', 'void')
          and ${table.dispatchStep} is null
          and ${table.restrictedCredentialId} is null
          and ${table.restrictedCredentialVersion} is null
          and ${table.transientSecretRefId} is null
        )`
    ),
    check(
      "finance_provider_operation_intents_predecessor_shape_check",
      sql`(
          ${table.sourceChainVersion} = 1
          and ${table.predecessorIntentId} is null
          and ${table.predecessorSourceChainVersion} is null
          and ${table.replacementAuthorityDigest} is null
        ) or (
          ${table.sourceChainVersion} > 1
          and ${table.predecessorIntentId} is not null
          and ${table.predecessorSourceChainVersion} = ${table.sourceChainVersion} - 1
          and ${table.replacementAuthorityDigest} ~ '^sha256:[a-f0-9]{64}$'
        )`
    ),
    check(
      "finance_provider_operation_intents_status_result_shape_check",
      sql`${table.status} in ${sql.raw(formatFinanceSqlValues(providerOperationStatusValues))}
        and ${table.version} >= 0
        and ${table.correlatedEconomicPaymentVersion} >= 0
        and ${table.dispatchAuthorizationVersion} >= 1
        and ${table.canonicalRequestDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.dispatchAuthorizationDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(trim(${table.operationPolicyId})) between 1 and 160
        and ${table.operationPolicyId} = trim(${table.operationPolicyId})
        and ${table.operationPolicyId} !~ '[[:cntrl:]]'
        and ${table.operationPolicyVersion} >= 1
        and ${table.operationPolicyDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.operationMaximumRows} >= 1
        and ${table.operationMaximumDecimalDigits} >= 1
        and ${table.operationMaximumArtifactBytes} >= 1
        and ${table.idempotencyRetentionDeadline} > ${table.createdAt}
        and ${table.updatedAt} >= ${table.createdAt}
        and (
          (${table.status} = 'pending_dispatch' and ${table.providerUnknownObservedAt} is null and ${table.terminalAt} is null)
          or (${table.status} = 'requires_customer_action' and ${table.providerUnknownObservedAt} is null and ${table.terminalAt} is null)
          or (${table.status} = 'provider_unknown' and ${table.providerUnknownObservedAt} is not null and ${table.providerUnknownObservedAt} >= ${table.createdAt} and ${table.terminalAt} is null)
          or (${table.status} in ('succeeded', 'failed') and ${table.terminalAt} is not null and ${table.terminalAt} >= coalesce(${table.providerUnknownObservedAt}, ${table.createdAt}))
        )`
    ),
    index("finance_provider_operation_intents_dispatch_idx").on(
      table.status,
      table.idempotencyRetentionDeadline,
      table.createdAt,
      table.id
    ),
    index("finance_provider_operation_intents_source_chain_idx").on(
      table.purpose,
      table.sourceId,
      table.operationKind,
      table.sourceChainVersion
    )
  ]
);

export const financeProviderOperationSourceHeads = pgTable(
  "finance_provider_operation_source_heads",
  {
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    purpose: text("purpose").notNull(),
    sourceId: varchar("source_id", { length: 160 }).notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }),
    operationKind: text("operation_kind").notNull(),
    currentOperationIntentId: varchar("current_operation_intent_id", { length: 160 }).notNull(),
    headVersion: financeRevisionString("head_version").notNull(),
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
      name: "finance_provider_operation_source_heads_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.currentOperationIntentId,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.purpose,
        table.sourceId,
        table.operationKind,
        table.headVersion
      ],
      foreignColumns: [
        financeProviderOperationIntents.id,
        financeProviderOperationIntents.seriesId,
        financeProviderOperationIntents.providerAccountId,
        financeProviderOperationIntents.providerIdentityVersion,
        financeProviderOperationIntents.purpose,
        financeProviderOperationIntents.sourceId,
        financeProviderOperationIntents.operationKind,
        financeProviderOperationIntents.sourceChainVersion
      ],
      name: "finance_provider_operation_source_heads_current_intent_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_provider_operation_source_heads_exact_source_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.purpose,
      table.sourceId,
      table.operationKind
    ),
    uniqueIndex("finance_provider_operation_source_heads_current_intent_unique").on(
      table.currentOperationIntentId
    ),
    check(
      "finance_provider_operation_source_heads_identifier_check",
      sql`length(trim(${table.sourceId})) between 1 and 160
        and ${table.sourceId} = trim(${table.sourceId})
        and ${table.sourceId} !~ '[[:cntrl:]]'
        and length(trim(${table.economicPaymentIntentId})) between 1 and 160
        and ${table.economicPaymentIntentId} = trim(${table.economicPaymentIntentId})
        and ${table.economicPaymentIntentId} !~ '[[:cntrl:]]'
        and length(trim(${table.currentOperationIntentId})) between 1 and 160
        and ${table.currentOperationIntentId} = trim(${table.currentOperationIntentId})
        and ${table.currentOperationIntentId} !~ '[[:cntrl:]]'`
    ),
    check(
      "finance_provider_operation_source_heads_shape_check",
      sql`${table.purpose} in ${sql.raw(formatFinanceSqlValues(providerOperationPurposeValues))}
        and ${table.operationKind} in ${sql.raw(
          formatFinanceSqlValues(providerOperationKindValues)
        )}
        and ${table.headVersion} >= 1
        and ${table.updatedAt} >= ${table.createdAt}
        and (
          (${table.operationKind} in ('checkout_session_create', 'card_setup', 'card_setup_execute', 'card_setup_3ds_method_complete', 'saved_card_charge', 'saved_card_charge_3ds_method_complete') and ${table.economicPaymentSessionId} is not null)
          or (${table.operationKind} in ('refund', 'void') and ${table.economicPaymentSessionId} is null)
        )`
    ),
    index("finance_provider_operation_source_heads_lookup_idx").on(
      table.purpose,
      table.sourceId,
      table.operationKind,
      table.headVersion
    )
  ]
);

export const financeProviderDispatchArtifacts = pgTable(
  "finance_provider_dispatch_artifacts",
  {
    providerOperationIntentId: varchar("provider_operation_intent_id", {
      length: 160
    }).primaryKey(),
    artifactId: varchar("artifact_id", { length: 160 }).notNull(),
    artifactDigest: varchar("artifact_digest", { length: 71 }).notNull(),
    canonicalRequestDigest: varchar("canonical_request_digest", { length: 71 }).notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.providerOperationIntentId],
      foreignColumns: [financeProviderOperationIntents.id],
      name: "finance_provider_dispatch_artifacts_operation_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.artifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_provider_dispatch_artifacts_artifact_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_provider_dispatch_artifacts_artifact_unique").on(table.artifactId),
    uniqueIndex("finance_provider_dispatch_artifacts_exact_request_unique").on(
      table.providerOperationIntentId,
      table.canonicalRequestDigest
    ),
    unique("finance_provider_dispatch_artifacts_receipt_owner_unique").on(
      table.providerOperationIntentId,
      table.artifactId,
      table.artifactDigest,
      table.canonicalRequestDigest
    ),
    check(
      "finance_provider_dispatch_artifacts_digest_check",
      sql`length(trim(${table.artifactId})) between 1 and 160
        and ${table.artifactId} = trim(${table.artifactId})
        and ${table.artifactId} !~ '[[:cntrl:]]'
        and ${table.artifactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.canonicalRequestDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.artifactDigest} = ${table.canonicalRequestDigest}`
    )
  ]
);

export const financeProviderOperationIntentCreationReceipts = pgTable(
  "finance_provider_operation_intent_creation_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerOperationIntentId: varchar("provider_operation_intent_id", {
      length: 160
    }).notNull(),
    providerOperationIntentVersion: financeRevisionString(
      "provider_operation_intent_version"
    ).notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    correlatedEconomicPaymentVersion: financeRevisionString(
      "correlated_economic_payment_version"
    ).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    purpose: text("purpose").notNull(),
    sourceId: varchar("source_id", { length: 160 }).notNull(),
    operationKind: text("operation_kind").notNull(),
    sourceChainVersion: financeRevisionString("source_chain_version").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    canonicalRequestDigest: varchar("canonical_request_digest", { length: 71 }).notNull(),
    dispatchAuthorizationId: varchar("dispatch_authorization_id", { length: 160 }).notNull(),
    dispatchAuthorizationVersion: financeRevisionString("dispatch_authorization_version").notNull(),
    dispatchAuthorizationDigest: varchar("dispatch_authorization_digest", {
      length: 71
    }).notNull(),
    dispatchArtifactId: varchar("dispatch_artifact_id", { length: 160 }).notNull(),
    dispatchArtifactDigest: varchar("dispatch_artifact_digest", { length: 71 }).notNull(),
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
        table.providerOperationIntentId,
        table.economicPaymentIntentId,
        table.correlatedEconomicPaymentVersion,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.purpose,
        table.sourceId,
        table.operationKind,
        table.sourceChainVersion,
        table.canonicalRequestDigest,
        table.idempotencyKey,
        table.dispatchAuthorizationId,
        table.dispatchAuthorizationVersion,
        table.dispatchAuthorizationDigest
      ],
      foreignColumns: [
        financeProviderOperationIntents.id,
        financeProviderOperationIntents.economicPaymentIntentId,
        financeProviderOperationIntents.correlatedEconomicPaymentVersion,
        financeProviderOperationIntents.seriesId,
        financeProviderOperationIntents.providerAccountId,
        financeProviderOperationIntents.providerIdentityVersion,
        financeProviderOperationIntents.purpose,
        financeProviderOperationIntents.sourceId,
        financeProviderOperationIntents.operationKind,
        financeProviderOperationIntents.sourceChainVersion,
        financeProviderOperationIntents.canonicalRequestDigest,
        financeProviderOperationIntents.idempotencyKey,
        financeProviderOperationIntents.dispatchAuthorizationId,
        financeProviderOperationIntents.dispatchAuthorizationVersion,
        financeProviderOperationIntents.dispatchAuthorizationDigest
      ],
      name: "finance_provider_intent_creation_receipts_operation_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.providerOperationIntentId,
        table.dispatchArtifactId,
        table.dispatchArtifactDigest,
        table.canonicalRequestDigest
      ],
      foreignColumns: [
        financeProviderDispatchArtifacts.providerOperationIntentId,
        financeProviderDispatchArtifacts.artifactId,
        financeProviderDispatchArtifacts.artifactDigest,
        financeProviderDispatchArtifacts.canonicalRequestDigest
      ],
      name: "finance_provider_intent_creation_receipts_artifact_fk"
    }).onDelete("restrict"),
    unique("finance_provider_intent_creation_receipts_operation_unique").on(
      table.providerOperationIntentId
    ),
    uniqueIndex("finance_provider_intent_creation_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    uniqueIndex("finance_provider_intent_creation_receipts_digest_unique").on(
      table.canonicalDigest
    ),
    check(
      "finance_provider_intent_creation_receipts_shape_check",
      sql`${table.providerOperationIntentVersion} = 0
        and ${table.correlatedEconomicPaymentVersion} >= 0
        and ${table.purpose} in ${sql.raw(formatFinanceSqlValues(providerOperationPurposeValues))}
        and ${table.operationKind} in ${sql.raw(
          formatFinanceSqlValues(providerOperationKindValues)
        )}
        and ${table.sourceChainVersion} >= 1
        and ${table.canonicalRequestDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.dispatchAuthorizationDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.dispatchArtifactDigest} = ${table.canonicalRequestDigest}
        and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.canonicalPreimage}) between 1 and 16000
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'`
    )
  ]
);

export const financeProviderOperationResults = pgTable(
  "finance_provider_operation_results",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    providerOperationIntentId: varchar("provider_operation_intent_id", { length: 160 }).notNull(),
    providerOperationIntentVersion: financeRevisionString(
      "provider_operation_intent_version"
    ).notNull(),
    correlatedEconomicPaymentVersion: financeRevisionString(
      "correlated_economic_payment_version"
    ).notNull(),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    outcome: text("outcome").notNull(),
    providerOperationId: varchar("provider_operation_id", { length: 160 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }),
    amountMinor: financeNumeric38String("amount_minor"),
    currency: text("currency"),
    canonicalRequestDigest: varchar("canonical_request_digest", { length: 71 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    evidenceArtifactId: varchar("evidence_artifact_id", { length: 160 }).notNull(),
    evidenceArtifactDigest: varchar("evidence_artifact_digest", { length: 71 }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [
        table.providerOperationIntentId,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.canonicalRequestDigest,
        table.idempotencyKey
      ],
      foreignColumns: [
        financeProviderOperationIntents.id,
        financeProviderOperationIntents.seriesId,
        financeProviderOperationIntents.providerAccountId,
        financeProviderOperationIntents.providerIdentityVersion,
        financeProviderOperationIntents.canonicalRequestDigest,
        financeProviderOperationIntents.idempotencyKey
      ],
      name: "finance_provider_operation_results_operation_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_provider_operation_results_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.evidenceArtifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_provider_operation_results_artifact_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_provider_operation_results_version_unique").on(
      table.providerOperationIntentId,
      table.providerOperationIntentVersion
    ),
    uniqueIndex("finance_provider_operation_results_provider_evidence_unique").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.providerOperationId,
      table.evidenceArtifactDigest
    ),
    unique("finance_provider_operation_results_receipt_owner_unique").on(
      table.id,
      table.providerOperationIntentId,
      table.providerOperationIntentVersion,
      table.correlatedEconomicPaymentVersion,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.outcome,
      table.providerOperationId,
      table.canonicalRequestDigest,
      table.idempotencyKey,
      table.evidenceArtifactId,
      table.evidenceArtifactDigest,
      table.observedAt,
      table.committedAt
    ),
    check(
      "finance_provider_operation_results_identifier_check",
      sql`length(trim(${table.id})) between 1 and 160
        and ${table.id} = trim(${table.id})
        and ${table.id} !~ '[[:cntrl:]]'
        and length(trim(${table.providerOperationId})) between 1 and 160
        and ${table.providerOperationId} = trim(${table.providerOperationId})
        and ${table.providerOperationId} !~ '[[:cntrl:]]'
        and (
          ${table.providerPaymentId} is null
          or (
            length(trim(${table.providerPaymentId})) between 1 and 160
            and ${table.providerPaymentId} = trim(${table.providerPaymentId})
            and ${table.providerPaymentId} !~ '[[:cntrl:]]'
          )
        )
        and length(trim(${table.evidenceArtifactId})) between 1 and 160
        and ${table.evidenceArtifactId} = trim(${table.evidenceArtifactId})
        and ${table.evidenceArtifactId} !~ '[[:cntrl:]]'`
    ),
    check(
      "finance_provider_operation_results_shape_check",
      sql`${table.outcome} in ${sql.raw(formatFinanceSqlValues(providerOperationOutcomeValues))}
        and ${table.providerOperationIntentVersion} >= 1
        and ${table.correlatedEconomicPaymentVersion} >= 0
        and ${table.canonicalRequestDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.evidenceArtifactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.committedAt} >= ${table.observedAt}
        and (
          (${table.amountMinor} is null and ${table.currency} is null)
          or (${table.amountMinor} >= 0 and ${table.currency} in ${sql.raw(
            formatFinanceSqlValues(financeCurrencyValues)
          )})
        )`
    ),
    index("finance_provider_operation_results_operation_idx").on(
      table.providerOperationIntentId,
      table.providerOperationIntentVersion,
      table.committedAt
    )
  ]
);

export const financeProviderOperationResultCommitReceipts = pgTable(
  "finance_provider_operation_result_commit_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerOperationResultId: varchar("provider_operation_result_id", { length: 160 }).notNull(),
    providerOperationIntentId: varchar("provider_operation_intent_id", {
      length: 160
    }).notNull(),
    providerOperationIntentVersion: financeRevisionString(
      "provider_operation_intent_version"
    ).notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    correlatedEconomicPaymentVersion: financeRevisionString(
      "correlated_economic_payment_version"
    ).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    purpose: text("purpose").notNull(),
    sourceId: varchar("source_id", { length: 160 }).notNull(),
    operationKind: text("operation_kind").notNull(),
    outcome: text("outcome").notNull(),
    providerOperationId: varchar("provider_operation_id", { length: 160 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 160 }),
    amountMinor: financeNumeric38String("amount_minor"),
    currency: text("currency"),
    canonicalRequestDigest: varchar("canonical_request_digest", { length: 71 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    evidenceArtifactId: varchar("evidence_artifact_id", { length: 160 }).notNull(),
    evidenceArtifactDigest: varchar("evidence_artifact_digest", { length: 71 }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    resultCommittedAt: timestamp("result_committed_at", { withTimezone: true }).notNull(),
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
        table.providerOperationResultId,
        table.providerOperationIntentId,
        table.providerOperationIntentVersion,
        table.correlatedEconomicPaymentVersion,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.outcome,
        table.providerOperationId,
        table.canonicalRequestDigest,
        table.idempotencyKey,
        table.evidenceArtifactId,
        table.evidenceArtifactDigest,
        table.observedAt,
        table.resultCommittedAt
      ],
      foreignColumns: [
        financeProviderOperationResults.id,
        financeProviderOperationResults.providerOperationIntentId,
        financeProviderOperationResults.providerOperationIntentVersion,
        financeProviderOperationResults.correlatedEconomicPaymentVersion,
        financeProviderOperationResults.seriesId,
        financeProviderOperationResults.providerAccountId,
        financeProviderOperationResults.providerIdentityVersion,
        financeProviderOperationResults.outcome,
        financeProviderOperationResults.providerOperationId,
        financeProviderOperationResults.canonicalRequestDigest,
        financeProviderOperationResults.idempotencyKey,
        financeProviderOperationResults.evidenceArtifactId,
        financeProviderOperationResults.evidenceArtifactDigest,
        financeProviderOperationResults.observedAt,
        financeProviderOperationResults.committedAt
      ],
      name: "finance_provider_result_commit_receipts_result_fk"
    }).onDelete("restrict"),
    unique("finance_provider_result_commit_receipts_result_unique").on(
      table.providerOperationResultId
    ),
    unique("finance_provider_result_receipts_capture_owner_unique").on(
      table.id,
      table.providerOperationResultId,
      table.providerOperationIntentId,
      table.providerOperationIntentVersion,
      table.economicPaymentIntentId,
      table.correlatedEconomicPaymentVersion,
      table.economicPaymentSessionId,
      table.purpose,
      table.sourceId,
      table.operationKind,
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.outcome,
      table.providerOperationId,
      table.providerPaymentId,
      table.amountMinor,
      table.currency,
      table.canonicalRequestDigest,
      table.evidenceArtifactId,
      table.evidenceArtifactDigest,
      table.observedAt
    ),
    uniqueIndex("finance_provider_result_commit_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    uniqueIndex("finance_provider_result_commit_receipts_digest_unique").on(table.canonicalDigest),
    check(
      "finance_provider_result_commit_receipts_shape_check",
      sql`${table.providerOperationIntentVersion} >= 1
        and ${table.correlatedEconomicPaymentVersion} >= 0
        and ${table.purpose} in ${sql.raw(formatFinanceSqlValues(providerOperationPurposeValues))}
        and ${table.operationKind} in ${sql.raw(
          formatFinanceSqlValues(providerOperationKindValues)
        )}
        and ${table.outcome} in ${sql.raw(formatFinanceSqlValues(providerOperationOutcomeValues))}
        and ${table.canonicalRequestDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.evidenceArtifactDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.canonicalPreimage}) between 1 and 16000
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'
        and ${table.committedAt} >= ${table.resultCommittedAt}`
    )
  ]
);

/**
 * Immutable internal evidence that an operation reached the transport boundary without a
 * trustworthy provider response. It deliberately contains no provider payment or money fact.
 */
export const financeProviderOperationTransportUnknownReceipts = pgTable(
  "finance_provider_operation_transport_unknown_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerOperationIntentId: varchar("provider_operation_intent_id", { length: 160 }).notNull(),
    providerOperationIntentVersion: financeRevisionString(
      "provider_operation_intent_version"
    ).notNull(),
    economicPaymentIntentId: varchar("economic_payment_intent_id", { length: 160 }).notNull(),
    correlatedEconomicPaymentVersion: financeRevisionString(
      "correlated_economic_payment_version"
    ).notNull(),
    economicPaymentSessionId: varchar("economic_payment_session_id", { length: 160 }),
    seriesId: varchar("series_id", { length: 160 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 160 }).notNull(),
    providerIdentityVersion: integer("provider_identity_version").notNull(),
    purpose: text("purpose").notNull(),
    sourceId: varchar("source_id", { length: 160 }).notNull(),
    operationKind: text("operation_kind").notNull(),
    canonicalRequestDigest: varchar("canonical_request_digest", { length: 71 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
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
      columns: [table.providerOperationIntentId],
      foreignColumns: [financeProviderOperationIntents.id],
      name: "finance_provider_transport_unknown_receipts_operation_fk"
    }).onDelete("restrict"),
    unique("finance_provider_transport_unknown_receipts_operation_version_unique").on(
      table.providerOperationIntentId,
      table.providerOperationIntentVersion
    ),
    uniqueIndex("finance_provider_transport_unknown_receipts_boundary_unique").on(
      table.persistenceTransactionBoundaryRef
    ),
    uniqueIndex("finance_provider_transport_unknown_receipts_digest_unique").on(
      table.canonicalDigest
    ),
    check(
      "finance_provider_transport_unknown_receipts_shape_check",
      sql`${table.providerOperationIntentVersion} >= 1
        and ${table.correlatedEconomicPaymentVersion} >= 0
        and ${table.purpose} in ${sql.raw(formatFinanceSqlValues(providerOperationPurposeValues))}
        and ${table.operationKind} in ${sql.raw(
          formatFinanceSqlValues(providerOperationKindValues)
        )}
        and ${table.canonicalRequestDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.canonicalPreimage}) between 1 and 16000
        and ${table.persistenceTransactionBoundaryRef} ~ '^postgres-xid:[0-9]+$'
        and ${table.committedAt} >= ${table.observedAt}`
    )
  ]
);

/** Baseline owner executes this reviewed DDL after every normalized Task 2 table exists. */
export const financeProviderOperationIntegritySql = `
create extension if not exists pgcrypto;

create or replace function finance_reject_provider_operation_evidence_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'provider operation evidence is immutable' using errcode = '55000';
end;
$$;

create trigger finance_provider_operation_intents_no_delete before delete on finance_provider_operation_intents
for each row execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_operation_intents_no_truncate before truncate on finance_provider_operation_intents
for each statement execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_operation_source_heads_no_delete before delete on finance_provider_operation_source_heads
for each row execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_operation_source_heads_no_truncate before truncate on finance_provider_operation_source_heads
for each statement execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_dispatch_artifacts_immutable before update or delete on finance_provider_dispatch_artifacts
for each row execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_dispatch_artifacts_no_truncate before truncate on finance_provider_dispatch_artifacts
for each statement execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_operation_results_immutable before update or delete on finance_provider_operation_results
for each row execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_operation_results_no_truncate before truncate on finance_provider_operation_results
for each statement execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_transport_unknown_receipts_immutable before update or delete on finance_provider_operation_transport_unknown_receipts
for each row execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_transport_unknown_receipts_no_truncate before truncate on finance_provider_operation_transport_unknown_receipts
for each statement execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_intent_creation_receipts_immutable before update or delete on finance_provider_operation_intent_creation_receipts
for each row execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_intent_creation_receipts_no_truncate before truncate on finance_provider_operation_intent_creation_receipts
for each statement execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_result_commit_receipts_immutable before update or delete on finance_provider_operation_result_commit_receipts
for each row execute function finance_reject_provider_operation_evidence_mutation();
create trigger finance_provider_result_commit_receipts_no_truncate before truncate on finance_provider_operation_result_commit_receipts
for each statement execute function finance_reject_provider_operation_evidence_mutation();

create or replace function finance_issue_provider_operation_persistence_time()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  economic_intent finance_economic_payment_intents%rowtype;
begin
  if tg_table_name = 'finance_provider_dispatch_artifacts' then
    new.registered_at := clock_timestamp();
  elsif tg_table_name = 'finance_provider_operation_results' then
    select economic.* into strict economic_intent
      from finance_provider_operation_intents operation
      join finance_economic_payment_intents economic
        on economic.id = operation.economic_payment_intent_id
      where operation.id = new.provider_operation_intent_id
      for update of economic;
    new.correlated_economic_payment_version := economic_intent.version;
    new.committed_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger finance_provider_dispatch_artifacts_issue_time
before insert on finance_provider_dispatch_artifacts
for each row execute function finance_issue_provider_operation_persistence_time();
create trigger finance_provider_operation_results_issue_time
before insert on finance_provider_operation_results
for each row execute function finance_issue_provider_operation_persistence_time();

create or replace function finance_issue_provider_operation_intent_creation_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  operation finance_provider_operation_intents%rowtype;
  dispatch finance_provider_dispatch_artifacts%rowtype;
begin
  select * into strict operation from finance_provider_operation_intents
    where id = new.provider_operation_intent_id;
  select * into strict dispatch from finance_provider_dispatch_artifacts
    where provider_operation_intent_id = operation.id;
  new.provider_operation_intent_version := operation.version;
  new.economic_payment_intent_id := operation.economic_payment_intent_id;
  new.correlated_economic_payment_version := operation.correlated_economic_payment_version;
  new.economic_payment_session_id := operation.economic_payment_session_id;
  new.series_id := operation.series_id;
  new.provider_account_id := operation.provider_account_id;
  new.provider_identity_version := operation.provider_identity_version;
  new.purpose := operation.purpose;
  new.source_id := operation.source_id;
  new.operation_kind := operation.operation_kind;
  new.source_chain_version := operation.source_chain_version;
  new.idempotency_key := operation.idempotency_key;
  new.canonical_request_digest := operation.canonical_request_digest;
  new.dispatch_authorization_id := operation.dispatch_authorization_id;
  new.dispatch_authorization_version := operation.dispatch_authorization_version;
  new.dispatch_authorization_digest := operation.dispatch_authorization_digest;
  new.dispatch_artifact_id := dispatch.artifact_id;
  new.dispatch_artifact_digest := dispatch.artifact_digest;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'provider_operation_intent_creation_receipt',
    'schemaVersion', 1,
    'receiptId', new.id::text,
    'providerOperationIntentId', new.provider_operation_intent_id,
    'providerOperationIntentVersion', new.provider_operation_intent_version::text,
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'correlatedEconomicPaymentVersion', new.correlated_economic_payment_version::text,
    'economicPaymentSessionId', new.economic_payment_session_id,
    'seriesId', new.series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'purpose', new.purpose,
    'sourceId', new.source_id,
    'operationKind', new.operation_kind,
    'sourceChainVersion', new.source_chain_version::text,
    'idempotencyKey', new.idempotency_key,
    'canonicalRequestDigest', new.canonical_request_digest,
    'dispatchAuthorizationId', new.dispatch_authorization_id,
    'dispatchAuthorizationVersion', new.dispatch_authorization_version::text,
    'dispatchAuthorizationDigest', new.dispatch_authorization_digest,
    'dispatchArtifactId', new.dispatch_artifact_id,
    'dispatchArtifactDigest', new.dispatch_artifact_digest,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'committedAt', to_char(new.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger finance_issue_provider_operation_intent_creation_receipt
before insert on finance_provider_operation_intent_creation_receipts
for each row execute function finance_issue_provider_operation_intent_creation_receipt();

create or replace function finance_issue_provider_operation_result_commit_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  result_row finance_provider_operation_results%rowtype;
  operation finance_provider_operation_intents%rowtype;
begin
  select * into strict result_row from finance_provider_operation_results
    where id = new.provider_operation_result_id;
  select * into strict operation from finance_provider_operation_intents
    where id = result_row.provider_operation_intent_id;
  new.provider_operation_intent_id := result_row.provider_operation_intent_id;
  new.provider_operation_intent_version := result_row.provider_operation_intent_version;
  new.economic_payment_intent_id := operation.economic_payment_intent_id;
  new.correlated_economic_payment_version := result_row.correlated_economic_payment_version;
  new.economic_payment_session_id := operation.economic_payment_session_id;
  new.series_id := result_row.series_id;
  new.provider_account_id := result_row.provider_account_id;
  new.provider_identity_version := result_row.provider_identity_version;
  new.purpose := operation.purpose;
  new.source_id := operation.source_id;
  new.operation_kind := operation.operation_kind;
  new.outcome := result_row.outcome;
  new.provider_operation_id := result_row.provider_operation_id;
  new.provider_payment_id := result_row.provider_payment_id;
  new.amount_minor := result_row.amount_minor;
  new.currency := result_row.currency;
  new.canonical_request_digest := result_row.canonical_request_digest;
  new.idempotency_key := result_row.idempotency_key;
  new.evidence_artifact_id := result_row.evidence_artifact_id;
  new.evidence_artifact_digest := result_row.evidence_artifact_digest;
  new.observed_at := result_row.observed_at;
  new.result_committed_at := result_row.committed_at;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'provider_operation_result_commit_receipt',
    'schemaVersion', 1,
    'receiptId', new.id::text,
    'providerOperationResultId', new.provider_operation_result_id,
    'providerOperationIntentId', new.provider_operation_intent_id,
    'providerOperationIntentVersion', new.provider_operation_intent_version::text,
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'correlatedEconomicPaymentVersion', new.correlated_economic_payment_version::text,
    'economicPaymentSessionId', new.economic_payment_session_id,
    'seriesId', new.series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'purpose', new.purpose,
    'sourceId', new.source_id,
    'operationKind', new.operation_kind,
    'outcome', new.outcome,
    'providerOperationId', new.provider_operation_id,
    'providerPaymentId', new.provider_payment_id,
    'amountMinor', new.amount_minor::text,
    'currency', new.currency,
    'canonicalRequestDigest', new.canonical_request_digest,
    'idempotencyKey', new.idempotency_key,
    'evidenceArtifactId', new.evidence_artifact_id,
    'evidenceArtifactDigest', new.evidence_artifact_digest,
    'observedAt', to_char(new.observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'resultCommittedAt', to_char(new.result_committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'committedAt', to_char(new.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger finance_issue_provider_operation_result_commit_receipt
before insert on finance_provider_operation_result_commit_receipts
for each row execute function finance_issue_provider_operation_result_commit_receipt();

create or replace function finance_issue_provider_operation_transport_unknown_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  operation finance_provider_operation_intents%rowtype;
begin
  select * into strict operation from finance_provider_operation_intents
    where id = new.provider_operation_intent_id;
  if operation.status <> 'provider_unknown' or operation.provider_unknown_observed_at is null then
    raise exception 'transport-unknown receipt requires an unknown provider-operation head' using errcode = '23514';
  end if;
  new.provider_operation_intent_version := operation.version;
  new.economic_payment_intent_id := operation.economic_payment_intent_id;
  new.correlated_economic_payment_version := operation.correlated_economic_payment_version;
  new.economic_payment_session_id := operation.economic_payment_session_id;
  new.series_id := operation.series_id;
  new.provider_account_id := operation.provider_account_id;
  new.provider_identity_version := operation.provider_identity_version;
  new.purpose := operation.purpose;
  new.source_id := operation.source_id;
  new.operation_kind := operation.operation_kind;
  new.canonical_request_digest := operation.canonical_request_digest;
  new.idempotency_key := operation.idempotency_key;
  new.observed_at := operation.provider_unknown_observed_at;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'provider_operation_transport_unknown_receipt',
    'schemaVersion', 1,
    'receiptId', new.id::text,
    'providerOperationIntentId', new.provider_operation_intent_id,
    'providerOperationIntentVersion', new.provider_operation_intent_version::text,
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'correlatedEconomicPaymentVersion', new.correlated_economic_payment_version::text,
    'economicPaymentSessionId', new.economic_payment_session_id,
    'seriesId', new.series_id,
    'providerAccountId', new.provider_account_id,
    'providerIdentityVersion', new.provider_identity_version,
    'purpose', new.purpose,
    'sourceId', new.source_id,
    'operationKind', new.operation_kind,
    'canonicalRequestDigest', new.canonical_request_digest,
    'idempotencyKey', new.idempotency_key,
    'observedAt', to_char(new.observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref,
    'committedAt', to_char(new.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger finance_issue_provider_operation_transport_unknown_receipt
before insert on finance_provider_operation_transport_unknown_receipts
for each row execute function finance_issue_provider_operation_transport_unknown_receipt();

create or replace function finance_validate_provider_operation_intent_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  economic_intent finance_economic_payment_intents%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into strict economic_intent from finance_economic_payment_intents
      where id = new.economic_payment_intent_id
      for update;
    new.correlated_economic_payment_version := economic_intent.version;
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    if new.version <> 0 or new.status <> 'pending_dispatch'
       or new.provider_unknown_observed_at is not null or new.terminal_at is not null then
      raise exception 'provider operation must start pending dispatch at version zero' using errcode = '23514';
    end if;
    return new;
  end if;
  new.updated_at := clock_timestamp();
  if new.id <> old.id
     or new.economic_payment_intent_id <> old.economic_payment_intent_id
     or new.correlated_economic_payment_version <> old.correlated_economic_payment_version
     or new.economic_payment_session_id is distinct from old.economic_payment_session_id
     or new.series_id <> old.series_id
     or new.provider_account_id <> old.provider_account_id
     or new.provider_identity_version <> old.provider_identity_version
     or new.purpose <> old.purpose
     or new.source_id <> old.source_id
     or new.operation_kind <> old.operation_kind
     or new.dispatch_step is distinct from old.dispatch_step
     or new.source_chain_version <> old.source_chain_version
     or new.predecessor_intent_id is distinct from old.predecessor_intent_id
     or new.predecessor_source_chain_version is distinct from old.predecessor_source_chain_version
     or new.replacement_authority_digest is distinct from old.replacement_authority_digest
     or new.idempotency_key <> old.idempotency_key
     or new.idempotency_retention_deadline <> old.idempotency_retention_deadline
     or new.canonical_request_digest is distinct from old.canonical_request_digest
     or new.dispatch_authorization_id <> old.dispatch_authorization_id
     or new.dispatch_authorization_version <> old.dispatch_authorization_version
     or new.dispatch_authorization_digest <> old.dispatch_authorization_digest
     or new.operation_policy_id <> old.operation_policy_id
     or new.operation_policy_version <> old.operation_policy_version
     or new.operation_policy_digest <> old.operation_policy_digest
     or new.operation_maximum_rows <> old.operation_maximum_rows
     or new.operation_maximum_decimal_digits <> old.operation_maximum_decimal_digits
     or new.operation_maximum_artifact_bytes <> old.operation_maximum_artifact_bytes
     or new.restricted_credential_id is distinct from old.restricted_credential_id
     or new.restricted_credential_version is distinct from old.restricted_credential_version
     or new.transient_secret_ref_id is distinct from old.transient_secret_ref_id
     or new.created_at <> old.created_at then
    raise exception 'provider operation request identity is immutable' using errcode = '55000';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'provider operation version conflict' using errcode = '40001';
  end if;
  if not (
    (old.status = 'pending_dispatch' and new.status in ('requires_customer_action', 'provider_unknown', 'succeeded', 'failed'))
    or (old.status = 'requires_customer_action' and new.status in ('provider_unknown', 'succeeded', 'failed'))
    or (old.status = 'provider_unknown' and new.status in ('provider_unknown', 'succeeded', 'failed'))
  ) then
    raise exception 'provider operation transition is not allowed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_provider_operation_intent_head
before insert or update on finance_provider_operation_intents
for each row execute function finance_validate_provider_operation_intent_head();

create or replace function finance_validate_provider_operation_prerequisites()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  predecessor finance_provider_operation_intents%rowtype;
  credential finance_restricted_provider_credentials%rowtype;
  secret finance_transient_secret_refs%rowtype;
  economic_intent finance_economic_payment_intents%rowtype;
  consumed_operation_id varchar(160);
  active_credential_exists boolean;
begin
  select * into economic_intent from finance_economic_payment_intents
    where id = new.economic_payment_intent_id;
  if economic_intent.purpose <> new.purpose or economic_intent.source_id <> new.source_id then
    raise exception 'provider operation economic source correlation mismatch' using errcode = '23514';
  end if;
  if new.predecessor_intent_id is not null then
    select * into predecessor from finance_provider_operation_intents where id = new.predecessor_intent_id;
    if predecessor.status <> 'failed'
       or predecessor.canonical_request_digest <> new.canonical_request_digest then
      raise exception 'replacement requires a failed canonical predecessor' using errcode = '23514';
    end if;
  end if;
  if new.restricted_credential_id is not null then
    select * into credential from finance_restricted_provider_credentials
      where credential_id = new.restricted_credential_id
        and credential_version = new.restricted_credential_version;
    if credential.series_id <> new.series_id
       or credential.provider_account_id <> new.provider_account_id
       or credential.provider_identity_version <> new.provider_identity_version then
      raise exception 'restricted credential provider binding mismatch' using errcode = '23514';
    end if;
    select exists (
      select 1 from finance_restricted_provider_credential_heads head
      where head.series_id = new.series_id
        and head.provider_account_id = new.provider_account_id
        and head.provider_identity_version = new.provider_identity_version
        and head.current_credential_id = new.restricted_credential_id
        and head.current_credential_version = new.restricted_credential_version
        and head.current_lifecycle = 'active'
    ) into active_credential_exists;
    if not active_credential_exists then
      raise exception 'saved-card operation requires the exact active credential head' using errcode = '23514';
    end if;
  end if;
  if new.transient_secret_ref_id is not null then
    select * into secret from finance_transient_secret_refs where secret_ref_id = new.transient_secret_ref_id;
    select provider_operation_intent_id into consumed_operation_id
      from finance_transient_secret_consumptions where secret_ref_id = new.transient_secret_ref_id;
    if secret.series_id <> new.series_id
       or secret.provider_account_id <> new.provider_account_id
       or secret.provider_identity_version <> new.provider_identity_version
       or secret.provider_expires_at <= new.created_at
       or consumed_operation_id is distinct from new.id then
      raise exception 'transient secret must be exact, live and consumed once by this operation' using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_provider_operation_prerequisites
after insert on finance_provider_operation_intents
deferrable initially deferred
for each row execute function finance_validate_provider_operation_prerequisites();

create or replace function finance_validate_client_checkout_dispatch_authorization()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.operation_kind <> 'checkout_session_create' then
    return null;
  end if;
  if not exists (
    select 1 from finance_client_checkout_authorizations authority
    where authority.authority_id = new.dispatch_authorization_id
      and authority.order_snapshot_version = new.dispatch_authorization_version
      and authority.canonical_digest = new.dispatch_authorization_digest
      and authority.provider_operation_intent_id = new.id
      and authority.order_id::text = new.source_id
      and authority.economic_payment_intent_id = new.economic_payment_intent_id
      and authority.economic_payment_session_id = new.economic_payment_session_id
  ) then
    raise exception 'client checkout operation requires its exact durable authorization' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_client_checkout_dispatch_authorization
after insert on finance_provider_operation_intents
deferrable initially deferred
for each row execute function finance_validate_client_checkout_dispatch_authorization();

create or replace function finance_require_provider_operation_durable_dependencies()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_provider_dispatch_artifacts dispatch
    where dispatch.provider_operation_intent_id = new.id
      and dispatch.canonical_request_digest = new.canonical_request_digest
  ) then
    raise exception 'provider operation must commit its sealed dispatch artifact before I/O' using errcode = '23514';
  end if;
  if not exists (
    select 1 from finance_provider_operation_source_heads head
    where head.series_id = new.series_id
      and head.provider_account_id = new.provider_account_id
      and head.provider_identity_version = new.provider_identity_version
      and head.purpose = new.purpose
      and head.source_id = new.source_id
      and head.operation_kind = new.operation_kind
      and head.current_operation_intent_id = new.id
      and head.head_version = new.source_chain_version
  ) then
    raise exception 'provider operation must be the committed source-chain head' using errcode = '23514';
  end if;
  if not exists (
    select 1 from finance_provider_operation_intent_creation_receipts receipt
    where receipt.provider_operation_intent_id = new.id
      and receipt.provider_operation_intent_version = 0
      and receipt.economic_payment_intent_id = new.economic_payment_intent_id
      and receipt.correlated_economic_payment_version = new.correlated_economic_payment_version
      and receipt.economic_payment_session_id is not distinct from new.economic_payment_session_id
      and receipt.series_id = new.series_id
      and receipt.provider_account_id = new.provider_account_id
      and receipt.provider_identity_version = new.provider_identity_version
      and receipt.purpose = new.purpose
      and receipt.source_id = new.source_id
      and receipt.operation_kind = new.operation_kind
      and receipt.source_chain_version = new.source_chain_version
      and receipt.idempotency_key = new.idempotency_key
      and receipt.canonical_request_digest = new.canonical_request_digest
      and receipt.dispatch_authorization_id = new.dispatch_authorization_id
      and receipt.dispatch_authorization_version = new.dispatch_authorization_version
      and receipt.dispatch_authorization_digest = new.dispatch_authorization_digest
  ) then
    raise exception 'provider operation must commit its DB-issued creation receipt before I/O' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_provider_operation_durable_dependencies
after insert on finance_provider_operation_intents
deferrable initially deferred
for each row execute function finance_require_provider_operation_durable_dependencies();

create or replace function finance_validate_provider_operation_source_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  current_intent finance_provider_operation_intents%rowtype;
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    if new.head_version <> 1 then
      raise exception 'provider operation source head must start at version one' using errcode = '23514';
    end if;
  else
    new.updated_at := clock_timestamp();
    if new.series_id <> old.series_id
       or new.provider_account_id <> old.provider_account_id
       or new.provider_identity_version <> old.provider_identity_version
       or new.purpose <> old.purpose
       or new.source_id <> old.source_id
       or new.economic_payment_intent_id <> old.economic_payment_intent_id
       or new.economic_payment_session_id is distinct from old.economic_payment_session_id
       or new.operation_kind <> old.operation_kind
       or new.created_at <> old.created_at
       or new.head_version <> old.head_version + 1 then
      raise exception 'provider operation source head CAS conflict' using errcode = '40001';
    end if;
  end if;
  select * into current_intent from finance_provider_operation_intents where id = new.current_operation_intent_id;
  if current_intent.source_chain_version <> new.head_version
     or current_intent.economic_payment_intent_id <> new.economic_payment_intent_id
     or current_intent.economic_payment_session_id is distinct from new.economic_payment_session_id then
    raise exception 'provider operation source head does not resolve exactly' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and current_intent.predecessor_intent_id is distinct from old.current_operation_intent_id then
    raise exception 'provider operation source head may only advance to its direct successor' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_provider_operation_source_head
before insert or update on finance_provider_operation_source_heads
for each row execute function finance_validate_provider_operation_source_head();

create or replace function finance_validate_provider_operation_artifact()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  operation finance_provider_operation_intents%rowtype;
  artifact finance_artifacts%rowtype;
begin
  select * into operation from finance_provider_operation_intents where id = new.provider_operation_intent_id;
  select * into artifact from finance_artifacts where id = new.artifact_id;
  if artifact.artifact_class <> 'provider_request'
     or artifact.binding_kind <> 'provider'
     or artifact.series_id <> operation.series_id
     or artifact.provider_account_id <> operation.provider_account_id
     or artifact.provider_identity_version <> operation.provider_identity_version
     or artifact.sha256_digest <> new.artifact_digest
     or new.canonical_request_digest <> operation.canonical_request_digest
     or new.artifact_digest <> new.canonical_request_digest
     or new.registered_at < operation.created_at then
    raise exception 'provider dispatch artifact is not the exact canonical request' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_provider_operation_artifact
after insert on finance_provider_dispatch_artifacts
deferrable initially deferred
for each row execute function finance_validate_provider_operation_artifact();

create or replace function finance_validate_provider_operation_intent_creation_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  operation finance_provider_operation_intents%rowtype;
begin
  select * into strict operation from finance_provider_operation_intents
    where id = new.provider_operation_intent_id;
  if operation.version <> 0
     or operation.status <> 'pending_dispatch'
     or operation.correlated_economic_payment_version <> new.correlated_economic_payment_version
     or operation.economic_payment_session_id is distinct from new.economic_payment_session_id then
    raise exception 'provider operation creation receipt is cross-wired' using errcode = '23514';
  end if;
  if not exists (
    select 1 from finance_provider_operation_source_heads head
    where head.series_id = new.series_id
      and head.provider_account_id = new.provider_account_id
      and head.provider_identity_version = new.provider_identity_version
      and head.purpose = new.purpose
      and head.source_id = new.source_id
      and head.operation_kind = new.operation_kind
      and head.economic_payment_intent_id = new.economic_payment_intent_id
      and head.economic_payment_session_id is not distinct from new.economic_payment_session_id
      and head.current_operation_intent_id = new.provider_operation_intent_id
      and head.head_version = new.source_chain_version
  ) then
    raise exception 'provider operation creation receipt does not bind the committed source head' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_provider_intent_creation_receipt
after insert on finance_provider_operation_intent_creation_receipts
deferrable initially deferred
for each row execute function finance_validate_provider_operation_intent_creation_receipt();

create or replace function finance_validate_provider_operation_result()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  operation finance_provider_operation_intents%rowtype;
  economic_intent finance_economic_payment_intents%rowtype;
  artifact finance_artifacts%rowtype;
begin
  select * into operation from finance_provider_operation_intents where id = new.provider_operation_intent_id;
  select * into economic_intent from finance_economic_payment_intents
    where id = operation.economic_payment_intent_id;
  select * into artifact from finance_artifacts where id = new.evidence_artifact_id;
  if operation.version <> new.provider_operation_intent_version
     or (new.outcome = 'ambiguous' and operation.status <> 'provider_unknown')
     or (new.outcome in ('succeeded', 'failed') and operation.status <> new.outcome) then
    raise exception 'provider result must match the committed operation head' using errcode = '23514';
  end if;
  if artifact.artifact_class not in ('provider_response', 'provider_canonical_read')
     or artifact.binding_kind <> 'provider'
     or artifact.series_id <> new.series_id
     or artifact.provider_account_id <> new.provider_account_id
     or artifact.provider_identity_version <> new.provider_identity_version
     or artifact.sha256_digest <> new.evidence_artifact_digest then
    raise exception 'provider result artifact binding mismatch' using errcode = '23514';
  end if;
  if new.outcome = 'succeeded'
     and operation.operation_kind in ('card_setup', 'card_setup_execute', 'card_setup_3ds_method_complete', 'saved_card_charge', 'saved_card_charge_3ds_method_complete')
     and (
       new.provider_payment_id is null
       or new.amount_minor is distinct from economic_intent.amount_minor
       or new.currency is distinct from economic_intent.currency
     or (operation.operation_kind in ('card_setup', 'card_setup_execute', 'card_setup_3ds_method_complete') and economic_intent.amount_minor <> 0)
     or (operation.operation_kind not in ('card_setup', 'card_setup_execute', 'card_setup_3ds_method_complete') and economic_intent.amount_minor <= 0)
     ) then
    raise exception 'successful capture-capable provider result must match exact economic money'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from finance_provider_operation_result_commit_receipts receipt
    where receipt.provider_operation_result_id = new.id
      and receipt.provider_operation_intent_id = new.provider_operation_intent_id
      and receipt.provider_operation_intent_version = new.provider_operation_intent_version
      and receipt.correlated_economic_payment_version = new.correlated_economic_payment_version
      and receipt.series_id = new.series_id
      and receipt.provider_account_id = new.provider_account_id
      and receipt.provider_identity_version = new.provider_identity_version
      and receipt.outcome = new.outcome
      and receipt.provider_operation_id = new.provider_operation_id
      and receipt.provider_payment_id is not distinct from new.provider_payment_id
      and receipt.amount_minor is not distinct from new.amount_minor
      and receipt.currency is not distinct from new.currency
      and receipt.canonical_request_digest = new.canonical_request_digest
      and receipt.idempotency_key = new.idempotency_key
      and receipt.evidence_artifact_id = new.evidence_artifact_id
      and receipt.evidence_artifact_digest = new.evidence_artifact_digest
      and receipt.observed_at = new.observed_at
      and receipt.result_committed_at = new.committed_at
  ) then
    raise exception 'provider result requires its DB-issued commit receipt' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_provider_operation_result
after insert on finance_provider_operation_results
deferrable initially deferred
for each row execute function finance_validate_provider_operation_result();

create or replace function finance_validate_provider_operation_result_commit_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  result_row finance_provider_operation_results%rowtype;
  operation finance_provider_operation_intents%rowtype;
begin
  select * into strict result_row from finance_provider_operation_results
    where id = new.provider_operation_result_id;
  select * into strict operation from finance_provider_operation_intents
    where id = new.provider_operation_intent_id;
  if result_row.provider_payment_id is distinct from new.provider_payment_id
     or result_row.amount_minor is distinct from new.amount_minor
     or result_row.currency is distinct from new.currency
     or result_row.correlated_economic_payment_version <> new.correlated_economic_payment_version
     or operation.economic_payment_intent_id <> new.economic_payment_intent_id
     or operation.economic_payment_session_id is distinct from new.economic_payment_session_id
     or operation.purpose <> new.purpose
     or operation.source_id <> new.source_id
     or operation.operation_kind <> new.operation_kind then
    raise exception 'provider operation result commit receipt is cross-wired' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_provider_result_commit_receipt
after insert on finance_provider_operation_result_commit_receipts
deferrable initially deferred
for each row execute function finance_validate_provider_operation_result_commit_receipt();

create or replace function finance_validate_provider_operation_transport_unknown_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  operation finance_provider_operation_intents%rowtype;
begin
  select * into strict operation from finance_provider_operation_intents
    where id = new.provider_operation_intent_id;
  if operation.status <> 'provider_unknown'
     or operation.version <> new.provider_operation_intent_version
     or operation.provider_unknown_observed_at <> new.observed_at
     or operation.economic_payment_intent_id <> new.economic_payment_intent_id
     or operation.correlated_economic_payment_version <> new.correlated_economic_payment_version
     or operation.economic_payment_session_id is distinct from new.economic_payment_session_id
     or operation.series_id <> new.series_id
     or operation.provider_account_id <> new.provider_account_id
     or operation.provider_identity_version <> new.provider_identity_version
     or operation.purpose <> new.purpose
     or operation.source_id <> new.source_id
     or operation.operation_kind <> new.operation_kind
     or operation.canonical_request_digest <> new.canonical_request_digest
     or operation.idempotency_key <> new.idempotency_key then
    raise exception 'transport-unknown receipt is cross-wired' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_validate_provider_operation_transport_unknown_receipt
after insert on finance_provider_operation_transport_unknown_receipts
deferrable initially deferred
for each row execute function finance_validate_provider_operation_transport_unknown_receipt();

create or replace function finance_require_provider_operation_observation_for_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  expected_outcome text;
begin
  if new.status = 'requires_customer_action' then
    if not exists (
      select 1
      from finance_saved_card_setup_customer_actions action
      where action.provider_operation_intent_id = new.id
        and action.provider_operation_intent_version = new.version
        and action.status = 'pending'
      union all
      select 1
      from finance_platform_tariff_invoice_customer_actions action
      where action.provider_operation_intent_id = new.id
        and action.provider_operation_intent_version = new.version
        and action.status = 'pending'
    ) then
      raise exception 'customer-action provider operation requires its durable action record' using errcode = '23514';
    end if;
    return null;
  end if;
  expected_outcome := case when new.status = 'provider_unknown' then 'ambiguous' else new.status end;
  if not exists (
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
    where result.provider_operation_intent_id = new.id
      and result.provider_operation_intent_version = new.version
      and result.outcome = expected_outcome
      and result.canonical_request_digest = new.canonical_request_digest
      and result.idempotency_key = new.idempotency_key
  ) then
    if new.status = 'provider_unknown' and exists (
      select 1
      from finance_provider_operation_transport_unknown_receipts receipt
      where receipt.provider_operation_intent_id = new.id
        and receipt.provider_operation_intent_version = new.version
        and receipt.economic_payment_intent_id = new.economic_payment_intent_id
        and receipt.correlated_economic_payment_version = new.correlated_economic_payment_version
        and receipt.economic_payment_session_id is not distinct from new.economic_payment_session_id
        and receipt.series_id = new.series_id
        and receipt.provider_account_id = new.provider_account_id
        and receipt.provider_identity_version = new.provider_identity_version
        and receipt.purpose = new.purpose
        and receipt.source_id = new.source_id
        and receipt.operation_kind = new.operation_kind
        and receipt.canonical_request_digest = new.canonical_request_digest
        and receipt.idempotency_key = new.idempotency_key
        and receipt.observed_at = new.provider_unknown_observed_at
    ) then
      return null;
    end if;
    raise exception 'provider operation head update requires verified provider evidence or transport-unknown receipt' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_provider_operation_observation_for_head
after update on finance_provider_operation_intents
deferrable initially deferred
for each row execute function finance_require_provider_operation_observation_for_head();
`;
