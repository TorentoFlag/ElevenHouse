import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertFlowBookingLifecycleSafety,
  reconcileFlowBookingLifecycleSafety
} from "../scripts/flow-booking-lifecycle-safety-reconciliation";
import { assertDevelopmentDatabaseUrl } from "./connection";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_flow_booking_lifecycle_safety_${randomUUID().replaceAll(
  "-",
  ""
)}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
const databaseClient = new Client({ connectionString: isolatedDatabaseUrl });
const currentBaselineSql = readFileSync(
  process.env.FLOW_INTEGRATION_BASELINE_PATH ?? "packages/db/drizzle/0000_sticky_rictor.sql",
  "utf8"
);

describe("Flow Booking lifecycle safety baseline PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    await databaseClient.connect();
  }, 30_000);

  afterAll(async () => {
    try {
      await databaseClient.end();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  beforeEach(async () => {
    await databaseClient.query("DROP SCHEMA public CASCADE");
    await databaseClient.query("CREATE SCHEMA public");
    await databaseClient.query(currentBaselineSql);
  });

  it("recognizes the exact generated baseline and remains an exact no-op", async () => {
    await expect(runReconciliation()).resolves.toBe("already_current");
    await expect(assertFlowBookingLifecycleSafety(databaseClient)).resolves.toBeUndefined();
  });

  it("rejects a receipt shape reconstructed from the current catalog", async () => {
    await databaseClient.query(downgradeReceiptShapeDdl);

    await expect(runReconciliation()).rejects.toThrow(
      /partial or drifted Flow Booking lifecycle catalog/
    );
  });

  it("installs the absent lifecycle authority only when Booking history is empty", async () => {
    await databaseClient.query(downgradeLifecycleAuthorityDdl);

    await expect(runReconciliation()).resolves.toBe("reconciled");
    await expect(assertFlowBookingLifecycleSafety(databaseClient)).resolves.toBeUndefined();
    await expect(runReconciliation()).resolves.toBe("already_current");
  });

  it("rejects absent lifecycle authority when existing Booking history cannot be reconstructed", async () => {
    await databaseClient.query(downgradeLifecycleAuthorityDdl);
    await insertBookingWithoutLifecycleHistory();

    await expect(runReconciliation()).rejects.toThrow(
      /Pre-lifecycle Booking data is not losslessly reconcilable; booking_count=1/
    );
    await expect(readLifecycleAuthorityEvidence()).resolves.toEqual({
      bookings: "1",
      lifecycleEvents: null,
      lifecycleRevision: null
    });
  });

  it("rejects a partial lifecycle catalog instead of repairing it heuristically", async () => {
    await databaseClient.query("DROP INDEX flow_booking_lifecycle_receipts_owner_processed_idx");

    await expect(runReconciliation()).rejects.toThrow(
      /partial or drifted Flow Booking lifecycle catalog/
    );
  });

  it("rejects revision-continuity drift in an otherwise exact current catalog", async () => {
    await insertBookingWithUnprovenRevision();

    await expect(runReconciliation()).rejects.toThrow(
      /Current Flow Booking lifecycle data violates revision continuity; invalid_count=1/
    );
  });

  it("rejects a reschedule as the first canonical Booking lifecycle revision", async () => {
    await insertBooking(1, true);

    await expect(
      databaseClient.query(`
        INSERT INTO booking_lifecycle_events (
          id, booking_id, owner_user_id, revision, event_kind, actor_kind,
          before_start_at, before_end_at, before_time_zone,
          after_start_at, after_end_at, after_time_zone, canonical_digest, occurred_at
        ) VALUES (
          'c6000000-0000-4000-8000-000000000001',
          'c1000000-0000-4000-8000-000000000001',
          'c2000000-0000-4000-8000-000000000001',
          1, 'rescheduled', 'system',
          '2026-08-06T10:00:00Z', '2026-08-06T11:00:00Z', 'Europe/Moscow',
          '2026-08-07T10:00:00Z', '2026-08-07T11:00:00Z', 'Europe/Moscow',
          'sha256:${"c".repeat(64)}', '2026-08-05T10:00:00Z'
        )
      `)
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "booking_lifecycle_events_transition_check"
    });
  });

  it("rejects a confirmed Booking commit without its canonical lifecycle history", async () => {
    await insertBooking(1, true);

    await expect(touchBookingWithLifecycleGuardsEnabled()).rejects.toMatchObject({
      code: "23514",
      constraint: "bookings_lifecycle_history_consistency"
    });
  });

  it("bounds the table lock used by the absent-authority reconciliation", async () => {
    await databaseClient.query(downgradeLifecycleAuthorityDdl);
    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowBookingLifecycleSafety(databaseClient)).resolves.toBe("reconciled");
      await expect(
        databaseClient.query<{ lock_timeout: string }>("SHOW lock_timeout")
      ).resolves.toMatchObject({ rows: [{ lock_timeout: "5s" }] });
    } finally {
      await databaseClient.query("ROLLBACK");
    }
  });
});

async function runReconciliation(): Promise<"already_current" | "reconciled"> {
  await databaseClient.query("BEGIN");
  try {
    const result = await reconcileFlowBookingLifecycleSafety(databaseClient);
    await databaseClient.query("COMMIT");
    return result;
  } catch (error) {
    await databaseClient.query("ROLLBACK");
    throw error;
  }
}

async function insertBookingWithoutLifecycleHistory(): Promise<void> {
  await insertBooking(0, false);
}

async function insertBookingWithUnprovenRevision(): Promise<void> {
  await insertBooking(1, true);
}

async function insertBooking(lifecycleRevision: number, includeRevision: boolean): Promise<void> {
  await databaseClient.query("BEGIN");
  try {
    await databaseClient.query("SET LOCAL session_replication_role = replica");
    await databaseClient.query(`
      INSERT INTO bookings (
        id, owner_user_id, client_user_id, product_id, reservation_id,
        ${includeRevision ? "lifecycle_revision," : ""}
        service_start_at, service_end_at, product_title_snapshot,
        duration_minutes_snapshot, delivery_format_snapshot, price_minor_snapshot,
        currency_snapshot, time_zone_snapshot, policy_snapshot
      ) VALUES (
        'c1000000-0000-4000-8000-000000000001',
        'c2000000-0000-4000-8000-000000000001',
        'c3000000-0000-4000-8000-000000000001',
        'c4000000-0000-4000-8000-000000000001',
        'c5000000-0000-4000-8000-000000000001',
        ${includeRevision ? `${lifecycleRevision},` : ""}
        '2026-08-06T10:00:00Z', '2026-08-06T11:00:00Z', 'Lifecycle fixture',
        60, 'video', 10000, 'RUB', 'Europe/Moscow', '{}'::jsonb
      )
    `);
    await databaseClient.query("COMMIT");
  } catch (error) {
    await databaseClient.query("ROLLBACK");
    throw error;
  }
}

async function touchBookingWithLifecycleGuardsEnabled(): Promise<void> {
  await databaseClient.query("BEGIN");
  try {
    await databaseClient.query("SET LOCAL session_replication_role = origin");
    await databaseClient.query(`
      UPDATE bookings
         SET updated_at = updated_at
       WHERE id = 'c1000000-0000-4000-8000-000000000001'
    `);
    await databaseClient.query("COMMIT");
  } catch (error) {
    await databaseClient.query("ROLLBACK");
    throw error;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Fixture is retained for lifecycle-reconciliation variants.
async function insertCurrentLifecycleHistoryWithCompletedPreservation(): Promise<void> {
  await databaseClient.query("BEGIN");
  try {
    await databaseClient.query("SET LOCAL session_replication_role = replica");
    await databaseClient.query(`
      INSERT INTO bookings (
        id, owner_user_id, client_user_id, product_id, reservation_id, lifecycle_revision,
        service_start_at, service_end_at, product_title_snapshot,
        duration_minutes_snapshot, delivery_format_snapshot, price_minor_snapshot,
        currency_snapshot, time_zone_snapshot, policy_snapshot
      ) VALUES (
        'd1000000-0000-4000-8000-000000000001',
        'd2000000-0000-4000-8000-000000000001',
        'd3000000-0000-4000-8000-000000000001',
        'd4000000-0000-4000-8000-000000000001',
        'd5000000-0000-4000-8000-000000000001', 2,
        '2026-08-07T12:00:00Z', '2026-08-07T13:00:00Z', 'Lifecycle fixture',
        60, 'video', 10000, 'RUB', 'Europe/Moscow', '{}'::jsonb
      );

      INSERT INTO booking_lifecycle_events (
        id, booking_id, owner_user_id, revision, event_kind, actor_kind,
        after_start_at, after_end_at, after_time_zone, canonical_digest, occurred_at
      ) VALUES (
        'd6000000-0000-4000-8000-000000000001',
        'd1000000-0000-4000-8000-000000000001',
        'd2000000-0000-4000-8000-000000000001',
        1, 'confirmed', 'system',
        '2026-08-07T10:00:00Z', '2026-08-07T11:00:00Z', 'Europe/Moscow',
        'sha256:${"a".repeat(64)}', '2026-08-05T10:00:00Z'
      );

      INSERT INTO booking_lifecycle_events (
        id, booking_id, owner_user_id, revision, event_kind, actor_kind, actor_user_id,
        before_start_at, before_end_at, before_time_zone,
        after_start_at, after_end_at, after_time_zone, canonical_digest, occurred_at
      ) VALUES (
        'd6000000-0000-4000-8000-000000000002',
        'd1000000-0000-4000-8000-000000000001',
        'd2000000-0000-4000-8000-000000000001',
        2, 'rescheduled', 'astrologer', 'd2000000-0000-4000-8000-000000000001',
        '2026-08-07T10:00:00Z', '2026-08-07T11:00:00Z', 'Europe/Moscow',
        '2026-08-07T12:00:00Z', '2026-08-07T13:00:00Z', 'Europe/Moscow',
        'sha256:${"b".repeat(64)}', '2026-08-05T11:00:00Z'
      );

      INSERT INTO flow_booking_lifecycle_receipts (
        lifecycle_event_id, booking_id, owner_user_id, revision, event_kind,
        canonical_digest, outcome, affected_run_count, affected_work_item_count,
        preserved_completed_work_item_count
      ) VALUES (
        'd6000000-0000-4000-8000-000000000002',
        'd1000000-0000-4000-8000-000000000001',
        'd2000000-0000-4000-8000-000000000001',
        2, 'rescheduled', 'sha256:${"b".repeat(64)}', 'rescheduled', 1, 1, 1
      );
    `);
    await databaseClient.query("COMMIT");
  } catch (error) {
    await databaseClient.query("ROLLBACK");
    throw error;
  }
}

async function readLifecycleAuthorityEvidence(): Promise<{
  readonly bookings: string;
  readonly lifecycleEvents: string | null;
  readonly lifecycleRevision: string | null;
}> {
  const result = await databaseClient.query<{
    bookings: string;
    lifecycle_events: string | null;
    lifecycle_revision: string | null;
  }>(`
    SELECT
      (SELECT count(*)::text FROM bookings) AS bookings,
      to_regclass('public.booking_lifecycle_events')::text AS lifecycle_events,
      (SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'bookings'
          AND column_name = 'lifecycle_revision') AS lifecycle_revision
  `);
  return {
    bookings: result.rows[0]!.bookings,
    lifecycleEvents: result.rows[0]!.lifecycle_events,
    lifecycleRevision: result.rows[0]!.lifecycle_revision
  };
}

const downgradeReceiptShapeDdl = `
ALTER TABLE flow_booking_lifecycle_receipts
  DROP CONSTRAINT flow_booking_lifecycle_receipts_shape_check,
  ADD CONSTRAINT flow_booking_lifecycle_receipts_shape_check CHECK (
    (event_kind = 'confirmed'
      AND outcome IN ('enrolled', 'no_match', 'late_unmatched', 'subject_ineligible', 'suppressed')
      AND flow_runtime_event_id IS NOT NULL
      AND affected_work_item_count = 0
      AND preserved_completed_work_item_count = 0)
    OR (event_kind = 'rescheduled'
      AND outcome = 'rescheduled'
      AND flow_runtime_event_id IS NULL
      AND preserved_completed_work_item_count = 0)
    OR (event_kind = 'cancelled' AND outcome = 'canceled' AND flow_runtime_event_id IS NULL)
  );
`;

const downgradeLifecycleAuthorityDdl = `
DROP TRIGGER bookings_lifecycle_history_consistency ON bookings;
DROP INDEX flow_run_events_booking_lifecycle_run_unique;
ALTER TABLE flow_run_events
  DROP CONSTRAINT flow_run_events_booking_lifecycle_event_owner_fk,
  DROP CONSTRAINT flow_run_events_booking_lifecycle_provenance_check,
  DROP COLUMN booking_lifecycle_event_id;

DROP TABLE flow_booking_lifecycle_heads;
DROP TABLE flow_booking_lifecycle_receipts;
DROP FUNCTION elevenhouse_guard_flow_booking_lifecycle_head_mutation();
DROP FUNCTION elevenhouse_guard_flow_booking_lifecycle_receipt_mutation();
DROP FUNCTION elevenhouse_assert_flow_booking_lifecycle_source();
DROP TABLE booking_lifecycle_events;
DROP FUNCTION elevenhouse_assert_booking_lifecycle_history();
DROP FUNCTION elevenhouse_reject_booking_lifecycle_event_mutation();
ALTER TABLE bookings
  DROP CONSTRAINT bookings_lifecycle_revision_check,
  DROP COLUMN lifecycle_revision;
`;

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  return assertDevelopmentDatabaseUrl(
    value,
    process.env.NODE_ENV,
    "test Flow Booking lifecycle safety"
  );
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
