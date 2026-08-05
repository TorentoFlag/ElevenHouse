import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  flowBookingLifecycleHeads,
  flowBookingLifecycleIntegritySql,
  flowBookingLifecycleReceipts
} from "./flow-booking-lifecycle.schema";
import { flowRunEvents } from "./flow-runtime.schema";

describe("Flow Booking lifecycle projection schema", () => {
  it("stores one ordered head and one immutable receipt per Booking revision", () => {
    const head = getTableConfig(flowBookingLifecycleHeads);
    const receipt = getTableConfig(flowBookingLifecycleReceipts);

    expect(head.name).toBe("flow_booking_lifecycle_heads");
    expect(head.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "booking_id",
        "owner_user_id",
        "applied_revision",
        "state",
        "current_start_at",
        "current_end_at",
        "current_time_zone",
        "last_lifecycle_event_id",
        "last_canonical_digest"
      ])
    );
    expect(receipt.name).toBe("flow_booking_lifecycle_receipts");
    expect(receipt.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "lifecycle_event_id",
        "booking_id",
        "owner_user_id",
        "revision",
        "event_kind",
        "canonical_digest",
        "outcome",
        "flow_runtime_event_id",
        "affected_run_count",
        "affected_work_item_count",
        "preserved_completed_work_item_count",
        "processed_at"
      ])
    );
    expect(receipt.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "flow_booking_lifecycle_receipts_booking_revision_unique"
    );
  });

  it("binds the projection to canonical Booking events and validates lifecycle shape", () => {
    const head = getTableConfig(flowBookingLifecycleHeads);
    const receipt = getTableConfig(flowBookingLifecycleReceipts);

    expect(head.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(
      expect.arrayContaining([
        "flow_booking_lifecycle_heads_booking_owner_fk",
        "flow_booking_lifecycle_heads_event_booking_owner_fk"
      ])
    );
    expect(receipt.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(
      expect.arrayContaining([
        "flow_booking_lifecycle_receipts_event_booking_owner_fk",
        "flow_booking_lifecycle_receipts_runtime_event_owner_fk"
      ])
    );
    expect(head.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "flow_booking_lifecycle_heads_revision_check",
        "flow_booking_lifecycle_heads_state_schedule_check",
        "flow_booking_lifecycle_heads_digest_check"
      ])
    );
    expect(receipt.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "flow_booking_lifecycle_receipts_event_kind_check",
        "flow_booking_lifecycle_receipts_outcome_check",
        "flow_booking_lifecycle_receipts_shape_check"
      ])
    );
  });

  it("guards monotonic heads and immutable receipt/source agreement in PostgreSQL", () => {
    expect(flowBookingLifecycleIntegritySql).toContain(
      "flow_booking_lifecycle_receipts_immutable"
    );
    expect(flowBookingLifecycleIntegritySql).toContain(
      "NEW.applied_revision <> OLD.applied_revision + 1"
    );
    expect(flowBookingLifecycleIntegritySql).toContain("NEW.applied_revision <> 1");
    expect(flowBookingLifecycleIntegritySql).toContain(
      "FROM flow_booking_lifecycle_receipts receipt"
    );
    expect(flowBookingLifecycleIntegritySql).toContain(
      "head.applied_revision >= NEW.revision"
    );
    expect(flowBookingLifecycleIntegritySql).toContain(
      "Flow Booking lifecycle head does not match its canonical event"
    );
    expect(flowBookingLifecycleIntegritySql).toContain(
      "Flow Booking lifecycle receipt does not match its canonical event"
    );
    expect(flowBookingLifecycleIntegritySql).toContain(
      "FROM flow_runtime_events runtime_event"
    );
    expect(flowBookingLifecycleIntegritySql).toContain(
      "runtime_event.source_event_id = NEW.lifecycle_event_id::text"
    );
    expect(flowBookingLifecycleIntegritySql).toContain(
      "runtime_event.subject_id = NEW.booking_id::text"
    );
    expect(flowBookingLifecycleIntegritySql).toContain(
      "runtime_event.payload->>'lifecycleEventId' = NEW.lifecycle_event_id::text"
    );
    expect(flowBookingLifecycleIntegritySql).toContain(
      "runtime_event.payload->>'lifecycleRevision' = NEW.revision::text"
    );
    expect(flowBookingLifecycleIntegritySql).toContain(
      "flow_booking_lifecycle_source_consistency"
    );
  });

  it("gives system run cancellation a lifecycle-event provenance column", () => {
    const events = getTableConfig(flowRunEvents);
    expect(events.columns.map((column) => column.name)).toContain("booking_lifecycle_event_id");
    expect(events.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      "flow_run_events_booking_lifecycle_event_owner_fk"
    );
    expect(events.indexes.map((index) => index.config.name)).toContain(
      "flow_run_events_booking_lifecycle_run_unique"
    );
  });

  it("allows accepted reschedule provenance only on its dedicated run event", () => {
    const events = getTableConfig(flowRunEvents);
    const provenance = events.checks.find(
      (constraint) => constraint.name === "flow_run_events_booking_lifecycle_provenance_check"
    );

    expect(provenance).toBeDefined();
    expect(new PgDialect().sqlToQuery(provenance!.value).sql).toContain(
      "booking_rescheduled"
    );
  });
});
