import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { calculationRecords } from "./calculation-records.schema";
import { calculationInterpretations } from "./calculation-interpretations.schema";
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
    publishedInterpretationId: uuid("published_interpretation_id"),
    publishedResultChecksum: text("published_result_checksum"),
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
    check(
      "calculation_client_links_published_result_checksum_check",
      sql`${table.publishedResultChecksum} is null or ${table.publishedResultChecksum} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "calculation_client_links_publication_binding_check",
      sql`(
        ${table.visibility} = 'private_to_astrologer'
        and ${table.publishedAt} is null
        and ${table.publishedInterpretationId} is null
        and ${table.publishedResultChecksum} is null
      ) or (
        ${table.visibility} = 'visible_to_client'
        and ${table.publishedAt} is not null
        and ${table.publishedInterpretationId} is not null
        and ${table.publishedResultChecksum} is not null
      )`
    ),
    foreignKey({
      name: "calculation_client_links_published_interpretation_fk",
      columns: [table.publishedInterpretationId, table.calculationId],
      foreignColumns: [calculationInterpretations.id, calculationInterpretations.calculationId]
    }).onDelete("restrict"),
    index("calculation_client_links_record_idx").on(table.calculationId),
    index("calculation_client_links_client_idx").on(table.clientId),
    index("calculation_client_links_published_interpretation_idx").on(
      table.publishedInterpretationId,
      table.calculationId
    ),
    uniqueIndex("calculation_client_links_record_client_unique").on(
      table.calculationId,
      table.clientId
    )
  ]
);
