import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import {
  clientBirthDataSourceValues,
  clientBirthTimePrecisionValues,
  formatClientSqlValues
} from "./client-values";

export const clientBirthData = pgTable(
  "client_birth_data",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientUserId: uuid("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label"),
    birthDate: text("birth_date"),
    birthTime: text("birth_time"),
    birthTimePrecision: text("birth_time_precision").notNull().default("unknown"),
    birthPlaceText: text("birth_place_text"),
    birthCountryCode: text("birth_country_code"),
    birthCity: text("birth_city"),
    birthRegion: text("birth_region"),
    birthTimezone: text("birth_timezone"),
    birthLatitude: doublePrecision("birth_latitude"),
    birthLongitude: doublePrecision("birth_longitude"),
    source: text("source").notNull().default("client_profile"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("client_birth_data_client_unique").on(table.clientUserId),
    index("client_birth_data_client_idx").on(table.clientUserId),
    check(
      "client_birth_data_time_precision_check",
      sql`${table.birthTimePrecision} in ${sql.raw(formatClientSqlValues(clientBirthTimePrecisionValues))}`
    ),
    check(
      "client_birth_data_source_check",
      sql`${table.source} in ${sql.raw(formatClientSqlValues(clientBirthDataSourceValues))}`
    ),
    check(
      "client_birth_data_birth_date_check",
      sql`${table.birthDate} is null or ${table.birthDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    check(
      "client_birth_data_birth_time_check",
      sql`${table.birthTime} is null or ${table.birthTime} ~ '^[0-9]{2}:[0-9]{2}$'`
    ),
    check(
      "client_birth_data_unknown_time_check",
      sql`${table.birthTimePrecision} <> 'unknown' or ${table.birthTime} is null`
    ),
    check(
      "client_birth_data_country_code_check",
      sql`${table.birthCountryCode} is null or ${table.birthCountryCode} ~ '^[A-Z]{2}$'`
    ),
    check(
      "client_birth_data_latitude_check",
      sql`${table.birthLatitude} is null or (${table.birthLatitude} >= -90 and ${table.birthLatitude} <= 90)`
    ),
    check(
      "client_birth_data_longitude_check",
      sql`${table.birthLongitude} is null or (${table.birthLongitude} >= -180 and ${table.birthLongitude} <= 180)`
    )
  ]
);
