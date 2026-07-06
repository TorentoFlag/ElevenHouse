import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { calculationRecords } from "./calculation-records.schema";
import {
  calculationClientVisibilityValues,
  formatCalculationSqlValues
} from "./calculation-values";

export const calculationClientLinks = pgTable(
  "calculation_client_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calculationId: uuid("calculation_id")
      .notNull()
      .references(() => calculationRecords.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    visibility: text("visibility").notNull().default("private_to_astrologer"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "calculation_client_links_visibility_check",
      sql`${table.visibility} in ${sql.raw(
        formatCalculationSqlValues(calculationClientVisibilityValues)
      )}`
    ),
    check(
      "calculation_client_links_published_at_check",
      sql`${table.visibility} <> 'visible_to_client' or ${table.publishedAt} is not null`
    ),
    index("calculation_client_links_record_idx").on(table.calculationId),
    index("calculation_client_links_client_idx").on(table.clientId),
    uniqueIndex("calculation_client_links_record_client_unique").on(
      table.calculationId,
      table.clientId
    )
  ]
);
