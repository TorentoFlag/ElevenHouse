import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { dictionaryCategories } from "./dictionary-categories.schema";
import {
  dictionaryLocaleValues,
  dictionaryPlatformEntryStatusValues
} from "./dictionary-values";

export const dictionaryPlatformEntries = pgTable(
  "dictionary_platform_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => dictionaryCategories.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    locale: text("locale").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "dictionary_platform_entries_locale_check",
      sql`${table.locale} in ${sql.raw(formatSqlValues(dictionaryLocaleValues))}`
    ),
    check(
      "dictionary_platform_entries_status_check",
      sql`${table.status} in ${sql.raw(formatSqlValues(dictionaryPlatformEntryStatusValues))}`
    ),
    unique("dictionary_platform_entries_category_code_locale_unique").on(
      table.categoryId,
      table.code,
      table.locale
    ),
    unique("dictionary_platform_entries_identity_category_code_locale_unique").on(
      table.id,
      table.categoryId,
      table.code,
      table.locale
    ),
    index("dictionary_platform_entries_locale_status_category_index").on(
      table.locale,
      table.status,
      table.categoryId
    )
  ]
);

function formatSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
