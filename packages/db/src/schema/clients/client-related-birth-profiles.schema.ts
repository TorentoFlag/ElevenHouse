import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
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
import {
  clientBirthDataEditorRoleValues,
  clientBirthDataSourceValues,
  clientBirthTimeDstOccurrenceValues,
  clientBirthTimePrecisionValues,
  formatClientSqlValues
} from "./client-values";

export const clientRelatedBirthProfiles = pgTable(
  "client_related_birth_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientUserId: uuid("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    relationshipLabel: text("relationship_label").notNull(),
    birthDate: text("birth_date"),
    birthTime: text("birth_time"),
    birthTimePrecision: text("birth_time_precision").notNull().default("unknown"),
    birthPlaceText: text("birth_place_text"),
    birthCountryCode: text("birth_country_code"),
    birthCity: text("birth_city"),
    birthRegion: text("birth_region"),
    birthTimezone: text("birth_timezone"),
    birthTimeDstOccurrence: text("birth_time_dst_occurrence"),
    birthLatitude: doublePrecision("birth_latitude"),
    birthLongitude: doublePrecision("birth_longitude"),
    source: text("source").notNull().default("client_profile"),
    revision: integer("revision").notNull().default(1),
    lastEditedByUserId: uuid("last_edited_by_user_id")
      .notNull()
      .references(() => users.id),
    lastEditedByRole: text("last_edited_by_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("client_related_birth_profiles_client_idx").on(table.clientUserId),
    index("client_related_birth_profiles_client_updated_idx").on(
      table.clientUserId,
      table.updatedAt
    ),
    check(
      "client_related_birth_profiles_display_name_check",
      sql`length(trim(${table.displayName})) between 1 and 200`
    ),
    check(
      "client_related_birth_profiles_relationship_label_check",
      sql`length(trim(${table.relationshipLabel})) between 1 and 100`
    ),
    check(
      "client_related_birth_profiles_time_precision_check",
      sql`${table.birthTimePrecision} in ${sql.raw(formatClientSqlValues(clientBirthTimePrecisionValues))}`
    ),
    check(
      "client_related_birth_profiles_source_check",
      sql`${table.source} in ${sql.raw(formatClientSqlValues(clientBirthDataSourceValues))}`
    ),
    check(
      "client_related_birth_profiles_last_edited_by_role_check",
      sql`${table.lastEditedByRole} in ${sql.raw(formatClientSqlValues(clientBirthDataEditorRoleValues))}`
    ),
    check(
      "client_related_birth_profiles_time_dst_occurrence_check",
      sql`${table.birthTimeDstOccurrence} is null or ${table.birthTimeDstOccurrence} in ${sql.raw(formatClientSqlValues(clientBirthTimeDstOccurrenceValues))}`
    ),
    check(
      "client_related_birth_profiles_birth_date_check",
      sql`${table.birthDate} is null or ${table.birthDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    check(
      "client_related_birth_profiles_birth_time_check",
      sql`${table.birthTime} is null or ${table.birthTime} ~ '^[0-9]{2}:[0-9]{2}$'`
    ),
    check(
      "client_related_birth_profiles_unknown_time_check",
      sql`${table.birthTimePrecision} <> 'unknown' or ${table.birthTime} is null`
    ),
    check(
      "client_related_birth_profiles_country_code_check",
      sql`${table.birthCountryCode} is null or ${table.birthCountryCode} ~ '^[A-Z]{2}$'`
    ),
    check(
      "client_related_birth_profiles_latitude_check",
      sql`${table.birthLatitude} is null or (${table.birthLatitude} >= -90 and ${table.birthLatitude} <= 90)`
    ),
    check(
      "client_related_birth_profiles_longitude_check",
      sql`${table.birthLongitude} is null or (${table.birthLongitude} >= -180 and ${table.birthLongitude} <= 180)`
    ),
    check("client_related_birth_profiles_revision_check", sql`${table.revision} >= 1`)
  ]
);

export const clientRelatedBirthProfileHistory = pgTable(
  "client_related_birth_profile_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relatedProfileId: uuid("related_profile_id")
      .notNull()
      .references(() => clientRelatedBirthProfiles.id),
    clientUserId: uuid("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    actorRole: text("actor_role").notNull(),
    source: text("source").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("client_related_birth_profile_history_revision_unique").on(
      table.relatedProfileId,
      table.revision
    ),
    index("client_related_birth_profile_history_client_recorded_idx").on(
      table.clientUserId,
      table.recordedAt
    ),
    check("client_related_birth_profile_history_revision_check", sql`${table.revision} >= 1`),
    check(
      "client_related_birth_profile_history_actor_role_check",
      sql`${table.actorRole} in ${sql.raw(formatClientSqlValues(clientBirthDataEditorRoleValues))}`
    ),
    check(
      "client_related_birth_profile_history_source_check",
      sql`${table.source} in ${sql.raw(formatClientSqlValues(clientBirthDataSourceValues))}`
    )
  ]
);
