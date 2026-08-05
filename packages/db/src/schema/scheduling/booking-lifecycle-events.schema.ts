import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import { bookings } from "./bookings.schema";
import {
  bookingCancellationReasonCodeValues,
  bookingLifecycleActorKindValues,
  bookingLifecycleEventKindValues,
  formatSchedulingSqlValues
} from "./scheduling-values";

export const bookingLifecycleEvents = pgTable(
  "booking_lifecycle_events",
  {
    id: uuid("id").primaryKey(),
    bookingId: uuid("booking_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    revision: integer("revision").notNull(),
    eventKind: text("event_kind").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id"),
    reasonCode: text("reason_code"),
    beforeStartAt: timestamp("before_start_at", { withTimezone: true }),
    beforeEndAt: timestamp("before_end_at", { withTimezone: true }),
    beforeTimeZone: text("before_time_zone"),
    afterStartAt: timestamp("after_start_at", { withTimezone: true }),
    afterEndAt: timestamp("after_end_at", { withTimezone: true }),
    afterTimeZone: text("after_time_zone"),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("booking_lifecycle_events_booking_revision_unique").on(table.bookingId, table.revision),
    unique("booking_lifecycle_events_id_owner_unique").on(table.id, table.ownerUserId),
    unique("booking_lifecycle_events_id_booking_owner_unique").on(
      table.id,
      table.bookingId,
      table.ownerUserId
    ),
    foreignKey({
      columns: [table.bookingId, table.ownerUserId],
      foreignColumns: [bookings.id, bookings.ownerUserId],
      name: "booking_lifecycle_events_booking_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.actorUserId],
      foreignColumns: [users.id],
      name: "booking_lifecycle_events_actor_fk"
    }).onDelete("restrict"),
    check("booking_lifecycle_events_revision_check", sql`${table.revision} > 0`),
    check(
      "booking_lifecycle_events_event_kind_check",
      sql`${table.eventKind} in ${sql.raw(
        formatSchedulingSqlValues(bookingLifecycleEventKindValues)
      )}`
    ),
    check(
      "booking_lifecycle_events_actor_check",
      sql`(
        ${table.actorKind} = 'system' and ${table.actorUserId} is null
      ) or (
        ${table.actorKind} in ${sql.raw(
          formatSchedulingSqlValues(bookingLifecycleActorKindValues.slice(1))
        )}
        and ${table.actorUserId} is not null
      )`
    ),
    check(
      "booking_lifecycle_events_reason_check",
      sql`${table.reasonCode} is null or ${table.reasonCode} in ${sql.raw(
        formatSchedulingSqlValues(bookingCancellationReasonCodeValues)
      )}`
    ),
    check(
      "booking_lifecycle_events_before_schedule_check",
      sql`(
        ${table.beforeStartAt} is null
        and ${table.beforeEndAt} is null
        and ${table.beforeTimeZone} is null
      ) or (
        ${table.beforeStartAt} < ${table.beforeEndAt}
        and length(trim(${table.beforeTimeZone})) between 1 and 100
      )`
    ),
    check(
      "booking_lifecycle_events_after_schedule_check",
      sql`(
        ${table.afterStartAt} is null
        and ${table.afterEndAt} is null
        and ${table.afterTimeZone} is null
      ) or (
        ${table.afterStartAt} < ${table.afterEndAt}
        and length(trim(${table.afterTimeZone})) between 1 and 100
      )`
    ),
    check(
      "booking_lifecycle_events_transition_check",
      sql`(
        ${table.eventKind} = 'confirmed'
        and ${table.revision} = 1
        and ${table.reasonCode} is null
        and ${table.beforeStartAt} is null
        and ${table.beforeEndAt} is null
        and ${table.beforeTimeZone} is null
        and ${table.afterStartAt} is not null
        and ${table.afterEndAt} is not null
        and ${table.afterTimeZone} is not null
      ) or (
        ${table.eventKind} = 'rescheduled'
        and ${table.revision} > 1
        and ${table.reasonCode} is null
        and ${table.beforeStartAt} is not null
        and ${table.beforeEndAt} is not null
        and ${table.beforeTimeZone} is not null
        and ${table.afterStartAt} is not null
        and ${table.afterEndAt} is not null
        and ${table.afterTimeZone} is not null
        and (
          ${table.beforeStartAt}, ${table.beforeEndAt}, ${table.beforeTimeZone}
        ) is distinct from (
          ${table.afterStartAt}, ${table.afterEndAt}, ${table.afterTimeZone}
        )
      ) or (
        ${table.eventKind} = 'completed'
        and ${table.revision} > 1
        and ${table.reasonCode} is null
        and ${table.beforeStartAt} is not null
        and ${table.beforeEndAt} is not null
        and ${table.beforeTimeZone} is not null
        and ${table.afterStartAt} is null
        and ${table.afterEndAt} is null
        and ${table.afterTimeZone} is null
      ) or (
        ${table.eventKind} = 'cancelled'
        and ${table.revision} > 1
        and ${table.reasonCode} is not null
        and ${table.beforeStartAt} is not null
        and ${table.beforeEndAt} is not null
        and ${table.beforeTimeZone} is not null
        and ${table.afterStartAt} is null
        and ${table.afterEndAt} is null
        and ${table.afterTimeZone} is null
      )`
    ),
    check(
      "booking_lifecycle_events_digest_check",
      sql`${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    index("booking_lifecycle_events_owner_occurred_idx").on(
      table.ownerUserId,
      table.occurredAt,
      table.id
    )
  ]
);

export const bookingLifecycleEventIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_reject_booking_lifecycle_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $booking_lifecycle_event_guard$
BEGIN
  RAISE EXCEPTION 'booking lifecycle events are immutable'
    USING ERRCODE = '55000';
END;
$booking_lifecycle_event_guard$;
--> statement-breakpoint
CREATE TRIGGER "booking_lifecycle_events_immutable"
BEFORE UPDATE OR DELETE ON "booking_lifecycle_events"
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_reject_booking_lifecycle_event_mutation();
--> statement-breakpoint
CREATE TRIGGER "booking_lifecycle_events_no_truncate"
BEFORE TRUNCATE ON "booking_lifecycle_events"
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_reject_booking_lifecycle_event_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_booking_lifecycle_history()
RETURNS trigger
LANGUAGE plpgsql
AS $booking_lifecycle_history_guard$
DECLARE
  target_booking bookings%ROWTYPE;
  history_count integer;
  minimum_revision integer;
  maximum_revision integer;
  first_event_kind text;
  latest_event booking_lifecycle_events%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'bookings' THEN
    target_booking := NEW;
  ELSE
    SELECT * INTO target_booking
      FROM bookings
     WHERE id = NEW.booking_id
       AND owner_user_id = NEW.owner_user_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT count(*)::integer, min(revision), max(revision),
         (array_agg(event_kind ORDER BY revision))[1]
    INTO history_count, minimum_revision, maximum_revision, first_event_kind
    FROM booking_lifecycle_events
   WHERE booking_id = target_booking.id
     AND owner_user_id = target_booking.owner_user_id;

  IF target_booking.lifecycle_revision = 0 THEN
    IF history_count <> 0 THEN
      RAISE EXCEPTION 'Booking lifecycle revision zero cannot have canonical history'
        USING ERRCODE = '23514', CONSTRAINT = 'bookings_lifecycle_history_consistency';
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO latest_event
    FROM booking_lifecycle_events
   WHERE booking_id = target_booking.id
     AND owner_user_id = target_booking.owner_user_id
     AND revision = target_booking.lifecycle_revision;

  IF history_count <> target_booking.lifecycle_revision
     OR minimum_revision <> 1
     OR maximum_revision <> target_booking.lifecycle_revision
     OR first_event_kind <> 'confirmed'
     OR NOT FOUND
     OR (
       target_booking.state IN ('confirmed', 'no_show')
       AND (
         latest_event.event_kind NOT IN ('confirmed', 'rescheduled')
         OR latest_event.after_start_at IS DISTINCT FROM target_booking.service_start_at
         OR latest_event.after_end_at IS DISTINCT FROM target_booking.service_end_at
         OR latest_event.after_time_zone IS DISTINCT FROM target_booking.time_zone_snapshot
       )
     )
     OR (
       target_booking.state = 'completed'
       AND (
         latest_event.event_kind <> 'completed'
         OR latest_event.before_start_at IS DISTINCT FROM target_booking.service_start_at
         OR latest_event.before_end_at IS DISTINCT FROM target_booking.service_end_at
         OR latest_event.before_time_zone IS DISTINCT FROM target_booking.time_zone_snapshot
       )
     )
     OR (target_booking.state = 'cancelled' AND latest_event.event_kind <> 'cancelled') THEN
    RAISE EXCEPTION 'Booking lifecycle revision does not match its canonical history'
      USING ERRCODE = '23514', CONSTRAINT = 'bookings_lifecycle_history_consistency';
  END IF;
  RETURN NULL;
END;
$booking_lifecycle_history_guard$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "bookings_lifecycle_history_consistency"
AFTER INSERT OR UPDATE ON "bookings"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_booking_lifecycle_history();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "booking_lifecycle_events_aggregate_consistency"
AFTER INSERT ON "booking_lifecycle_events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_booking_lifecycle_history();`;
