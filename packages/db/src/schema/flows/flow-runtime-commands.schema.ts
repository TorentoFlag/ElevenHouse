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
import {
  flowRuntimeCommandRouteTemplateValues,
  flowRuntimeCommandScopeValues,
  flowRuntimeCommandStateValues,
  formatFlowSqlValues
} from "./flows-values";

export const flowRuntimeCommands = pgTable(
  "flow_runtime_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiSurface: text("api_surface").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    routeTemplate: text("route_template").notNull(),
    resourceId: uuid("resource_id").notNull(),
    commandScope: text("command_scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state").notNull().default("processing"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    replayUntil: timestamp("replay_until", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("flow_runtime_commands_scope_key_unique").on(
      table.apiSurface,
      table.actorUserId,
      table.ownerUserId,
      table.routeTemplate,
      table.resourceId,
      table.idempotencyKey
    ),
    unique("flow_runtime_commands_id_resource_owner_unique").on(
      table.id,
      table.resourceId,
      table.ownerUserId
    ),
    check(
      "flow_runtime_commands_scope_check",
      sql`${table.apiSurface} = 'astrologer-api'
        and ${table.routeTemplate} in ${sql.raw(
          formatFlowSqlValues(flowRuntimeCommandRouteTemplateValues)
        )}
        and ${table.commandScope} in ${sql.raw(formatFlowSqlValues(flowRuntimeCommandScopeValues))}
        and ${table.routeTemplate} = '/flow-runs/:runId/cancel'
        and ${table.commandScope} = 'flows.runtime.cancel.v1'`
    ),
    check(
      "flow_runtime_commands_key_check",
      sql`length(${table.idempotencyKey}) between 8 and 128
        and ${table.idempotencyKey} ~ '^[A-Za-z0-9._:-]+$'`
    ),
    check(
      "flow_runtime_commands_request_hash_check",
      sql`${table.requestHash} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "flow_runtime_commands_state_check",
      sql`${table.state} in ${sql.raw(formatFlowSqlValues(flowRuntimeCommandStateValues))}`
    ),
    check(
      "flow_runtime_commands_terminal_state_check",
      sql`(
        ${table.state} = 'processing' and ${table.completedAt} is null
      ) or (
        ${table.state} in ('succeeded', 'failed') and ${table.completedAt} is not null
      )`
    ),
    check(
      "flow_runtime_commands_replay_window_check",
      sql`${table.replayUntil} = ${table.createdAt} + interval '24 hours'`
    ),
    check(
      "flow_runtime_commands_completion_check",
      sql`${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt}`
    ),
    index("flow_runtime_commands_replay_until_idx").on(table.replayUntil),
    index("flow_runtime_commands_owner_resource_created_idx").on(
      table.ownerUserId,
      table.resourceId,
      table.createdAt
    )
  ]
);

export const flowRuntimeCommandOutcomes = pgTable(
  "flow_runtime_command_outcomes",
  {
    commandId: uuid("command_id").primaryKey(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.commandId],
      foreignColumns: [flowRuntimeCommands.id],
      name: "flow_runtime_command_outcomes_command_fk"
    }).onDelete("cascade"),
    check(
      "flow_runtime_command_outcomes_response_check",
      sql`${table.responseStatus} in (200, 404, 409)
        and jsonb_typeof(${table.responseBody}) = 'object'`
    ),
    index("flow_runtime_command_outcomes_created_idx").on(table.createdAt)
  ]
);
