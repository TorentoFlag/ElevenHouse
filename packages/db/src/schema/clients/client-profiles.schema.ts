import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";

export const clientProfiles = pgTable(
  "client_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayNameSnapshot: text("display_name_snapshot"),
    preferredLocale: text("preferred_locale"),
    timezone: text("timezone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "client_profiles_display_name_length_check",
      sql`${table.displayNameSnapshot} is null or length(trim(${table.displayNameSnapshot})) between 1 and 200`
    ),
    check(
      "client_profiles_preferred_locale_length_check",
      sql`${table.preferredLocale} is null or length(trim(${table.preferredLocale})) between 2 and 20`
    ),
    check(
      "client_profiles_timezone_length_check",
      sql`${table.timezone} is null or length(trim(${table.timezone})) > 0`
    )
  ]
);
