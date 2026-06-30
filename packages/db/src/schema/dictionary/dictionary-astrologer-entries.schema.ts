import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
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
  dictionaryAstrologerEntryStatusValues,
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
    body: text("body").notNull(),
    status: text("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
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
      "dictionary_astrologer_entries_status_check",
      sql`${table.status} in ${sql.raw(formatSqlValues(dictionaryAstrologerEntryStatusValues))}`
    ),
    check("dictionary_astrologer_entries_version_check", sql`${table.version} > 0`),
    check(
      "dictionary_astrologer_entries_override_platform_check",
      sql`${table.entryType} <> 'override' or ${table.platformEntryId} is not null`
    ),
    check(
      "dictionary_astrologer_entries_custom_platform_check",
      sql`${table.entryType} <> 'custom' or ${table.platformEntryId} is null`
    ),
    check(
      "dictionary_astrologer_entries_deleted_at_check",
      sql`${table.status} <> 'deleted' or ${table.deletedAt} is not null`
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
    index("dictionary_astrologer_entries_owner_category_locale_status_index").on(
      table.ownerUserId,
      table.categoryId,
      table.locale,
      table.status
    ),
    index("dictionary_astrologer_entries_platform_entry_id_index").on(table.platformEntryId),
    uniqueIndex("dictionary_astrologer_entries_active_override_unique")
      .on(table.ownerUserId, table.platformEntryId, table.locale)
      .where(sql`${table.entryType} = 'override' and ${table.status} = 'active'`),
    uniqueIndex("dictionary_astrologer_entries_active_custom_code_unique")
      .on(table.ownerUserId, table.categoryId, table.code, table.locale)
      .where(sql`${table.entryType} = 'custom' and ${table.status} = 'active'`)
  ]
);

function formatSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
