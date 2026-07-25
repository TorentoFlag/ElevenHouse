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
import { financeIdempotencyCommandStateValues, formatFinanceSqlValues } from "./finance-values";

export const financeIdempotencyCommands = pgTable(
  "finance_idempotency_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    requestHash: text("request_hash").notNull(),
    state: text("state").notNull().default("processing"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("finance_idempotency_commands_scope_key_unique").on(
      table.scope,
      table.idempotencyKey
    ),
    check(
      "finance_idempotency_commands_scope_length_check",
      sql`length(trim(${table.scope})) between 1 and 150`
    ),
    check(
      "finance_idempotency_commands_key_length_check",
      sql`length(trim(${table.idempotencyKey})) between 1 and 160`
    ),
    check(
      "finance_idempotency_commands_request_hash_check",
      sql`${table.requestHash} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "finance_idempotency_commands_state_check",
      sql`${table.state} in ${sql.raw(
        formatFinanceSqlValues(financeIdempotencyCommandStateValues)
      )}`
    ),
    check(
      "finance_idempotency_commands_result_state_check",
      sql`(${table.state} = 'processing' and ${table.result} is null and ${table.errorCode} is null) or (${table.state} = 'completed' and ${table.result} is not null and jsonb_typeof(${table.result}) = 'object' and ${table.errorCode} is null) or (${table.state} = 'failed' and ${table.result} is null and ${table.errorCode} is not null and length(trim(${table.errorCode})) between 1 and 120)`
    ),
    index("finance_idempotency_commands_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("finance_idempotency_commands_expiry_idx").on(table.expiresAt)
  ]
);
