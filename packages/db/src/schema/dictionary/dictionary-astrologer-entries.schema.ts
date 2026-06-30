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
import { users } from "../identity/accounts.schema";
import { dictionaryCategories } from "./dictionary-categories.schema";
import { dictionaryPlatformEntries } from "./dictionary-platform-entries.schema";
import {
  dictionaryAstrologerEntryTypeValues,
  dictionaryLocaleValues
} from "./dictionary-values";

export const dictionaryAstrologerEntries = pgTable(
  "dictionary_astrologer_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platformEntryId: uuid("platform_entry_id"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => dictionaryCategories.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    locale: text("locale").notNull(),
    entryType: text("entry_type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "dictionary_astrologer_entries_locale_check",
      sql`${table.locale} in ${sql.raw(formatSqlValues(dictionaryLocaleValues))}`
    ),
    check(
      "dictionary_astrologer_entries_entry_type_check",
      sql`${table.entryType} in ${sql.raw(formatSqlValues(dictionaryAstrologerEntryTypeValues))}`
    ),
    check(
      "dictionary_astrologer_entries_override_platform_check",
      sql`${table.entryType} <> 'override' or ${table.platformEntryId} is not null`
    ),
    check(
      "dictionary_astrologer_entries_custom_platform_check",
      sql`${table.entryType} <> 'custom' or ${table.platformEntryId} is null`
    ),
    foreignKey({
      columns: [table.platformEntryId, table.categoryId, table.code, table.locale],
      foreignColumns: [
        dictionaryPlatformEntries.id,
        dictionaryPlatformEntries.categoryId,
        dictionaryPlatformEntries.code,
        dictionaryPlatformEntries.locale
      ],
      name: "dictionary_astrologer_entries_platform_entry_identity_fk"
    }).onDelete("restrict"),
    index("dictionary_astrologer_entries_custom_owner_locale_category_index")
      .on(table.ownerUserId, table.locale, table.categoryId)
      .where(sql`${table.entryType} = 'custom'`),
    index("dictionary_astrologer_entries_platform_entry_id_index").on(table.platformEntryId),
    uniqueIndex("dictionary_astrologer_entries_override_unique")
      .on(table.ownerUserId, table.platformEntryId, table.locale)
      .where(sql`${table.entryType} = 'override'`),
    uniqueIndex("dictionary_astrologer_entries_custom_code_unique")
      .on(table.ownerUserId, table.categoryId, table.code, table.locale)
      .where(sql`${table.entryType} = 'custom'`)
  ]
);

function formatSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
