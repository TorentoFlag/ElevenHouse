import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
    check(
      "calculation_participants_source_client_check",
      sql`(${table.source} = 'crm_client' and ${table.clientId} is not null) or (${table.source} = 'manual' and ${table.clientId} is null)`
    ),
    check("calculation_participants_order_check", sql`${table.order} >= 0 and ${table.order} < 2`),
    index("calculation_participants_record_role_idx").on(table.calculationId, table.role),
    index("calculation_participants_record_order_idx").on(table.calculationId, table.order)
  ]
);
