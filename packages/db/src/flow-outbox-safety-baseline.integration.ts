import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertFlowOutboxSafety,
  reconcileFlowOutboxSafety
} from "../scripts/flow-outbox-safety-reconciliation";
import { flowOutboxSafetyBaselineDdl } from "../scripts/production-baseline-plan";
import { assertDevelopmentDatabaseUrl } from "./connection";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_outbox_baseline_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
const databaseClient = new Client({ connectionString: isolatedDatabaseUrl });

describe("flow outbox safety baseline PostgreSQL integration", () => {
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
    await databaseClient.query("DROP TABLE IF EXISTS outbox_events");
    await databaseClient.query(previousOutboxFixtureDdl);
  });

  it("adds fenced quarantine state without rewriting canonical existing events", async () => {
    await insertCanonicalPreviousEvents();
    const before = await readExistingEventEvidence();

    await applyTransition();

    await expect(readExistingEventEvidence()).resolves.toEqual(before);
    const addedState = await databaseClient.query<{
      id: string;
      claim_fence: string;
      quarantined_at: Date | null;
      quarantine_reason_code: string | null;
    }>(`
      SELECT id, claim_fence, quarantined_at, quarantine_reason_code
        FROM outbox_events
       ORDER BY id
    `);
    expect(addedState.rows).toEqual(
      before.map((row) => ({
        id: row.id,
        claim_fence: "0",
        quarantined_at: null,
        quarantine_reason_code: null
      }))
    );

    const constraints = await databaseClient.query<{
      conname: string;
      convalidated: boolean;
    }>(`
      SELECT conname, convalidated
        FROM pg_constraint
       WHERE conrelid = 'outbox_events'::regclass
         AND conname IN (
           'outbox_events_status_check',
           'outbox_events_claim_fence_check',
           'outbox_events_quarantine_reason_code_check',
           'outbox_events_state_check'
         )
       ORDER BY conname
    `);
    expect(constraints.rows).toEqual([
      { conname: "outbox_events_claim_fence_check", convalidated: true },
      { conname: "outbox_events_quarantine_reason_code_check", convalidated: true },
      { conname: "outbox_events_state_check", convalidated: true },
      { conname: "outbox_events_status_check", convalidated: true }
    ]);

    const index = await databaseClient.query<{ indexdef: string }>(`
      SELECT indexdef
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'outbox_events'
         AND indexname = 'outbox_events_quarantined_index'
    `);
    expect(index.rows[0]?.indexdef).toContain(
      "(event_type, quarantined_at, id) WHERE (status = 'quarantined'::text)"
    );

    await expect(
      databaseClient.query(
        `INSERT INTO outbox_events (
           id, event_type, aggregate_id, payload, status, attempts, claim_fence,
           quarantined_at, quarantine_reason_code
         ) VALUES ($1, $2, $3, $4, 'quarantined', 1, 1, now(), $5)`,
        [
          randomUUID(),
          "flows.runtime_event.dispatch_requested",
          randomUUID(),
          { schemaVersion: "flow-runtime-dispatch.v1" },
          "FLOW_RUNTIME_DISPATCH_PAYLOAD_INVALID"
        ]
      )
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      databaseClient.query(
        `INSERT INTO outbox_events (
           id, event_type, aggregate_id, payload, claim_fence
         ) VALUES ($1, $2, $3, $4, -1)`,
        [randomUUID(), "test.invalid", randomUUID(), {}]
      )
    ).rejects.toThrow(/outbox_events_claim_fence_check/);
  });

  it("fails closed and rolls back when legacy rows violate the canonical state", async () => {
    const eventId = randomUUID();
    await databaseClient.query(
      `INSERT INTO outbox_events (
         id, event_type, aggregate_id, payload, status, locked_at
       ) VALUES ($1, 'legacy.noncanonical', $2, '{}', 'pending', now())`,
      [eventId, randomUUID()]
    );
    const before = await readExistingEventEvidence();

    await databaseClient.query("BEGIN");
    try {
      await expect(databaseClient.query(flowOutboxSafetyBaselineDdl)).rejects.toThrow(
        /outbox_events_state_check/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(readExistingEventEvidence()).resolves.toEqual(before);
    const shape = await databaseClient.query<{
      added_column_count: string;
      old_constraint_count: string;
      quarantine_index: string | null;
    }>(`
      SELECT
        (SELECT count(*)::text
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'outbox_events'
            AND column_name IN ('claim_fence', 'quarantined_at', 'quarantine_reason_code'))
          AS added_column_count,
        (SELECT count(*)::text
           FROM pg_constraint
          WHERE conrelid = 'outbox_events'::regclass
            AND conname IN (
              'outbox_events_pending_not_published_check',
              'outbox_events_publishing_locked_check',
              'outbox_events_published_at_check'
            )) AS old_constraint_count,
        to_regclass('public.outbox_events_quarantined_index')::text AS quarantine_index
    `);
    expect(shape.rows[0]).toEqual({
      added_column_count: "0",
      old_constraint_count: "3",
      quarantine_index: null
    });
  });

  it("reconciles only the exact predecessor catalog and then becomes an exact no-op", async () => {
    await insertCanonicalPreviousEvents();
    const before = await readExistingEventEvidence();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowOutboxSafety(databaseClient)).resolves.toBe("reconciled");
      await expect(assertFlowOutboxSafety(databaseClient)).resolves.toBeUndefined();
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }
    await expect(readExistingEventEvidence()).resolves.toEqual(before);

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowOutboxSafety(databaseClient)).resolves.toBe("already_current");
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }
    await expect(readExistingEventEvidence()).resolves.toEqual(before);
  });

  it("rejects a partial predecessor catalog without changing its rows or shape", async () => {
    await insertCanonicalPreviousEvents();
    await databaseClient.query(
      "CREATE INDEX outbox_events_unapproved_index ON outbox_events (attempts)"
    );
    const before = await readExistingEventEvidence();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowOutboxSafety(databaseClient)).rejects.toThrow(
        /partial or drifted Flow outbox safety catalog/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(readExistingEventEvidence()).resolves.toEqual(before);
    const shape = await databaseClient.query<{
      claim_fence: string | null;
      unapproved_index: string | null;
    }>(`
      SELECT
        (SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'outbox_events'
            AND column_name = 'claim_fence') AS claim_fence,
        to_regclass('public.outbox_events_unapproved_index')::text AS unapproved_index
    `);
    expect(shape.rows[0]).toEqual({
      claim_fence: null,
      unapproved_index: "outbox_events_unapproved_index"
    });
  });

  it("rejects case-only drift inside a quoted outbox-state literal", async () => {
    await applyTransition();
    await databaseClient.query(`
      ALTER TABLE outbox_events
        DROP CONSTRAINT outbox_events_status_check,
        ADD CONSTRAINT outbox_events_status_check CHECK (
          status IN ('PENDING', 'publishing', 'published', 'quarantined')
        )
    `);

    await expect(assertFlowOutboxSafety(databaseClient)).rejects.toThrow(
      /Flow outbox safety catalog drifted/
    );
  });

  it.each([
    ["unlogged durability", "ALTER TABLE outbox_events SET UNLOGGED"],
    ["row-level security", "ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY"],
    ["forced row-level security", "ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY"]
  ])("rejects %s drift on the outbox authority relation", async (_label, statement) => {
    await applyTransition();
    await databaseClient.query(statement);

    await expect(assertFlowOutboxSafety(databaseClient)).rejects.toThrow(
      /Flow outbox safety catalog drifted/
    );
  });

  it("serializes concurrent reconciliation and applies the transition once", async () => {
    await insertCanonicalPreviousEvents();
    const competingClient = new Client({ connectionString: isolatedDatabaseUrl });
    await competingClient.connect();
    await databaseClient.query("BEGIN");
    await competingClient.query("BEGIN");

    try {
      const first = reconcileFlowOutboxSafety(databaseClient).then(async (result) => {
        await databaseClient.query("COMMIT");
        return result;
      });
      const second = reconcileFlowOutboxSafety(competingClient).then(async (result) => {
        await competingClient.query("COMMIT");
        return result;
      });

      await expect(Promise.all([first, second])).resolves.toEqual(
        expect.arrayContaining(["reconciled", "already_current"])
      );
      await expect(assertFlowOutboxSafety(databaseClient)).resolves.toBeUndefined();
    } catch (error) {
      await databaseClient.query("ROLLBACK").catch(() => undefined);
      await competingClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await competingClient.end();
    }
  });
});

async function applyTransition(): Promise<void> {
  await databaseClient.query("BEGIN");
  try {
    await databaseClient.query(flowOutboxSafetyBaselineDdl);
    await databaseClient.query("COMMIT");
  } catch (error) {
    await databaseClient.query("ROLLBACK");
    throw error;
  }
}

async function insertCanonicalPreviousEvents(): Promise<void> {
  await databaseClient.query(`
    INSERT INTO outbox_events (
      id, event_type, aggregate_id, payload, status, attempts, available_at,
      locked_at, published_at, last_error, created_at, updated_at
    ) VALUES
      (
        '10000000-0000-4000-8000-000000000001',
        'flows.runtime_event.dispatch_requested',
        '20000000-0000-4000-8000-000000000001',
        '{"schemaVersion":"flow-runtime-dispatch.v1","nested":{"private":"retained"}}',
        'pending', 0, '2026-08-03T10:00:00Z', NULL, NULL, NULL,
        '2026-08-03T10:00:00Z', '2026-08-03T10:00:00Z'
      ),
      (
        '10000000-0000-4000-8000-000000000002',
        'flows.runtime_event.dispatch_requested',
        '20000000-0000-4000-8000-000000000002',
        '{"schemaVersion":"flow-runtime-dispatch.v1","state":"claimed"}',
        'publishing', 2, '2026-08-03T10:01:00Z', '2026-08-03T10:02:00Z', NULL,
        'FLOW_RUNTIME_DISPATCH_RETRYABLE_FAILURE',
        '2026-08-03T10:01:00Z', '2026-08-03T10:02:00Z'
      ),
      (
        '10000000-0000-4000-8000-000000000003',
        'calculation.pdf.requested.v1',
        '20000000-0000-4000-8000-000000000003',
        '{"schemaVersion":"calculation-pdf.v1","state":"published"}',
        'published', 1, '2026-08-03T10:03:00Z', NULL, '2026-08-03T10:04:00Z', NULL,
        '2026-08-03T10:03:00Z', '2026-08-03T10:04:00Z'
      );
  `);
}

async function readExistingEventEvidence(): Promise<
  readonly {
    readonly id: string;
    readonly row_version: string;
    readonly row_location: string;
    readonly event_type: string;
    readonly aggregate_id: string;
    readonly payload: string;
    readonly status: string;
    readonly attempts: number;
    readonly available_at: string;
    readonly locked_at: string | null;
    readonly published_at: string | null;
    readonly last_error: string | null;
    readonly created_at: string;
    readonly updated_at: string;
  }[]
> {
  const result = await databaseClient.query(`
    SELECT
      id,
      xmin::text AS row_version,
      ctid::text AS row_location,
      event_type,
      aggregate_id,
      payload::text AS payload,
      status,
      attempts,
      available_at::text,
      locked_at::text,
      published_at::text,
      last_error,
      created_at::text,
      updated_at::text
    FROM outbox_events
    ORDER BY id
  `);
  return result.rows;
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  assertDevelopmentDatabaseUrl(value);
  return value;
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

const previousOutboxFixtureDdl = `
  CREATE TABLE outbox_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamptz DEFAULT now() NOT NULL,
    locked_at timestamptz,
    published_at timestamptz,
    last_error text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT outbox_events_status_check
      CHECK (status IN ('pending', 'publishing', 'published')),
    CONSTRAINT outbox_events_attempts_check CHECK (attempts >= 0),
    CONSTRAINT outbox_events_pending_not_published_check
      CHECK (status <> 'pending' OR published_at IS NULL),
    CONSTRAINT outbox_events_publishing_locked_check
      CHECK (status <> 'publishing' OR locked_at IS NOT NULL),
    CONSTRAINT outbox_events_published_at_check
      CHECK (status <> 'published' OR published_at IS NOT NULL)
  );
  CREATE UNIQUE INDEX outbox_events_event_type_aggregate_id_unique
    ON outbox_events (event_type, aggregate_id);
  CREATE INDEX outbox_events_pending_index
    ON outbox_events (status, available_at, created_at);
  CREATE INDEX outbox_events_locked_at_index ON outbox_events (locked_at);
`;
