import { sql } from "drizzle-orm";
import type { BookingClientDataRequirementsSnapshot } from "@elevenhouse/domain";
import {
  check,
  foreignKey,
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
  formatSqlValues,
  productCurrencyValues,
  productDeliveryFormatValues
} from "../products/product-values";
import { products } from "../products/products.schema";
import { availabilitySchedules } from "./availability.schema";
import {
  bookingClientDataRequirementsConstraintName,
  bookingClientDataRequirementsSnapshotPredicateSql
} from "./booking-client-data-requirements-constraint";
import {
  bookingSourceValues,
  bookingStateValues,
  formatSchedulingSqlValues,
  manualCalendarBlockStateValues,
  scheduleReservationKindValues,
  scheduleReservationLifecycleValues
} from "./scheduling-values";

export const scheduleReservations = pgTable(
  "schedule_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull(),
    scheduleId: uuid("schedule_id").notNull(),
    kind: text("kind").notNull(),
    lifecycle: text("lifecycle").notNull().default("active"),
    serviceStartAt: timestamp("service_start_at", { withTimezone: true }).notNull(),
    serviceEndAt: timestamp("service_end_at", { withTimezone: true }).notNull(),
    occupiedStartAt: timestamp("occupied_start_at", { withTimezone: true }).notNull(),
    occupiedEndAt: timestamp("occupied_end_at", { withTimezone: true }).notNull(),
    sourceAggregateId: uuid("source_aggregate_id"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("schedule_reservations_id_owner_unique").on(table.id, table.ownerUserId),
    foreignKey({
      columns: [table.scheduleId, table.ownerUserId],
      foreignColumns: [availabilitySchedules.id, availabilitySchedules.ownerUserId],
      name: "schedule_reservations_schedule_owner_fk"
    }).onDelete("cascade"),
    check(
      "schedule_reservations_kind_check",
      sql`${table.kind} in ${sql.raw(formatSchedulingSqlValues(scheduleReservationKindValues))}`
    ),
    check(
      "schedule_reservations_lifecycle_check",
      sql`${table.lifecycle} in ${sql.raw(
        formatSchedulingSqlValues(scheduleReservationLifecycleValues)
      )}`
    ),
    check(
      "schedule_reservations_service_range_check",
      sql`${table.serviceStartAt} < ${table.serviceEndAt}`
    ),
    check(
      "schedule_reservations_occupied_range_check",
      sql`${table.occupiedStartAt} < ${table.occupiedEndAt} and ${table.occupiedStartAt} <= ${table.serviceStartAt} and ${table.occupiedEndAt} >= ${table.serviceEndAt}`
    ),
    check(
      "schedule_reservations_source_check",
      sql`(${table.kind} in ('booking', 'manual_block') and ${table.sourceAggregateId} is not null) or ${table.kind} = 'hold'`
    ),
    check(
      "schedule_reservations_hold_expiry_check",
      sql`(${table.kind} = 'hold' and ${table.holdExpiresAt} is not null) or (${table.kind} <> 'hold' and ${table.holdExpiresAt} is null)`
    ),
    index("schedule_reservations_owner_service_idx").on(
      table.ownerUserId,
      table.serviceStartAt,
      table.serviceEndAt
    ),
    index("schedule_reservations_owner_lifecycle_occupied_idx").on(
      table.ownerUserId,
      table.lifecycle,
      table.occupiedStartAt,
      table.occupiedEndAt
    ),
    index("schedule_reservations_hold_expiry_idx").on(table.lifecycle, table.holdExpiresAt)
  ]
);

export const manualCalendarBlocks = pgTable(
  "manual_calendar_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull(),
    reservationId: uuid("reservation_id").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.reservationId, table.ownerUserId],
      foreignColumns: [scheduleReservations.id, scheduleReservations.ownerUserId],
      name: "manual_calendar_blocks_reservation_owner_fk"
    }).onDelete("cascade"),
    unique("manual_calendar_blocks_reservation_unique").on(table.reservationId),
    check(
      "manual_calendar_blocks_title_length_check",
      sql`length(trim(${table.title})) between 1 and 120`
    ),
    check(
      "manual_calendar_blocks_state_check",
      sql`${table.state} in ${sql.raw(formatSchedulingSqlValues(manualCalendarBlockStateValues))}`
    ),
    index("manual_calendar_blocks_owner_state_updated_idx").on(
      table.ownerUserId,
      table.state,
      table.updatedAt
    )
  ]
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull(),
    clientUserId: uuid("client_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    productId: uuid("product_id").notNull(),
    reservationId: uuid("reservation_id").notNull(),
    source: text("source").notNull().default("manual"),
    state: text("state").notNull().default("confirmed"),
    lifecycleRevision: integer("lifecycle_revision").notNull().default(0),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    serviceStartAt: timestamp("service_start_at", { withTimezone: true }).notNull(),
    serviceEndAt: timestamp("service_end_at", { withTimezone: true }).notNull(),
    productTitleSnapshot: text("product_title_snapshot").notNull(),
    durationMinutesSnapshot: integer("duration_minutes_snapshot").notNull(),
    deliveryFormatSnapshot: text("delivery_format_snapshot").notNull(),
    priceMinorSnapshot: integer("price_minor_snapshot").notNull(),
    currencySnapshot: text("currency_snapshot").notNull(),
    timeZoneSnapshot: text("time_zone_snapshot").notNull(),
    policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull(),
    clientDataRequirementsSnapshot: jsonb("client_data_requirements_snapshot")
      .$type<BookingClientDataRequirementsSnapshot>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("bookings_id_owner_unique").on(table.id, table.ownerUserId),
    unique("bookings_id_owner_client_unique").on(
      table.id,
      table.ownerUserId,
      table.clientUserId
    ),
    foreignKey({
      columns: [table.reservationId, table.ownerUserId],
      foreignColumns: [scheduleReservations.id, scheduleReservations.ownerUserId],
      name: "bookings_reservation_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.productId, table.ownerUserId],
      foreignColumns: [products.id, products.ownerUserId],
      name: "bookings_product_owner_fk"
    }).onDelete("restrict"),
    unique("bookings_reservation_unique").on(table.reservationId),
    check(
      "bookings_state_check",
      sql`${table.state} in ${sql.raw(formatSchedulingSqlValues(bookingStateValues))}`
    ),
    check(
      "bookings_source_check",
      sql`${table.source} in ${sql.raw(formatSchedulingSqlValues(bookingSourceValues))}`
    ),
    check(
      "bookings_hold_expiry_check",
      sql`(${table.state} = 'hold' and ${table.holdExpiresAt} is not null) or (${table.state} <> 'hold' and ${table.holdExpiresAt} is null)`
    ),
    check("bookings_lifecycle_revision_check", sql`${table.lifecycleRevision} >= 0`),
    check(
      "bookings_lifecycle_state_revision_check",
      sql`(
        ${table.state} in ('hold', 'pending_payment', 'expired')
        and ${table.lifecycleRevision} = 0
      ) or (
        ${table.state} in ('confirmed', 'completed', 'no_show')
        and ${table.lifecycleRevision} > 0
      ) or (
        ${table.state} = 'cancelled'
        and (${table.lifecycleRevision} = 0 or ${table.lifecycleRevision} > 1)
      )`
    ),
    check("bookings_service_range_check", sql`${table.serviceStartAt} < ${table.serviceEndAt}`),
    check(
      "bookings_product_title_length_check",
      sql`length(trim(${table.productTitleSnapshot})) between 1 and 200`
    ),
    check("bookings_duration_check", sql`${table.durationMinutesSnapshot} between 1 and 1440`),
    check(
      "bookings_delivery_format_check",
      sql`${table.deliveryFormatSnapshot} in ${sql.raw(
        formatSqlValues(productDeliveryFormatValues)
      )}`
    ),
    check("bookings_price_check", sql`${table.priceMinorSnapshot} >= 0`),
    check(
      "bookings_currency_check",
      sql`${table.currencySnapshot} in ${sql.raw(formatSqlValues(productCurrencyValues))}`
    ),
    check(
      "bookings_time_zone_length_check",
      sql`length(trim(${table.timeZoneSnapshot})) between 1 and 100`
    ),
    check("bookings_policy_snapshot_check", sql`jsonb_typeof(${table.policySnapshot}) = 'object'`),
    check(
      bookingClientDataRequirementsConstraintName,
      sql.raw(bookingClientDataRequirementsSnapshotPredicateSql())
    ),
    index("bookings_owner_service_idx").on(table.ownerUserId, table.serviceStartAt, table.id),
    index("bookings_owner_client_created_idx").on(
      table.ownerUserId,
      table.clientUserId,
      table.createdAt,
      table.id
    )
  ]
);
