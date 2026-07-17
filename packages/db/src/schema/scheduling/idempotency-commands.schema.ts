import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  formatSchedulingSqlValues,
  idempotencyCommandStateValues
} from "./scheduling-values";

export const idempotencyCommands = pgTable(
  "idempotency_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiSurface: text("api_surface").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    commandScope: text("command_scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state").notNull().default("processing"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("idempotency_commands_scope_key_unique").on(
      table.apiSurface,
      table.actorUserId,
      table.commandScope,
      table.key
    ),
    check(
      "idempotency_commands_api_surface_length_check",
      sql`length(trim(${table.apiSurface})) between 1 and 100`
    ),
    check(
      "idempotency_commands_scope_length_check",
      sql`length(trim(${table.commandScope})) between 1 and 150`
    ),
    check(
      "idempotency_commands_key_length_check",
      sql`length(${table.key}) between 8 and 255`
    ),
    check(
      "idempotency_commands_request_hash_check",
      sql`${table.requestHash} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "idempotency_commands_state_check",
      sql`${table.state} in ${sql.raw(formatSchedulingSqlValues(idempotencyCommandStateValues))}`
    ),
    check(
      "idempotency_commands_result_state_check",
      sql`(${table.state} = 'processing' and ${table.result} is null) or (${table.state} = 'completed' and jsonb_typeof(${table.result}) = 'object')`
    ),
    index("idempotency_commands_expiry_idx").on(table.expiresAt),
    index("idempotency_commands_actor_created_idx").on(table.actorUserId, table.createdAt)
  ]
);
