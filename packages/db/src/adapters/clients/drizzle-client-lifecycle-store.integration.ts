import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { createDrizzleClientLifecycleStore } from "./drizzle-client-lifecycle-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_client_lifecycle_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;
let relationshipId: string;

describe.sequential("client lifecycle Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
  }, 30_000);

  beforeEach(async () => {
    await runtime.pool.query("DROP SCHEMA public CASCADE");
    await runtime.pool.query("CREATE SCHEMA public");
    await runtime.pool.query(readCurrentMigrationSql());
    relationshipId = await seedRelationship();
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("applies a captured-order transition once and replays the exact source id", async () => {
    const sourceEventId = `order:${randomUUID()}:captured`;
    const input = {
      relationshipId,
      sourceEventId,
      cause: { kind: "captured_order" as const, occurredAt: "2026-08-13T10:00:00.000Z" },
      actorUserId: null
    };
    const store = createDrizzleClientLifecycleStore(runtime.database);

    await expect(store.applyTransition(input)).resolves.toMatchObject({
      replayed: false,
      decision: { disposition: "applied", status: "active", mode: "automatic" }
    });
    await expect(store.applyTransition(input)).resolves.toMatchObject({ replayed: true });

    const persisted = await runtime.pool.query<{
      status: string;
      mode: string;
      revision: number;
      history_count: string;
    }>(
      `select state.status, state.mode, state.revision,
              (select count(*)::text from client_lifecycle_history where relationship_id = state.relationship_id) as history_count
         from client_lifecycle_states state
        where state.relationship_id = $1`,
      [relationshipId]
    );
    expect(persisted.rows).toEqual([
      { status: "active", mode: "automatic", revision: 1, history_count: "1" }
    ]);
    const outbox = await runtime.pool.query<{
      event_type: string;
      aggregate_id: string;
      payload: { eventKind: string; payload: { fromStatus: string | null; toStatus: string } };
    }>(
      `select event_type, aggregate_id, payload
         from outbox_events
        where event_type = 'flows.client_lifecycle_changed.enrollment_requested.v1'`
    );
    expect(outbox.rows).toMatchObject([
      {
        event_type: "flows.client_lifecycle_changed.enrollment_requested.v1",
        aggregate_id: expect.any(String),
        payload: {
          eventKind: "client_lifecycle_changed",
          payload: { fromStatus: null, toStatus: "active" }
        }
      }
    ]);
  });

  it("records automatic candidates while the astrologer has a manual override", async () => {
    const store = createDrizzleClientLifecycleStore(runtime.database);
    await store.applyTransition({
      relationshipId,
      sourceEventId: `manual:${randomUUID()}`,
      cause: {
        kind: "manual_override",
        manualStatus: "inactive",
        occurredAt: "2026-08-13T10:00:00.000Z"
      },
      actorUserId: null
    });

    await expect(
      store.applyTransition({
        relationshipId,
        sourceEventId: `message:${randomUUID()}:received`,
        cause: { kind: "inbound_message", occurredAt: "2026-08-13T10:01:00.000Z" },
        actorUserId: null
      })
    ).resolves.toMatchObject({
      decision: {
        disposition: "candidate_recorded",
        status: "inactive",
        mode: "manual_override",
        latestAutomaticCandidateStatus: "active"
      }
    });
    const outbox = await runtime.pool.query<{ count: string }>(
      `select count(*)::text as count
         from outbox_events
        where event_type = 'flows.client_lifecycle_changed.enrollment_requested.v1'`
    );
    expect(outbox.rows).toEqual([{ count: "1" }]);
  });
});

async function seedRelationship(): Promise<string> {
  const clientUserId = randomUUID();
  const astrologerUserId = randomUUID();
  const id = randomUUID();
  await runtime.pool.query("insert into users (id, status) values ($1, 'active'), ($2, 'active')", [
    clientUserId,
    astrologerUserId
  ]);
  await runtime.pool.query(
    `insert into client_astrologer_relationships (
       id, client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at
     ) values ($1, $2, $3, 'manual', 'active', '2026-08-13T09:00:00.000Z', '2026-08-13T09:00:00.000Z')`,
    [id, clientUserId, astrologerUserId]
  );
  return id;
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
