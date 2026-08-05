import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { currentBaseline } from "../scripts/production-baseline-plan";
import { assertDevelopmentDatabaseUrl } from "./connection";

const execFileAsync = promisify(execFile);
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;
const databaseName = `elevenhouse_production_baseline_preflight_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = integrationDatabaseUrl
  ? withDatabaseName(
      assertDevelopmentDatabaseUrl(
        integrationDatabaseUrl,
        process.env.NODE_ENV,
        "test production baseline preflight"
      ),
      databaseName
    )
  : "";
const adminClient = integrationDatabaseUrl
  ? new Client({ connectionString: integrationDatabaseUrl })
  : undefined;
const databaseClient = isolatedDatabaseUrl
  ? new Client({ connectionString: isolatedDatabaseUrl })
  : undefined;

describeWithDatabase("production baseline read-only preflight integration", () => {
  beforeAll(async () => {
    await adminClient!.connect();
    await adminClient!.query(`CREATE DATABASE "${databaseName}"`);
    await databaseClient!.connect();
    await databaseClient!.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
    await databaseClient!.query(`
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (
        id serial PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('${currentBaseline.hash}', ${currentBaseline.createdAt});
    `);
  }, 30_000);

  afterAll(async () => {
    try {
      await databaseClient?.end();
      await adminClient?.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient?.end();
    }
  }, 30_000);

  it("attests the current catalog twice without changing the migration ledger", async () => {
    const before = await readLedger();

    const first = await runPreflight();
    expect(first).toContain("Production baseline preflight accepted the current baseline");
    const second = await runPreflight();
    expect(second).toContain("Production baseline preflight accepted the current baseline");

    await expect(readLedger()).resolves.toEqual(before);
  }, 30_000);
});

async function runPreflight(): Promise<string> {
  const result = await execFileAsync(
    "pnpm",
    ["--filter", "@elevenhouse/db", "db:preflight-production-baseline"],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: isolatedDatabaseUrl },
      timeout: 20_000
    }
  );
  return `${result.stdout}${result.stderr}`;
}

async function readLedger(): Promise<readonly { hash: string; created_at: string }[]> {
  const result = await databaseClient!.query<{ hash: string; created_at: string }>(`
    SELECT hash, created_at::text AS created_at
      FROM drizzle.__drizzle_migrations
     ORDER BY id
  `);
  return result.rows;
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
