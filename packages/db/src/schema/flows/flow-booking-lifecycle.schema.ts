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

import {
  bookingLifecycleEventKindValues,
  formatSchedulingSqlValues
} from "../scheduling/scheduling-values";
import { bookingLifecycleEvents } from "../scheduling/booking-lifecycle-events.schema";
import { bookings } from "../scheduling/bookings.schema";
import { flowRuntimeEvents } from "./flow-runtime.schema";
import {
  flowBookingLifecycleReceiptOutcomeValues,
  flowBookingLifecycleStateValues,
  formatFlowSqlValues
} from "./flows-values";

export const flowBookingLifecycleHeads = pgTable(
  "flow_booking_lifecycle_heads",
  {
    bookingId: uuid("booking_id").primaryKey(),
    ownerUserId: uuid("owner_user_id").notNull(),
    appliedRevision: integer("applied_revision").notNull(),
    state: text("state").notNull(),
    currentStartAt: timestamp("current_start_at", { withTimezone: true }),
    currentEndAt: timestamp("current_end_at", { withTimezone: true }),
    currentTimeZone: text("current_time_zone"),
    lastLifecycleEventId: uuid("last_lifecycle_event_id").notNull(),
    lastCanonicalDigest: varchar("last_canonical_digest", { length: 71 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.bookingId, table.ownerUserId],
      foreignColumns: [bookings.id, bookings.ownerUserId],
      name: "flow_booking_lifecycle_heads_booking_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.lastLifecycleEventId, table.bookingId, table.ownerUserId],
      foreignColumns: [
        bookingLifecycleEvents.id,
        bookingLifecycleEvents.bookingId,
        bookingLifecycleEvents.ownerUserId
      ],
      name: "flow_booking_lifecycle_heads_event_booking_owner_fk"
    }).onDelete("restrict"),
    unique("flow_booking_lifecycle_heads_booking_owner_unique").on(
      table.bookingId,
      table.ownerUserId
    ),
    index("flow_booking_lifecycle_heads_owner_state_idx").on(
      table.ownerUserId,
      table.state,
      table.updatedAt,
      table.bookingId
    ),
    check("flow_booking_lifecycle_heads_revision_check", sql`${table.appliedRevision} > 0`),
    check(
      "flow_booking_lifecycle_heads_state_check",
      sql`${table.state} in ${sql.raw(formatFlowSqlValues(flowBookingLifecycleStateValues))}`
    ),
    check(
      "flow_booking_lifecycle_heads_state_schedule_check",
      sql`(
        ${table.state} in ('confirmed', 'completed')
        and ${table.currentStartAt} is not null
        and ${table.currentEndAt} is not null
        and ${table.currentStartAt} < ${table.currentEndAt}
        and length(trim(${table.currentTimeZone})) between 1 and 100
      ) or (
        ${table.state} = 'cancelled'
        and ${table.currentStartAt} is null
        and ${table.currentEndAt} is null
        and ${table.currentTimeZone} is null
      )`
    ),
    check(
      "flow_booking_lifecycle_heads_digest_check",
      sql`${table.lastCanonicalDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "flow_booking_lifecycle_heads_time_order_check",
      sql`${table.updatedAt} >= ${table.createdAt}`
    )
  ]
);

export const flowBookingLifecycleReceipts = pgTable(
  "flow_booking_lifecycle_receipts",
  {
    lifecycleEventId: uuid("lifecycle_event_id").primaryKey(),
    bookingId: uuid("booking_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    revision: integer("revision").notNull(),
    eventKind: text("event_kind").notNull(),
    canonicalDigest: varchar("canonical_digest", { length: 71 }).notNull(),
    outcome: text("outcome").notNull(),
    flowRuntimeEventId: uuid("flow_runtime_event_id"),
    affectedRunCount: integer("affected_run_count").notNull().default(0),
    affectedWorkItemCount: integer("affected_work_item_count").notNull().default(0),
    preservedCompletedWorkItemCount: integer("preserved_completed_work_item_count")
      .notNull()
      .default(0),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.lifecycleEventId, table.bookingId, table.ownerUserId],
      foreignColumns: [
        bookingLifecycleEvents.id,
        bookingLifecycleEvents.bookingId,
        bookingLifecycleEvents.ownerUserId
      ],
      name: "flow_booking_lifecycle_receipts_event_booking_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.flowRuntimeEventId, table.ownerUserId],
      foreignColumns: [flowRuntimeEvents.id, flowRuntimeEvents.ownerUserId],
      name: "flow_booking_lifecycle_receipts_runtime_event_owner_fk"
    }).onDelete("restrict"),
    unique("flow_booking_lifecycle_receipts_booking_revision_unique").on(
      table.bookingId,
      table.revision
    ),
    index("flow_booking_lifecycle_receipts_owner_processed_idx").on(
      table.ownerUserId,
      table.processedAt,
      table.lifecycleEventId
    ),
    check("flow_booking_lifecycle_receipts_revision_check", sql`${table.revision} > 0`),
    check(
      "flow_booking_lifecycle_receipts_event_kind_check",
      sql`${table.eventKind} in ${sql.raw(
        formatSchedulingSqlValues(bookingLifecycleEventKindValues)
      )}`
    ),
    check(
      "flow_booking_lifecycle_receipts_outcome_check",
      sql`${table.outcome} in ${sql.raw(
        formatFlowSqlValues(flowBookingLifecycleReceiptOutcomeValues)
      )}`
    ),
    check(
      "flow_booking_lifecycle_receipts_digest_check",
      sql`${table.canonicalDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "flow_booking_lifecycle_receipts_counts_check",
      sql`${table.affectedRunCount} >= 0
        and ${table.affectedWorkItemCount} >= 0
        and ${table.preservedCompletedWorkItemCount} >= 0`
    ),
    check(
      "flow_booking_lifecycle_receipts_shape_check",
      sql`(
        ${table.eventKind} = 'confirmed'
        and ${table.outcome} in ('enrolled', 'no_match', 'late_unmatched', 'subject_ineligible', 'suppressed')
        and ${table.flowRuntimeEventId} is not null
        and ${table.affectedWorkItemCount} = 0
        and ${table.preservedCompletedWorkItemCount} = 0
      ) or (
        ${table.eventKind} = 'rescheduled'
        and ${table.outcome} = 'rescheduled'
        and ${table.flowRuntimeEventId} is null
      ) or (
        ${table.eventKind} = 'completed'
        and ${table.outcome} = 'completed'
        and ${table.flowRuntimeEventId} is null
        and ${table.affectedRunCount} = 0
        and ${table.affectedWorkItemCount} = 0
        and ${table.preservedCompletedWorkItemCount} = 0
      ) or (
        ${table.eventKind} = 'cancelled'
        and ${table.outcome} = 'canceled'
        and ${table.flowRuntimeEventId} is null
      )`
    )
  ]
);

export const flowBookingLifecycleIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_booking_lifecycle_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_booking_lifecycle_receipt_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Flow Booking lifecycle receipts cannot be truncated'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_receipts_immutable';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Flow Booking lifecycle receipts are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_receipts_immutable';
  END IF;
  IF EXISTS (SELECT 1 FROM bookings WHERE id = OLD.booking_id) THEN
    RAISE EXCEPTION 'Flow Booking lifecycle receipts are retained for the Booking lifetime'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_receipts_immutable';
  END IF;
  RETURN OLD;
END;
$flow_booking_lifecycle_receipt_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_booking_lifecycle_receipts_immutable"
BEFORE UPDATE OR DELETE ON flow_booking_lifecycle_receipts
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_booking_lifecycle_receipt_mutation();
--> statement-breakpoint
CREATE TRIGGER "flow_booking_lifecycle_receipts_truncate_guard"
BEFORE TRUNCATE ON flow_booking_lifecycle_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_flow_booking_lifecycle_receipt_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_booking_lifecycle_head_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_booking_lifecycle_head_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Flow Booking lifecycle heads cannot be truncated'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_heads_transition_guard';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM bookings WHERE id = OLD.booking_id) THEN
      RAISE EXCEPTION 'Flow Booking lifecycle head is retained for the Booking lifetime'
        USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_heads_transition_guard';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.applied_revision <> 1 OR NEW.state <> 'confirmed' THEN
      RAISE EXCEPTION 'Flow Booking lifecycle head must begin with confirmation revision one'
        USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_heads_transition_guard';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.booking_id <> NEW.booking_id
     OR OLD.owner_user_id <> NEW.owner_user_id
     OR OLD.created_at <> NEW.created_at
     OR NEW.applied_revision <> OLD.applied_revision + 1
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Flow Booking lifecycle head permits one contiguous revision transition'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_heads_transition_guard';
  END IF;
  RETURN NEW;
END;
$flow_booking_lifecycle_head_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_booking_lifecycle_heads_transition_guard"
BEFORE INSERT OR UPDATE OR DELETE ON flow_booking_lifecycle_heads
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_booking_lifecycle_head_mutation();
--> statement-breakpoint
CREATE TRIGGER "flow_booking_lifecycle_heads_truncate_guard"
BEFORE TRUNCATE ON flow_booking_lifecycle_heads
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_flow_booking_lifecycle_head_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_booking_lifecycle_source()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_booking_lifecycle_source_guard$
DECLARE
  source_event booking_lifecycle_events%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'flow_booking_lifecycle_heads' THEN
    SELECT * INTO source_event
      FROM booking_lifecycle_events
     WHERE id = NEW.last_lifecycle_event_id
       AND booking_id = NEW.booking_id
       AND owner_user_id = NEW.owner_user_id
       AND revision = NEW.applied_revision;
    IF NOT FOUND
       OR source_event.canonical_digest IS DISTINCT FROM NEW.last_canonical_digest
       OR (
         NEW.state in ('confirmed', 'completed')
         AND (
           (
             source_event.event_kind IN ('confirmed', 'rescheduled')
             AND (
               source_event.after_start_at IS DISTINCT FROM NEW.current_start_at
               OR source_event.after_end_at IS DISTINCT FROM NEW.current_end_at
               OR source_event.after_time_zone IS DISTINCT FROM NEW.current_time_zone
             )
           ) OR (
             source_event.event_kind = 'completed'
             AND (
               source_event.before_start_at IS DISTINCT FROM NEW.current_start_at
               OR source_event.before_end_at IS DISTINCT FROM NEW.current_end_at
               OR source_event.before_time_zone IS DISTINCT FROM NEW.current_time_zone
             )
           ) OR source_event.event_kind NOT IN ('confirmed', 'rescheduled', 'completed')
         )
       )
       OR (NEW.state = 'cancelled' AND source_event.event_kind <> 'cancelled')
       OR NOT EXISTS (
         SELECT 1
           FROM flow_booking_lifecycle_receipts receipt
          WHERE receipt.lifecycle_event_id = NEW.last_lifecycle_event_id
            AND receipt.booking_id = NEW.booking_id
            AND receipt.owner_user_id = NEW.owner_user_id
            AND receipt.revision = NEW.applied_revision
            AND receipt.canonical_digest = NEW.last_canonical_digest
       ) THEN
      RAISE EXCEPTION 'Flow Booking lifecycle head does not match its canonical event'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_booking_lifecycle_source_consistency';
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO source_event
    FROM booking_lifecycle_events
   WHERE id = NEW.lifecycle_event_id
     AND booking_id = NEW.booking_id
     AND owner_user_id = NEW.owner_user_id
     AND revision = NEW.revision;
  IF NOT FOUND
     OR source_event.event_kind IS DISTINCT FROM NEW.event_kind
     OR source_event.canonical_digest IS DISTINCT FROM NEW.canonical_digest
     OR (
       NEW.event_kind = 'confirmed'
       AND (
         NOT EXISTS (
           SELECT 1
             FROM flow_runtime_events runtime_event
             JOIN bookings booking
               ON booking.id = NEW.booking_id
              AND booking.owner_user_id = NEW.owner_user_id
            WHERE runtime_event.id = NEW.flow_runtime_event_id
              AND runtime_event.owner_user_id = NEW.owner_user_id
              AND runtime_event.source = 'booking'
              AND runtime_event.source_event_id = NEW.lifecycle_event_id::text
              AND runtime_event.dedupe_key = 'booking-confirmed:' || NEW.booking_id::text
              AND runtime_event.event_kind = 'booking_confirmed'
              AND runtime_event.subject_type = 'booking'
              AND runtime_event.subject_id = NEW.booking_id::text
              AND runtime_event.occurrence_key = NEW.booking_id::text
              AND runtime_event.occurred_at IS NOT DISTINCT FROM source_event.occurred_at
              AND runtime_event.payload_schema_version = 1
              AND runtime_event.payload->>'bookingId' = NEW.booking_id::text
              AND runtime_event.payload->>'clientUserId' = booking.client_user_id::text
              AND runtime_event.payload->>'productId' = booking.product_id::text
              AND jsonb_typeof(runtime_event.payload->'startAt') = 'string'
              AND (runtime_event.payload->>'startAt')::timestamptz
                    IS NOT DISTINCT FROM source_event.after_start_at
              AND jsonb_typeof(runtime_event.payload->'endAt') = 'string'
              AND (runtime_event.payload->>'endAt')::timestamptz
                    IS NOT DISTINCT FROM source_event.after_end_at
              AND runtime_event.payload->>'lifecycleEventId' = NEW.lifecycle_event_id::text
              AND runtime_event.payload->>'lifecycleRevision' = NEW.revision::text
              AND runtime_event.payload - ARRAY[
                'bookingId',
                'clientUserId',
                'productId',
                'startAt',
                'endAt',
                'lifecycleEventId',
                'lifecycleRevision'
              ]::text[] = '{}'::jsonb
              AND runtime_event.classification = 'personal'
              AND runtime_event.redaction_version = 1
              AND runtime_event.retention_policy_id = 'flows.booking-confirmed.v1'
              AND runtime_event.ingestion_outcome = NEW.outcome
              AND runtime_event.processed_at IS NOT NULL
         )
         OR (SELECT count(*)::integer
               FROM flow_runs run
              WHERE run.runtime_event_id = NEW.flow_runtime_event_id
                AND run.owner_user_id = NEW.owner_user_id)
            IS DISTINCT FROM NEW.affected_run_count
       )
     )
     OR (
       NEW.event_kind = 'rescheduled'
       AND (
         (SELECT count(*)::integer
            FROM flow_run_events event
           WHERE event.booking_lifecycle_event_id = NEW.lifecycle_event_id
             AND event.owner_user_id = NEW.owner_user_id
             AND event.event_type = 'booking_rescheduled')
           IS DISTINCT FROM NEW.affected_run_count
         OR (SELECT count(*)::integer
               FROM flow_work_items item
               JOIN flow_run_events event
                 ON event.id = item.last_run_event_id
                AND event.flow_run_id = item.flow_run_id
                AND event.owner_user_id = item.owner_user_id
              WHERE event.booking_lifecycle_event_id = NEW.lifecycle_event_id
                AND event.event_type = 'booking_rescheduled')
              IS DISTINCT FROM NEW.affected_work_item_count
         OR (SELECT count(*)::integer
               FROM flow_work_items item
               JOIN flow_runs run ON run.id = item.flow_run_id
               JOIN flow_runtime_events runtime_event ON runtime_event.id = run.runtime_event_id
              WHERE item.owner_user_id = NEW.owner_user_id
                AND item.status = 'completed'
                AND runtime_event.source = 'booking'
                AND runtime_event.subject_type = 'booking'
                AND runtime_event.subject_id = NEW.booking_id::text)
              IS DISTINCT FROM NEW.preserved_completed_work_item_count
       )
     )
     OR (
       NEW.event_kind = 'completed'
       AND (
         NEW.outcome <> 'completed'
         OR NEW.flow_runtime_event_id IS NOT NULL
         OR NEW.affected_run_count <> 0
         OR NEW.affected_work_item_count <> 0
         OR NEW.preserved_completed_work_item_count <> 0
       )
     )
     OR (
       NEW.event_kind = 'cancelled'
       AND (
         (SELECT count(*)::integer
            FROM flow_run_events event
           WHERE event.booking_lifecycle_event_id = NEW.lifecycle_event_id
             AND event.owner_user_id = NEW.owner_user_id
             AND event.event_type = 'run_canceled')
           IS DISTINCT FROM NEW.affected_run_count
         OR (SELECT count(*)::integer
               FROM flow_work_items item
               JOIN flow_run_events event
                 ON event.id = item.last_run_event_id
                AND event.flow_run_id = item.flow_run_id
                AND event.owner_user_id = item.owner_user_id
              WHERE event.booking_lifecycle_event_id = NEW.lifecycle_event_id
                AND event.event_type = 'run_canceled')
              IS DISTINCT FROM NEW.affected_work_item_count
         OR (SELECT count(*)::integer
               FROM flow_work_items item
               JOIN flow_runs run ON run.id = item.flow_run_id
               JOIN flow_runtime_events runtime_event ON runtime_event.id = run.runtime_event_id
              WHERE item.owner_user_id = NEW.owner_user_id
                AND item.status = 'completed'
                AND runtime_event.source = 'booking'
                AND runtime_event.subject_type = 'booking'
                AND runtime_event.subject_id = NEW.booking_id::text)
              IS DISTINCT FROM NEW.preserved_completed_work_item_count
       )
     )
     OR NOT EXISTS (
       SELECT 1
         FROM flow_booking_lifecycle_heads head
        WHERE head.booking_id = NEW.booking_id
          AND head.owner_user_id = NEW.owner_user_id
          AND head.applied_revision >= NEW.revision
     ) THEN
    RAISE EXCEPTION 'Flow Booking lifecycle receipt does not match its canonical event'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_booking_lifecycle_source_consistency';
  END IF;
  RETURN NULL;
END;
$flow_booking_lifecycle_source_guard$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_booking_lifecycle_heads_source_consistency"
AFTER INSERT OR UPDATE ON flow_booking_lifecycle_heads
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_booking_lifecycle_source();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_booking_lifecycle_receipts_source_consistency"
AFTER INSERT ON flow_booking_lifecycle_receipts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_booking_lifecycle_source();`;
