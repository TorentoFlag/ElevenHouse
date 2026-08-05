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
  flowDefinitionCommandScopeValues,
  flowDefinitionCommandStateValues,
  formatFlowSqlValues
} from "./flows-values";

export const flowDefinitionCommands = pgTable(
  "flow_definition_commands",
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
    uniqueIndex("flow_definition_commands_scope_key_unique").on(
      table.apiSurface,
      table.actorUserId,
      table.ownerUserId,
      table.routeTemplate,
      table.resourceId,
      table.idempotencyKey
    ),
    unique("flow_definition_commands_id_resource_owner_unique").on(
      table.id,
      table.resourceId,
      table.ownerUserId
    ),
    check(
      "flow_definition_commands_scope_check",
      sql`${table.apiSurface} = 'astrologer-api'
        and ${table.commandScope} in ${sql.raw(formatFlowSqlValues(flowDefinitionCommandScopeValues))}
        and (
          (
            ${table.routeTemplate} = '/flows'
            and ${table.commandScope} = 'flows.definition.create.v2'
            and ${table.resourceId} = ${table.ownerUserId}
          )
          or (${table.routeTemplate} = '/flows/:flowId/draft' and ${table.commandScope} = 'flows.definition.update-draft.v2')
          or (${table.routeTemplate} = '/flows/:flowId/publish' and ${table.commandScope} = 'flows.definition.publish.v2')
          or (${table.routeTemplate} = '/flows/:flowId/next-draft' and ${table.commandScope} = 'flows.definition.create-next-draft.v2')
        )`
    ),
    check(
      "flow_definition_commands_key_check",
      sql`length(${table.idempotencyKey}) between 8 and 128
        and ${table.idempotencyKey} ~ '^[A-Za-z0-9._:-]+$'`
    ),
    check(
      "flow_definition_commands_request_hash_check",
      sql`${table.requestHash} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "flow_definition_commands_state_check",
      sql`${table.state} in ${sql.raw(formatFlowSqlValues(flowDefinitionCommandStateValues))}`
    ),
    check(
      "flow_definition_commands_terminal_state_check",
      sql`(
        ${table.state} = 'processing'
        and ${table.completedAt} is null
      ) or (
        ${table.state} in ('succeeded', 'failed')
        and ${table.completedAt} is not null
      )`
    ),
    check(
      "flow_definition_commands_replay_window_check",
      sql`${table.replayUntil} = ${table.createdAt} + interval '24 hours'`
    ),
    check(
      "flow_definition_commands_completion_check",
      sql`${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt}`
    ),
    index("flow_definition_commands_replay_until_idx").on(table.replayUntil),
    index("flow_definition_commands_owner_resource_created_idx").on(
      table.ownerUserId,
      table.resourceId,
      table.createdAt
    )
  ]
);

export const flowDefinitionCommandOutcomes = pgTable(
  "flow_definition_command_outcomes",
  {
    commandId: uuid("command_id").primaryKey(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.commandId],
      foreignColumns: [flowDefinitionCommands.id],
      name: "flow_definition_command_outcomes_command_fk"
    }).onDelete("cascade"),
    check(
      "flow_definition_command_outcomes_response_check",
      sql`(
        ${table.responseStatus} in (200, 201)
        or ${table.responseStatus} between 400 and 499
      ) and jsonb_typeof(${table.responseBody}) = 'object'`
    ),
    index("flow_definition_command_outcomes_created_idx").on(table.createdAt)
  ]
);
