import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { CHART_CALCULATION_REQUESTED_EVENT } from "@elevenhouse/domain";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { createDrizzleOutboxRelayStore, OutboxRelayStaleClaimError } from "./drizzle-outbox-relay";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_chart_outbox_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
const firstClaimAt = new Date("2030-01-01T12:00:00.000Z");
const reclaimedAt = new Date("2030-01-01T12:02:00.000Z");
let runtime: PostgresRuntime;

describe("generic outbox relay store Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
    await runtime.pool.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  beforeEach(async () => {
    await runtime.pool.query("delete from outbox_events");
  });

  it("increments and returns a monotonic claim fence for every stale reclaim", async () => {
    const event = await insertEvent();
    const store = createDrizzleOutboxRelayStore(runtime.database);

    const staleClaim = onlyClaim(await store.claimPending(claimInput(firstClaimAt)));
    const currentClaim = onlyClaim(await store.claimPending(claimInput(reclaimedAt)));

    expect(staleClaim).toMatchObject({ id: event.id, attempts: 0, claimFence: 1n });
    expect(currentClaim).toMatchObject({ id: event.id, attempts: 0, claimFence: 2n });
    expect(await selectEvent(event.id)).toMatchObject({
      status: "publishing",
      attempts: 0,
      claim_fence: "2",
      locked_at: reclaimedAt
    });
  });

  it("rejects a stale publisher while the current claimant publishes the same event", async () => {
    const event = await insertEvent();
    const store = createDrizzleOutboxRelayStore(runtime.database);
    const staleClaim = onlyClaim(await store.claimPending(claimInput(firstClaimAt)));
    const currentClaim = onlyClaim(await store.claimPending(claimInput(reclaimedAt)));

    const [staleDisposition, currentDisposition] = await Promise.allSettled([
      store.markPublished({
        eventId: event.id,
        claimFence: staleClaim.claimFence,
        publishedAt: reclaimedAt
      }),
      store.markPublished({
        eventId: event.id,
        claimFence: currentClaim.claimFence,
        publishedAt: reclaimedAt
      })
    ]);

    expect(staleDisposition).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        name: "OutboxRelayStaleClaimError",
        code: "OUTBOX_RELAY_STALE_CLAIM",
        operation: "mark_published"
      })
    });
    expect((staleDisposition as PromiseRejectedResult).reason).toBeInstanceOf(
      OutboxRelayStaleClaimError
    );
    expect(currentDisposition).toEqual({ status: "fulfilled", value: undefined });
    expect(await selectEvent(event.id)).toMatchObject({
      status: "published",
      attempts: 0,
      claim_fence: "2",
      locked_at: null,
      published_at: reclaimedAt,
      last_error: null
    });
  });

  it("rejects a stale requeue while the current claimant owns the same event", async () => {
    const event = await insertEvent();
    const store = createDrizzleOutboxRelayStore(runtime.database);
    const staleClaim = onlyClaim(await store.claimPending(claimInput(firstClaimAt)));
    const currentClaim = onlyClaim(await store.claimPending(claimInput(reclaimedAt)));
    const staleAvailableAt = new Date("2030-01-01T12:03:00.000Z");
    const currentAvailableAt = new Date("2030-01-01T12:04:00.000Z");

    const staleDisposition = store.markPublishFailed({
      eventId: event.id,
      claimFence: staleClaim.claimFence,
      failedAt: reclaimedAt,
      nextAvailableAt: staleAvailableAt,
      errorMessage: "stale failure"
    });
    const currentDisposition = store.markPublishFailed({
      eventId: event.id,
      claimFence: currentClaim.claimFence,
      failedAt: reclaimedAt,
      nextAvailableAt: currentAvailableAt,
      errorMessage: "current failure"
    });
    const [staleResult, currentResult] = await Promise.allSettled([
      staleDisposition,
      currentDisposition
    ]);

    expect(staleResult).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        name: "OutboxRelayStaleClaimError",
        code: "OUTBOX_RELAY_STALE_CLAIM",
        operation: "mark_publish_failed"
      })
    });
    expect((staleResult as PromiseRejectedResult).reason).toBeInstanceOf(
      OutboxRelayStaleClaimError
    );
    expect(currentResult).toEqual({ status: "fulfilled", value: undefined });
    expect(await selectEvent(event.id)).toMatchObject({
      status: "pending",
      attempts: 1,
      claim_fence: "2",
      locked_at: null,
      available_at: currentAvailableAt,
      last_error: "current failure"
    });
  });
});

function claimInput(now: Date) {
  return {
    eventTypes: [CHART_CALCULATION_REQUESTED_EVENT],
    limit: 10,
    now,
    stalePublishingBefore: new Date(now.getTime() - 60_000)
  };
}

async function insertEvent(): Promise<{ readonly id: string; readonly aggregateId: string }> {
  const id = randomUUID();
  const aggregateId = randomUUID();
  await runtime.pool.query(
    `insert into outbox_events (id, event_type, aggregate_id, payload)
     values ($1, $2, $3, $4)`,
    [id, CHART_CALCULATION_REQUESTED_EVENT, aggregateId, { jobId: aggregateId }]
  );
  return { id, aggregateId };
}

async function selectEvent(id: string): Promise<{
  readonly status: string;
  readonly attempts: number;
  readonly claim_fence: string;
  readonly available_at: Date;
  readonly locked_at: Date | null;
  readonly published_at: Date | null;
  readonly last_error: string | null;
}> {
  const result = await runtime.pool.query(
    `select status, attempts, claim_fence, available_at, locked_at, published_at, last_error
       from outbox_events
      where id = $1`,
    [id]
  );
  return result.rows[0]!;
}

function onlyClaim(
  claims: Awaited<ReturnType<ReturnType<typeof createDrizzleOutboxRelayStore>["claimPending"]>>
) {
  expect(claims).toHaveLength(1);
  return claims[0]!;
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  assertDevelopmentDatabaseUrl(value);
  return value;
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
