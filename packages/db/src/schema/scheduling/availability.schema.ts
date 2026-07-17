import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { products } from "../products/products.schema";
import {
  availabilityOverrideModeValues,
  formatSchedulingSqlValues
} from "./scheduling-values";

export const availabilitySchedules = pgTable(
  "availability_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Default"),
    timeZone: text("time_zone").notNull(),
    isDefault: boolean("is_default").notNull().default(true),
    version: integer("version").notNull().default(1),
    startIntervalMinutes: integer("start_interval_minutes").notNull(),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    minimumNoticeMinutes: integer("minimum_notice_minutes").notNull().default(0),
    bookingHorizonDays: integer("booking_horizon_days").notNull(),
    maximumBookingsPerDay: integer("maximum_bookings_per_day"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("availability_schedules_id_owner_unique").on(table.id, table.ownerUserId),
    uniqueIndex("availability_schedules_default_owner_unique")
      .on(table.ownerUserId)
      .where(sql`${table.isDefault} = true`),
    check(
      "availability_schedules_name_length_check",
      sql`length(trim(${table.name})) between 1 and 120`
    ),
    check(
      "availability_schedules_time_zone_length_check",
      sql`length(trim(${table.timeZone})) between 1 and 100`
    ),
    check("availability_schedules_version_check", sql`${table.version} > 0`),
    check(
      "availability_schedules_start_interval_check",
      sql`${table.startIntervalMinutes} between 1 and 1440`
    ),
    check(
      "availability_schedules_buffer_before_check",
      sql`${table.bufferBeforeMinutes} between 0 and 10080`
    ),
    check(
      "availability_schedules_buffer_after_check",
      sql`${table.bufferAfterMinutes} between 0 and 10080`
    ),
    check(
      "availability_schedules_minimum_notice_check",
      sql`${table.minimumNoticeMinutes} between 0 and 525600`
    ),
    check(
      "availability_schedules_booking_horizon_check",
      sql`${table.bookingHorizonDays} between 1 and 730`
    ),
    check(
      "availability_schedules_maximum_bookings_check",
      sql`${table.maximumBookingsPerDay} is null or ${table.maximumBookingsPerDay} between 1 and 100`
    ),
    index("availability_schedules_owner_updated_idx").on(table.ownerUserId, table.updatedAt)
  ]
);

export const availabilityWeeklyPeriods = pgTable(
  "availability_weekly_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    weekday: integer("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.scheduleId, table.ownerUserId],
      foreignColumns: [availabilitySchedules.id, availabilitySchedules.ownerUserId],
      name: "availability_weekly_periods_schedule_owner_fk"
    }).onDelete("cascade"),
    unique("availability_weekly_periods_schedule_day_range_unique").on(
      table.scheduleId,
      table.weekday,
      table.startMinute,
      table.endMinute
    ),
    check("availability_weekly_periods_weekday_check", sql`${table.weekday} between 1 and 7`),
    check(
      "availability_weekly_periods_range_check",
      sql`${table.startMinute} >= 0 and ${table.endMinute} <= 1440 and ${table.startMinute} < ${table.endMinute}`
    ),
    index("availability_weekly_periods_schedule_day_idx").on(
      table.scheduleId,
      table.weekday,
      table.startMinute
    )
  ]
);

export const availabilityDateOverrides = pgTable(
  "availability_date_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    localDate: date("local_date", { mode: "string" }).notNull(),
    mode: text("mode").notNull()
  },
  (table) => [
    unique("availability_date_overrides_identity_unique").on(
      table.id,
      table.scheduleId,
      table.ownerUserId
    ),
    foreignKey({
      columns: [table.scheduleId, table.ownerUserId],
      foreignColumns: [availabilitySchedules.id, availabilitySchedules.ownerUserId],
      name: "availability_date_overrides_schedule_owner_fk"
    }).onDelete("cascade"),
    unique("availability_date_overrides_schedule_date_unique").on(
      table.scheduleId,
      table.localDate
    ),
    check(
      "availability_date_overrides_mode_check",
      sql`${table.mode} in ${sql.raw(formatSchedulingSqlValues(availabilityOverrideModeValues))}`
    ),
    index("availability_date_overrides_schedule_date_idx").on(
      table.scheduleId,
      table.localDate
    )
  ]
);

export const availabilityOverridePeriods = pgTable(
  "availability_override_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    overrideId: uuid("override_id").notNull(),
    scheduleId: uuid("schedule_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.overrideId, table.scheduleId, table.ownerUserId],
      foreignColumns: [
        availabilityDateOverrides.id,
        availabilityDateOverrides.scheduleId,
        availabilityDateOverrides.ownerUserId
      ],
      name: "availability_override_periods_override_schedule_owner_fk"
    }).onDelete("cascade"),
    unique("availability_override_periods_override_range_unique").on(
      table.overrideId,
      table.startMinute,
      table.endMinute
    ),
    check(
      "availability_override_periods_range_check",
      sql`${table.startMinute} >= 0 and ${table.endMinute} <= 1440 and ${table.startMinute} < ${table.endMinute}`
    ),
    index("availability_override_periods_override_start_idx").on(
      table.overrideId,
      table.startMinute
    )
  ]
);

export const availabilityProductAssignments = pgTable(
  "availability_product_assignments",
  {
    scheduleId: uuid("schedule_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    productId: uuid("product_id").notNull()
  },
  (table) => [
    primaryKey({
      name: "availability_product_assignments_pk",
      columns: [table.scheduleId, table.productId]
    }),
    foreignKey({
      columns: [table.scheduleId, table.ownerUserId],
      foreignColumns: [availabilitySchedules.id, availabilitySchedules.ownerUserId],
      name: "availability_product_assignments_schedule_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.productId, table.ownerUserId],
      foreignColumns: [products.id, products.ownerUserId],
      name: "availability_product_assignments_product_owner_fk"
    }).onDelete("cascade"),
    index("availability_product_assignments_owner_product_idx").on(
      table.ownerUserId,
      table.productId
    )
  ]
);
