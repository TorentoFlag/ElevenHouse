import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
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
import { mediaAssets } from "../media/media-assets.schema";
import { clientSubscriptions, clientSubscriptionTransitionReceipts } from "../client-subscriptions";
import { astroDiaryCycles, astroDiaryJournals } from "./core.schema";
import { astroDiaryDraftVersionFacts, astroDiaryTimelineItemRevisions } from "./timeline.schema";

const asyncWorkColumns = () => ({
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  claimFence: bigint("claim_fence", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  leaseOwner: varchar("lease_owner", { length: 200 }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  lastFailureCode: varchar("last_failure_code", { length: 160 }),
  quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
  quarantineReasonCode: varchar("quarantine_reason_code", { length: 160 })
});

function asyncWorkAuthorityCheck(
  name: string,
  state: AnyPgColumn,
  columns: Readonly<{
    attempts: AnyPgColumn;
    maxAttempts: AnyPgColumn;
    claimFence: AnyPgColumn;
    leaseOwner: AnyPgColumn;
    leaseExpiresAt: AnyPgColumn;
    nextAttemptAt: AnyPgColumn;
    lastFailureCode: AnyPgColumn;
    quarantinedAt: AnyPgColumn;
    quarantineReasonCode: AnyPgColumn;
  }>,
  processingState = "processing",
  quarantineState = "quarantined"
) {
  const processingStateLiteral = sql.raw(`'${processingState}'`);
  const quarantineStateLiteral = sql.raw(`'${quarantineState}'`);
  const ordinarySharedQuarantineState =
    quarantineState === "failed"
      ? sql`or (${state} = ${quarantineStateLiteral}
          and ${columns.leaseOwner} is null
          and ${columns.nextAttemptAt} is null
          and ${columns.quarantinedAt} is null
          and ${columns.quarantineReasonCode} is null)`
      : sql``;
  return check(
    `${name}_work_authority_check`,
    sql`${columns.attempts} between 0 and ${columns.maxAttempts}
      and ${columns.maxAttempts} between 1 and 20
      and ${columns.claimFence} >= ${columns.attempts}
      and ((${columns.leaseOwner} is null) = (${columns.leaseExpiresAt} is null))
      and (${columns.leaseOwner} is null or length(trim(${columns.leaseOwner})) between 1 and 200)
      and (${columns.lastFailureCode} is null
        or length(trim(${columns.lastFailureCode})) between 1 and 160)
      and (${columns.quarantineReasonCode} is null
        or length(trim(${columns.quarantineReasonCode})) between 1 and 160)
      and (
        (${state} = ${processingStateLiteral}
          and ${columns.attempts} >= 1
          and ${columns.leaseOwner} is not null
          and ${columns.nextAttemptAt} is null
          and ${columns.quarantinedAt} is null
          and ${columns.quarantineReasonCode} is null)
        or (${state} = ${quarantineStateLiteral}
          and ${columns.leaseOwner} is null
          and ${columns.nextAttemptAt} is null
          and ${columns.lastFailureCode} is not null
          and ${columns.quarantinedAt} is not null
          and ${columns.quarantineReasonCode} is not null)
        ${ordinarySharedQuarantineState}
        or (${state} not in (${processingStateLiteral}, ${quarantineStateLiteral})
          and ${columns.leaseOwner} is null
          and ${columns.quarantinedAt} is null
          and ${columns.quarantineReasonCode} is null)
      )`
  );
}

export const astroDiaryEvents = pgTable(
  "astro_diary_events",
  {
    eventId: uuid("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    eventDigest: varchar("event_digest", { length: 71 }).notNull(),
    journalId: uuid("journal_id").notNull(),
    journalEpochId: uuid("journal_epoch_id").notNull(),
    cycleId: uuid("cycle_id"),
    itemId: uuid("item_id"),
    contextId: uuid("context_id"),
    obligationId: uuid("obligation_id"),
    responseItemId: uuid("response_item_id"),
    commandId: uuid("command_id"),
    periodId: uuid("period_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.journalId],
      foreignColumns: [astroDiaryJournals.id],
      name: "astro_diary_events_journal_fk"
    }).onDelete("restrict"),
    check("astro_diary_events_schema_version_check", sql`${table.schemaVersion} = 1`),
    check("astro_diary_events_digest_check", sql`${table.eventDigest} ~ '^sha256:[a-f0-9]{64}$'`),
    check(
      "astro_diary_events_ids_only_shape_check",
      sql`(
        ${table.eventType} = 'astro_diary.cycle_opened.v1'
        and ${table.cycleId} is not null and ${table.periodId} is not null
        and ${table.itemId} is null and ${table.contextId} is null
        and ${table.obligationId} is null
        and ${table.responseItemId} is null and ${table.commandId} is null
      ) or (
        ${table.eventType} in (
          'astro_diary.timeline_item_published.v1',
          'astro_diary.timeline_item_edited.v1',
          'astro_diary.timeline_item_hidden.v1',
          'astro_diary.timeline_item_erased.v1'
        )
        and ${table.cycleId} is not null and ${table.itemId} is not null
        and ${table.contextId} is null and ${table.obligationId} is null
        and ${table.responseItemId} is null
        and ${table.commandId} is null and ${table.periodId} is null
      ) or (
        ${table.eventType} = 'astro_diary.cycle_closed.v1'
        and ${table.cycleId} is not null and ${table.itemId} is null
        and ${table.contextId} is null and ${table.obligationId} is null
        and ${table.responseItemId} is null
        and ${table.commandId} is null and ${table.periodId} is null
      ) or (
        ${table.eventType} in (
          'astro_diary.response_obligation_created.v1',
          'astro_diary.response_obligation_overdue.v1'
        )
        and ${table.cycleId} is not null and ${table.obligationId} is not null
        and ${table.itemId} is null and ${table.contextId} is null
        and ${table.responseItemId} is null
        and ${table.commandId} is null and ${table.periodId} is null
      ) or (
        ${table.eventType} = 'astro_diary.response_obligation_satisfied.v1'
        and ${table.cycleId} is not null and ${table.obligationId} is not null
        and ${table.responseItemId} is not null and ${table.itemId} is null
        and ${table.contextId} is null and ${table.commandId} is null
        and ${table.periodId} is null
      ) or (
        ${table.eventType} in (
          'astro_diary.context_generation_requested.v1',
          'astro_diary.derivative_generation_requested.v1'
        )
        and ${table.cycleId} is not null and ${table.itemId} is not null
        and ${table.contextId} is null and ${table.obligationId} is null
        and ${table.responseItemId} is null
        and ${table.commandId} is null and ${table.periodId} is null
      ) or (
        ${table.eventType} in (
          'astro_diary.context_completed.v1', 'astro_diary.context_failed.v1'
        )
        and ${table.cycleId} is not null and ${table.itemId} is not null
        and ${table.contextId} is not null and ${table.obligationId} is null
        and ${table.responseItemId} is null and ${table.commandId} is null
        and ${table.periodId} is null
      ) or (
        ${table.eventType} in (
          'astro_diary.ai_generation_requested.v1', 'astro_diary.ai_updated.v1'
        )
        and ${table.cycleId} is not null and ${table.commandId} is not null
        and ${table.itemId} is null and ${table.contextId} is null
        and ${table.obligationId} is null
        and ${table.responseItemId} is null and ${table.periodId} is null
      ) or (
        ${table.eventType} in (
          'astro_diary.export_requested.v1', 'astro_diary.export_ready.v1',
          'astro_diary.export_failed.v1', 'astro_diary.export_invalidated.v1',
          'astro_diary.erasure_requested.v1', 'astro_diary.erasure_completed.v1'
        )
        and ${table.commandId} is not null and ${table.cycleId} is null
        and ${table.itemId} is null and ${table.contextId} is null
        and ${table.obligationId} is null
        and ${table.responseItemId} is null and ${table.periodId} is null
      ) or (
        ${table.eventType} = 'astro_diary.journal_activated.v1'
        and ${table.cycleId} is null and ${table.itemId} is null
        and ${table.contextId} is null and ${table.obligationId} is null
        and ${table.responseItemId} is null and ${table.commandId} is null
        and ${table.periodId} is null
      )`
    ),
    index("astro_diary_events_journal_occurred_idx").on(
      table.journalId,
      table.occurredAt,
      table.eventId
    )
  ]
);

/** Immutable proof that one canonical paid capture activated one journal epoch. */
export const astroDiarySubscriptionActivationReceipts = pgTable(
  "astro_diary_subscription_activation_receipts",
  {
    id: uuid("id").primaryKey(),
    journalId: uuid("journal_id").notNull(),
    relationshipId: uuid("relationship_id").notNull(),
    journalEpochId: uuid("journal_epoch_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    contractId: uuid("contract_id").notNull(),
    subscriptionVersion: integer("subscription_version").notNull(),
    sourceEventId: uuid("source_event_id").notNull(),
    sourceEventDigest: varchar("source_event_digest", { length: 71 }).notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    transitionId: uuid("transition_id").notNull(),
    activationEventId: uuid("activation_event_id").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("astro_diary_subscription_activation_journal_unique").on(table.journalId),
    unique("astro_diary_subscription_activation_epoch_unique").on(table.journalEpochId),
    unique("astro_diary_subscription_activation_subscription_unique").on(table.subscriptionId),
    unique("astro_diary_subscription_activation_source_event_unique").on(table.sourceEventId),
    unique("astro_diary_subscription_activation_evidence_unique").on(table.evidenceId),
    unique("astro_diary_subscription_activation_transition_unique").on(table.transitionId),
    unique("astro_diary_subscription_activation_event_unique").on(table.activationEventId),
    foreignKey({
      columns: [table.journalId, table.relationshipId, table.journalEpochId],
      foreignColumns: [
        astroDiaryJournals.id,
        astroDiaryJournals.relationshipId,
        astroDiaryJournals.journalEpochId
      ],
      name: "astro_diary_subscription_activation_journal_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.subscriptionId, table.contractId, table.relationshipId, table.journalEpochId],
      foreignColumns: [
        clientSubscriptions.id,
        clientSubscriptions.contractId,
        clientSubscriptions.relationshipId,
        clientSubscriptions.journalEpochId
      ],
      name: "astro_diary_subscription_activation_subscription_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.transitionId,
        table.subscriptionId,
        table.contractId,
        table.subscriptionVersion
      ],
      foreignColumns: [
        clientSubscriptionTransitionReceipts.transitionId,
        clientSubscriptionTransitionReceipts.subscriptionId,
        clientSubscriptionTransitionReceipts.contractId,
        clientSubscriptionTransitionReceipts.subscriptionVersion
      ],
      name: "astro_diary_subscription_activation_transition_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.activationEventId],
      foreignColumns: [astroDiaryEvents.eventId],
      name: "astro_diary_subscription_activation_event_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_subscription_activation_evidence_check",
      sql`${table.subscriptionVersion} >= 2
        and ${table.sourceEventDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.id} <> ${table.journalId}
        and ${table.id} <> ${table.sourceEventId}
        and ${table.id} <> ${table.evidenceId}
        and ${table.id} <> ${table.transitionId}
        and ${table.id} <> ${table.activationEventId}`
    )
  ]
);

export const astroDiaryRealtimeEvents = pgTable(
  "astro_diary_realtime_events",
  {
    eventId: bigint("event_id", { mode: "bigint" }).generatedAlwaysAsIdentity().primaryKey(),
    sourceEventId: uuid("source_event_id")
      .notNull()
      .references(() => astroDiaryEvents.eventId, { onDelete: "restrict" }),
    type: text("type").notNull(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    cycleId: uuid("cycle_id"),
    itemId: uuid("item_id"),
    obligationId: uuid("obligation_id"),
    contextId: uuid("context_id"),
    commandId: uuid("command_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("astro_diary_realtime_events_source_unique").on(table.sourceEventId),
    check("astro_diary_realtime_events_cursor_check", sql`${table.eventId} >= 1`),
    check(
      "astro_diary_realtime_events_ids_only_shape_check",
      sql`(
        ${table.type} in ('journal.updated', 'allowance.updated')
        and ${table.cycleId} is null and ${table.itemId} is null
        and ${table.obligationId} is null and ${table.contextId} is null
        and ${table.commandId} is null
      ) or (
        ${table.type} = 'cycle.updated' and ${table.cycleId} is not null
        and ${table.itemId} is null and ${table.obligationId} is null
        and ${table.contextId} is null and ${table.commandId} is null
      ) or (
        ${table.type} in ('timeline.item.published', 'timeline.item.updated', 'timeline.item.erased')
        and ${table.cycleId} is not null and ${table.itemId} is not null
        and ${table.obligationId} is null and ${table.contextId} is null
        and ${table.commandId} is null
      ) or (
        ${table.type} = 'obligation.updated' and ${table.cycleId} is not null
        and ${table.obligationId} is not null and ${table.itemId} is null
        and ${table.contextId} is null and ${table.commandId} is null
      ) or (
        ${table.type} = 'context.updated' and ${table.cycleId} is not null
        and ${table.itemId} is not null and ${table.contextId} is not null
        and ${table.obligationId} is null and ${table.commandId} is null
      ) or (
        ${table.type} = 'ai.updated' and ${table.cycleId} is not null
        and ${table.commandId} is not null and ${table.itemId} is null
        and ${table.obligationId} is null and ${table.contextId} is null
      ) or (
        ${table.type} in ('export.updated', 'erasure.updated')
        and ${table.commandId} is not null and ${table.cycleId} is null
        and ${table.itemId} is null and ${table.obligationId} is null
        and ${table.contextId} is null
      )`
    ),
    index("astro_diary_realtime_events_journal_cursor_idx").on(table.journalId, table.eventId)
  ]
);

export const astroDiaryEventDeliveries = pgTable(
  "astro_diary_event_deliveries",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => astroDiaryEvents.eventId, { onDelete: "restrict" }),
    consumer: varchar("consumer", { length: 80 }).notNull(),
    state: text("state").notNull(),
    ...asyncWorkColumns(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("astro_diary_event_deliveries_event_consumer_unique").on(table.eventId, table.consumer),
    check(
      "astro_diary_event_deliveries_consumer_check",
      sql`${table.consumer} in (
        'realtime_projection', 'notification', 'context_worker', 'derivative_worker',
        'ai_worker', 'export_worker', 'erasure_worker'
      )`
    ),
    check(
      "astro_diary_event_deliveries_state_check",
      sql`(${table.state} in ('pending', 'publishing') and ${table.publishedAt} is null)
        or (${table.state} = 'published' and ${table.publishedAt} is not null)
        or (${table.state} = 'quarantined' and ${table.publishedAt} is null)`
    ),
    asyncWorkAuthorityCheck("astro_diary_event_deliveries", table.state, table, "publishing"),
    index("astro_diary_event_deliveries_pending_idx").on(table.state, table.availableAt, table.id)
  ]
);

export const astroDiaryAiCommands = pgTable(
  "astro_diary_ai_commands",
  {
    id: uuid("id").primaryKey(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    cycleId: uuid("cycle_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    operation: text("operation").notNull(),
    state: text("state").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    sourceItemId: uuid("source_item_id").notNull(),
    sourceItemRevision: integer("source_item_revision").notNull(),
    sourceDigest: varchar("source_digest", { length: 71 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 200 }).notNull(),
    requestedModel: varchar("requested_model", { length: 120 }).notNull(),
    ...asyncWorkColumns(),
    failureCode: varchar("failure_code", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    unique("astro_diary_ai_commands_journal_key_unique").on(table.journalId, table.idempotencyKey),
    foreignKey({
      columns: [table.cycleId, table.journalId],
      foreignColumns: [astroDiaryCycles.id, astroDiaryCycles.journalId],
      name: "astro_diary_ai_commands_cycle_journal_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.sourceItemId, table.sourceItemRevision, table.journalId],
      foreignColumns: [
        astroDiaryTimelineItemRevisions.itemId,
        astroDiaryTimelineItemRevisions.revision,
        astroDiaryTimelineItemRevisions.journalId
      ],
      name: "astro_diary_ai_commands_source_revision_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_ai_commands_operation_check",
      sql`${table.operation} in ('question_draft', 'reply_draft')`
    ),
    check(
      "astro_diary_ai_commands_digest_check",
      sql`${table.sourceDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "astro_diary_ai_commands_state_check",
      sql`(
        ${table.state} = 'pending'
        and ${table.processingStartedAt} is null and ${table.completedAt} is null
        and ${table.failureCode} is null
      ) or (
        ${table.state} = 'processing'
        and ${table.processingStartedAt} is not null and ${table.completedAt} is null
        and ${table.failureCode} is null
      ) or (
        ${table.state} = 'succeeded'
        and ${table.processingStartedAt} is not null and ${table.completedAt} is not null
        and ${table.failureCode} is null
      ) or (
        ${table.state} in ('known_failed', 'outcome_unknown', 'source_stale', 'cancelled', 'quarantined')
        and ${table.completedAt} is not null
        and length(trim(${table.failureCode})) between 1 and 160
      )`
    ),
    asyncWorkAuthorityCheck("astro_diary_ai_commands", table.state, table),
    check(
      "astro_diary_ai_commands_time_order_check",
      sql`(${table.processingStartedAt} is null or ${table.processingStartedAt} >= ${table.createdAt})
        and (${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt})`
    ),
    index("astro_diary_ai_commands_pending_idx").on(table.state, table.createdAt, table.id)
  ]
);

export const astroDiaryAiAttempts = pgTable(
  "astro_diary_ai_attempts",
  {
    id: uuid("id").primaryKey(),
    commandId: uuid("command_id")
      .notNull()
      .references(() => astroDiaryAiCommands.id, { onDelete: "restrict" }),
    stage: text("stage").notNull(),
    state: text("state").notNull(),
    requestedModel: varchar("requested_model", { length: 120 }).notNull(),
    observedModel: varchar("observed_model", { length: 120 }),
    inputDigest: varchar("input_digest", { length: 71 }).notNull(),
    outputDigest: varchar("output_digest", { length: 71 }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    failureCode: varchar("failure_code", { length: 160 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    unique("astro_diary_ai_attempts_command_stage_unique").on(table.commandId, table.stage),
    check(
      "astro_diary_ai_attempts_stage_check",
      sql`${table.stage} in ('generation', 'review_refine')`
    ),
    check(
      "astro_diary_ai_attempts_digest_check",
      sql`${table.inputDigest} ~ '^sha256:[a-f0-9]{64}$'
        and (${table.outputDigest} is null or ${table.outputDigest} ~ '^sha256:[a-f0-9]{64}$')`
    ),
    check(
      "astro_diary_ai_attempts_usage_check",
      sql`(${table.inputTokens} is null or ${table.inputTokens} >= 0)
        and (${table.outputTokens} is null or ${table.outputTokens} >= 0)
        and (${table.latencyMs} is null or ${table.latencyMs} >= 0)`
    ),
    check(
      "astro_diary_ai_attempts_state_check",
      sql`(
        ${table.state} = 'processing' and ${table.completedAt} is null
        and ${table.outputDigest} is null and ${table.failureCode} is null
      ) or (
        ${table.state} = 'succeeded' and ${table.completedAt} is not null
        and ${table.observedModel} is not null and ${table.outputDigest} is not null
        and ${table.failureCode} is null
      ) or (
        ${table.state} in ('known_failed', 'outcome_unknown', 'source_stale', 'cancelled')
        and ${table.completedAt} is not null
        and length(trim(${table.failureCode})) between 1 and 160
      )`
    )
  ]
);

export const astroDiaryAiDrafts = pgTable(
  "astro_diary_ai_drafts",
  {
    id: uuid("id").primaryKey(),
    commandId: uuid("command_id")
      .notNull()
      .references(() => astroDiaryAiCommands.id, { onDelete: "restrict" }),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    cycleId: uuid("cycle_id").notNull(),
    sourceDigest: varchar("source_digest", { length: 71 }).notNull(),
    body: text("body").notNull(),
    bodyDigest: varchar("body_digest", { length: 71 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("astro_diary_ai_drafts_command_unique").on(table.commandId),
    foreignKey({
      columns: [table.cycleId, table.journalId],
      foreignColumns: [astroDiaryCycles.id, astroDiaryCycles.journalId],
      name: "astro_diary_ai_drafts_cycle_journal_fk"
    }).onDelete("restrict"),
    check("astro_diary_ai_drafts_body_check", sql`length(trim(${table.body})) between 1 and 20000`),
    check(
      "astro_diary_ai_drafts_digest_check",
      sql`${table.sourceDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.bodyDigest} ~ '^sha256:[a-f0-9]{64}$'`
    )
  ]
);

export const astroDiaryExportCommands = pgTable(
  "astro_diary_export_commands",
  {
    id: uuid("id").primaryKey(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    status: text("status").notNull(),
    sourceJournalVersion: integer("source_journal_version").notNull(),
    sourceDigest: varchar("source_digest", { length: 71 }).notNull(),
    locale: text("locale").notNull(),
    artifactMediaId: uuid("artifact_media_id"),
    artifactOwnerUserId: uuid("artifact_owner_user_id"),
    ...asyncWorkColumns(),
    failureCode: varchar("failure_code", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("astro_diary_export_commands_journal_key_unique").on(
      table.journalId,
      table.idempotencyKey
    ),
    foreignKey({
      columns: [table.artifactMediaId, table.artifactOwnerUserId],
      foreignColumns: [mediaAssets.id, mediaAssets.ownerUserId],
      name: "astro_diary_export_commands_artifact_media_owner_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_export_commands_source_version_check",
      sql`${table.sourceJournalVersion} >= 1`
    ),
    check("astro_diary_export_commands_locale_check", sql`${table.locale} in ('ru', 'en')`),
    check(
      "astro_diary_export_commands_digest_check",
      sql`${table.sourceDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "astro_diary_export_commands_state_check",
      sql`(
        ${table.status} in ('queued', 'processing')
        and ${table.artifactMediaId} is null and ${table.artifactOwnerUserId} is null
        and ${table.failureCode} is null
      ) or (
        ${table.status} = 'ready'
        and ${table.artifactMediaId} is not null
        and ${table.artifactOwnerUserId} = ${table.requestedByUserId}
        and ${table.failureCode} is null
      ) or (
        ${table.status} = 'failed'
        and ${table.artifactMediaId} is null and ${table.artifactOwnerUserId} is null
        and length(trim(${table.failureCode})) between 1 and 160
      ) or (
        ${table.status} = 'invalidated'
        and ${table.artifactMediaId} is null and ${table.artifactOwnerUserId} is null
        and ${table.failureCode} is null
      )`
    ),
    check(
      "astro_diary_export_commands_time_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`
    ),
    asyncWorkAuthorityCheck(
      "astro_diary_export_commands",
      table.status,
      table,
      "processing",
      "failed"
    )
  ]
);

export const astroDiaryDerivativeCommands = pgTable(
  "astro_diary_derivative_commands",
  {
    id: uuid("id").primaryKey(),
    journalId: uuid("journal_id").notNull(),
    itemId: uuid("item_id").notNull(),
    sourceRevision: integer("source_revision").notNull(),
    sourceDigest: varchar("source_digest", { length: 71 }).notNull(),
    operation: text("operation").notNull(),
    state: text("state").notNull(),
    ...asyncWorkColumns(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    unique("astro_diary_derivative_commands_source_operation_unique").on(
      table.itemId,
      table.sourceRevision,
      table.operation
    ),
    foreignKey({
      columns: [table.itemId, table.sourceRevision, table.journalId],
      foreignColumns: [
        astroDiaryTimelineItemRevisions.itemId,
        astroDiaryTimelineItemRevisions.revision,
        astroDiaryTimelineItemRevisions.journalId
      ],
      name: "astro_diary_derivative_commands_source_revision_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_derivative_commands_operation_check",
      sql`${table.operation} in ('generate', 'redact')`
    ),
    check(
      "astro_diary_derivative_commands_digest_check",
      sql`${table.sourceDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "astro_diary_derivative_commands_state_check",
      sql`(${table.state} in ('pending', 'processing') and ${table.completedAt} is null)
        or (${table.state} in ('completed', 'known_failed', 'source_stale', 'quarantined')
          and ${table.completedAt} is not null)`
    ),
    asyncWorkAuthorityCheck("astro_diary_derivative_commands", table.state, table)
  ]
);

export const astroDiaryErasureCommands = pgTable(
  "astro_diary_erasure_commands",
  {
    id: uuid("id").primaryKey(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    state: text("state").notNull(),
    sourceVersion: integer("source_version").notNull(),
    sourceDigest: varchar("source_digest", { length: 71 }),
    derivativeCommandId: uuid("derivative_command_id").references(
      () => astroDiaryDerivativeCommands.id,
      { onDelete: "restrict" }
    ),
    cascadeRequestId: uuid("cascade_request_id"),
    ...asyncWorkColumns(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    check("astro_diary_erasure_commands_version_check", sql`${table.sourceVersion} >= 1`),
    check(
      "astro_diary_erasure_commands_target_check",
      sql`(
        ${table.targetType} = 'item'
        and ${table.sourceDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.derivativeCommandId} is not null
        and ${table.cascadeRequestId} is null
      ) or (
        ${table.targetType} = 'journal'
        and ${table.targetId} = ${table.journalId}
        and ${table.sourceDigest} is null
        and ${table.derivativeCommandId} is null
        and ${table.cascadeRequestId} is not null
      )`
    ),
    check(
      "astro_diary_erasure_commands_state_check",
      sql`(${table.state} in ('pending', 'processing') and ${table.completedAt} is null)
        or (${table.state} in ('completed', 'quarantined') and ${table.completedAt} is not null)`
    ),
    asyncWorkAuthorityCheck("astro_diary_erasure_commands", table.state, table)
  ]
);

export const astroDiaryDerivativeRedactionReceipts = pgTable(
  "astro_diary_derivative_redaction_receipts",
  {
    id: uuid("id").primaryKey(),
    commandId: uuid("command_id")
      .notNull()
      .references(() => astroDiaryErasureCommands.id, { onDelete: "restrict" }),
    target: text("target").notNull(),
    mediaId: uuid("media_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("astro_diary_derivative_redaction_receipts_media_unique")
      .on(table.commandId, table.mediaId)
      .where(sql`${table.target} = 'media'`),
    uniqueIndex("astro_diary_derivative_redaction_receipts_source_unique")
      .on(table.commandId)
      .where(sql`${table.target} = 'source'`),
    uniqueIndex("astro_diary_derivative_redaction_receipts_derivative_unique")
      .on(table.commandId)
      .where(sql`${table.target} = 'derivative'`),
    check(
      "astro_diary_derivative_redaction_receipts_target_check",
      sql`(${table.target} in ('source', 'derivative') and ${table.mediaId} is null)
        or (${table.target} = 'media' and ${table.mediaId} is not null)`
    )
  ]
);

export const astroDiaryCascadeCommands = pgTable(
  "astro_diary_cascade_commands",
  {
    cascadeRequestId: uuid("cascade_request_id").primaryKey(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    state: text("state").notNull(),
    ...asyncWorkColumns(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    unique("astro_diary_cascade_commands_journal_identity_unique").on(
      table.cascadeRequestId,
      table.journalId
    ),
    check(
      "astro_diary_cascade_commands_state_check",
      sql`(${table.state} in ('pending', 'processing') and ${table.completedAt} is null)
        or (${table.state} in ('completed', 'quarantined') and ${table.completedAt} is not null)`
    ),
    asyncWorkAuthorityCheck("astro_diary_cascade_commands", table.state, table)
  ]
);

export const astroDiaryCascadeTargets = pgTable(
  "astro_diary_cascade_targets",
  {
    cascadeRequestId: uuid("cascade_request_id").notNull(),
    journalId: uuid("journal_id").notNull(),
    subsystem: text("subsystem").notNull(),
    targetId: uuid("target_id").notNull(),
    sourceVersion: integer("source_version").notNull(),
    sourceDigest: varchar("source_digest", { length: 71 }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.cascadeRequestId, table.subsystem, table.targetId],
      name: "astro_diary_cascade_targets_pk"
    }),
    foreignKey({
      columns: [table.cascadeRequestId, table.journalId],
      foreignColumns: [
        astroDiaryCascadeCommands.cascadeRequestId,
        astroDiaryCascadeCommands.journalId
      ],
      name: "astro_diary_cascade_targets_command_journal_fk"
    }).onDelete("restrict"),
    unique("astro_diary_cascade_targets_evidence_unique").on(
      table.cascadeRequestId,
      table.journalId,
      table.subsystem,
      table.targetId,
      table.sourceVersion,
      table.sourceDigest
    ),
    check(
      "astro_diary_cascade_targets_subsystem_check",
      sql`${table.subsystem} in (
        'timeline_revision', 'derivative', 'transcript', 'extraction',
        'embedding', 'ai_draft', 'export', 'media'
      )`
    ),
    check("astro_diary_cascade_targets_version_check", sql`${table.sourceVersion} >= 1`),
    check(
      "astro_diary_cascade_targets_digest_check",
      sql`${table.sourceDigest} ~ '^sha256:[a-f0-9]{64}$'`
    )
  ]
);

export const astroDiaryCascadeReceipts = pgTable(
  "astro_diary_cascade_receipts",
  {
    receiptId: uuid("receipt_id").primaryKey(),
    cascadeRequestId: uuid("cascade_request_id").notNull(),
    journalId: uuid("journal_id").notNull(),
    subsystem: text("subsystem").notNull(),
    targetId: uuid("target_id").notNull(),
    sourceVersion: integer("source_version").notNull(),
    sourceDigest: varchar("source_digest", { length: 71 }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("astro_diary_cascade_receipts_target_unique").on(
      table.cascadeRequestId,
      table.subsystem,
      table.targetId
    ),
    foreignKey({
      columns: [
        table.cascadeRequestId,
        table.journalId,
        table.subsystem,
        table.targetId,
        table.sourceVersion,
        table.sourceDigest
      ],
      foreignColumns: [
        astroDiaryCascadeTargets.cascadeRequestId,
        astroDiaryCascadeTargets.journalId,
        astroDiaryCascadeTargets.subsystem,
        astroDiaryCascadeTargets.targetId,
        astroDiaryCascadeTargets.sourceVersion,
        astroDiaryCascadeTargets.sourceDigest
      ],
      name: "astro_diary_cascade_receipts_exact_target_fk"
    }).onDelete("restrict")
  ]
);

export const astroDiaryErasureDecisionFacts = pgTable(
  "astro_diary_erasure_decision_facts",
  {
    id: uuid("id").primaryKey(),
    type: text("type").notNull(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    relationshipId: uuid("relationship_id"),
    journalEpochId: uuid("journal_epoch_id"),
    erasureRequestId: uuid("erasure_request_id"),
    cascadeRequestId: uuid("cascade_request_id"),
    subscriptionId: uuid("subscription_id"),
    cycleId: uuid("cycle_id"),
    obligationId: uuid("obligation_id"),
    closeReason: text("close_reason"),
    obligationState: text("obligation_state"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "astro_diary_erasure_decision_facts_shape_check",
      sql`(
        ${table.type} = 'astro_diary.journal_erasure_requested'
        and ${table.relationshipId} is not null and ${table.journalEpochId} is not null
        and ${table.erasureRequestId} is not null and ${table.cascadeRequestId} is not null
        and ${table.subscriptionId} is null and ${table.cycleId} is null
        and ${table.obligationId} is null and ${table.closeReason} is null
        and ${table.obligationState} is null
      ) or (
        ${table.type} = 'astro_diary.subscription_end_requested'
        and ${table.subscriptionId} is not null and ${table.erasureRequestId} is not null
        and ${table.relationshipId} is null and ${table.journalEpochId} is null
        and ${table.cascadeRequestId} is null and ${table.cycleId} is null
        and ${table.obligationId} is null and ${table.closeReason} is null
        and ${table.obligationState} is null
      ) or (
        ${table.type} = 'astro_diary.cycle_closed'
        and ${table.cycleId} is not null and ${table.closeReason} = 'journal_deleted'
        and ${table.relationshipId} is null and ${table.journalEpochId} is null
        and ${table.erasureRequestId} is null and ${table.cascadeRequestId} is null
        and ${table.subscriptionId} is null and ${table.obligationId} is null
        and ${table.obligationState} is null
      ) or (
        ${table.type} = 'astro_diary.obligation_closed'
        and ${table.cycleId} is not null and ${table.obligationId} is not null
        and ${table.obligationState} = 'closed_without_response'
        and ${table.relationshipId} is null and ${table.journalEpochId} is null
        and ${table.erasureRequestId} is null and ${table.cascadeRequestId} is null
        and ${table.subscriptionId} is null and ${table.closeReason} is null
      )`
    ),
    index("astro_diary_erasure_decision_facts_journal_occurred_idx").on(
      table.journalId,
      table.occurredAt,
      table.id
    )
  ]
);

export const astroDiaryCommandReceipts = pgTable(
  "astro_diary_command_receipts",
  {
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    requestHash: varchar("request_hash", { length: 71 }).notNull(),
    outcome: text("outcome").notNull(),
    rejectionCode: varchar("rejection_code", { length: 160 }),
    resultResourceType: text("result_resource_type"),
    resultResourceId: uuid("result_resource_id"),
    resultResourceVersion: integer("result_resource_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.journalId, table.idempotencyKey],
      name: "astro_diary_command_receipts_pk"
    }),
    check(
      "astro_diary_command_receipts_hash_check",
      sql`${table.requestHash} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "astro_diary_command_receipts_idempotency_key_check",
      sql`length(trim(${table.idempotencyKey})) between 1 and 160`
    ),
    check(
      "astro_diary_command_receipts_outcome_check",
      sql`(${table.outcome} = 'applied' and ${table.rejectionCode} is null)
        or (${table.outcome} = 'rejected'
          and length(trim(${table.rejectionCode})) between 1 and 160)`
    ),
    check(
      "astro_diary_command_receipts_result_resource_check",
      sql`(
        ${table.outcome} = 'applied'
        and (
          (${table.resultResourceType} is null and ${table.resultResourceId} is null
            and ${table.resultResourceVersion} is null)
          or (${table.resultResourceType} = 'draft' and ${table.resultResourceId} is not null
            and ${table.resultResourceVersion} >= 1)
        )
      ) or (
        ${table.outcome} = 'rejected' and ${table.resultResourceType} is null
        and ${table.resultResourceId} is null and ${table.resultResourceVersion} is null
      )`
    ),
    foreignKey({
      columns: [table.resultResourceId, table.resultResourceVersion, table.journalId],
      foreignColumns: [
        astroDiaryDraftVersionFacts.draftId,
        astroDiaryDraftVersionFacts.version,
        astroDiaryDraftVersionFacts.journalId
      ],
      name: "astro_diary_command_receipts_draft_result_fact_fk"
    }).onDelete("restrict")
  ]
);

export const astroDiaryCommandPreconditions = pgTable(
  "astro_diary_command_preconditions",
  {
    journalId: uuid("journal_id").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    aggregate: text("aggregate").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    expectedVersion: integer("expected_version")
  },
  (table) => [
    primaryKey({
      columns: [table.journalId, table.idempotencyKey, table.aggregate, table.aggregateId],
      name: "astro_diary_command_preconditions_pk"
    }),
    foreignKey({
      columns: [table.journalId, table.idempotencyKey],
      foreignColumns: [
        astroDiaryCommandReceipts.journalId,
        astroDiaryCommandReceipts.idempotencyKey
      ],
      name: "astro_diary_command_preconditions_receipt_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_command_preconditions_aggregate_check",
      sql`${table.aggregate} in (
        'journal', 'cycle', 'draft', 'timeline_item', 'obligation', 'allowance', 'read_cursor'
      )`
    ),
    check(
      "astro_diary_command_preconditions_version_check",
      sql`(
        (${table.aggregate} = 'read_cursor' and ${table.expectedVersion} is null)
        or ${table.expectedVersion} >= 1
      )`
    )
  ]
);

export const astroDiaryCommandEventReceipts = pgTable(
  "astro_diary_command_event_receipts",
  {
    journalId: uuid("journal_id").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    ordinal: integer("ordinal").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => astroDiaryEvents.eventId, { onDelete: "restrict" })
  },
  (table) => [
    primaryKey({
      columns: [table.journalId, table.idempotencyKey, table.ordinal],
      name: "astro_diary_command_event_receipts_pk"
    }),
    unique("astro_diary_command_event_receipts_event_unique").on(table.eventId),
    foreignKey({
      columns: [table.journalId, table.idempotencyKey],
      foreignColumns: [
        astroDiaryCommandReceipts.journalId,
        astroDiaryCommandReceipts.idempotencyKey
      ],
      name: "astro_diary_command_event_receipts_receipt_fk"
    }).onDelete("restrict"),
    check("astro_diary_command_event_receipts_ordinal_check", sql`${table.ordinal} >= 0`)
  ]
);

export const astroDiaryEventApplicationReceipts = pgTable(
  "astro_diary_event_application_receipts",
  {
    consumer: varchar("consumer", { length: 160 }).notNull(),
    sourceEventId: uuid("source_event_id").notNull(),
    sourceEventType: varchar("source_event_type", { length: 200 }).notNull(),
    sourceEventDigest: varchar("source_event_digest", { length: 71 }).notNull(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    resultKind: text("result_kind").notNull(),
    resultCode: varchar("result_code", { length: 160 }),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.consumer, table.sourceEventId],
      name: "astro_diary_event_application_receipts_pk"
    }),
    check(
      "astro_diary_event_application_receipts_consumer_check",
      sql`${table.consumer} in (
        'realtime_projection', 'notification', 'context_worker', 'derivative_worker',
        'ai_worker', 'export_worker', 'erasure_worker'
      )`
    ),
    foreignKey({
      columns: [table.sourceEventId],
      foreignColumns: [astroDiaryEvents.eventId],
      name: "astro_diary_event_application_receipts_source_event_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_event_application_receipts_digest_check",
      sql`${table.sourceEventDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "astro_diary_event_application_receipts_result_check",
      sql`(${table.resultKind} = 'applied' and ${table.resultCode} is null)
        or (${table.resultKind} in ('idempotent', 'rejected')
          and length(trim(${table.resultCode})) between 1 and 160)`
    ),
    index("astro_diary_event_application_receipts_journal_applied_idx").on(
      table.journalId,
      table.appliedAt,
      table.sourceEventId
    )
  ]
);
