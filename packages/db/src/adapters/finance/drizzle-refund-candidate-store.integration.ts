import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RefundCandidateAlreadyOpenError,
  type ClientRefundCandidate,
  type FinanceIdempotentCommand
} from "@elevenhouse/domain";
import { Client } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { createDrizzleRefundCandidateStore } from "./drizzle-refund-candidate-store";

const integrationDatabaseUrl = integrationUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_refund_candidates_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;

describe("refund candidate Drizzle/PostgreSQL integration", () => {
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

  it("persists one client candidate atomically, replays the command, and rejects another open case", async () => {
    const fixture = await createFixture();
    const store = createDrizzleRefundCandidateStore(runtime.database);
    const first = candidate({ id: randomUUID(), orderId: fixture.orderId, clientUserId: fixture.clientUserId });
    const command = submitCommand(fixture.clientUserId, "candidate-create-1", "a");

    await expect(store.executeSubmitCandidate(command, async () => first)).resolves.toEqual({
      kind: "created",
      value: first
    });
    await expect(
      store.executeSubmitCandidate(command, async () => {
        throw new Error("idempotent replay must not create another candidate");
      })
    ).resolves.toEqual({ kind: "replayed", value: first });

    await expect(
      store.executeSubmitCandidate(
        submitCommand(fixture.clientUserId, "candidate-create-2", "b"),
        async () => candidate({ id: randomUUID(), orderId: fixture.orderId, clientUserId: fixture.clientUserId })
      )
    ).rejects.toBeInstanceOf(RefundCandidateAlreadyOpenError);

    const review = await store.executeReviewCandidate(
      reviewCommand(fixture.adminUserId, "candidate-review-1", "c"),
      {
        reviewId: randomUUID(),
        candidateId: first.id,
        expectedVersion: 1,
        actorUserId: fixture.adminUserId,
        action: "claimed",
        note: "Investigating the delivery history.",
        now: "2026-08-05T12:10:00.000Z"
      }
    );
    expect(review).toMatchObject({
      kind: "created",
      value: {
        candidate: { id: first.id, status: "under_review", version: 2 },
        review: { action: "claimed", candidateVersion: 2, actorUserId: fixture.adminUserId }
      }
    });

    const result = await runtime.pool.query(
      "select (select count(*) from finance_refund_candidates)::int as candidates, (select count(*) from finance_refund_candidate_reviews)::int as reviews, (select count(*) from finance_idempotency_commands)::int as idempotency_commands, (select count(*) from audit_log_entries)::int as audit_entries"
    );
    expect(result.rows[0]).toEqual({ candidates: 1, reviews: 1, idempotency_commands: 2, audit_entries: 1 });
  });
});

async function createFixture(): Promise<{
  readonly clientUserId: string;
  readonly adminUserId: string;
  readonly orderId: string;
}> {
  const clientUserId = randomUUID();
  const astrologerUserId = randomUUID();
  const adminUserId = randomUUID();
  const orderId = randomUUID();
  await runtime.pool.query("insert into users (id) values ($1), ($2), ($3)", [
    clientUserId,
    astrologerUserId,
    adminUserId
  ]);

  // The candidate adapter only needs a real client-owned order. The isolated fixture bypasses
  // unrelated product/policy/tariff foreign keys while retaining all candidate constraints.
  const connection = await runtime.pool.connect();
  try {
    await connection.query("begin");
    await connection.query("set local session_replication_role = replica");
    await connection.query(
      `insert into orders
        (id, client_user_id, astrologer_user_id, product_id, product_title_snapshot, status,
         gross_amount_minor, gross_currency, platform_fee_amount_minor, platform_fee_currency,
         astrologer_net_amount_minor, astrologer_net_currency, finance_policy_snapshot_id,
         tariff_series_id, tariff_version, tariff_version_digest)
       values ($1, $2, $3, $4, 'Refund candidate fixture', 'paid',
               10000, 'RUB', 800, 'RUB', 9200, 'RUB', $5, 'fixture-tariff', 1, $6)`,
      [
        orderId,
        clientUserId,
        astrologerUserId,
        randomUUID(),
        randomUUID(),
        `sha256:${"a".repeat(64)}`
      ]
    );
    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
  }
  return { clientUserId, adminUserId, orderId };
}

function candidate(input: {
  readonly id: string;
  readonly orderId: string;
  readonly clientUserId: string;
}): ClientRefundCandidate {
  return {
    id: input.id,
    orderId: input.orderId,
    clientUserId: input.clientUserId,
    statement: "The agreed service was not provided.",
    status: "submitted",
    version: 1,
    submittedAt: "2026-08-05T12:00:00.000Z",
    resolvedRefundCaseId: null,
    resolvedAt: null,
    updatedAt: "2026-08-05T12:00:00.000Z"
  };
}

function submitCommand(
  clientUserId: string,
  idempotencyKey: string,
  hashCharacter: string
): FinanceIdempotentCommand {
  return {
    scope: `refund-candidates.submit:${clientUserId}`,
    idempotencyKey,
    actorUserId: clientUserId,
    requestHash: `sha256:${hashCharacter.repeat(64)}`,
    now: "2026-08-05T12:00:00.000Z",
    expiresAt: "2026-08-06T12:00:00.000Z"
  };
}

function reviewCommand(
  adminUserId: string,
  idempotencyKey: string,
  hashCharacter: string
): FinanceIdempotentCommand {
  return {
    scope: `admin.refund-candidates.review:${adminUserId}`,
    idempotencyKey,
    actorUserId: adminUserId,
    requestHash: `sha256:${hashCharacter.repeat(64)}`,
    now: "2026-08-05T12:10:00.000Z",
    expiresAt: "2026-08-06T12:10:00.000Z"
  };
}

function integrationUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
