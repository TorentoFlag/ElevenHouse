import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { astroCalendarGenerations } from "./astro-calendar-generations.schema";
import {
  astroCalendarEventSourceValues,
  astroCalendarEventTypeValues,
  astroCalendarTimePrecisionValues,
  formatAstroCalendarSqlValues
} from "./astro-calendar-values";

export const astroCalendarEvents = pgTable(
  "astro_calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => astroCalendarGenerations.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    source: text("source").notNull(),
    type: text("type").notNull(),
    timePrecision: text("time_precision").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    payload: jsonb("payload").notNull(),
    dictionaryCodes: jsonb("dictionary_codes").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "astro_calendar_events_source_check",
      sql`${table.source} in ${sql.raw(formatAstroCalendarSqlValues(astroCalendarEventSourceValues))}`
    ),
    check(
      "astro_calendar_events_type_check",
      sql`${table.type} in ${sql.raw(formatAstroCalendarSqlValues(astroCalendarEventTypeValues))}`
    ),
    check(
      "astro_calendar_events_time_precision_check",
      sql`${table.timePrecision} in ${sql.raw(formatAstroCalendarSqlValues(astroCalendarTimePrecisionValues))}`
    ),
    check(
      "astro_calendar_events_payload_object_check",
      sql`jsonb_typeof(${table.payload}) = 'object'`
    ),
    check(
      "astro_calendar_events_dictionary_codes_array_check",
      sql`jsonb_typeof(${table.dictionaryCodes}) = 'array'`
    ),
    check(
      "astro_calendar_events_range_check",
      sql`${table.endsAt} is null or ${table.endsAt} >= ${table.startsAt}`
    ),
    index("astro_calendar_events_owner_starts_idx").on(table.ownerUserId, table.startsAt, table.id),
    index("astro_calendar_events_generation_starts_idx").on(
      table.generationId,
      table.startsAt,
      table.id
    ),
    uniqueIndex("astro_calendar_events_generation_event_unique").on(
      table.generationId,
      table.eventId
    )
  ]
);
