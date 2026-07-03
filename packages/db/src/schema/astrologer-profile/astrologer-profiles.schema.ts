import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";

export const astrologerProfiles = pgTable(
  "astrologer_profiles",
  {
    ownerUserId: uuid("owner_user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    publicHandle: text("public_handle").notNull(),
    publicName: text("public_name").notNull(),
    headline: text("headline"),
    bio: text("bio"),
    timezone: text("timezone").notNull(),
    locale: text("locale").notNull(),
    avatarMediaId: text("avatar_media_id"),
    coverMediaId: text("cover_media_id"),
    consultationLanguages: jsonb("consultation_languages").$type<string[]>().notNull(),
    isPublicPageEnabled: boolean("is_public_page_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("astrologer_profiles_public_handle_unique").on(table.publicHandle),
    check(
      "astrologer_profiles_public_handle_format_check",
      sql`${table.publicHandle} ~ '^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$'`
    ),
    check(
      "astrologer_profiles_public_name_length_check",
      sql`length(trim(${table.publicName})) between 2 and 200`
    ),
    check(
      "astrologer_profiles_headline_length_check",
      sql`${table.headline} is null or length(trim(${table.headline})) <= 240`
    ),
    check(
      "astrologer_profiles_bio_length_check",
      sql`${table.bio} is null or length(trim(${table.bio})) <= 4000`
    ),
    check(
      "astrologer_profiles_timezone_length_check",
      sql`length(trim(${table.timezone})) > 0`
    ),
    check("astrologer_profiles_locale_length_check", sql`length(trim(${table.locale})) > 0`),
    index("astrologer_profiles_public_handle_idx").on(table.publicHandle)
  ]
);
