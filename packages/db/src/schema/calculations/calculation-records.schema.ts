import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  calculationModeValues,
  calculationModuleValues,
  calculationStatusValues,
  formatCalculationSqlValues
} from "./calculation-values";

export const calculationRecords = pgTable(
  "calculation_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    mode: text("mode").notNull(),
    methodCode: text("method_code").notNull(),
    currentMethodVersion: text("current_method_version").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("calculated"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "calculation_records_module_check",
      sql`${table.module} in ${sql.raw(formatCalculationSqlValues(calculationModuleValues))}`
    ),
    check(
      "calculation_records_mode_check",
      sql`${table.mode} in ${sql.raw(formatCalculationSqlValues(calculationModeValues))}`
    ),
    check(
      "calculation_records_status_check",
      sql`${table.status} in ${sql.raw(formatCalculationSqlValues(calculationStatusValues))}`
    ),
    index("calculation_records_owner_updated_id_idx").on(
      table.ownerUserId,
      table.updatedAt,
      table.id
    ),
    index("calculation_records_owner_status_updated_id_idx").on(
      table.ownerUserId,
      table.status,
      table.updatedAt,
      table.id
    ),
    index("calculation_records_owner_module_created_id_idx").on(
      table.ownerUserId,
      table.module,
      table.createdAt,
      table.id
    ),
    index("calculation_records_owner_status_module_created_id_idx").on(
      table.ownerUserId,
      table.status,
      table.module,
      table.createdAt,
      table.id
    )
  ]
);
