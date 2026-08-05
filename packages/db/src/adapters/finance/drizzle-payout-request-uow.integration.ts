import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_payout_request_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);

describe.sequential("payout request canonical persistence baseline", () => {
  const admin = new Client({ connectionString: baseDatabaseUrl });
  const isolated = new Client({ connectionString: isolatedDatabaseUrl });

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`create database "${databaseName}"`);
    await isolated.connect();
    await isolated.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
  }, 30_000);

  afterAll(async () => {
    try {
      await isolated.end();
      await admin.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await admin.end();
    }
  }, 30_000);

  it("installs the immutable payout aggregate and exact allocation table on the full baseline", async () => {
    const rows = await isolated.query<{ relation: string | null }>(
      `select to_regclass(name) as relation
         from unnest($1::text[]) as required(name)
         order by name`,
      [["finance_payout_request_allocations", "finance_payout_requests"]]
    );
    expect(rows.rows.map((row) => row.relation)).toEqual([
      "finance_payout_request_allocations",
      "finance_payout_requests"
    ]);
    const constraints = await isolated.query<{ conname: string }>(
      `select conname from pg_constraint
       where conrelid = 'finance_payout_requests'::regclass
       and conname in ('finance_payout_requests_amount_check', 'finance_payout_requests_digest_check')
       order by conname`
    );
    expect(constraints.rows.map((row) => row.conname)).toEqual([
      "finance_payout_requests_amount_check",
      "finance_payout_requests_digest_check"
    ]);
  });
});

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(
    value,
    process.env.NODE_ENV,
    "run payout request integration tests against"
  );
}

function withDatabaseName(connectionString: string, targetDatabaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${targetDatabaseName}`;
  return url.toString();
}
