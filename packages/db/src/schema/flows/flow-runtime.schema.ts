import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { flowVersions } from "./flow-versions.schema";
import { flows } from "./flows.schema";
import {
  flowApprovalKindValues,
  flowApprovalStatusValues,
  flowDeliveryAttemptStatusValues,
  flowRunStatusValues,
  flowRunSubjectTypeValues,
  flowRuntimeEventSourceValues,
  flowStepRunStatusValues,
  flowSuppressionReasonValues,
  formatFlowSqlValues
} from "./flows-values";

export const flowRuntimeEvents = pgTable(
  "flow_runtime_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceEventId: text("source_event_id").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("flow_runtime_events_id_owner_unique").on(table.id, table.ownerUserId),
    uniqueIndex("flow_runtime_events_owner_dedupe_unique").on(table.ownerUserId, table.dedupeKey),
    index("flow_runtime_events_owner_occurred_idx").on(table.ownerUserId, table.occurredAt, table.id),
    check(
      "flow_runtime_events_source_check",
      sql`${table.source} in ${sql.raw(formatFlowSqlValues(flowRuntimeEventSourceValues))}`
    ),
    check(
      "flow_runtime_events_subject_type_check",
      sql`${table.subjectType} in ${sql.raw(formatFlowSqlValues(flowRunSubjectTypeValues))}`
    ),
    check(
      "flow_runtime_events_source_event_id_length_check",
      sql`length(trim(${table.sourceEventId})) between 1 and 180`
    ),
    check(
      "flow_runtime_events_dedupe_key_length_check",
      sql`length(trim(${table.dedupeKey})) between 1 and 240`
    ),
    check(
      "flow_runtime_events_subject_id_length_check",
      sql`length(trim(${table.subjectId})) between 1 and 180`
    ),
    check("flow_runtime_events_payload_object_check", sql`jsonb_typeof(${table.payload}) = 'object'`)
  ]
);

export const flowRuns = pgTable(
  "flow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flowId: uuid("flow_id").notNull(),
    flowVersionId: uuid("flow_version_id").notNull(),
    runtimeEventId: uuid("runtime_event_id").notNull(),
    status: text("status").notNull().default("pending"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    currentNodeId: text("current_node_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    unique("flow_runs_id_owner_unique").on(table.id, table.ownerUserId),
    unique("flow_runs_id_event_owner_unique").on(table.id, table.runtimeEventId, table.ownerUserId),
    unique("flow_runs_id_flow_event_owner_unique").on(
      table.id,
      table.flowId,
      table.runtimeEventId,
      table.ownerUserId
    ),
    uniqueIndex("flow_runs_owner_flow_event_unique").on(
      table.ownerUserId,
      table.flowId,
      table.runtimeEventId
    ),
    foreignKey({
      columns: [table.flowId, table.ownerUserId],
      foreignColumns: [flows.id, flows.ownerUserId],
      name: "flow_runs_flow_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.flowId, table.flowVersionId, table.ownerUserId],
      foreignColumns: [flowVersions.flowId, flowVersions.id, flowVersions.ownerUserId],
      name: "flow_runs_flow_version_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.runtimeEventId, table.ownerUserId],
      foreignColumns: [flowRuntimeEvents.id, flowRuntimeEvents.ownerUserId],
      name: "flow_runs_runtime_event_owner_fk"
    }).onDelete("restrict"),
    index("flow_runs_owner_status_updated_idx").on(table.ownerUserId, table.status, table.updatedAt),
    index("flow_runs_flow_created_idx").on(table.flowId, table.createdAt, table.id),
    index("flow_runs_runtime_event_idx").on(table.runtimeEventId),
    check(
      "flow_runs_status_check",
      sql`${table.status} in ${sql.raw(formatFlowSqlValues(flowRunStatusValues))}`
    ),
    check("flow_runs_snapshot_object_check", sql`jsonb_typeof(${table.snapshot}) = 'object'`),
    check(
      "flow_runs_current_node_id_length_check",
      sql`${table.currentNodeId} is null or length(trim(${table.currentNodeId})) between 1 and 160`
    )
  ]
);

export const flowStepRuns = pgTable(
  "flow_step_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flowRunId: uuid("flow_run_id").notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull().default("pending"),
    inputSnapshot: jsonb("input_snapshot").$type<Record<string, unknown>>().notNull(),
    outputSnapshot: jsonb("output_snapshot").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    unique("flow_step_runs_id_owner_unique").on(table.id, table.ownerUserId),
    unique("flow_step_runs_id_run_owner_unique").on(table.id, table.flowRunId, table.ownerUserId),
    foreignKey({
      columns: [table.flowRunId, table.ownerUserId],
      foreignColumns: [flowRuns.id, flowRuns.ownerUserId],
      name: "flow_step_runs_run_owner_fk"
    }).onDelete("cascade"),
    index("flow_step_runs_owner_run_created_idx").on(table.ownerUserId, table.flowRunId, table.createdAt),
    check(
      "flow_step_runs_status_check",
      sql`${table.status} in ${sql.raw(formatFlowSqlValues(flowStepRunStatusValues))}`
    ),
    check("flow_step_runs_node_id_length_check", sql`length(trim(${table.nodeId})) between 1 and 160`),
    check(
      "flow_step_runs_input_snapshot_object_check",
      sql`jsonb_typeof(${table.inputSnapshot}) = 'object'`
    ),
    check(
      "flow_step_runs_output_snapshot_object_check",
      sql`${table.outputSnapshot} is null or jsonb_typeof(${table.outputSnapshot}) = 'object'`
    ),
    check(
      "flow_step_runs_error_code_length_check",
      sql`${table.errorCode} is null or length(trim(${table.errorCode})) between 1 and 120`
    ),
    check(
      "flow_step_runs_error_message_length_check",
      sql`${table.errorMessage} is null or length(trim(${table.errorMessage})) between 1 and 1000`
    )
  ]
);

export const flowApprovals = pgTable(
  "flow_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flowRunId: uuid("flow_run_id").notNull(),
    flowStepRunId: uuid("flow_step_run_id"),
    status: text("status").notNull().default("pending"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    preview: text("preview").notNull(),
    decisionNote: text("decision_note"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      columns: [table.flowRunId, table.ownerUserId],
      foreignColumns: [flowRuns.id, flowRuns.ownerUserId],
      name: "flow_approvals_run_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.flowStepRunId, table.flowRunId, table.ownerUserId],
      foreignColumns: [flowStepRuns.id, flowStepRuns.flowRunId, flowStepRuns.ownerUserId],
      name: "flow_approvals_step_run_owner_fk"
    }).onDelete("restrict"),
    index("flow_approvals_owner_status_created_idx").on(table.ownerUserId, table.status, table.createdAt),
    index("flow_approvals_run_created_idx").on(table.flowRunId, table.createdAt),
    check(
      "flow_approvals_status_check",
      sql`${table.status} in ${sql.raw(formatFlowSqlValues(flowApprovalStatusValues))}`
    ),
    check(
      "flow_approvals_kind_check",
      sql`${table.kind} in ${sql.raw(formatFlowSqlValues(flowApprovalKindValues))}`
    ),
    check("flow_approvals_title_length_check", sql`length(trim(${table.title})) between 1 and 180`),
    check("flow_approvals_preview_length_check", sql`length(trim(${table.preview})) between 1 and 1000`),
    check(
      "flow_approvals_decision_note_length_check",
      sql`${table.decisionNote} is null or length(trim(${table.decisionNote})) between 1 and 1000`
    ),
    check(
      "flow_approvals_pending_decision_check",
      sql`${table.status} <> 'pending' or (${table.decidedAt} is null and ${table.decidedByUserId} is null and ${table.snoozedUntil} is null)`
    ),
    check(
      "flow_approvals_decided_status_check",
      sql`${table.status} in ('pending', 'expired') or (${table.decidedAt} is not null and ${table.decidedByUserId} is not null)`
    ),
    check(
      "flow_approvals_snoozed_until_check",
      sql`${table.status} <> 'snoozed' or ${table.snoozedUntil} is not null`
    )
  ]
);

export const flowDeliveryAttempts = pgTable(
  "flow_delivery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flowRunId: uuid("flow_run_id").notNull(),
    flowStepRunId: uuid("flow_step_run_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    provider: text("provider"),
    status: text("status").notNull().default("pending"),
    providerRequestPayload: jsonb("provider_request_payload").$type<Record<string, unknown>>(),
    providerResponsePayload: jsonb("provider_response_payload").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.flowRunId, table.ownerUserId],
      foreignColumns: [flowRuns.id, flowRuns.ownerUserId],
      name: "flow_delivery_attempts_run_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.flowStepRunId, table.flowRunId, table.ownerUserId],
      foreignColumns: [flowStepRuns.id, flowStepRuns.flowRunId, flowStepRuns.ownerUserId],
      name: "flow_delivery_attempts_step_run_owner_fk"
    }).onDelete("cascade"),
    uniqueIndex("flow_delivery_attempts_owner_idempotency_unique").on(
      table.ownerUserId,
      table.idempotencyKey
    ),
    uniqueIndex("flow_delivery_attempts_step_attempt_unique").on(
      table.flowStepRunId,
      table.attemptNumber
    ),
    index("flow_delivery_attempts_owner_status_created_idx").on(
      table.ownerUserId,
      table.status,
      table.createdAt
    ),
    check(
      "flow_delivery_attempts_status_check",
      sql`${table.status} in ${sql.raw(formatFlowSqlValues(flowDeliveryAttemptStatusValues))}`
    ),
    check(
      "flow_delivery_attempts_idempotency_key_length_check",
      sql`length(trim(${table.idempotencyKey})) between 1 and 240`
    ),
    check("flow_delivery_attempts_number_check", sql`${table.attemptNumber} > 0`),
    check(
      "flow_delivery_attempts_provider_length_check",
      sql`${table.provider} is null or length(trim(${table.provider})) between 1 and 120`
    ),
    check(
      "flow_delivery_attempts_request_payload_object_check",
      sql`${table.providerRequestPayload} is null or jsonb_typeof(${table.providerRequestPayload}) = 'object'`
    ),
    check(
      "flow_delivery_attempts_response_payload_object_check",
      sql`${table.providerResponsePayload} is null or jsonb_typeof(${table.providerResponsePayload}) = 'object'`
    ),
    check(
      "flow_delivery_attempts_error_code_length_check",
      sql`${table.errorCode} is null or length(trim(${table.errorCode})) between 1 and 120`
    ),
    check(
      "flow_delivery_attempts_error_message_length_check",
      sql`${table.errorMessage} is null or length(trim(${table.errorMessage})) between 1 and 1000`
    )
  ]
);

export const flowSuppressions = pgTable(
  "flow_suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flowId: uuid("flow_id").notNull(),
    runtimeEventId: uuid("runtime_event_id").notNull(),
    flowRunId: uuid("flow_run_id"),
    reason: text("reason").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.flowId, table.ownerUserId],
      foreignColumns: [flows.id, flows.ownerUserId],
      name: "flow_suppressions_flow_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.runtimeEventId, table.ownerUserId],
      foreignColumns: [flowRuntimeEvents.id, flowRuntimeEvents.ownerUserId],
      name: "flow_suppressions_runtime_event_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.flowRunId, table.flowId, table.runtimeEventId, table.ownerUserId],
      foreignColumns: [
        flowRuns.id,
        flowRuns.flowId,
        flowRuns.runtimeEventId,
        flowRuns.ownerUserId
      ],
      name: "flow_suppressions_run_event_owner_fk"
    }).onDelete("restrict"),
    uniqueIndex("flow_suppressions_owner_flow_event_reason_unique").on(
      table.ownerUserId,
      table.flowId,
      table.runtimeEventId,
      table.reason
    ),
    index("flow_suppressions_owner_created_idx").on(table.ownerUserId, table.createdAt, table.id),
    index("flow_suppressions_runtime_event_idx").on(table.runtimeEventId),
    check(
      "flow_suppressions_reason_check",
      sql`${table.reason} in ${sql.raw(formatFlowSqlValues(flowSuppressionReasonValues))}`
    ),
    check("flow_suppressions_details_object_check", sql`jsonb_typeof(${table.details}) = 'object'`)
  ]
);
