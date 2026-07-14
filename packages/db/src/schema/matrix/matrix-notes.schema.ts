import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { calculationRecords } from "../calculations/calculation-records.schema";

export const matrixNotes = pgTable(
  "matrix_notes",
  {
    id: uuid("id").primaryKey(),
    calculationId: uuid("calculation_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    text: text("text").notNull(),
    resultChecksum: text("result_checksum").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "matrix_notes_text_length_check",
      sql`length(trim(${table.text})) between 1 and 10000`
    ),
    check(
      "matrix_notes_result_checksum_check",
      sql`${table.resultChecksum} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    foreignKey({
      columns: [table.calculationId, table.ownerUserId],
      foreignColumns: [calculationRecords.id, calculationRecords.ownerUserId],
      name: "matrix_notes_calculation_owner_fk"
    }).onDelete("cascade"),
    index("matrix_notes_owner_calculation_created_id_idx").on(
      table.ownerUserId,
      table.calculationId,
      table.createdAt,
      table.id
    )
  ]
);
