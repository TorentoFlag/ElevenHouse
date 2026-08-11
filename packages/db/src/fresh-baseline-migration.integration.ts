import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertDevelopmentDatabaseUrl } from "./connection";

const execFileAsync = promisify(execFile);
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;
const databaseName = `elevenhouse_fresh_baseline_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = integrationDatabaseUrl
  ? withDatabaseName(
      assertDevelopmentDatabaseUrl(
        integrationDatabaseUrl,
        process.env.NODE_ENV,
        "test fresh generated baseline migration"
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
const migrationCount = readMigrationCount();

describeWithDatabase("fresh generated baseline migration", () => {
  beforeAll(async () => {
    await adminClient!.connect();
    await adminClient!.query(`CREATE DATABASE "${databaseName}"`);
    await runMigrator();
    await databaseClient!.connect();
  }, 30_000);

  afterAll(async () => {
    try {
      await databaseClient?.end();
      await adminClient?.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient?.end();
    }
  }, 30_000);

  it("installs the complete ordered lineage with V2 refund tables before their integrity triggers", async () => {
    const migrationLedger = await databaseClient!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations"
    );
    const refundCaseTable = await databaseClient!.query<{ exists: boolean }>(`
      SELECT to_regclass('public.finance_online_wallet_refund_cases') IS NOT NULL AS exists
    `);
    const refundCaseTrigger = await databaseClient!.query<{ exists: boolean }>(`
      SELECT exists(
        SELECT 1
          FROM pg_trigger
         WHERE tgname = 'finance_online_wallet_refund_cases_transition_guard'
           AND tgrelid = 'finance_online_wallet_refund_cases'::regclass
      ) AS exists
    `);

    expect(migrationLedger.rows).toEqual([{ count: String(migrationCount) }]);
    expect(refundCaseTable.rows).toEqual([{ exists: true }]);
    expect(refundCaseTrigger.rows).toEqual([{ exists: true }]);
  }, 30_000);
});

async function runMigrator(): Promise<void> {
  await execFileAsync("pnpm", ["--filter", "@elevenhouse/db", "db:migrate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: isolatedDatabaseUrl },
    timeout: 30_000
  });
}

function readMigrationCount(): number {
  const journalPath = join(process.cwd(), "packages/db/drizzle/meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries?: unknown };
  if (!Array.isArray(journal.entries)) throw new Error("Migration journal entries are required");
  return journal.entries.length;
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
