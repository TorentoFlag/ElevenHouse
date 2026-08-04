import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";
import { clientDataConsents } from "../clients/client-data-consents.schema";

export const aiUsageRecords = pgTable(
  "ai_usage_records",
  {
    id: uuid("id").primaryKey(),
    status: text("status").notNull(),
    feature: text("feature").notNull(),
    promptId: text("prompt_id").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    provider: text("provider").notNull(),
    ownerSafetyId: text("owner_safety_id").notNull(),
    processingAuthorityVersion: text("processing_authority_version"),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    sourceChecksum: text("source_checksum"),
    model: text("model"),
    finishReason: text("finish_reason"),
    safeErrorCode: text("safe_error_code"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    durationMs: integer("duration_ms"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    index("ai_usage_records_owner_started_index").on(table.ownerSafetyId, table.startedAt),
    index("ai_usage_records_status_started_index").on(table.status, table.startedAt),
    index("ai_usage_records_feature_started_index").on(table.feature, table.startedAt),
    check(
      "ai_usage_records_status_check",
      sql`${table.status} in ('started', 'succeeded', 'failed', 'indeterminate')`
    ),
    check(
      "ai_usage_records_safe_fields_check",
      sql`length(trim(${table.feature})) between 1 and 160
        and length(trim(${table.promptId})) between 1 and 160
        and ${table.promptVersion} >= 1
        and length(trim(${table.provider})) between 1 and 80
        and (${table.model} is null or length(trim(${table.model})) between 1 and 160)
        and (${table.finishReason} is null or length(trim(${table.finishReason})) between 1 and 120)
        and (${table.safeErrorCode} is null or ${table.safeErrorCode} in (
          'AI_PROVIDER_REFUSED',
          'AI_PROVIDER_BAD_REQUEST',
          'AI_PROVIDER_RESPONSE_INVALID',
          'AI_PROVIDER_INCOMPLETE_RESPONSE',
          'AI_PROVIDER_UNAVAILABLE',
          'AI_PROVIDER_AUTHENTICATION_FAILED',
          'AI_PROVIDER_BILLING_FAILED',
          'AI_PROVIDER_RATE_LIMITED',
          'AI_PROVIDER_SERVER_ERROR',
          'AI_PROVIDER_TIMEOUT',
          'AI_PROVIDER_UNKNOWN_FAILURE',
          'AI_USAGE_OUTCOME_INDETERMINATE'
        ))`
    ),
    check(
      "ai_usage_records_owner_safety_id_check",
      sql`${table.ownerSafetyId} ~ '^eh_[0-9a-f]{61}$'`
    ),
    check(
      "ai_usage_records_resource_evidence_check",
      sql`(${table.processingAuthorityVersion} is null or length(trim(${table.processingAuthorityVersion})) between 1 and 160)
        and (
          (
            ${table.resourceType} is null
            and ${table.resourceId} is null
            and ${table.sourceChecksum} is null
          ) or (
            ${table.processingAuthorityVersion} is not null
            and length(trim(${table.resourceType})) between 1 and 80
            and ${table.resourceId} is not null
            and ${table.sourceChecksum} ~ '^sha256:[0-9a-f]{64}$'
          )
        )`
    ),
    check(
      "ai_usage_records_token_counts_check",
      sql`(
          ${table.promptTokens} is null
          and ${table.completionTokens} is null
          and ${table.totalTokens} is null
        ) or (
          ${table.promptTokens} >= 0
          and ${table.completionTokens} >= 0
          and ${table.totalTokens} = ${table.promptTokens} + ${table.completionTokens}
        )`
    ),
    check(
      "ai_usage_records_lifecycle_check",
      sql`(
          ${table.status} = 'started'
          and ${table.model} is null
          and ${table.finishReason} is null
          and ${table.safeErrorCode} is null
          and ${table.promptTokens} is null
          and ${table.completionTokens} is null
          and ${table.totalTokens} is null
          and ${table.durationMs} is null
          and ${table.completedAt} is null
        ) or (
          ${table.status} = 'succeeded'
          and ${table.model} is not null
          and ${table.finishReason} is not null
          and ${table.safeErrorCode} is null
          and ${table.durationMs} >= 0
          and ${table.completedAt} >= ${table.startedAt}
        ) or (
          ${table.status} = 'failed'
          and ${table.model} is null
          and ${table.finishReason} is null
          and ${table.safeErrorCode} is not null
          and ${table.promptTokens} is null
          and ${table.completionTokens} is null
          and ${table.totalTokens} is null
          and ${table.durationMs} >= 0
          and ${table.completedAt} >= ${table.startedAt}
        ) or (
          ${table.status} = 'indeterminate'
          and ${table.model} is null
          and ${table.finishReason} is null
          and ${table.safeErrorCode} = 'AI_USAGE_OUTCOME_INDETERMINATE'
          and ${table.promptTokens} is null
          and ${table.completionTokens} is null
          and ${table.totalTokens} is null
          and ${table.durationMs} >= 0
          and ${table.completedAt} >= ${table.startedAt}
        )`
    )
  ]
);

export const aiUsageConsentRecords = pgTable(
  "ai_usage_consent_records",
  {
    usageRecordId: uuid("usage_record_id")
      .notNull()
      .references(() => aiUsageRecords.id, { onDelete: "cascade" }),
    consentRecordId: uuid("consent_record_id")
      .notNull()
      .references(() => clientDataConsents.id, { onDelete: "restrict" })
  },
  (table) => [
    primaryKey({
      name: "ai_usage_consent_records_pk",
      columns: [table.usageRecordId, table.consentRecordId]
    }),
    index("ai_usage_consent_records_consent_index").on(table.consentRecordId)
  ]
);
