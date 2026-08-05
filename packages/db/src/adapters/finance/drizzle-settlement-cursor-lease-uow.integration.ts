import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import {
  SettlementCursorLeasePersistenceError,
  createDrizzleSettlementCursorLeaseUnitOfWork
} from "./drizzle-settlement-cursor-lease-uow";

const baseDatabaseUrl = integrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_settlement_lease_${randomUUID().replaceAll("-", "")}`;
if (!/^elevenhouse_settlement_lease_[0-9a-f]{32}$/.test(databaseName)) {
  throw new Error("Invalid isolated settlement lease test database name");
}
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const providerAccount = Object.freeze({
  seriesId: "arc-series-main",
  providerAccountId: "arc-account-main",
  identityVersion: 1
});
const cursorKey = Object.freeze({ providerAccount, stream: "settlement_ledger" as const });

describe.sequential("settlement cursor lease PostgreSQL integration", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    database = drizzle(pool);
    await pool.query(minimalLeaseSchemaSql);
  }, 30_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await adminClient.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("claims, renews, releases and increments one durable fencing token", async () => {
    await seedCursor(pool, "lease-lifecycle");
    const unitOfWork = createDrizzleSettlementCursorLeaseUnitOfWork({ database });

    const claimed = await unitOfWork.claimLease({
      cursorKey,
      expectedCursorVersion: 1,
      leaseOwnerId: "worker-a",
      leaseToken: "worker-a-secret-token",
      leaseDurationSeconds: 120
    });
    expect(claimed).toMatchObject({
      kind: "settlement_cursor_lease_receipt",
      cursorKey,
      cursorVersion: 2,
      leaseOwnerId: "worker-a",
      leaseToken: "worker-a-secret-token",
      fencingToken: 1,
      state: "active"
    });
    expect(Date.parse(claimed.databaseExpiresAt)).toBeGreaterThan(
      Date.parse(claimed.databaseClaimedAt)
    );

    const persisted = await pool.query<{
      lease_token_digest: string;
      lease_claimed_at: Date;
      updated_at: Date;
    }>(
      `select lease_token_digest, lease_claimed_at, updated_at
       from finance_settlement_cursors where id = 'lease-lifecycle'`
    );
    expect(persisted.rows[0]?.lease_token_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(persisted.rows[0]?.lease_token_digest).not.toContain("worker-a-secret-token");
    expect(persisted.rows[0]?.updated_at.toISOString()).toBe(
      persisted.rows[0]?.lease_claimed_at.toISOString()
    );

    const renewed = await unitOfWork.renewLease({
      cursorKey,
      expectedCursorVersion: 2,
      leaseOwnerId: "worker-a",
      leaseToken: "worker-a-secret-token",
      fencingToken: 1,
      leaseDurationSeconds: 240
    });
    expect(renewed).toMatchObject({ cursorVersion: 3, fencingToken: 1, state: "active" });
    expect(renewed.databaseClaimedAt).toBe(claimed.databaseClaimedAt);
    expect(Date.parse(renewed.databaseExpiresAt)).toBeGreaterThan(
      Date.parse(claimed.databaseExpiresAt)
    );

    const released = await unitOfWork.releaseLease({
      cursorKey,
      expectedCursorVersion: 3,
      leaseOwnerId: "worker-a",
      leaseToken: "worker-a-secret-token",
      fencingToken: 1
    });
    expect(released).toMatchObject({ cursorVersion: 4, fencingToken: 1, state: "released" });

    const claimedByB = await unitOfWork.claimLease({
      cursorKey,
      expectedCursorVersion: 4,
      leaseOwnerId: "worker-b",
      leaseToken: "worker-b-secret-token",
      leaseDurationSeconds: 120
    });
    expect(claimedByB).toMatchObject({ cursorVersion: 5, fencingToken: 2, state: "active" });
  });

  it("serializes competing claims and never lets a live lease be stolen", async () => {
    await seedCursor(pool, "lease-race");
    const first = createDrizzleSettlementCursorLeaseUnitOfWork({ database });
    const second = createDrizzleSettlementCursorLeaseUnitOfWork({ database });
    const commands = [
      first.claimLease({
        cursorKey,
        expectedCursorVersion: 1,
        leaseOwnerId: "race-worker-a",
        leaseToken: "race-token-a",
        leaseDurationSeconds: 120
      }),
      second.claimLease({
        cursorKey,
        expectedCursorVersion: 1,
        leaseOwnerId: "race-worker-b",
        leaseToken: "race-token-b",
        leaseDurationSeconds: 120
      })
    ];

    const results = await Promise.allSettled(commands);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ reason: "cursor_version_conflict" })
    });

    const row = await pool.query<{ version: string; fencing_token: string }>(
      `select version, fencing_token from finance_settlement_cursors where id = 'lease-race'`
    );
    expect(row.rows).toEqual([{ version: "2", fencing_token: "1" }]);
  });

  it("rejects stale version, owner, token and fence without changing the cursor", async () => {
    await seedCursor(pool, "lease-stale");
    const unitOfWork = createDrizzleSettlementCursorLeaseUnitOfWork({ database });
    await unitOfWork.claimLease({
      cursorKey,
      expectedCursorVersion: 1,
      leaseOwnerId: "worker-stale",
      leaseToken: "correct-token",
      leaseDurationSeconds: 120
    });

    const attempts = [
      () =>
        unitOfWork.renewLease({
          cursorKey,
          expectedCursorVersion: 1,
          leaseOwnerId: "worker-stale",
          leaseToken: "correct-token",
          fencingToken: 1,
          leaseDurationSeconds: 120
        }),
      () =>
        unitOfWork.renewLease({
          cursorKey,
          expectedCursorVersion: 2,
          leaseOwnerId: "other-worker",
          leaseToken: "correct-token",
          fencingToken: 1,
          leaseDurationSeconds: 120
        }),
      () =>
        unitOfWork.renewLease({
          cursorKey,
          expectedCursorVersion: 2,
          leaseOwnerId: "worker-stale",
          leaseToken: "wrong-token",
          fencingToken: 1,
          leaseDurationSeconds: 120
        }),
      () =>
        unitOfWork.releaseLease({
          cursorKey,
          expectedCursorVersion: 2,
          leaseOwnerId: "worker-stale",
          leaseToken: "correct-token",
          fencingToken: 2
        })
    ];

    for (const attempt of attempts) {
      await expect(attempt()).rejects.toBeInstanceOf(SettlementCursorLeasePersistenceError);
    }
    const row = await pool.query<{ version: string; fencing_token: string }>(
      `select version, fencing_token from finance_settlement_cursors where id = 'lease-stale'`
    );
    expect(row.rows).toEqual([{ version: "2", fencing_token: "1" }]);
  });

  it("reclaims an expired lease with a higher fence and rejects the former credential", async () => {
    await seedCursor(pool, "lease-expired");
    const unitOfWork = createDrizzleSettlementCursorLeaseUnitOfWork({ database });
    await unitOfWork.claimLease({
      cursorKey,
      expectedCursorVersion: 1,
      leaseOwnerId: "expired-worker",
      leaseToken: "expired-token",
      leaseDurationSeconds: 120
    });
    await pool.query(
      `update finance_settlement_cursors
       set lease_expires_at = clock_timestamp() - interval '1 second'
       where id = 'lease-expired'`
    );

    const reclaimed = await unitOfWork.claimLease({
      cursorKey,
      expectedCursorVersion: 2,
      leaseOwnerId: "replacement-worker",
      leaseToken: "replacement-token",
      leaseDurationSeconds: 120
    });

    expect(reclaimed).toMatchObject({
      cursorVersion: 3,
      leaseOwnerId: "replacement-worker",
      fencingToken: 2,
      state: "active"
    });
    await expect(
      unitOfWork.renewLease({
        cursorKey,
        expectedCursorVersion: 3,
        leaseOwnerId: "expired-worker",
        leaseToken: "expired-token",
        fencingToken: 1,
        leaseDurationSeconds: 120
      })
    ).rejects.toMatchObject({ reason: "lease_credential_conflict" });
  });
});

async function seedCursor(pool: Pool, id: string): Promise<void> {
  await pool.query(`delete from finance_settlement_cursors`);
  await pool.query(
    `insert into finance_settlement_cursors
      (id, provider_account_series_id, provider_account_id, provider_identity_version, stream,
       initial_backfill_start, overlap_seconds, high_water_mark, checkpointed_page_count,
       fencing_token, window_generation, version, updated_at)
     values ($1, $2, $3, $4, 'settlement_ledger',
       '2026-07-01T00:00:00Z', 300, '2026-07-01T00:00:00Z', 0, 0, 0, 1,
       clock_timestamp())`,
    [
      id,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion
    ]
  );
}

function integrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run finance integration tests");
}

function withDatabaseName(connectionString: string, nextDatabaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${nextDatabaseName}`;
  return url.toString();
}

const minimalLeaseSchemaSql = `
create table finance_settlement_cursors (
  id text primary key,
  provider_account_series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  stream text not null,
  initial_backfill_start timestamptz not null,
  overlap_seconds integer not null,
  high_water_mark timestamptz not null,
  active_window_start timestamptz,
  active_window_end timestamptz,
  next_page_cursor varchar(1000),
  checkpointed_page_count integer not null default 0,
  max_page_count integer,
  lease_owner_id varchar(160),
  lease_token_digest varchar(71),
  lease_claimed_at timestamptz,
  lease_expires_at timestamptz,
  fencing_token numeric(38,0) not null default 0,
  window_generation numeric(38,0) not null default 0,
  version numeric(38,0) not null default 1,
  updated_at timestamptz not null default clock_timestamp(),
  unique (provider_account_series_id, provider_account_id, provider_identity_version, stream)
);
`;
