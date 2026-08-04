import { sql } from "drizzle-orm";
import { flowExecutableNodeKindV2Values, flowSourceHandleV2Values } from "@elevenhouse/contracts";
import {
  flowExecutionFailureReasonCodeValues,
  flowExecutionFailedTerminalFailureReasonCodeValues,
  flowExecutionPermanentFailureReasonCodeValues,
  flowExecutionQuarantineFailureReasonCodeValues,
  flowExecutionRetryScheduledFailureReasonCodeValues,
  flowExecutionRetryableFailureReasonCodeValues,
  flowExecutionRetryPolicyV1
} from "@elevenhouse/domain";
import {
  bigint,
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
import { flowRuntimeCommands } from "./flow-runtime-commands.schema";
import { flows } from "./flows.schema";
import {
  flowApprovalKindValues,
  flowApprovalStatusValues,
  flowDeliveryAttemptStatusValues,
  flowExecutionAttemptOutcomeValues,
  flowExecutionTokenStateValues,
  flowRunEventTypeValues,
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
    index("flow_runtime_events_owner_occurred_idx").on(
      table.ownerUserId,
      table.occurredAt,
      table.id
    ),
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
    check(
      "flow_runtime_events_payload_object_check",
      sql`jsonb_typeof(${table.payload}) = 'object'`
    )
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
    traceSequence: bigint("trace_sequence", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    unique("flow_runs_id_owner_unique").on(table.id, table.ownerUserId),
    unique("flow_runs_id_version_owner_unique").on(
      table.id,
      table.flowVersionId,
      table.ownerUserId
    ),
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
    index("flow_runs_owner_status_updated_idx").on(
      table.ownerUserId,
      table.status,
      table.updatedAt
    ),
    index("flow_runs_flow_created_idx").on(table.flowId, table.createdAt, table.id),
    index("flow_runs_runtime_event_idx").on(table.runtimeEventId),
    check(
      "flow_runs_status_check",
      sql`${table.status} in ${sql.raw(formatFlowSqlValues(flowRunStatusValues))}`
    ),
    check("flow_runs_snapshot_object_check", sql`jsonb_typeof(${table.snapshot}) = 'object'`),
    check("flow_runs_trace_sequence_check", sql`${table.traceSequence} >= 0`),
    check(
      "flow_runs_current_node_id_length_check",
      sql`${table.currentNodeId} is null or length(trim(${table.currentNodeId})) between 1 and 160`
    )
  ]
);

export const flowExecutionTokens = pgTable(
  "flow_execution_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flowRunId: uuid("flow_run_id").notNull(),
    flowVersionId: uuid("flow_version_id").notNull(),
    nodeId: text("node_id").notNull(),
    nodeKind: text("node_kind").notNull(),
    configSchemaVersion: integer("config_schema_version").notNull(),
    executorContractVersion: integer("executor_contract_version").notNull(),
    executorKey: text("executor_key").notNull(),
    state: text("state").notNull().default("runnable"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    nodeActivationSequence: bigint("node_activation_sequence", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    attemptCounter: bigint("attempt_counter", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    fencingToken: bigint("fencing_token", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    retryPolicyKey: text("retry_policy_key").notNull().default(flowExecutionRetryPolicyV1.key),
    maxAttempts: integer("max_attempts").notNull().default(flowExecutionRetryPolicyV1.maxAttempts),
    retryBaseDelayMs: integer("retry_base_delay_ms")
      .notNull()
      .default(flowExecutionRetryPolicyV1.baseDelayMs),
    retryMaxDelayMs: integer("retry_max_delay_ms")
      .notNull()
      .default(flowExecutionRetryPolicyV1.maxDelayMs),
    failureDisposition: text("failure_disposition"),
    failureReasonCode: text("failure_reason_code"),
    terminalAt: timestamp("terminal_at", { withTimezone: true }),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("flow_execution_tokens_id_run_owner_unique").on(
      table.id,
      table.flowRunId,
      table.ownerUserId
    ),
    foreignKey({
      columns: [table.flowRunId, table.flowVersionId, table.ownerUserId],
      foreignColumns: [flowRuns.id, flowRuns.flowVersionId, flowRuns.ownerUserId],
      name: "flow_execution_tokens_run_version_owner_fk"
    }).onDelete("cascade"),
    uniqueIndex("flow_execution_tokens_run_unique").on(table.flowRunId),
    index("flow_execution_tokens_owner_run_idx").on(table.ownerUserId, table.flowRunId),
    index("flow_execution_tokens_runnable_idx").on(
      table.state,
      table.availableAt,
      table.createdAt,
      table.id
    ),
    index("flow_execution_tokens_expired_lease_idx").on(
      table.state,
      table.leaseExpiresAt,
      table.id
    ),
    index("flow_execution_tokens_quarantined_idx").on(
      table.failureDisposition,
      table.quarantinedAt,
      table.id
    ),
    check(
      "flow_execution_tokens_state_check",
      sql`${table.state} in ${sql.raw(formatFlowSqlValues(flowExecutionTokenStateValues))}`
    ),
    check(
      "flow_execution_tokens_node_id_length_check",
      sql`length(trim(${table.nodeId})) between 1 and 160`
    ),
    check(
      "flow_execution_tokens_node_kind_length_check",
      sql`length(trim(${table.nodeKind})) between 1 and 80`
    ),
    check(
      "flow_execution_tokens_node_kind_check",
      sql`${table.nodeKind} in ${sql.raw(formatFlowSqlValues(flowExecutableNodeKindV2Values))}`
    ),
    check(
      "flow_execution_tokens_executor_versions_check",
      sql`${table.configSchemaVersion} > 0 and ${table.executorContractVersion} > 0`
    ),
    check(
      "flow_execution_tokens_executor_key_check",
      sql`${table.executorKey} = ${table.nodeKind} || ':' || ${table.configSchemaVersion}::text || ':' || ${table.executorContractVersion}::text`
    ),
    check(
      "flow_execution_tokens_lease_owner_length_check",
      sql`${table.leaseOwner} is null or length(trim(${table.leaseOwner})) between 1 and 180`
    ),
    check(
      "flow_execution_tokens_node_activation_sequence_check",
      sql`${table.nodeActivationSequence} > 0`
    ),
    check(
      "flow_execution_tokens_lease_state_check",
      sql`(
        ${table.state} = 'claimed'
        and ${table.claimedAt} is not null
        and ${table.leaseOwner} is not null
        and ${table.leaseExpiresAt} is not null
        and ${table.claimedAt} <= ${table.leaseExpiresAt}
        and ${table.claimedAt} <= ${table.updatedAt}
      ) or (
        ${table.state} <> 'claimed'
        and ${table.claimedAt} is null
        and ${table.leaseOwner} is null
        and ${table.leaseExpiresAt} is null
      )`
    ),
    check(
      "flow_execution_tokens_attempt_counter_check",
      sql`${table.attemptCounter} between 0 and ${table.maxAttempts}`
    ),
    check(
      "flow_execution_tokens_fencing_token_check",
      sql`${table.fencingToken} >= ${table.attemptCounter}`
    ),
    check(
      "flow_execution_tokens_counter_state_check",
      sql`(${table.state} not in ('runnable', 'retry_scheduled')
          or ${table.attemptCounter} < ${table.maxAttempts})
        and (${table.state} not in ('claimed', 'retry_scheduled')
          or ${table.attemptCounter} > 0)`
    ),
    check(
      "flow_execution_tokens_retry_policy_check",
      sql`${table.retryPolicyKey} = ${sql.raw(`'${flowExecutionRetryPolicyV1.key}'`)}
        and ${table.maxAttempts} = ${sql.raw(String(flowExecutionRetryPolicyV1.maxAttempts))}
        and ${table.retryBaseDelayMs} = ${sql.raw(String(flowExecutionRetryPolicyV1.baseDelayMs))}
        and ${table.retryMaxDelayMs} = ${sql.raw(String(flowExecutionRetryPolicyV1.maxDelayMs))}`
    ),
    check(
      "flow_execution_tokens_failure_disposition_check",
      sql`${table.failureDisposition} is null
        or ${table.failureDisposition} in ('retry_scheduled', 'failed_terminal', 'quarantined')`
    ),
    check(
      "flow_execution_tokens_failure_reason_check",
      sql`${table.failureReasonCode} is null
        or ${table.failureReasonCode} in ${sql.raw(
          formatFlowSqlValues(flowExecutionFailureReasonCodeValues)
        )}`
    ),
    check(
      "flow_execution_tokens_failure_state_check",
      sql`(
        ${table.state} = 'retry_scheduled'
        and ${table.failureDisposition} is not null
        and ${table.failureDisposition} = 'retry_scheduled'
        and ${table.failureReasonCode} is not null
        and ${table.failureReasonCode} in ${sql.raw(
          formatFlowSqlValues(flowExecutionRetryScheduledFailureReasonCodeValues)
        )}
        and ${table.quarantinedAt} is null
      ) or (
        ${table.state} = 'failed'
        and ${table.failureDisposition} is not null
        and ${table.failureReasonCode} is not null
        and (
          (${table.failureDisposition} = 'quarantined'
            and ${table.failureReasonCode} in ${sql.raw(
              formatFlowSqlValues(flowExecutionQuarantineFailureReasonCodeValues)
            )}
            and ${table.quarantinedAt} is not null)
          or (${table.failureDisposition} = 'failed_terminal'
            and ${table.failureReasonCode} in ${sql.raw(
              formatFlowSqlValues(flowExecutionFailedTerminalFailureReasonCodeValues)
            )}
            and ${table.quarantinedAt} is null)
        )
      ) or (
        ${table.state} not in ('retry_scheduled', 'failed')
        and ${table.failureDisposition} is null
        and ${table.failureReasonCode} is null
        and ${table.quarantinedAt} is null
      )`
    ),
    check(
      "flow_execution_tokens_terminal_state_check",
      sql`(
        ${table.state} in ('completed', 'failed', 'canceled')
        and ${table.terminalAt} is not null
      ) or (
        ${table.state} not in ('completed', 'failed', 'canceled')
        and ${table.terminalAt} is null
      )`
    ),
    check(
      "flow_execution_tokens_completed_node_check",
      sql`${table.state} <> 'completed' or ${table.nodeKind} = 'completed'`
    )
  ]
);

export const flowExecutionAttempts = pgTable(
  "flow_execution_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flowRunId: uuid("flow_run_id").notNull(),
    tokenId: uuid("token_id").notNull(),
    flowVersionId: uuid("flow_version_id").notNull(),
    nodeId: text("node_id").notNull(),
    executorKey: text("executor_key").notNull(),
    nodeActivationSequence: bigint("node_activation_sequence", { mode: "bigint" }).notNull(),
    attemptNumber: bigint("attempt_number", { mode: "bigint" }).notNull(),
    fencingToken: bigint("fencing_token", { mode: "bigint" }).notNull(),
    leaseOwner: text("lease_owner").notNull(),
    outcome: text("outcome").notNull(),
    resultCode: text("result_code").notNull(),
    traceSummary: jsonb("trace_summary").$type<Record<string, unknown>>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("flow_execution_attempts_id_run_owner_unique").on(
      table.id,
      table.flowRunId,
      table.ownerUserId
    ),
    foreignKey({
      columns: [table.tokenId, table.flowRunId, table.ownerUserId],
      foreignColumns: [
        flowExecutionTokens.id,
        flowExecutionTokens.flowRunId,
        flowExecutionTokens.ownerUserId
      ],
      name: "flow_execution_attempts_token_run_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.flowRunId, table.flowVersionId, table.ownerUserId],
      foreignColumns: [flowRuns.id, flowRuns.flowVersionId, flowRuns.ownerUserId],
      name: "flow_execution_attempts_run_version_owner_fk"
    }).onDelete("cascade"),
    uniqueIndex("flow_execution_attempts_token_fence_unique").on(table.tokenId, table.fencingToken),
    uniqueIndex("flow_execution_attempts_token_activation_attempt_unique").on(
      table.tokenId,
      table.nodeActivationSequence,
      table.attemptNumber
    ),
    index("flow_execution_attempts_owner_run_completed_idx").on(
      table.ownerUserId,
      table.flowRunId,
      table.completedAt,
      table.id
    ),
    check(
      "flow_execution_attempts_outcome_check",
      sql`${table.outcome} in ${sql.raw(formatFlowSqlValues(flowExecutionAttemptOutcomeValues))}`
    ),
    check(
      "flow_execution_attempts_node_activation_sequence_check",
      sql`${table.nodeActivationSequence} > 0`
    ),
    check(
      "flow_execution_attempts_number_check",
      sql`${table.attemptNumber} between 1 and ${sql.raw(
        String(flowExecutionRetryPolicyV1.maxAttempts)
      )} and ${table.fencingToken} >= ${table.attemptNumber}`
    ),
    check(
      "flow_execution_attempts_node_id_length_check",
      sql`length(trim(${table.nodeId})) between 1 and 160`
    ),
    check(
      "flow_execution_attempts_executor_key_length_check",
      sql`length(trim(${table.executorKey})) between 1 and 180`
    ),
    check(
      "flow_execution_attempts_lease_owner_length_check",
      sql`length(trim(${table.leaseOwner})) between 1 and 180`
    ),
    check(
      "flow_execution_attempts_result_code_length_check",
      sql`length(trim(${table.resultCode})) between 1 and 160`
    ),
    check(
      "flow_execution_attempts_trace_summary_object_check",
      sql`jsonb_typeof(${table.traceSummary}) = 'object'`
    ),
    check(
      "flow_execution_attempts_trace_summary_schema_check",
      sql`${table.traceSummary} ?& array[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[]
        and (
          (
            ${table.outcome} = 'advanced'
            and ${table.traceSummary} ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[]
            and jsonb_typeof(${table.traceSummary}->'sourceHandle') = 'string'
            and jsonb_typeof(${table.traceSummary}->'selectedEdgeId') = 'string'
            and jsonb_typeof(${table.traceSummary}->'targetNodeId') = 'string'
            and jsonb_typeof(${table.traceSummary}->'targetNodeKind') = 'string'
            and ${table.traceSummary} - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[] = '{}'::jsonb
          )
          or (
            ${table.outcome} <> 'advanced'
            and ${table.traceSummary} - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
            ]::text[] = '{}'::jsonb
          )
        )
        and jsonb_typeof(${table.traceSummary}->'schemaVersion') = 'string'
        and jsonb_typeof(${table.traceSummary}->'outcome') = 'string'
        and jsonb_typeof(${table.traceSummary}->'nodeKind') = 'string'
        and jsonb_typeof(${table.traceSummary}->'reasonCode') = 'string'
        and jsonb_typeof(${table.traceSummary}->'resultCode') = 'string'
        and ${table.traceSummary}->>'schemaVersion' = 'flow-runtime-trace.v1'
        and ${table.traceSummary}->>'nodeKind' in ${sql.raw(
          formatFlowSqlValues(flowExecutableNodeKindV2Values)
        )}
        and ${table.traceSummary}->>'nodeKind' = split_part(${table.executorKey}, ':', 1)
        and ${table.resultCode} = ${table.traceSummary}->>'resultCode'
        and length(${table.traceSummary}->>'resultCode') between 1 and 160
        and ${table.traceSummary}->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        and (
          (
            ${table.outcome} = 'advanced'
            and ${table.traceSummary}->>'outcome' = 'advanced'
            and ${table.traceSummary}->>'reasonCode' = 'FLOW_EDGE_SELECTED'
            and ${table.traceSummary}->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and ${table.traceSummary}->>'sourceHandle' in ${sql.raw(
              formatFlowSqlValues(flowSourceHandleV2Values)
            )}
            and ${table.traceSummary}->>'targetNodeKind' in ${sql.raw(
              formatFlowSqlValues(flowExecutableNodeKindV2Values)
            )}
            and length(${table.traceSummary}->>'selectedEdgeId') between 1 and 160
            and ${table.traceSummary}->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and length(${table.traceSummary}->>'targetNodeId') between 1 and 160
            and ${table.traceSummary}->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
          )
          or
          (
            ${table.outcome} = 'completed'
            and ${table.traceSummary}->>'nodeKind' = 'completed'
            and ${table.traceSummary}->>'outcome' = 'terminal'
            and ${table.traceSummary}->>'reasonCode' = 'FLOW_GOAL_REACHED'
          )
          or (
            ${table.outcome} = 'lease_expired'
            and ${table.traceSummary}->>'outcome' = 'lease_expired'
            and ${table.traceSummary}->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
            and ${table.traceSummary}->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          )
          or (
            ${table.outcome} = 'canceled'
            and ${table.traceSummary}->>'outcome' = 'canceled'
            and ${table.traceSummary}->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
            and ${table.traceSummary}->>'resultCode' = 'FLOW_RUN_CANCELED'
          )
          or (
            ${table.outcome} = 'retry_scheduled'
            and ${table.traceSummary}->>'outcome' = 'retry_scheduled'
            and ${table.traceSummary}->>'reasonCode' in ${sql.raw(
              formatFlowSqlValues(flowExecutionRetryableFailureReasonCodeValues)
            )}
            and ${table.traceSummary}->>'resultCode' = 'FLOW_EXECUTION_RETRY_SCHEDULED'
          )
          or (
            ${table.outcome} = 'failed'
            and ${table.traceSummary}->>'outcome' = 'failed'
            and (
              (
                ${table.traceSummary}->>'reasonCode' in ${sql.raw(
                  formatFlowSqlValues(flowExecutionPermanentFailureReasonCodeValues)
                )}
                and ${table.traceSummary}->>'resultCode' = 'FLOW_EXECUTION_FAILED_TERMINAL'
              )
              or (
                ${table.traceSummary}->>'reasonCode' in ${sql.raw(
                  formatFlowSqlValues([
                    ...flowExecutionRetryableFailureReasonCodeValues,
                    "FLOW_TOKEN_LEASE_EXPIRED"
                  ])
                )}
                and ${table.traceSummary}->>'resultCode' = 'FLOW_EXECUTION_RETRY_EXHAUSTED'
              )
            )
          )
        )`
    ),
    check(
      "flow_execution_attempts_time_order_check",
      sql`${table.completedAt} >= ${table.startedAt}`
    )
  ]
);

export const flowRunEvents = pgTable(
  "flow_run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flowRunId: uuid("flow_run_id").notNull(),
    sequence: bigint("sequence", { mode: "bigint" }).notNull(),
    eventType: text("event_type").notNull(),
    nodeId: text("node_id"),
    attemptId: uuid("attempt_id"),
    commandId: uuid("command_id"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.flowRunId, table.ownerUserId],
      foreignColumns: [flowRuns.id, flowRuns.ownerUserId],
      name: "flow_run_events_run_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.attemptId, table.flowRunId, table.ownerUserId],
      foreignColumns: [
        flowExecutionAttempts.id,
        flowExecutionAttempts.flowRunId,
        flowExecutionAttempts.ownerUserId
      ],
      name: "flow_run_events_attempt_run_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.commandId, table.flowRunId, table.ownerUserId],
      foreignColumns: [
        flowRuntimeCommands.id,
        flowRuntimeCommands.resourceId,
        flowRuntimeCommands.ownerUserId
      ],
      name: "flow_run_events_command_run_owner_fk"
    }).onDelete("cascade"),
    uniqueIndex("flow_run_events_run_sequence_unique").on(table.flowRunId, table.sequence),
    uniqueIndex("flow_run_events_attempt_unique")
      .on(table.attemptId)
      .where(sql`${table.attemptId} is not null`),
    index("flow_run_events_owner_occurred_idx").on(table.ownerUserId, table.occurredAt, table.id),
    check(
      "flow_run_events_type_check",
      sql`${table.eventType} in ${sql.raw(formatFlowSqlValues(flowRunEventTypeValues))}`
    ),
    check("flow_run_events_sequence_check", sql`${table.sequence} > 0`),
    check(
      "flow_run_events_node_id_length_check",
      sql`${table.nodeId} is null or length(trim(${table.nodeId})) between 1 and 160`
    ),
    check("flow_run_events_summary_object_check", sql`jsonb_typeof(${table.summary}) = 'object'`),
    check(
      "flow_run_events_summary_schema_check",
      sql`${table.summary} ?& array[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[]
        and (
          (
            ${table.eventType} = 'token_advanced'
            and ${table.summary} ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[]
            and jsonb_typeof(${table.summary}->'sourceHandle') = 'string'
            and jsonb_typeof(${table.summary}->'selectedEdgeId') = 'string'
            and jsonb_typeof(${table.summary}->'targetNodeId') = 'string'
            and jsonb_typeof(${table.summary}->'targetNodeKind') = 'string'
            and ${table.summary} - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[] = '{}'::jsonb
          )
          or (
            ${table.eventType} <> 'token_advanced'
            and ${table.summary} - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
            ]::text[] = '{}'::jsonb
          )
        )
        and jsonb_typeof(${table.summary}->'schemaVersion') = 'string'
        and jsonb_typeof(${table.summary}->'outcome') = 'string'
        and jsonb_typeof(${table.summary}->'nodeKind') = 'string'
        and jsonb_typeof(${table.summary}->'reasonCode') = 'string'
        and jsonb_typeof(${table.summary}->'resultCode') = 'string'
        and ${table.summary}->>'schemaVersion' = 'flow-runtime-trace.v1'
        and ${table.summary}->>'nodeKind' in ${sql.raw(
          formatFlowSqlValues(flowExecutableNodeKindV2Values)
        )}
        and length(${table.summary}->>'resultCode') between 1 and 160
        and ${table.summary}->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        and (
          (
            ${table.eventType} = 'token_advanced'
            and ${table.nodeId} is not null
            and ${table.attemptId} is not null
            and ${table.commandId} is null
            and ${table.summary}->>'outcome' = 'advanced'
            and ${table.summary}->>'reasonCode' = 'FLOW_EDGE_SELECTED'
            and ${table.summary}->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and ${table.summary}->>'sourceHandle' in ${sql.raw(
              formatFlowSqlValues(flowSourceHandleV2Values)
            )}
            and ${table.summary}->>'targetNodeKind' in ${sql.raw(
              formatFlowSqlValues(flowExecutableNodeKindV2Values)
            )}
            and length(${table.summary}->>'selectedEdgeId') between 1 and 160
            and ${table.summary}->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and length(${table.summary}->>'targetNodeId') between 1 and 160
            and ${table.summary}->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
          )
          or
          (
            ${table.eventType} = 'run_completed'
            and ${table.attemptId} is not null
            and ${table.commandId} is null
            and ${table.summary}->>'nodeKind' = 'completed'
            and ${table.summary}->>'outcome' = 'terminal'
            and ${table.summary}->>'reasonCode' = 'FLOW_GOAL_REACHED'
          )
          or (
            ${table.eventType} = 'token_lease_expired'
            and ${table.attemptId} is not null
            and ${table.commandId} is null
            and ${table.summary}->>'outcome' = 'lease_expired'
            and ${table.summary}->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
            and ${table.summary}->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          )
          or (
            ${table.eventType} = 'run_canceled'
            and ${table.commandId} is not null
            and ${table.summary}->>'outcome' = 'canceled'
            and ${table.summary}->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
            and ${table.summary}->>'resultCode' = 'FLOW_RUN_CANCELED'
          )
          or (
            ${table.eventType} = 'token_retry_scheduled'
            and ${table.attemptId} is not null
            and ${table.commandId} is null
            and ${table.summary}->>'outcome' = 'retry_scheduled'
            and ${table.summary}->>'reasonCode' in ${sql.raw(
              formatFlowSqlValues(flowExecutionRetryableFailureReasonCodeValues)
            )}
            and ${table.summary}->>'resultCode' = 'FLOW_EXECUTION_RETRY_SCHEDULED'
          )
          or (
            ${table.eventType} = 'run_failed'
            and ${table.commandId} is null
            and ${table.summary}->>'outcome' = 'failed'
            and (
              (
                ${table.summary}->>'reasonCode' in ${sql.raw(
                  formatFlowSqlValues(flowExecutionPermanentFailureReasonCodeValues)
                )}
                and ${table.summary}->>'resultCode' = 'FLOW_EXECUTION_FAILED_TERMINAL'
              )
              or (
                ${table.summary}->>'reasonCode' in ${sql.raw(
                  formatFlowSqlValues([
                    ...flowExecutionRetryableFailureReasonCodeValues,
                    "FLOW_TOKEN_LEASE_EXPIRED"
                  ])
                )}
                and ${table.summary}->>'resultCode' = 'FLOW_EXECUTION_RETRY_EXHAUSTED'
              )
            )
          )
        )`
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
    index("flow_step_runs_owner_run_created_idx").on(
      table.ownerUserId,
      table.flowRunId,
      table.createdAt
    ),
    check(
      "flow_step_runs_status_check",
      sql`${table.status} in ${sql.raw(formatFlowSqlValues(flowStepRunStatusValues))}`
    ),
    check(
      "flow_step_runs_node_id_length_check",
      sql`length(trim(${table.nodeId})) between 1 and 160`
    ),
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
    index("flow_approvals_owner_status_created_idx").on(
      table.ownerUserId,
      table.status,
      table.createdAt
    ),
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
    check(
      "flow_approvals_preview_length_check",
      sql`length(trim(${table.preview})) between 1 and 1000`
    ),
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
      foreignColumns: [flowRuns.id, flowRuns.flowId, flowRuns.runtimeEventId, flowRuns.ownerUserId],
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
