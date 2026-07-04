import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
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
    visibilityStatus: text("visibility_status").notNull().default("draft"),
    professionalExperienceYears: integer("professional_experience_years"),
    professionalSchool: text("professional_school"),
    specializations: jsonb("specializations")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    methods: jsonb("methods")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    telegramHandle: text("telegram_handle"),
    instagramHandle: text("instagram_handle"),
    whatsappContact: text("whatsapp_contact"),
    websiteUrl: text("website_url"),
    ownBirthDate: text("own_birth_date"),
    ownBirthTime: text("own_birth_time"),
    ownBirthPlace: text("own_birth_place"),
    showOwnBirthDataPublic: boolean("show_own_birth_data_public").notNull().default(false),
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
    check("astrologer_profiles_timezone_length_check", sql`length(trim(${table.timezone})) > 0`),
    check("astrologer_profiles_locale_length_check", sql`length(trim(${table.locale})) > 0`),
    check(
      "astrologer_profiles_visibility_status_check",
      sql`${table.visibilityStatus} in ('published', 'paused', 'draft')`
    ),
    check(
      "astrologer_profiles_experience_years_check",
      sql`${table.professionalExperienceYears} is null or (${table.professionalExperienceYears} >= 0 and ${table.professionalExperienceYears} <= 100)`
    ),
    check(
      "astrologer_profiles_school_length_check",
      sql`${table.professionalSchool} is null or length(trim(${table.professionalSchool})) <= 500`
    ),
    check(
      "astrologer_profiles_own_birth_date_check",
      sql`${table.ownBirthDate} is null or ${table.ownBirthDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    check(
      "astrologer_profiles_own_birth_time_check",
      sql`${table.ownBirthTime} is null or ${table.ownBirthTime} ~ '^[0-9]{2}:[0-9]{2}$'`
    ),
    index("astrologer_profiles_public_handle_idx").on(table.publicHandle)
  ]
);
