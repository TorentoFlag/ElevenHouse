import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import { bookings } from "../scheduling/bookings.schema";
import {
  formatSessionSqlValues,
  sessionEndReasonValues,
  sessionStateValues
} from "./session-values";

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    clientUserId: uuid("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    state: text("state").notNull().default("scheduled"),
    lifecycleRevision: integer("lifecycle_revision").notNull().default(1),
    scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }).notNull(),
    scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }).notNull(),
    timeZoneSnapshot: text("time_zone_snapshot").notNull(),
    productTitleSnapshot: text("product_title_snapshot").notNull(),
    provider: text("provider").notNull().default("livekit"),
    providerRoomName: text("provider_room_name").notNull(),
    latestMessageSequence: bigint("latest_message_sequence", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("sessions_booking_unique").on(table.bookingId),
    unique("sessions_provider_room_unique").on(table.provider, table.providerRoomName),
    unique("sessions_id_owner_client_unique").on(
      table.id,
      table.ownerUserId,
      table.clientUserId
    ),
    foreignKey({
      columns: [table.bookingId, table.ownerUserId, table.clientUserId],
      foreignColumns: [bookings.id, bookings.ownerUserId, bookings.clientUserId],
      name: "sessions_booking_owner_client_fk"
    }).onDelete("restrict"),
    check(
      "sessions_state_check",
      sql`${table.state} in ${sql.raw(formatSessionSqlValues(sessionStateValues))}`
    ),
    check("sessions_lifecycle_revision_check", sql`${table.lifecycleRevision} > 0`),
    check("sessions_schedule_range_check", sql`${table.scheduledStartAt} < ${table.scheduledEndAt}`),
    check(
      "sessions_lifecycle_evidence_check",
      sql`(
        ${table.state} = 'scheduled'
        and ${table.startedAt} is null
        and ${table.endedAt} is null
        and ${table.endReason} is null
      ) or (
        ${table.state} = 'active'
        and ${table.startedAt} is not null
        and ${table.endedAt} is null
        and ${table.endReason} is null
      ) or (
        ${table.state} = 'ended'
        and ${table.startedAt} is not null
        and ${table.endedAt} is not null
        and ${table.endReason} is not null
      ) or (
        ${table.state} in ('cancelled', 'expired')
        and ${table.startedAt} is null
        and ${table.endedAt} is not null
        and ${table.endReason} is null
      )`
    ),
    check(
      "sessions_end_reason_check",
      sql`${table.endReason} is null or ${table.endReason} in ${sql.raw(
        formatSessionSqlValues(sessionEndReasonValues)
      )}`
    ),
    check("sessions_provider_check", sql`${table.provider} = 'livekit'`),
    check("sessions_provider_room_length_check", sql`length(trim(${table.providerRoomName})) between 1 and 200`),
    check("sessions_product_title_length_check", sql`length(trim(${table.productTitleSnapshot})) between 1 and 200`),
    check("sessions_time_zone_length_check", sql`length(trim(${table.timeZoneSnapshot})) between 1 and 100`),
    check("sessions_message_sequence_check", sql`${table.latestMessageSequence} >= 0`),
    check("sessions_distinct_users_check", sql`${table.ownerUserId} <> ${table.clientUserId}`),
    index("sessions_owner_schedule_idx").on(table.ownerUserId, table.scheduledStartAt, table.id),
    index("sessions_client_schedule_idx").on(table.clientUserId, table.scheduledStartAt, table.id),
    index("sessions_state_schedule_idx").on(table.state, table.scheduledEndAt, table.id)
  ]
);
