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
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { calculationInterpretations } from "../calculations/calculation-interpretations.schema";
import { bookingLifecycleEvents } from "../scheduling/booking-lifecycle-events.schema";
import { flowActivationEpochs } from "./flow-enrollment-control.schema";
import { flowVersions } from "./flow-versions.schema";
import { flowRuntimeCommands } from "./flow-runtime-commands.schema";
import { flowRuntimeRolloutPolicyVersions } from "./flow-runtime-control.schema";
import { flows } from "./flows.schema";
import {
  flowApprovalKindValues,
  flowApprovalStatusValues,
  flowDeliveryAttemptStatusValues,
  flowEnrollmentPolicyKeyValues,
  flowExecutionAuthorityBasisValues,
  flowExecutionAttemptOutcomeValues,
  flowExecutionTokenStateValues,
  flowRunEventTypeValues,
  flowRunStatusValues,
  flowRunSubjectTypeValues,
  flowRuntimeEventClassificationValues,
  flowRuntimeEventIngestionOutcomeValues,
  flowRuntimeEventKindValues,
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
    eventKind: text("event_kind"),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    occurrenceKey: text("occurrence_key"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    payloadSchemaVersion: integer("payload_schema_version"),
    payloadDigest: varchar("payload_digest", { length: 71 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    classification: text("classification"),
    redactionVersion: integer("redaction_version"),
    retentionPolicyId: text("retention_policy_id"),
    ingestionOutcome: text("ingestion_outcome"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("flow_runtime_events_id_owner_unique").on(table.id, table.ownerUserId),
    uniqueIndex("flow_runtime_events_owner_dedupe_unique").on(table.ownerUserId, table.dedupeKey),
    uniqueIndex("flow_runtime_events_source_identity_unique")
      .on(table.source, table.sourceEventId)
      .where(sql`${table.eventKind} is not null`),
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
    ),
    check(
      "flow_runtime_events_payload_digest_check",
      sql`${table.payloadDigest} is null or ${table.payloadDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "flow_runtime_events_normalized_shape_check",
      sql`(
        ${table.eventKind} is null
        and ${table.occurrenceKey} is null
        and ${table.payloadSchemaVersion} is null
        and ${table.payloadDigest} is null
        and ${table.classification} is null
        and ${table.redactionVersion} is null
        and ${table.retentionPolicyId} is null
        and ${table.ingestionOutcome} is null
        and ${table.processedAt} is null
      ) or (
        ${table.eventKind} in ${sql.raw(formatFlowSqlValues(flowRuntimeEventKindValues))}
        and length(trim(${table.occurrenceKey})) between 1 and 180
        and ${table.payloadSchemaVersion} = 1
        and ${table.payloadDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.classification} in ${sql.raw(
          formatFlowSqlValues(flowRuntimeEventClassificationValues)
        )}
        and ${table.redactionVersion} = 1
        and length(trim(${table.retentionPolicyId})) between 1 and 180
        and ${table.ingestionOutcome} in ${sql.raw(
          formatFlowSqlValues(flowRuntimeEventIngestionOutcomeValues)
        )}
        and ${table.processedAt} is not null
      )`
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
    activationEpochId: uuid("activation_epoch_id"),
    triggerNodeId: text("trigger_node_id"),
    occurrenceKey: text("occurrence_key"),
    enrollmentPolicyKey: text("enrollment_policy_key"),
    enrollmentPolicyRevision: integer("enrollment_policy_revision"),
    executionAuthorityBasis: text("execution_authority_basis"),
    executionAuthorityRefId: text("execution_authority_ref_id"),
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
    foreignKey({
      columns: [table.activationEpochId, table.flowId, table.flowVersionId],
      foreignColumns: [
        flowActivationEpochs.id,
        flowActivationEpochs.flowId,
        flowActivationEpochs.flowVersionId
      ],
      name: "flow_runs_activation_epoch_fk"
    }).onDelete("restrict"),
    uniqueIndex("flow_runs_owner_stable_enrollment_unique")
      .on(
        table.ownerUserId,
        table.flowId,
        table.triggerNodeId,
        table.enrollmentPolicyKey,
        table.occurrenceKey
      )
      .where(sql`${table.activationEpochId} is not null`),
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
    ),
    check(
      "flow_runs_enrollment_shape_check",
      sql`(
        ${table.activationEpochId} is null
        and ${table.triggerNodeId} is null
        and ${table.occurrenceKey} is null
        and ${table.enrollmentPolicyKey} is null
        and ${table.enrollmentPolicyRevision} is null
        and ${table.executionAuthorityBasis} is null
        and ${table.executionAuthorityRefId} is null
      ) or (
        ${table.activationEpochId} is not null
        and length(trim(${table.triggerNodeId})) between 1 and 160
        and ${table.triggerNodeId} ~ '^[a-z0-9][a-z0-9_-]*$'
        and length(trim(${table.occurrenceKey})) between 1 and 180
        and ${table.enrollmentPolicyKey} in ${sql.raw(
          formatFlowSqlValues(flowEnrollmentPolicyKeyValues)
        )}
        and ${table.enrollmentPolicyRevision} = 1
        and ${table.executionAuthorityBasis} in ${sql.raw(
          formatFlowSqlValues(flowExecutionAuthorityBasisValues)
        )}
        and length(trim(${table.executionAuthorityRefId})) between 1 and 180
      )`
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
    claimControlPolicyRevision: integer("claim_control_policy_revision"),
    claimPolicyDigest: varchar("claim_policy_digest", { length: 71 }),
    claimWorkerSessionId: uuid("claim_worker_session_id"),
    claimWorkerRegistrationDigest: varchar("claim_worker_registration_digest", {
      length: 71
    }),
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
    foreignKey({
      columns: [table.claimControlPolicyRevision],
      foreignColumns: [flowRuntimeRolloutPolicyVersions.revision],
      name: "flow_execution_tokens_claim_policy_fk"
    }).onDelete("restrict"),
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
      "flow_execution_tokens_claim_authority_check",
      sql`(
        ${table.claimControlPolicyRevision} is null
        and ${table.claimPolicyDigest} is null
        and ${table.claimWorkerSessionId} is null
        and ${table.claimWorkerRegistrationDigest} is null
      ) or (
        ${table.claimControlPolicyRevision} > 0
        and ${table.claimPolicyDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.claimWorkerSessionId} is not null
        and ${table.claimWorkerRegistrationDigest} ~ '^sha256:[a-f0-9]{64}$'
        and (${table.state} <> 'claimed'
          or ${table.leaseOwner} = ${table.claimWorkerSessionId}::text)
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
      sql`${table.state} <> 'completed' or ${table.nodeKind} in ('completed', 'suppressed', 'failed')`
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
    controlPolicyRevision: integer("control_policy_revision"),
    policyDigest: varchar("policy_digest", { length: 71 }),
    workerSessionId: uuid("worker_session_id"),
    workerRegistrationDigest: varchar("worker_registration_digest", { length: 71 }),
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
    foreignKey({
      columns: [table.controlPolicyRevision],
      foreignColumns: [flowRuntimeRolloutPolicyVersions.revision],
      name: "flow_execution_attempts_claim_policy_fk"
    }).onDelete("restrict"),
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
      "flow_execution_attempts_claim_authority_check",
      sql`(
        ${table.controlPolicyRevision} is null
        and ${table.policyDigest} is null
        and ${table.workerSessionId} is null
        and ${table.workerRegistrationDigest} is null
      ) or (
        ${table.controlPolicyRevision} > 0
        and ${table.policyDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.workerSessionId} is not null
        and ${table.workerRegistrationDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.leaseOwner} = ${table.workerSessionId}::text
      )`
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
            and (
              ${table.traceSummary}->>'reasonCode' = 'FLOW_EDGE_SELECTED'
              or (
                ${table.traceSummary}->>'nodeKind' = 'send_message'
                and ${table.traceSummary}->>'reasonCode' = 'FLOW_MESSAGING_DELIVERY_COMPLETED'
                and ${table.traceSummary}->>'sourceHandle' in ('success', 'error')
              )
            )
          )
          or
          (
            ${table.outcome} = 'waiting'
            and ${table.traceSummary}->>'nodeKind' = 'astrologer_work_item'
            and ${table.traceSummary}->>'outcome' = 'waiting'
            and ${table.traceSummary}->>'reasonCode' = 'FLOW_WORK_ITEM_CREATED'
            and ${table.traceSummary}->>'resultCode' = 'FLOW_WAITING_WORK_ITEM'
          )
          or
          (
            ${table.outcome} = 'waiting'
            and ${table.traceSummary}->>'nodeKind' = 'natal_chart_request'
            and ${table.traceSummary}->>'outcome' = 'waiting'
            and ${table.traceSummary}->>'reasonCode' = 'FLOW_CHART_CALCULATION_REQUESTED'
            and ${table.traceSummary}->>'resultCode' = 'FLOW_WAITING_SIGNAL'
          )
          or
          (
            ${table.outcome} = 'waiting'
            and ${table.traceSummary}->>'nodeKind' = 'send_message'
            and ${table.traceSummary}->>'outcome' = 'waiting'
            and ${table.traceSummary}->>'reasonCode' = 'FLOW_MESSAGING_DELIVERY_REQUESTED'
            and ${table.traceSummary}->>'resultCode' = 'FLOW_WAITING_EXTERNAL'
          )
          or
          (
            ${table.outcome} = 'waiting'
            and ${table.traceSummary}->>'nodeKind' in ('astrologer_approval', 'natal_chart_ai_draft')
            and ${table.traceSummary}->>'outcome' = 'waiting'
            and ${table.traceSummary}->>'reasonCode' = 'FLOW_APPROVAL_CREATED'
            and ${table.traceSummary}->>'resultCode' = 'FLOW_WAITING_APPROVAL'
          )
          or
          (
            ${table.outcome} = 'completed'
            and ${table.traceSummary}->>'nodeKind' in ('completed', 'suppressed', 'failed')
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
            and ${table.traceSummary}->>'reasonCode' in (
              'FLOW_RUN_CANCELED_BY_OWNER', 'FLOW_BOOKING_CANCELED'
            )
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
    bookingLifecycleEventId: uuid("booking_lifecycle_event_id"),
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
        flowRuntimeCommands.flowRunId,
        flowRuntimeCommands.ownerUserId
      ],
      name: "flow_run_events_command_run_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.bookingLifecycleEventId, table.ownerUserId],
      foreignColumns: [bookingLifecycleEvents.id, bookingLifecycleEvents.ownerUserId],
      name: "flow_run_events_booking_lifecycle_event_owner_fk"
    }).onDelete("restrict"),
    unique("flow_run_events_id_run_owner_unique").on(table.id, table.flowRunId, table.ownerUserId),
    uniqueIndex("flow_run_events_run_sequence_unique").on(table.flowRunId, table.sequence),
    uniqueIndex("flow_run_events_attempt_unique")
      .on(table.attemptId)
      .where(sql`${table.attemptId} is not null`),
    uniqueIndex("flow_run_events_command_unique")
      .on(table.commandId)
      .where(sql`${table.commandId} is not null`),
    uniqueIndex("flow_run_events_booking_lifecycle_run_unique")
      .on(table.bookingLifecycleEventId, table.flowRunId)
      .where(sql`${table.bookingLifecycleEventId} is not null`),
    index("flow_run_events_owner_occurred_idx").on(table.ownerUserId, table.occurredAt, table.id),
    check(
      "flow_run_events_type_check",
      sql`${table.eventType} in ${sql.raw(formatFlowSqlValues(flowRunEventTypeValues))}`
    ),
    check("flow_run_events_sequence_check", sql`${table.sequence} > 0`),
    check(
      "flow_run_events_booking_lifecycle_provenance_check",
      sql`(
        ${table.eventType} = 'run_canceled'
        and (${table.commandId} is null) <> (${table.bookingLifecycleEventId} is null)
      ) or (
        ${table.eventType} = 'booking_rescheduled'
        and ${table.attemptId} is null
        and ${table.commandId} is null
        and ${table.bookingLifecycleEventId} is not null
      ) or (
        ${table.eventType} not in ('run_canceled', 'booking_rescheduled')
        and ${table.bookingLifecycleEventId} is null
      )`
    ),
    check(
      "flow_run_events_node_id_length_check",
      sql`${table.nodeId} is null or length(trim(${table.nodeId})) between 1 and 160`
    ),
    check("flow_run_events_summary_object_check", sql`jsonb_typeof(${table.summary}) = 'object'`),
    check(
      "flow_run_events_summary_schema_check",
      sql`(
        ${table.eventType} = 'run_enrolled'
        and ${table.nodeId} is not null
        and ${table.attemptId} is null
        and ${table.commandId} is null
        and ${table.summary} ?& array[
          'schemaVersion', 'outcome', 'reasonCode', 'resultCode', 'eventKind',
          'activationEpochId', 'triggerNodeId', 'targetNodeId', 'targetNodeKind',
          'enrollmentPolicyKey', 'occurrenceKey'
        ]::text[]
        and ${table.summary} - array[
          'schemaVersion', 'outcome', 'reasonCode', 'resultCode', 'eventKind',
          'activationEpochId', 'triggerNodeId', 'targetNodeId', 'targetNodeKind',
          'enrollmentPolicyKey', 'occurrenceKey'
        ]::text[] = '{}'::jsonb
        and jsonb_typeof(${table.summary}->'schemaVersion') = 'string'
        and jsonb_typeof(${table.summary}->'outcome') = 'string'
        and jsonb_typeof(${table.summary}->'reasonCode') = 'string'
        and jsonb_typeof(${table.summary}->'resultCode') = 'string'
        and jsonb_typeof(${table.summary}->'eventKind') = 'string'
        and jsonb_typeof(${table.summary}->'activationEpochId') = 'string'
        and jsonb_typeof(${table.summary}->'triggerNodeId') = 'string'
        and jsonb_typeof(${table.summary}->'targetNodeId') = 'string'
        and jsonb_typeof(${table.summary}->'targetNodeKind') = 'string'
        and jsonb_typeof(${table.summary}->'enrollmentPolicyKey') = 'string'
        and jsonb_typeof(${table.summary}->'occurrenceKey') = 'string'
        and ${table.summary}->>'schemaVersion' = 'flow-enrollment-trace.v1'
        and ${table.summary}->>'outcome' = 'enrolled'
        and ${table.summary}->>'reasonCode' = 'FLOW_TRIGGER_MATCHED'
        and ${table.summary}->>'resultCode' = 'FLOW_RUN_ENROLLED'
        and ${table.summary}->>'eventKind' in ${sql.raw(
          formatFlowSqlValues(flowRuntimeEventKindValues)
        )}
        and ${table.summary}->>'triggerNodeId' = ${table.nodeId}
        and length(${table.summary}->>'triggerNodeId') between 1 and 160
        and ${table.summary}->>'triggerNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        and length(${table.summary}->>'targetNodeId') between 1 and 160
        and ${table.summary}->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        and ${table.summary}->>'targetNodeKind' in ${sql.raw(
          formatFlowSqlValues(flowExecutableNodeKindV2Values)
        )}
        and ${table.summary}->>'enrollmentPolicyKey' in ${sql.raw(
          formatFlowSqlValues(flowEnrollmentPolicyKeyValues)
        )}
        and length(${table.summary}->>'occurrenceKey') between 1 and 180
      ) or (
        ${table.eventType} <> 'run_enrolled'
        and ${table.summary} ?& array[
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
          ) or (
            ${table.eventType} = 'token_advanced'
            and ${table.summary} ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind',
              'sourceOutboxEventId', 'birthDataHistoryId', 'birthDataRevision',
              'workItemId', 'fromRevision', 'toRevision'
            ]::text[]
            and ${table.summary} - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind',
              'sourceOutboxEventId', 'birthDataHistoryId', 'birthDataRevision',
              'workItemId', 'fromRevision', 'toRevision'
            ]::text[] = '{}'::jsonb
            and jsonb_typeof(${table.summary}->'sourceHandle') = 'string'
            and jsonb_typeof(${table.summary}->'selectedEdgeId') = 'string'
            and jsonb_typeof(${table.summary}->'targetNodeId') = 'string'
            and jsonb_typeof(${table.summary}->'targetNodeKind') = 'string'
            and jsonb_typeof(${table.summary}->'sourceOutboxEventId') = 'string'
            and jsonb_typeof(${table.summary}->'birthDataHistoryId') = 'string'
            and jsonb_typeof(${table.summary}->'birthDataRevision') = 'number'
            and jsonb_typeof(${table.summary}->'workItemId') = 'string'
            and jsonb_typeof(${table.summary}->'fromRevision') = 'number'
            and jsonb_typeof(${table.summary}->'toRevision') = 'number'
            and ${table.summary}->>'sourceOutboxEventId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and ${table.summary}->>'birthDataHistoryId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and ${table.summary}->>'workItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and scale((${table.summary}->>'birthDataRevision')::numeric) = 0
            and (${table.summary}->>'birthDataRevision')::numeric between 1 and 2147483647
            and scale((${table.summary}->>'fromRevision')::numeric) = 0
            and scale((${table.summary}->>'toRevision')::numeric) = 0
            and (${table.summary}->>'fromRevision')::numeric between 1 and 2147483646
            and (${table.summary}->>'toRevision')::numeric =
              (${table.summary}->>'fromRevision')::numeric + 1
          )
          or (
            ${table.eventType} = 'token_signaled'
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
            ${table.eventType} = 'work_item_available'
            and ${table.summary} ?& array[
              'workItemId', 'fromRevision', 'toRevision', 'scheduledFor'
            ]::text[]
            and ${table.summary} - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'workItemId', 'fromRevision', 'toRevision', 'scheduledFor'
            ]::text[] = '{}'::jsonb
            and jsonb_typeof(${table.summary}->'workItemId') = 'string'
            and jsonb_typeof(${table.summary}->'fromRevision') = 'number'
            and jsonb_typeof(${table.summary}->'toRevision') = 'number'
            and jsonb_typeof(${table.summary}->'scheduledFor') = 'string'
            and ${table.summary}->>'workItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and scale((${table.summary}->>'fromRevision')::numeric) = 0
            and scale((${table.summary}->>'toRevision')::numeric) = 0
            and (${table.summary}->>'fromRevision')::numeric between 1 and 2147483646
            and (${table.summary}->>'toRevision')::numeric =
              (${table.summary}->>'fromRevision')::numeric + 1
            and length(${table.summary}->>'scheduledFor') between 20 and 35
          )
          or (
            ${table.eventType} = 'approval_expired'
            and ${table.summary} ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[]
            and ${table.summary} - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[] = '{}'::jsonb
            and jsonb_typeof(${table.summary}->'sourceHandle') = 'string'
            and jsonb_typeof(${table.summary}->'selectedEdgeId') = 'string'
            and jsonb_typeof(${table.summary}->'targetNodeId') = 'string'
            and jsonb_typeof(${table.summary}->'targetNodeKind') = 'string'
          )
          or (
            ${table.eventType} = 'booking_rescheduled'
            and ${table.summary} ?& array[
              'bookingId', 'bookingLifecycleRevision',
              'previousStartAt', 'previousEndAt', 'previousTimeZone',
              'currentStartAt', 'currentEndAt', 'currentTimeZone',
              'workItemId', 'fromRevision', 'toRevision',
              'previousWorkItemStatus', 'currentWorkItemStatus',
              'previousDueAt', 'currentDueAt',
              'previousSnoozedUntil', 'currentSnoozedUntil', 'snoozeAdjustment'
            ]::text[]
            and ${table.summary} - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'bookingId', 'bookingLifecycleRevision',
              'previousStartAt', 'previousEndAt', 'previousTimeZone',
              'currentStartAt', 'currentEndAt', 'currentTimeZone',
              'workItemId', 'fromRevision', 'toRevision',
              'previousWorkItemStatus', 'currentWorkItemStatus',
              'previousDueAt', 'currentDueAt',
              'previousSnoozedUntil', 'currentSnoozedUntil', 'snoozeAdjustment'
            ]::text[] = '{}'::jsonb
            and jsonb_typeof(${table.summary}->'bookingId') = 'string'
            and ${table.summary}->>'bookingId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and jsonb_typeof(${table.summary}->'bookingLifecycleRevision') = 'number'
            and scale((${table.summary}->>'bookingLifecycleRevision')::numeric) = 0
            and (${table.summary}->>'bookingLifecycleRevision')::numeric
                  between 1 and 2147483647
            and jsonb_typeof(${table.summary}->'previousStartAt') = 'string'
            and jsonb_typeof(${table.summary}->'previousEndAt') = 'string'
            and jsonb_typeof(${table.summary}->'previousTimeZone') = 'string'
            and jsonb_typeof(${table.summary}->'currentStartAt') = 'string'
            and jsonb_typeof(${table.summary}->'currentEndAt') = 'string'
            and jsonb_typeof(${table.summary}->'currentTimeZone') = 'string'
            and (${table.summary}->>'previousStartAt')::timestamptz <
                  (${table.summary}->>'previousEndAt')::timestamptz
            and (${table.summary}->>'currentStartAt')::timestamptz <
                  (${table.summary}->>'currentEndAt')::timestamptz
            and length(trim(${table.summary}->>'previousTimeZone')) between 1 and 120
            and length(trim(${table.summary}->>'currentTimeZone')) between 1 and 120
            and (
              (${table.summary}->>'previousStartAt')::timestamptz IS DISTINCT FROM
                (${table.summary}->>'currentStartAt')::timestamptz
              or (${table.summary}->>'previousEndAt')::timestamptz IS DISTINCT FROM
                (${table.summary}->>'currentEndAt')::timestamptz
              or ${table.summary}->>'previousTimeZone' IS DISTINCT FROM
                ${table.summary}->>'currentTimeZone'
            )
            and (
              (
                jsonb_typeof(${table.summary}->'workItemId') = 'null'
                and jsonb_typeof(${table.summary}->'fromRevision') = 'null'
                and jsonb_typeof(${table.summary}->'toRevision') = 'null'
                and jsonb_typeof(${table.summary}->'previousWorkItemStatus') = 'null'
                and jsonb_typeof(${table.summary}->'currentWorkItemStatus') = 'null'
                and jsonb_typeof(${table.summary}->'previousDueAt') = 'null'
                and jsonb_typeof(${table.summary}->'currentDueAt') = 'null'
                and jsonb_typeof(${table.summary}->'previousSnoozedUntil') = 'null'
                and jsonb_typeof(${table.summary}->'currentSnoozedUntil') = 'null'
                and jsonb_typeof(${table.summary}->'snoozeAdjustment') = 'null'
              ) or (
                jsonb_typeof(${table.summary}->'workItemId') = 'string'
                and ${table.summary}->>'workItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                and jsonb_typeof(${table.summary}->'fromRevision') = 'number'
                and jsonb_typeof(${table.summary}->'toRevision') = 'number'
                and scale((${table.summary}->>'fromRevision')::numeric) = 0
                and scale((${table.summary}->>'toRevision')::numeric) = 0
                and (${table.summary}->>'fromRevision')::numeric between 1 and 2147483646
                and (${table.summary}->>'toRevision')::numeric =
                      (${table.summary}->>'fromRevision')::numeric + 1
                and jsonb_typeof(${table.summary}->'previousWorkItemStatus') = 'string'
                and jsonb_typeof(${table.summary}->'currentWorkItemStatus') = 'string'
                and ${table.summary}->>'previousWorkItemStatus' in (
                  'pending', 'in_progress', 'snoozed'
                )
                and ${table.summary}->>'currentWorkItemStatus' in (
                  'pending', 'in_progress', 'snoozed'
                )
                and jsonb_typeof(${table.summary}->'previousDueAt') = 'string'
                and jsonb_typeof(${table.summary}->'currentDueAt') = 'string'
                and jsonb_typeof(${table.summary}->'previousSnoozedUntil') in ('null', 'string')
                and jsonb_typeof(${table.summary}->'currentSnoozedUntil') in ('null', 'string')
                and jsonb_typeof(${table.summary}->'snoozeAdjustment') = 'string'
                and ${table.summary}->>'snoozeAdjustment' in ('unchanged', 'shortened', 'woken')
                and (
                  (${table.summary}->>'previousWorkItemStatus' = 'snoozed') =
                    (jsonb_typeof(${table.summary}->'previousSnoozedUntil') = 'string')
                )
                and (
                  (${table.summary}->>'currentWorkItemStatus' = 'snoozed') =
                    (jsonb_typeof(${table.summary}->'currentSnoozedUntil') = 'string')
                )
                and (
                  (
                    ${table.summary}->>'snoozeAdjustment' = 'unchanged'
                    and ${table.summary}->>'previousWorkItemStatus' =
                          ${table.summary}->>'currentWorkItemStatus'
                    and ${table.summary}->'previousSnoozedUntil' =
                          ${table.summary}->'currentSnoozedUntil'
                    and (
                      ${table.summary}->>'currentWorkItemStatus' <> 'snoozed'
                      or (${table.summary}->>'currentDueAt')::timestamptz >=
                           (${table.summary}->>'currentSnoozedUntil')::timestamptz
                    )
                  ) or (
                    ${table.summary}->>'snoozeAdjustment' = 'shortened'
                    and ${table.summary}->>'previousWorkItemStatus' = 'snoozed'
                    and ${table.summary}->>'currentWorkItemStatus' = 'snoozed'
                    and (${table.summary}->>'currentSnoozedUntil')::timestamptz =
                          (${table.summary}->>'currentDueAt')::timestamptz
                    and (${table.summary}->>'currentSnoozedUntil')::timestamptz <
                          (${table.summary}->>'previousSnoozedUntil')::timestamptz
                  ) or (
                    ${table.summary}->>'snoozeAdjustment' = 'woken'
                    and ${table.summary}->>'previousWorkItemStatus' = 'snoozed'
                    and ${table.summary}->>'currentWorkItemStatus' = 'pending'
                    and jsonb_typeof(${table.summary}->'previousSnoozedUntil') = 'string'
                    and jsonb_typeof(${table.summary}->'currentSnoozedUntil') = 'null'
                  )
                )
              )
            )
          )
          or (
            ${table.eventType} not in (
              'token_advanced', 'token_signaled', 'work_item_available', 'approval_expired',
              'booking_rescheduled'
            )
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
            and ${table.summary}->>'outcome' = 'advanced'
            and ${table.summary}->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and ${table.summary}->>'targetNodeKind' in ${sql.raw(
              formatFlowSqlValues(flowExecutableNodeKindV2Values)
            )}
            and length(${table.summary}->>'selectedEdgeId') between 1 and 160
            and ${table.summary}->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and length(${table.summary}->>'targetNodeId') between 1 and 160
            and ${table.summary}->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and (
              (
                ${table.attemptId} is not null
                and ${table.commandId} is null
                and ${table.summary}->>'reasonCode' = 'FLOW_EDGE_SELECTED'
                and ${table.summary}->>'sourceHandle' in ${sql.raw(
                  formatFlowSqlValues(flowSourceHandleV2Values)
                )}
              ) or (
                ${table.attemptId} is null
                and ${table.commandId} is not null
                and ${table.summary}->>'nodeKind' = 'astrologer_work_item'
                and ${table.summary}->>'reasonCode' = 'FLOW_WORK_ITEM_COMPLETED'
                and ${table.summary}->>'sourceHandle' = 'success'
              ) or (
                ${table.attemptId} is null
                and ${table.commandId} is not null
                and ${table.summary}->>'nodeKind' in ('astrologer_approval', 'natal_chart_ai_draft')
                and ${table.summary}->>'reasonCode' = 'FLOW_APPROVAL_DECIDED'
                and ${table.summary}->>'sourceHandle' in ('approved', 'rejected')
              ) or (
                ${table.attemptId} is null
                and ${table.commandId} is null
                and ${table.summary}->>'nodeKind' = 'astrologer_work_item'
                and ${table.summary}->>'reasonCode' = 'FLOW_BIRTH_PROFILE_RECHECK_READY'
                and ${table.summary}->>'sourceHandle' = 'success'
              )
            )
          )
          or
          (
            ${table.eventType} = 'token_signaled'
            and ${table.nodeId} is not null
            and ${table.attemptId} is null
            and ${table.commandId} is null
            and ${table.summary}->>'outcome' = 'advanced'
            and ${table.summary}->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and ${table.summary}->>'targetNodeKind' in ${sql.raw(
              formatFlowSqlValues(flowExecutableNodeKindV2Values)
            )}
            and length(${table.summary}->>'selectedEdgeId') between 1 and 160
            and ${table.summary}->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and length(${table.summary}->>'targetNodeId') between 1 and 160
            and ${table.summary}->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and (
              (
                ${table.summary}->>'nodeKind' = 'natal_chart_request'
                and ${table.summary}->>'reasonCode' = 'FLOW_CHART_CALCULATION_COMPLETED'
                and ${table.summary}->>'sourceHandle' = 'next'
              ) or (
                ${table.summary}->>'nodeKind' = 'send_message'
                and ${table.summary}->>'reasonCode' = 'FLOW_MESSAGING_DELIVERY_COMPLETED'
                and ${table.summary}->>'sourceHandle' in ('success', 'error')
              )
            )
          )
          or
          (
            ${table.eventType} = 'work_item_available'
            and ${table.nodeId} is not null
            and ${table.attemptId} is null
            and ${table.commandId} is null
            and ${table.summary}->>'nodeKind' = 'astrologer_work_item'
            and ${table.summary}->>'outcome' = 'available'
            and ${table.summary}->>'reasonCode' = 'FLOW_WORK_ITEM_SNOOZE_ELAPSED'
            and ${table.summary}->>'resultCode' = 'FLOW_WORK_ITEM_AVAILABLE'
          )
          or
          (
            ${table.eventType} = 'approval_available'
            and ${table.nodeId} is not null
            and ${table.attemptId} is null
            and ${table.commandId} is null
            and ${table.summary}->>'nodeKind' in ('astrologer_approval', 'natal_chart_ai_draft')
            and ${table.summary}->>'outcome' = 'available'
            and ${table.summary}->>'reasonCode' = 'FLOW_APPROVAL_SNOOZE_ELAPSED'
            and ${table.summary}->>'resultCode' = 'FLOW_APPROVAL_AVAILABLE'
          )
          or
          (
            ${table.eventType} = 'approval_expired'
            and ${table.nodeId} is not null
            and ${table.attemptId} is null
            and ${table.commandId} is null
            and ${table.summary}->>'nodeKind' in ('astrologer_approval', 'natal_chart_ai_draft')
            and ${table.summary}->>'outcome' = 'advanced'
            and ${table.summary}->>'reasonCode' = 'FLOW_APPROVAL_EXPIRED'
            and ${table.summary}->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and ${table.summary}->>'sourceHandle' = 'timeout'
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
            ${table.eventType} = 'booking_rescheduled'
            and ${table.nodeId} is not null
            and ${table.attemptId} is null
            and ${table.commandId} is null
            and ${table.bookingLifecycleEventId} is not null
            and ${table.summary}->>'outcome' = 'rescheduled'
            and ${table.summary}->>'reasonCode' = 'FLOW_BOOKING_RESCHEDULED'
            and ${table.summary}->>'resultCode' = 'FLOW_BOOKING_SCHEDULE_UPDATED'
          )
          or
          (
            ${table.eventType} = 'token_waiting'
            and ${table.nodeId} is not null
            and ${table.attemptId} is not null
            and ${table.commandId} is null
            and ${table.summary}->>'outcome' = 'waiting'
            and (
              (
                ${table.summary}->>'nodeKind' = 'astrologer_work_item'
                and ${table.summary}->>'reasonCode' = 'FLOW_WORK_ITEM_CREATED'
                and ${table.summary}->>'resultCode' = 'FLOW_WAITING_WORK_ITEM'
              ) or (
                ${table.summary}->>'nodeKind' = 'natal_chart_request'
                and ${table.summary}->>'reasonCode' = 'FLOW_CHART_CALCULATION_REQUESTED'
                and ${table.summary}->>'resultCode' = 'FLOW_WAITING_SIGNAL'
              ) or (
                ${table.summary}->>'nodeKind' = 'send_message'
                and ${table.summary}->>'reasonCode' = 'FLOW_MESSAGING_DELIVERY_REQUESTED'
                and ${table.summary}->>'resultCode' = 'FLOW_WAITING_EXTERNAL'
              ) or (
                ${table.summary}->>'nodeKind' in ('astrologer_approval', 'natal_chart_ai_draft')
                and ${table.summary}->>'reasonCode' = 'FLOW_APPROVAL_CREATED'
                and ${table.summary}->>'resultCode' = 'FLOW_WAITING_APPROVAL'
              )
            )
          )
          or
          (
            ${table.eventType} = 'run_completed'
            and ${table.attemptId} is not null
            and ${table.commandId} is null
            and ${table.summary}->>'nodeKind' in ('completed', 'suppressed', 'failed')
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
            and ${table.summary}->>'outcome' = 'canceled'
            and ${table.summary}->>'resultCode' = 'FLOW_RUN_CANCELED'
            and (
              (
                ${table.commandId} is not null
                and ${table.bookingLifecycleEventId} is null
                and ${table.summary}->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
              ) or (
                ${table.commandId} is null
                and ${table.bookingLifecycleEventId} is not null
                and ${table.summary}->>'reasonCode' = 'FLOW_BOOKING_CANCELED'
              )
            )
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
    executionTokenId: uuid("execution_token_id"),
    nodeActivationSequence: bigint("node_activation_sequence", { mode: "bigint" }),
    status: text("status").notNull().default("pending"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    preview: text("preview").notNull(),
    aiCalculationId: uuid("ai_calculation_id"),
    aiInterpretationId: uuid("ai_interpretation_id"),
    aiSourceChecksum: varchar("ai_source_checksum", { length: 71 }),
    aiContentChecksum: varchar("ai_content_checksum", { length: 71 }),
    aiOutputText: text("ai_output_text"),
    decisionNote: text("decision_note"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revision: integer("revision").notNull().default(1),
    lastCommandId: uuid("last_command_id"),
    lastRunEventId: uuid("last_run_event_id"),
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
    foreignKey({
      columns: [table.executionTokenId, table.flowRunId, table.ownerUserId],
      foreignColumns: [
        flowExecutionTokens.id,
        flowExecutionTokens.flowRunId,
        flowExecutionTokens.ownerUserId
      ],
      name: "flow_approvals_token_run_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.lastCommandId, table.flowRunId, table.ownerUserId],
      foreignColumns: [
        flowRuntimeCommands.id,
        flowRuntimeCommands.flowRunId,
        flowRuntimeCommands.ownerUserId
      ],
      name: "flow_approvals_last_command_run_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.lastRunEventId, table.flowRunId, table.ownerUserId],
      foreignColumns: [flowRunEvents.id, flowRunEvents.flowRunId, flowRunEvents.ownerUserId],
      name: "flow_approvals_last_run_event_run_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.aiInterpretationId, table.aiCalculationId],
      foreignColumns: [calculationInterpretations.id, calculationInterpretations.calculationId],
      name: "flow_approvals_ai_interpretation_calculation_fk"
    }).onDelete("restrict"),
    uniqueIndex("flow_approvals_token_activation_unique").on(
      table.executionTokenId,
      table.nodeActivationSequence
    ),
    uniqueIndex("flow_approvals_ai_interpretation_unique").on(table.aiInterpretationId),
    index("flow_approvals_owner_status_created_idx").on(
      table.ownerUserId,
      table.status,
      table.createdAt
    ),
    index("flow_approvals_pending_expiry_idx").on(
      table.status,
      table.expiresAt,
      table.createdAt,
      table.id
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
      "flow_approvals_ai_artifact_provenance_check",
      sql`(
        ${table.aiCalculationId} is null
        and ${table.aiInterpretationId} is null
        and ${table.aiSourceChecksum} is null
        and ${table.aiContentChecksum} is null
        and ${table.aiOutputText} is null
      ) or (
        ${table.aiCalculationId} is not null
        and ${table.aiInterpretationId} is not null
        and ${table.aiSourceChecksum} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.aiContentChecksum} ~ '^sha256:[a-f0-9]{64}$'
        and length(${table.aiOutputText}) between 1 and 26000
      )`
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
    ),
    check("flow_approvals_revision_check", sql`${table.revision} > 0`),
    check(
      "flow_approvals_runtime_provenance_check",
      sql`(
        ${table.executionTokenId} is null
        and ${table.nodeActivationSequence} is null
        and ${table.expiresAt} is null
        and ${table.revision} = 1
        and ${table.lastCommandId} is null
        and ${table.lastRunEventId} is null
      ) or (
        ${table.executionTokenId} is not null
        and ${table.nodeActivationSequence} > 0
        and (
          (${table.revision} = 1
            and ${table.status} = 'pending'
            and ${table.lastCommandId} is null
            and ${table.lastRunEventId} is null)
          or (${table.revision} > 1
            and (${table.lastCommandId} is null) <> (${table.lastRunEventId} is null))
        )
      )`
    ),
    check(
      "flow_approvals_runtime_expiry_check",
      sql`${table.executionTokenId} is null or ${table.expiresAt} is null or ${table.expiresAt} >= ${table.createdAt}`
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

export const flowRunIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_run_enrollment_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_run_enrollment_guard$
BEGIN
  IF ROW(
    OLD.id, OLD.owner_user_id, OLD.flow_id, OLD.flow_version_id,
    OLD.runtime_event_id, OLD.activation_epoch_id, OLD.trigger_node_id,
    OLD.occurrence_key, OLD.enrollment_policy_key, OLD.enrollment_policy_revision,
    OLD.execution_authority_basis, OLD.execution_authority_ref_id,
    OLD.snapshot, OLD.created_at
  ) IS DISTINCT FROM ROW(
    NEW.id, NEW.owner_user_id, NEW.flow_id, NEW.flow_version_id,
    NEW.runtime_event_id, NEW.activation_epoch_id, NEW.trigger_node_id,
    NEW.occurrence_key, NEW.enrollment_policy_key, NEW.enrollment_policy_revision,
    NEW.execution_authority_basis, NEW.execution_authority_ref_id,
    NEW.snapshot, NEW.created_at
  ) THEN
    RAISE EXCEPTION 'Flow run enrollment identity and snapshot are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runs_enrollment_immutable';
  END IF;
  IF NEW.trace_sequence < OLD.trace_sequence OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Flow run trace and update time are monotonic'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runs_enrollment_immutable';
  END IF;
  RETURN NEW;
END;
$flow_run_enrollment_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_runs_enrollment_immutable"
BEFORE UPDATE ON flow_runs
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_run_enrollment_mutation();`;

export const flowRuntimeEventIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_runtime_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_runtime_event_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'flow runtime events are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runtime_events_immutable';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'flow runtime events are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runtime_events_immutable';
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE id = OLD.owner_user_id) THEN
    RAISE EXCEPTION 'flow runtime events are retained for the owner lifetime'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runtime_events_immutable';
  END IF;

  RETURN OLD;
END;
$flow_runtime_event_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_runtime_events_immutable"
BEFORE UPDATE OR DELETE ON flow_runtime_events
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_runtime_event_mutation();
--> statement-breakpoint
CREATE TRIGGER "flow_runtime_events_truncate_guard"
BEFORE TRUNCATE ON flow_runtime_events
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_flow_runtime_event_mutation();`;
