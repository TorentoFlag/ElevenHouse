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

import { financeProviderAccounts } from "./provider-accounts.schema";
import {
  financeArtifactAccessActionValues,
  financeArtifactAccessOutcomeValues,
  financeArtifactAccessPurposeValues,
  financeArtifactBindingKindValues,
  financeArtifactClassValues,
  financeArtifactLegalHoldActionValues,
  financeArtifactPurgeAttemptOutcomeValues,
  financeArtifactServiceIdentityValues,
  financeCurrencyValues,
  financeNumeric38String,
  financeRevisionString,
  formatFinanceSqlValues
} from "./finance-values";

export const financeArtifactRetentionPolicies = pgTable(
  "finance_artifact_retention_policies",
  {
    policyId: varchar("policy_id", { length: 160 }).notNull(),
    policyVersion: financeRevisionString("policy_version").notNull(),
    artifactClass: text("artifact_class").notNull(),
    retainForSeconds: financeNumeric38String("retain_for_seconds").notNull(),
    authorityRef: varchar("authority_ref", { length: 320 }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.policyId, table.policyVersion],
      name: "finance_artifact_retention_policies_pk"
    }),
    check(
      "finance_artifact_retention_policies_class_check",
      sql`${table.artifactClass} in ${sql.raw(formatFinanceSqlValues(financeArtifactClassValues))}`
    ),
    check("finance_artifact_retention_policies_version_check", sql`${table.policyVersion} >= 1`),
    check("finance_artifact_retention_policies_duration_check", sql`${table.retainForSeconds} > 0`),
    index("finance_artifact_retention_policies_class_effective_idx").on(
      table.artifactClass,
      table.effectiveAt,
      table.policyVersion
    )
  ]
);

export const financeArtifacts = pgTable(
  "finance_artifacts",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    artifactClass: text("artifact_class").notNull(),
    sha256Digest: varchar("sha256_digest", { length: 71 }).notNull(),
    byteLength: financeNumeric38String("byte_length").notNull(),
    contentType: varchar("content_type", { length: 160 }).notNull(),
    bindingKind: text("binding_kind").notNull(),
    seriesId: varchar("series_id", { length: 160 }),
    providerAccountId: varchar("provider_account_id", { length: 160 }),
    providerIdentityVersion: integer("provider_identity_version"),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }),
    currency: text("currency"),
    statementSourceFingerprint: varchar("statement_source_fingerprint", { length: 71 }),
    privateObjectKey: varchar("private_object_key", { length: 640 }).notNull(),
    privateObjectVersion: varchar("private_object_version", { length: 320 }).notNull(),
    envelopeKeyVersion: varchar("envelope_key_version", { length: 320 }).notNull(),
    retentionPolicyId: varchar("retention_policy_id", { length: 160 }).notNull(),
    retentionPolicyVersion: financeRevisionString("retention_policy_version").notNull(),
    retainedUntil: timestamp("retained_until", { withTimezone: true }).notNull().defaultNow(),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_artifacts_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.retentionPolicyId, table.retentionPolicyVersion],
      foreignColumns: [
        financeArtifactRetentionPolicies.policyId,
        financeArtifactRetentionPolicies.policyVersion
      ],
      name: "finance_artifacts_retention_policy_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_artifacts_private_object_version_unique").on(
      table.privateObjectKey,
      table.privateObjectVersion
    ),
    uniqueIndex("finance_artifacts_provider_scope_digest_unique")
      .on(
        table.artifactClass,
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.sha256Digest
      )
      .where(sql`${table.bindingKind} = 'provider'`),
    uniqueIndex("finance_artifacts_bank_scope_digest_unique")
      .on(table.artifactClass, table.bankCashPoolId, table.currency, table.sha256Digest)
      .where(sql`${table.bindingKind} = 'bank_cash_pool'`),
    check(
      "finance_artifacts_class_check",
      sql`${table.artifactClass} in ${sql.raw(formatFinanceSqlValues(financeArtifactClassValues))}`
    ),
    check("finance_artifacts_digest_check", sql`${table.sha256Digest} ~ '^sha256:[a-f0-9]{64}$'`),
    check("finance_artifacts_byte_length_check", sql`${table.byteLength} >= 0`),
    check(
      "finance_artifacts_content_type_check",
      sql`length(trim(${table.contentType})) between 3 and 160
        and ${table.contentType} = lower(${table.contentType})
        and ${table.contentType} ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'`
    ),
    check(
      "finance_artifacts_binding_kind_check",
      sql`${table.bindingKind} in ${sql.raw(
        formatFinanceSqlValues(financeArtifactBindingKindValues)
      )}`
    ),
    check(
      "finance_artifacts_exact_binding_check",
      sql`(
        ${table.bindingKind} = 'provider'
        and ${table.seriesId} is not null
        and ${table.providerAccountId} is not null
        and ${table.providerIdentityVersion} is not null
        and ${table.bankCashPoolId} is null
        and ${table.currency} is null
        and ${table.statementSourceFingerprint} is null
      ) or (
        ${table.bindingKind} = 'bank_cash_pool'
        and ${table.seriesId} is null
        and ${table.providerAccountId} is null
        and ${table.providerIdentityVersion} is null
        and ${table.bankCashPoolId} is not null
        and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}
        and ${table.statementSourceFingerprint} ~ '^sha256:[a-f0-9]{64}$'
      )`
    ),
    check(
      "finance_artifacts_private_locator_check",
      sql`length(trim(${table.privateObjectKey})) between 1 and 640
        and length(trim(${table.privateObjectVersion})) between 1 and 320
        and length(trim(${table.envelopeKeyVersion})) between 1 and 320`
    ),
    check(
      "finance_artifacts_retention_window_check",
      sql`${table.retentionPolicyVersion} >= 1 and ${table.retainedUntil} > ${table.registeredAt}`
    ),
    index("finance_artifacts_provider_digest_idx").on(
      table.seriesId,
      table.providerAccountId,
      table.providerIdentityVersion,
      table.sha256Digest
    ),
    index("finance_artifacts_provider_history_idx")
      .on(
        table.seriesId,
        table.providerAccountId,
        table.providerIdentityVersion,
        table.artifactClass,
        table.registeredAt,
        table.id
      )
      .where(sql`${table.bindingKind} = 'provider'`),
    index("finance_artifacts_bank_digest_idx").on(
      table.bankCashPoolId,
      table.currency,
      table.sha256Digest
    ),
    index("finance_artifacts_bank_history_idx")
      .on(table.bankCashPoolId, table.currency, table.artifactClass, table.registeredAt, table.id)
      .where(sql`${table.bindingKind} = 'bank_cash_pool'`),
    index("finance_artifacts_retention_due_idx").on(
      table.retainedUntil,
      table.artifactClass,
      table.id
    )
  ]
);

export const financeArtifactAccessEvents = pgTable(
  "finance_artifact_access_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactId: varchar("artifact_id", { length: 160 }),
    requestedArtifactIdHash: varchar("requested_artifact_id_hash", { length: 71 }).notNull(),
    serviceIdentity: text("service_identity").notNull(),
    purpose: text("purpose").notNull(),
    action: text("action").notNull(),
    outcome: text("outcome").notNull(),
    reasonCode: varchar("reason_code", { length: 160 }).notNull(),
    requestId: varchar("request_id", { length: 160 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.artifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_artifact_access_events_artifact_fk"
    }).onDelete("restrict"),
    unique("finance_artifact_access_events_exact_action_unique").on(
      table.id,
      table.artifactId,
      table.serviceIdentity,
      table.purpose,
      table.action,
      table.outcome
    ),
    check(
      "finance_artifact_access_events_requested_hash_check",
      sql`${table.requestedArtifactIdHash} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "finance_artifact_access_events_service_check",
      sql`${table.serviceIdentity} in ${sql.raw(
        formatFinanceSqlValues(financeArtifactServiceIdentityValues)
      )}`
    ),
    check(
      "finance_artifact_access_events_purpose_check",
      sql`${table.purpose} in ${sql.raw(
        formatFinanceSqlValues(financeArtifactAccessPurposeValues)
      )}`
    ),
    check(
      "finance_artifact_access_events_action_check",
      sql`${table.action} in ${sql.raw(formatFinanceSqlValues(financeArtifactAccessActionValues))}`
    ),
    check(
      "finance_artifact_access_events_outcome_check",
      sql`${table.outcome} in ${sql.raw(
        formatFinanceSqlValues(financeArtifactAccessOutcomeValues)
      )}`
    ),
    index("finance_artifact_access_events_artifact_occurred_idx").on(
      table.artifactId,
      table.occurredAt,
      table.id
    ),
    index("finance_artifact_access_events_request_idx").on(table.requestId, table.occurredAt),
    index("finance_artifact_access_events_service_purpose_time_idx").on(
      table.serviceIdentity,
      table.purpose,
      table.occurredAt,
      table.id
    )
  ]
);

export const financeArtifactPurgeRequests = pgTable(
  "finance_artifact_purge_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactId: varchar("artifact_id", { length: 160 }).notNull(),
    deletionAuditEventId: uuid("deletion_audit_event_id").notNull(),
    deletionAuditServiceIdentity: text("deletion_audit_service_identity").notNull(),
    deletionAuditPurpose: text("deletion_audit_purpose").notNull(),
    deletionAuditAction: text("deletion_audit_action").notNull(),
    deletionAuditOutcome: text("deletion_audit_outcome").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.artifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_artifact_purge_requests_artifact_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.deletionAuditEventId,
        table.artifactId,
        table.deletionAuditServiceIdentity,
        table.deletionAuditPurpose,
        table.deletionAuditAction,
        table.deletionAuditOutcome
      ],
      foreignColumns: [
        financeArtifactAccessEvents.id,
        financeArtifactAccessEvents.artifactId,
        financeArtifactAccessEvents.serviceIdentity,
        financeArtifactAccessEvents.purpose,
        financeArtifactAccessEvents.action,
        financeArtifactAccessEvents.outcome
      ],
      name: "finance_artifact_purge_requests_exact_deletion_audit_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_artifact_purge_requests_artifact_unique").on(table.artifactId),
    uniqueIndex("finance_artifact_purge_requests_exact_request_unique").on(
      table.id,
      table.artifactId,
      table.deletionAuditEventId,
      table.deletionAuditServiceIdentity,
      table.deletionAuditPurpose,
      table.deletionAuditAction,
      table.deletionAuditOutcome
    ),
    check(
      "finance_artifact_purge_requests_deletion_audit_check",
      sql`${table.deletionAuditServiceIdentity} = 'finance_retention'
        and ${table.deletionAuditPurpose} = 'retention_deletion'
        and ${table.deletionAuditAction} = 'retention_delete'
        and ${table.deletionAuditOutcome} = 'allowed'`
    )
  ]
);

export const financeArtifactPurgeAttempts = pgTable(
  "finance_artifact_purge_attempts",
  {
    attemptId: varchar("attempt_id", { length: 160 }).primaryKey(),
    purgeRequestId: uuid("purge_request_id").notNull(),
    outcome: text("outcome").notNull(),
    reasonCode: varchar("reason_code", { length: 160 }),
    deletionVerificationDigest: varchar("deletion_verification_digest", { length: 71 }),
    deletedPrivateObjectVersion: varchar("deleted_private_object_version", { length: 320 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.purgeRequestId],
      foreignColumns: [financeArtifactPurgeRequests.id],
      name: "finance_artifact_purge_attempts_request_fk"
    }).onDelete("restrict"),
    uniqueIndex("finance_artifact_purge_attempts_request_attempt_unique").on(
      table.purgeRequestId,
      table.attemptId
    ),
    uniqueIndex("finance_artifact_purge_attempts_exact_outcome_unique").on(
      table.attemptId,
      table.purgeRequestId,
      table.outcome
    ),
    check(
      "finance_artifact_purge_attempts_outcome_check",
      sql`${table.outcome} in ${sql.raw(
        formatFinanceSqlValues(financeArtifactPurgeAttemptOutcomeValues)
      )}`
    ),
    check(
      "finance_artifact_purge_attempts_evidence_check",
      sql`(
        ${table.outcome} = 'failed'
        and ${table.reasonCode} is not null
        and ${table.deletionVerificationDigest} is null
        and ${table.deletedPrivateObjectVersion} is null
      ) or (
        ${table.outcome} = 'deletion_verified'
        and ${table.reasonCode} is null
        and ${table.deletionVerificationDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(trim(${table.deletedPrivateObjectVersion})) between 1 and 320
      )`
    ),
    index("finance_artifact_purge_attempts_request_time_idx").on(
      table.purgeRequestId,
      table.occurredAt,
      table.attemptId
    )
  ]
);

export const financeArtifactTombstones = pgTable(
  "finance_artifact_tombstones",
  {
    artifactId: varchar("artifact_id", { length: 160 }).primaryKey(),
    sha256Digest: varchar("sha256_digest", { length: 71 }).notNull(),
    byteLength: financeNumeric38String("byte_length").notNull(),
    bindingKind: text("binding_kind").notNull(),
    seriesId: varchar("series_id", { length: 160 }),
    providerAccountId: varchar("provider_account_id", { length: 160 }),
    providerIdentityVersion: integer("provider_identity_version"),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }),
    currency: text("currency"),
    statementSourceFingerprint: varchar("statement_source_fingerprint", { length: 71 }),
    retentionPolicyId: varchar("retention_policy_id", { length: 160 }).notNull(),
    retentionPolicyVersion: financeRevisionString("retention_policy_version").notNull(),
    purgeRequestId: uuid("purge_request_id").notNull(),
    verifiedPurgeAttemptId: varchar("verified_purge_attempt_id", { length: 160 }).notNull(),
    verifiedPurgeOutcome: text("verified_purge_outcome").notNull(),
    deletionVerificationDigest: varchar("deletion_verification_digest", { length: 71 }).notNull(),
    deletedPrivateObjectVersion: varchar("deleted_private_object_version", {
      length: 320
    }).notNull(),
    deletionAuditEventId: uuid("deletion_audit_event_id").notNull(),
    deletionAuditServiceIdentity: text("deletion_audit_service_identity").notNull(),
    deletionAuditPurpose: text("deletion_audit_purpose").notNull(),
    deletionAuditAction: text("deletion_audit_action").notNull(),
    deletionAuditOutcome: text("deletion_audit_outcome").notNull(),
    reasonCode: varchar("reason_code", { length: 160 }).notNull(),
    tombstonedAt: timestamp("tombstoned_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.artifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_artifact_tombstones_artifact_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_artifact_tombstones_provider_identity_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.retentionPolicyId, table.retentionPolicyVersion],
      foreignColumns: [
        financeArtifactRetentionPolicies.policyId,
        financeArtifactRetentionPolicies.policyVersion
      ],
      name: "finance_artifact_tombstones_retention_policy_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.deletionAuditEventId,
        table.artifactId,
        table.deletionAuditServiceIdentity,
        table.deletionAuditPurpose,
        table.deletionAuditAction,
        table.deletionAuditOutcome
      ],
      foreignColumns: [
        financeArtifactAccessEvents.id,
        financeArtifactAccessEvents.artifactId,
        financeArtifactAccessEvents.serviceIdentity,
        financeArtifactAccessEvents.purpose,
        financeArtifactAccessEvents.action,
        financeArtifactAccessEvents.outcome
      ],
      name: "finance_artifact_tombstones_exact_deletion_audit_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.purgeRequestId,
        table.artifactId,
        table.deletionAuditEventId,
        table.deletionAuditServiceIdentity,
        table.deletionAuditPurpose,
        table.deletionAuditAction,
        table.deletionAuditOutcome
      ],
      foreignColumns: [
        financeArtifactPurgeRequests.id,
        financeArtifactPurgeRequests.artifactId,
        financeArtifactPurgeRequests.deletionAuditEventId,
        financeArtifactPurgeRequests.deletionAuditServiceIdentity,
        financeArtifactPurgeRequests.deletionAuditPurpose,
        financeArtifactPurgeRequests.deletionAuditAction,
        financeArtifactPurgeRequests.deletionAuditOutcome
      ],
      name: "finance_artifact_tombstones_exact_purge_request_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.verifiedPurgeAttemptId, table.purgeRequestId, table.verifiedPurgeOutcome],
      foreignColumns: [
        financeArtifactPurgeAttempts.attemptId,
        financeArtifactPurgeAttempts.purgeRequestId,
        financeArtifactPurgeAttempts.outcome
      ],
      name: "finance_artifact_tombstones_verified_purge_attempt_fk"
    }).onDelete("restrict"),
    check(
      "finance_artifact_tombstones_digest_check",
      sql`${table.sha256Digest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check("finance_artifact_tombstones_byte_length_check", sql`${table.byteLength} >= 0`),
    check(
      "finance_artifact_tombstones_binding_kind_check",
      sql`${table.bindingKind} in ${sql.raw(
        formatFinanceSqlValues(financeArtifactBindingKindValues)
      )}`
    ),
    check(
      "finance_artifact_tombstones_exact_binding_check",
      sql`(
        ${table.bindingKind} = 'provider'
        and ${table.seriesId} is not null
        and ${table.providerAccountId} is not null
        and ${table.providerIdentityVersion} is not null
        and ${table.bankCashPoolId} is null
        and ${table.currency} is null
        and ${table.statementSourceFingerprint} is null
      ) or (
        ${table.bindingKind} = 'bank_cash_pool'
        and ${table.seriesId} is null
        and ${table.providerAccountId} is null
        and ${table.providerIdentityVersion} is null
        and ${table.bankCashPoolId} is not null
        and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}
        and ${table.statementSourceFingerprint} ~ '^sha256:[a-f0-9]{64}$'
      )`
    ),
    check(
      "finance_artifact_tombstones_deletion_audit_check",
      sql`${table.deletionAuditServiceIdentity} = 'finance_retention'
        and ${table.deletionAuditPurpose} = 'retention_deletion'
        and ${table.deletionAuditAction} = 'retention_delete'
        and ${table.deletionAuditOutcome} = 'allowed'`
    ),
    check(
      "finance_artifact_tombstones_verified_deletion_check",
      sql`${table.verifiedPurgeOutcome} = 'deletion_verified'
        and ${table.deletionVerificationDigest} ~ '^sha256:[a-f0-9]{64}$'
        and length(trim(${table.deletedPrivateObjectVersion})) between 1 and 320`
    ),
    check(
      "finance_artifact_tombstones_retention_version_check",
      sql`${table.retentionPolicyVersion} >= 1`
    ),
    index("finance_artifact_tombstones_time_idx").on(table.tombstonedAt, table.artifactId)
  ]
);

export const financeArtifactLegalHolds = pgTable(
  "finance_artifact_legal_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactId: varchar("artifact_id", { length: 160 }).notNull(),
    holdId: varchar("hold_id", { length: 160 }).notNull(),
    action: text("action").notNull(),
    appliedEventId: uuid("applied_event_id"),
    appliedEventAction: text("applied_event_action"),
    authorityRef: varchar("authority_ref", { length: 320 }).notNull(),
    reasonCode: varchar("reason_code", { length: 160 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.artifactId],
      foreignColumns: [financeArtifacts.id],
      name: "finance_artifact_legal_holds_artifact_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.appliedEventId, table.holdId, table.artifactId, table.appliedEventAction],
      foreignColumns: [table.id, table.holdId, table.artifactId, table.action],
      name: "finance_artifact_legal_holds_applied_event_fk"
    }).onDelete("restrict"),
    unique("finance_artifact_legal_holds_exact_event_unique").on(
      table.id,
      table.holdId,
      table.artifactId,
      table.action
    ),
    uniqueIndex("finance_artifact_legal_holds_action_unique").on(table.holdId, table.action),
    check(
      "finance_artifact_legal_holds_action_check",
      sql`${table.action} in ${sql.raw(
        formatFinanceSqlValues(financeArtifactLegalHoldActionValues)
      )}`
    ),
    check(
      "finance_artifact_legal_holds_transition_check",
      sql`(
        ${table.action} = 'applied'
        and ${table.appliedEventId} is null
        and ${table.appliedEventAction} is null
      ) or (
        ${table.action} = 'released'
        and ${table.appliedEventId} is not null
        and ${table.appliedEventAction} = 'applied'
      )`
    ),
    index("finance_artifact_legal_holds_artifact_time_idx").on(
      table.artifactId,
      table.occurredAt,
      table.id
    )
  ]
);

export const financeArtifactSecurityIncidents = pgTable(
  "finance_artifact_security_incidents",
  {
    incidentRef: varchar("incident_ref", { length: 160 }).primaryKey(),
    ruleCode: varchar("rule_code", { length: 160 }).notNull(),
    bindingKind: text("binding_kind").notNull(),
    seriesId: varchar("series_id", { length: 160 }),
    providerAccountId: varchar("provider_account_id", { length: 160 }),
    providerIdentityVersion: integer("provider_identity_version"),
    bankCashPoolId: varchar("bank_cash_pool_id", { length: 160 }),
    currency: text("currency"),
    statementSourceFingerprint: varchar("statement_source_fingerprint", { length: 71 }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.seriesId, table.providerAccountId, table.providerIdentityVersion],
      foreignColumns: [
        financeProviderAccounts.seriesId,
        financeProviderAccounts.providerAccountId,
        financeProviderAccounts.identityVersion
      ],
      name: "finance_artifact_security_incidents_provider_identity_fk"
    }).onDelete("restrict"),
    check(
      "finance_artifact_security_incidents_binding_kind_check",
      sql`${table.bindingKind} in ${sql.raw(
        formatFinanceSqlValues(financeArtifactBindingKindValues)
      )}`
    ),
    check(
      "finance_artifact_security_incidents_exact_binding_check",
      sql`(
        ${table.bindingKind} = 'provider'
        and ${table.seriesId} is not null
        and ${table.providerAccountId} is not null
        and ${table.providerIdentityVersion} is not null
        and ${table.bankCashPoolId} is null
        and ${table.currency} is null
        and ${table.statementSourceFingerprint} is null
      ) or (
        ${table.bindingKind} = 'bank_cash_pool'
        and ${table.seriesId} is null
        and ${table.providerAccountId} is null
        and ${table.providerIdentityVersion} is null
        and ${table.bankCashPoolId} is not null
        and ${table.currency} in ${sql.raw(formatFinanceSqlValues(financeCurrencyValues))}
        and ${table.statementSourceFingerprint} ~ '^sha256:[a-f0-9]{64}$'
      )`
    )
  ]
);

/** Baseline owner executes this DDL after Drizzle creates the tables. */
export const financeArtifactImmutabilitySql = `
create or replace function finance_reject_artifact_evidence_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  raise exception 'finance artifact evidence rows are append-only' using errcode = '55000';
end;
$$;

create trigger finance_artifacts_immutable before update or delete on finance_artifacts
for each row execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifacts_no_truncate before truncate on finance_artifacts
for each statement execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_retention_policies_immutable before update or delete on finance_artifact_retention_policies
for each row execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_retention_policies_no_truncate before truncate on finance_artifact_retention_policies
for each statement execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_access_events_immutable before update or delete on finance_artifact_access_events
for each row execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_access_events_no_truncate before truncate on finance_artifact_access_events
for each statement execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_purge_requests_immutable before update or delete on finance_artifact_purge_requests
for each row execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_purge_requests_no_truncate before truncate on finance_artifact_purge_requests
for each statement execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_purge_attempts_immutable before update or delete on finance_artifact_purge_attempts
for each row execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_purge_attempts_no_truncate before truncate on finance_artifact_purge_attempts
for each statement execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_tombstones_immutable before update or delete on finance_artifact_tombstones
for each row execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_tombstones_no_truncate before truncate on finance_artifact_tombstones
for each statement execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_legal_holds_immutable before update or delete on finance_artifact_legal_holds
for each row execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_legal_holds_no_truncate before truncate on finance_artifact_legal_holds
for each statement execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_security_incidents_immutable before update or delete on finance_artifact_security_incidents
for each row execute function finance_reject_artifact_evidence_mutation();
create trigger finance_artifact_security_incidents_no_truncate before truncate on finance_artifact_security_incidents
for each statement execute function finance_reject_artifact_evidence_mutation();

create or replace function finance_stamp_artifact_access_event_time()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  new.occurred_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_stamp_artifact_access_event_time
before insert on finance_artifact_access_events
for each row execute function finance_stamp_artifact_access_event_time();

create or replace function finance_validate_artifact_legal_hold_event()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  applied finance_artifact_legal_holds%rowtype;
begin
  new.occurred_at := clock_timestamp();
  perform 1 from finance_artifacts
    where id = new.artifact_id
    for update;
  if not found then
    raise exception 'legal hold artifact does not exist' using errcode = '23503';
  end if;
  if new.action = 'applied' and exists (
    select 1 from finance_artifact_purge_requests
      where artifact_id = new.artifact_id
  ) then
    raise exception 'legal hold cannot start after durable purge authorization' using errcode = '23514';
  end if;
  if new.action = 'released' then
    select * into applied from finance_artifact_legal_holds
      where id = new.applied_event_id
        and artifact_id = new.artifact_id
        and hold_id = new.hold_id
        and action = 'applied';
    if not found or new.occurred_at < applied.occurred_at then
      raise exception 'legal-hold release must follow its exact application' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger finance_validate_artifact_legal_hold_event
before insert on finance_artifact_legal_holds
for each row execute function finance_validate_artifact_legal_hold_event();

create or replace function finance_stamp_artifact_security_incident_time()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  new.observed_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_stamp_artifact_security_incident_time
before insert on finance_artifact_security_incidents
for each row execute function finance_stamp_artifact_security_incident_time();

create or replace function finance_validate_artifact_purge_request_insert()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  source finance_artifacts%rowtype;
  deletion_audit_occurred_at timestamptz;
begin
  new.requested_at := clock_timestamp();
  select * into source from finance_artifacts where id = new.artifact_id for update;
  if not found then
    raise exception 'artifact purge source does not exist' using errcode = '23503';
  end if;
  if clock_timestamp() < source.retained_until then
    raise exception 'artifact retention period has not expired' using errcode = '23514';
  end if;
  if exists (
    select 1
      from finance_artifact_legal_holds applied
      where applied.artifact_id = new.artifact_id
        and applied.action = 'applied'
        and not exists (
          select 1
            from finance_artifact_legal_holds released
            where released.applied_event_id = applied.id
              and released.artifact_id = applied.artifact_id
              and released.action = 'released'
        )
  ) then
    raise exception 'artifact is under an active legal hold' using errcode = '23514';
  end if;
  if exists (select 1 from finance_artifact_tombstones where artifact_id = new.artifact_id) then
    raise exception 'artifact is already tombstoned' using errcode = '23514';
  end if;
  select occurred_at into deletion_audit_occurred_at
    from finance_artifact_access_events
    where id = new.deletion_audit_event_id
      and artifact_id = new.artifact_id
      and service_identity = 'finance_retention'
      and purpose = 'retention_deletion'
      and action = 'retention_delete'
      and outcome = 'allowed';
  if not found or deletion_audit_occurred_at < source.retained_until then
    raise exception 'artifact purge requires a timely allowed deletion audit' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_artifact_purge_request_insert
before insert on finance_artifact_purge_requests
for each row execute function finance_validate_artifact_purge_request_insert();

create or replace function finance_stamp_artifact_purge_attempt_time()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  new.occurred_at := clock_timestamp();
  return new;
end;
$$;

create trigger finance_stamp_artifact_purge_attempt_time
before insert on finance_artifact_purge_attempts
for each row execute function finance_stamp_artifact_purge_attempt_time();

create or replace function finance_require_verified_purge_tombstone()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if new.outcome = 'deletion_verified' and not exists (
    select 1 from finance_artifact_tombstones tombstone
      where tombstone.verified_purge_attempt_id = new.attempt_id
        and tombstone.purge_request_id = new.purge_request_id
        and tombstone.verified_purge_outcome = new.outcome
  ) then
    raise exception 'verified purge attempt must atomically produce its exact tombstone' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger finance_require_verified_purge_tombstone
after insert on finance_artifact_purge_attempts
deferrable initially deferred
for each row execute function finance_require_verified_purge_tombstone();

create or replace function finance_validate_artifact_retention_insert()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  policy finance_artifact_retention_policies%rowtype;
  expected_retained_until timestamptz;
begin
  new.registered_at := clock_timestamp();
  select * into policy from finance_artifact_retention_policies
    where policy_id = new.retention_policy_id
      and policy_version = new.retention_policy_version;
  if not found then
    raise exception 'artifact retention policy does not exist' using errcode = '23503';
  end if;
  if policy.artifact_class <> new.artifact_class or policy.effective_at > new.registered_at then
    raise exception 'artifact retention policy is not effective for this artifact' using errcode = '23514';
  end if;
  expected_retained_until := new.registered_at + (policy.retain_for_seconds::text || ' seconds')::interval;
  new.retained_until := expected_retained_until;
  return new;
end;
$$;

create trigger finance_validate_artifact_retention_insert
before insert on finance_artifacts
for each row execute function finance_validate_artifact_retention_insert();

create or replace function finance_validate_artifact_tombstone_insert()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
declare
  source finance_artifacts%rowtype;
  deletion_audit_occurred_at timestamptz;
begin
  new.tombstoned_at := clock_timestamp();
  select * into source from finance_artifacts where id = new.artifact_id;
  if not found then
    raise exception 'artifact tombstone source does not exist' using errcode = '23503';
  end if;
  if new.sha256_digest is distinct from source.sha256_digest
     or new.byte_length is distinct from source.byte_length
     or new.binding_kind is distinct from source.binding_kind
     or new.series_id is distinct from source.series_id
     or new.provider_account_id is distinct from source.provider_account_id
     or new.provider_identity_version is distinct from source.provider_identity_version
     or new.bank_cash_pool_id is distinct from source.bank_cash_pool_id
     or new.currency is distinct from source.currency
     or new.statement_source_fingerprint is distinct from source.statement_source_fingerprint
     or new.deleted_private_object_version is distinct from source.private_object_version
     or new.retention_policy_id is distinct from source.retention_policy_id
     or new.retention_policy_version is distinct from source.retention_policy_version then
    raise exception 'artifact tombstone must exactly mirror its source' using errcode = '23514';
  end if;
  if clock_timestamp() < source.retained_until then
    raise exception 'artifact retention period has not expired' using errcode = '23514';
  end if;
  if not exists (
    select 1 from finance_artifact_purge_attempts verified
      where verified.attempt_id = new.verified_purge_attempt_id
        and verified.purge_request_id = new.purge_request_id
        and verified.outcome = 'deletion_verified'
        and verified.deletion_verification_digest = new.deletion_verification_digest
        and verified.deleted_private_object_version = new.deleted_private_object_version
  ) then
    raise exception 'artifact tombstone requires exact verified object deletion evidence' using errcode = '23514';
  end if;
  if exists (
    select 1
      from finance_artifact_legal_holds applied
      where applied.artifact_id = new.artifact_id
        and applied.action = 'applied'
        and not exists (
          select 1
            from finance_artifact_legal_holds released
            where released.applied_event_id = applied.id
              and released.artifact_id = applied.artifact_id
              and released.action = 'released'
        )
  ) then
    raise exception 'artifact is under an active legal hold' using errcode = '23514';
  end if;
  select occurred_at into deletion_audit_occurred_at
    from finance_artifact_access_events
    where id = new.deletion_audit_event_id
      and artifact_id = new.artifact_id
      and service_identity = 'finance_retention'
      and purpose = 'retention_deletion'
      and action = 'retention_delete'
      and outcome = 'allowed';
  if not found
     or deletion_audit_occurred_at < source.retained_until
     or new.tombstoned_at < deletion_audit_occurred_at then
    raise exception 'artifact tombstone requires a timely allowed deletion audit' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finance_validate_artifact_tombstone_insert
before insert on finance_artifact_tombstones
for each row execute function finance_validate_artifact_tombstone_insert();
`;

/** Added atomically by Task 8 once the normalized cash-pool directory table exists. */
export const financeArtifactDeferredBankCashPoolForeignKeys = [
  {
    sourceTable: "finance_artifacts",
    sourceColumns: ["bank_cash_pool_id"],
    targetTable: "finance_bank_cash_pools",
    targetColumns: ["id"]
  },
  {
    sourceTable: "finance_artifact_tombstones",
    sourceColumns: ["bank_cash_pool_id"],
    targetTable: "finance_bank_cash_pools",
    targetColumns: ["id"]
  },
  {
    sourceTable: "finance_artifact_security_incidents",
    sourceColumns: ["bank_cash_pool_id"],
    targetTable: "finance_bank_cash_pools",
    targetColumns: ["id"]
  }
] as const;
