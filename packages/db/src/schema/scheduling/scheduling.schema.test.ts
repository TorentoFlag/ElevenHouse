import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { products } from "../products";
import {
  availabilityDateOverrides,
  availabilityOverridePeriods,
  availabilityProductAssignments,
  availabilitySchedules,
  availabilityWeeklyPeriods,
  bookingLifecycleEvents,
  bookings,
  idempotencyCommands,
  manualCalendarBlocks,
  scheduleReservations
} from "./index";

const migrationFile = readCurrentMigrationSql();

describe("scheduling persistence schema", () => {
  it("owns the complete availability aggregate with owner-scoped references", () => {
    const scheduleConfig = getTableConfig(availabilitySchedules);
    const weeklyConfig = getTableConfig(availabilityWeeklyPeriods);
    const overrideConfig = getTableConfig(availabilityDateOverrides);
    const overridePeriodConfig = getTableConfig(availabilityOverridePeriods);
    const assignmentConfig = getTableConfig(availabilityProductAssignments);
    const productConfig = getTableConfig(products);

    expect(Object.keys(getTableColumns(availabilitySchedules))).toEqual(
      expect.arrayContaining([
        "id",
        "ownerUserId",
        "timeZone",
        "isDefault",
        "version",
        "startIntervalMinutes",
        "bufferBeforeMinutes",
        "bufferAfterMinutes",
        "minimumNoticeMinutes",
        "bookingHorizonDays",
        "maximumBookingsPerDay"
      ])
    );
    expect(scheduleConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "availability_schedules_id_owner_unique"
    );
    expect(scheduleConfig.indexes.map((index) => index.config.name)).toContain(
      "availability_schedules_default_owner_unique"
    );
    expect(weeklyConfig.foreignKeys.map((key) => key.getName())).toContain(
      "availability_weekly_periods_schedule_owner_fk"
    );
    expect(overrideConfig.foreignKeys.map((key) => key.getName())).toContain(
      "availability_date_overrides_schedule_owner_fk"
    );
    expect(overridePeriodConfig.foreignKeys.map((key) => key.getName())).toContain(
      "availability_override_periods_override_schedule_owner_fk"
    );
    expect(assignmentConfig.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "availability_product_assignments_schedule_owner_fk",
        "availability_product_assignments_product_owner_fk"
      ])
    );
    expect(productConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "products_id_owner_unique"
    );
  });

  it("uses one owner-wide reservation boundary for bookings and manual blocks", () => {
    const reservationConfig = getTableConfig(scheduleReservations);
    const bookingConfig = getTableConfig(bookings);
    const blockConfig = getTableConfig(manualCalendarBlocks);

    expect(Object.keys(getTableColumns(scheduleReservations))).toEqual(
      expect.arrayContaining([
        "ownerUserId",
        "scheduleId",
        "kind",
        "lifecycle",
        "serviceStartAt",
        "serviceEndAt",
        "occupiedStartAt",
        "occupiedEndAt",
        "sourceAggregateId",
        "holdExpiresAt"
      ])
    );
    expect(reservationConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "schedule_reservations_id_owner_unique"
    );
    expect(reservationConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "schedule_reservations_kind_check",
        "schedule_reservations_lifecycle_check",
        "schedule_reservations_service_range_check",
        "schedule_reservations_occupied_range_check"
      ])
    );
    expect(Object.keys(getTableColumns(bookings))).toEqual(
      expect.arrayContaining([
        "reservationId",
        "source",
        "state",
        "lifecycleRevision",
        "holdExpiresAt",
        "serviceStartAt",
        "clientDataRequirementsSnapshot"
      ])
    );
    expect(bookingConfig.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "bookings_reservation_owner_fk",
        "bookings_product_owner_fk"
      ])
    );
    expect(bookingConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "bookings_state_check",
        "bookings_source_check",
        "bookings_hold_expiry_check",
        "bookings_lifecycle_revision_check",
        "bookings_client_data_requirements_snapshot_check"
      ])
    );
    expect(blockConfig.foreignKeys.map((key) => key.getName())).toContain(
      "manual_calendar_blocks_reservation_owner_fk"
    );
  });

  it("persists immutable revisioned booking lifecycle authority", () => {
    const config = getTableConfig(bookingLifecycleEvents);

    expect(Object.keys(getTableColumns(bookingLifecycleEvents))).toEqual(
      expect.arrayContaining([
        "id",
        "bookingId",
        "ownerUserId",
        "revision",
        "eventKind",
        "actorKind",
        "actorUserId",
        "reasonCode",
        "beforeStartAt",
        "beforeEndAt",
        "beforeTimeZone",
        "afterStartAt",
        "afterEndAt",
        "afterTimeZone",
        "canonicalDigest",
        "occurredAt"
      ])
    );
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "booking_lifecycle_events_booking_revision_unique"
    );
    expect(config.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "booking_lifecycle_events_booking_owner_fk",
        "booking_lifecycle_events_actor_fk"
      ])
    );
    expect(config.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "booking_lifecycle_events_revision_check",
        "booking_lifecycle_events_event_kind_check",
        "booking_lifecycle_events_actor_check",
        "booking_lifecycle_events_transition_check",
        "booking_lifecycle_events_digest_check"
      ])
    );
  });

  it("persists request hashes and replayable contract results", () => {
    const config = getTableConfig(idempotencyCommands);

    expect(Object.keys(getTableColumns(idempotencyCommands))).toEqual(
      expect.arrayContaining([
        "apiSurface",
        "actorUserId",
        "commandScope",
        "key",
        "requestHash",
        "state",
        "result",
        "expiresAt"
      ])
    );
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "idempotency_commands_scope_key_unique"
    );
    expect(config.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "idempotency_commands_request_hash_check",
        "idempotency_commands_result_state_check"
      ])
    );
  });

  it("keeps scheduling tables and the active-range exclusion in the baseline", () => {
    const migration = migrationFile;

    for (const table of [
      "availability_schedules",
      "availability_weekly_periods",
      "availability_date_overrides",
      "availability_override_periods",
      "availability_product_assignments",
      "schedule_reservations",
      "manual_calendar_blocks",
      "bookings",
      "booking_lifecycle_events",
      "idempotency_commands"
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
    expect(migration.match(/CREATE EXTENSION IF NOT EXISTS btree_gist;/g)).toHaveLength(1);
    expect(
      migration.match(/schedule_reservations_active_owner_range_exclude/g)
    ).toHaveLength(1);
    expect(migration).toContain("EXCLUDE USING gist");
    expect(migration).toContain(
      "tstzrange(\"occupied_start_at\", \"occupied_end_at\", '[)') WITH &&"
    );
    expect(migration).toContain("WHERE (\"lifecycle\" = 'active')");
    expect(migration.match(/booking_lifecycle_events_immutable/g)).toHaveLength(1);
    expect(migration.match(/booking_lifecycle_events_no_truncate/g)).toHaveLength(1);
  });
});
