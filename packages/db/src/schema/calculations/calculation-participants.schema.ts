import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";
import { calculationRecords } from "./calculation-records.schema";
import {
  calculationParticipantRoleValues,
  calculationParticipantSourceValues,
  formatCalculationSqlValues
} from "./calculation-values";

export const calculationParticipants = pgTable(
  "calculation_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calculationId: uuid("calculation_id")
      .notNull()
      .references(() => calculationRecords.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    source: text("source").notNull(),
    clientId: uuid("client_id"),
    displayName: text("display_name").notNull(),
    birthDate: text("birth_date"),
    inputSnapshot: jsonb("input_snapshot").notNull(),
    manuallyOverridden: boolean("manually_overridden").notNull().default(false),
    order: integer("order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "calculation_participants_role_check",
      sql`${table.role} in ${sql.raw(formatCalculationSqlValues(calculationParticipantRoleValues))}`
    ),
    check(
      "calculation_participants_source_check",
      sql`${table.source} in ${sql.raw(
        formatCalculationSqlValues(calculationParticipantSourceValues)
      )}`
    ),
    index("calculation_participants_record_order_idx").on(table.calculationId, table.order)
  ]
);
