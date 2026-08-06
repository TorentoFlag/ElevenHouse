import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import { flowExecutionTokens, flowRuns } from "./flow-runtime.schema";
import {
  flowExecutionSignalOutcomeValues,
  flowExecutionSignalTypeValues,
  flowExecutionSignalWaitStateValues,
  formatFlowSqlValues
} from "./flows-values";

export const flowExecutionSignalInbox = pgTable(
  "flow_execution_signal_inbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceEventId: uuid("source_event_id").notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    signalType: text("signal_type").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    outcome: text("outcome").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true })
  },
  (table) => [
    unique("flow_execution_signal_inbox_id_owner_unique").on(table.id, table.ownerUserId),
    uniqueIndex("flow_execution_signal_inbox_source_event_unique").on(table.sourceEventId),
    uniqueIndex("flow_execution_signal_inbox_owner_identity_unique").on(
      table.ownerUserId,
      table.signalType,
      table.correlationId
    ),
    index("flow_execution_signal_inbox_pending_idx").on(
      table.ownerUserId,
      table.signalType,
      table.correlationId,
      table.receivedAt
    ),
    check(
      "flow_execution_signal_inbox_type_check",
      sql`${table.signalType} in ${sql.raw(formatFlowSqlValues(flowExecutionSignalTypeValues))}`
    ),
    check(
      "flow_execution_signal_inbox_outcome_check",
      sql`${table.outcome} in ${sql.raw(formatFlowSqlValues(flowExecutionSignalOutcomeValues))}`
    ),
    check("flow_execution_signal_inbox_clock_check", sql`${table.receivedAt} >= ${table.occurredAt}`)
  ]
);

export const flowExecutionSignalWaits = pgTable(
  "flow_execution_signal_waits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    flowRunId: uuid("flow_run_id").notNull(),
    flowVersionId: uuid("flow_version_id").notNull(),
    tokenId: uuid("token_id").notNull(),
    nodeActivationSequence: bigint("node_activation_sequence", { mode: "bigint" }).notNull(),
    nodeId: text("node_id").notNull(),
    signalType: text("signal_type").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    successHandle: text("success_handle").notNull(),
    state: text("state").notNull().default("waiting"),
    consumedSignalId: uuid("consumed_signal_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      columns: [table.flowRunId, table.flowVersionId, table.ownerUserId],
      foreignColumns: [flowRuns.id, flowRuns.flowVersionId, flowRuns.ownerUserId],
      name: "flow_execution_signal_waits_run_version_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tokenId, table.flowRunId, table.ownerUserId],
      foreignColumns: [
        flowExecutionTokens.id,
        flowExecutionTokens.flowRunId,
        flowExecutionTokens.ownerUserId
      ],
      name: "flow_execution_signal_waits_token_run_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.consumedSignalId, table.ownerUserId],
      foreignColumns: [flowExecutionSignalInbox.id, flowExecutionSignalInbox.ownerUserId],
      name: "flow_execution_signal_waits_consumed_signal_owner_fk"
    }).onDelete("restrict"),
    unique("flow_execution_signal_waits_id_run_owner_unique").on(
      table.id,
      table.flowRunId,
      table.ownerUserId
    ),
    uniqueIndex("flow_execution_signal_waits_token_activation_unique").on(
      table.tokenId,
      table.nodeActivationSequence
    ),
    uniqueIndex("flow_execution_signal_waits_consumed_signal_unique")
      .on(table.consumedSignalId)
      .where(sql`${table.consumedSignalId} is not null`),
    index("flow_execution_signal_waits_match_idx").on(
      table.ownerUserId,
      table.signalType,
      table.correlationId,
      table.state
    ),
    check(
      "flow_execution_signal_waits_type_check",
      sql`${table.signalType} in ${sql.raw(formatFlowSqlValues(flowExecutionSignalTypeValues))}`
    ),
    check(
      "flow_execution_signal_waits_state_check",
      sql`${table.state} in ${sql.raw(formatFlowSqlValues(flowExecutionSignalWaitStateValues))}`
    ),
    check(
      "flow_execution_signal_waits_node_check",
      sql`${table.nodeActivationSequence} > 0
        and length(trim(${table.nodeId})) between 1 and 160
        and ${table.nodeId} ~ '^[a-z0-9][a-z0-9_-]*$'
        and ${table.successHandle} = 'next'`
    ),
    check(
      "flow_execution_signal_waits_lifecycle_check",
      sql`(
        ${table.state} = 'waiting'
        and ${table.consumedSignalId} is null
        and ${table.consumedAt} is null
        and ${table.canceledAt} is null
      ) or (
        ${table.state} = 'consumed'
        and ${table.consumedSignalId} is not null
        and ${table.consumedAt} is not null
        and ${table.canceledAt} is null
      ) or (
        ${table.state} = 'canceled'
        and ${table.consumedSignalId} is null
        and ${table.consumedAt} is null
        and ${table.canceledAt} is not null
      )`
    )
  ]
);
