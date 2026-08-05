import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { auditActorSubjects } from "../audit-log/audit-actor-subjects.schema";

export const flowRuntimeControlCommands = pgTable(
  "flow_runtime_control_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schemaVersion: text("schema_version")
      .notNull()
      .default(sql`'flow-runtime-control-replace-policy-command.v1'`),
    actorSubjectId: uuid("actor_subject_id").notNull(),
    commandScope: text("command_scope")
      .notNull()
      .default(sql`'flows.runtime-control.replace-policy.v1'`),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 71 }).notNull(),
    expectedRevision: integer("expected_revision").notNull(),
    targetRevision: integer("target_revision").notNull(),
    requestedPolicyDigest: varchar("requested_policy_digest", { length: 71 }).notNull(),
    reason: text("reason").notNull(),
    state: text("state").notNull().default("processing"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    replayUntil: timestamp("replay_until", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.actorSubjectId],
      foreignColumns: [auditActorSubjects.actorSubjectId],
      name: "flow_runtime_control_commands_actor_fk"
    }).onDelete("restrict"),
    uniqueIndex("flow_runtime_control_commands_scope_key_unique").on(
      table.commandScope,
      table.actorSubjectId,
      table.idempotencyKey
    ),
    index("flow_runtime_control_commands_replay_until_idx").on(table.replayUntil),
    index("flow_runtime_control_commands_target_created_idx").on(
      table.targetRevision,
      table.createdAt,
      table.id
    ),
    check(
      "flow_runtime_control_commands_identity_check",
      sql`${table.schemaVersion} = 'flow-runtime-control-replace-policy-command.v1'
        and ${table.commandScope} = 'flows.runtime-control.replace-policy.v1'
        and length(${table.idempotencyKey}) between 8 and 128
        and ${table.idempotencyKey} ~ '^[A-Za-z0-9._:-]+$'`
    ),
    check(
      "flow_runtime_control_commands_revision_check",
      sql`${table.expectedRevision} > 0
        and ${table.targetRevision} = ${table.expectedRevision} + 1`
    ),
    check(
      "flow_runtime_control_commands_evidence_check",
      sql`${table.requestHash} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.requestedPolicyDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "flow_runtime_control_commands_reason_check",
      sql`length(trim(${table.reason})) between 1 and 500
        and ${table.reason} = trim(${table.reason})
        and ${table.reason} !~ '[[:cntrl:]]'`
    ),
    check(
      "flow_runtime_control_commands_state_check",
      sql`(${table.state} = 'processing' and ${table.completedAt} is null)
        or (${table.state} in ('succeeded', 'failed') and ${table.completedAt} is not null)`
    ),
    check(
      "flow_runtime_control_commands_time_check",
      sql`${table.replayUntil} = ${table.createdAt} + interval '24 hours'
        and ${table.updatedAt} >= ${table.createdAt}
        and (${table.completedAt} is null
          or (${table.completedAt} >= ${table.createdAt}
            and ${table.completedAt} = ${table.updatedAt}))`
    )
  ]
);

export const flowRuntimeControlCommandOutcomes = pgTable(
  "flow_runtime_control_command_outcomes",
  {
    commandId: uuid("command_id").primaryKey(),
    resultKind: text("result_kind").notNull(),
    currentRevision: integer("current_revision").notNull(),
    policyRevision: integer("policy_revision"),
    requestedPolicyCanonicalPreimage: text("requested_policy_canonical_preimage").notNull(),
    requestedPolicyDigest: varchar("requested_policy_digest", { length: 71 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.commandId],
      foreignColumns: [flowRuntimeControlCommands.id],
      name: "flow_runtime_control_command_outcomes_command_fk"
    }).onDelete("restrict"),
    index("flow_runtime_control_command_outcomes_created_idx").on(table.createdAt),
    check(
      "flow_runtime_control_command_outcomes_shape_check",
      sql`${table.currentRevision} > 0
        and length(${table.requestedPolicyCanonicalPreimage}) between 1 and 300000
        and ${table.requestedPolicyDigest} ~ '^sha256:[a-f0-9]{64}$'
        and (
          (${table.resultKind} = 'applied'
            and ${table.policyRevision} = ${table.currentRevision})
          or (${table.resultKind} = 'revision_conflict'
            and ${table.policyRevision} is null)
        )`
    )
  ]
);
