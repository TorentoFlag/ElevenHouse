import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import {
  financeBankCashPools,
  financeCashPoolDirectoryReceipts
} from "../../schema/finance/bank-cash.schema";
import { createDrizzleCashPoolDirectoryBootstrapPort } from "./drizzle-cash-pool-directory-bootstrap";

const baseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_cash_pool_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = withDatabaseName(baseUrl, databaseName);
const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe.sequential("cash-pool directory bootstrap PostgreSQL integration", () => {
  const admin = new Client({ connectionString: baseUrl });
  let pool: Pool;

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: databaseUrl });
    await pool.query(minimalDirectorySchemaSql);
  }, 30_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await admin.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await admin.end();
    }
  }, 30_000);

  it("is replay-safe and creates only the zero-balance reference rows", async () => {
    const database = drizzle(pool, { schema: { financeBankCashPools, financeCashPoolDirectoryReceipts } });
    const port = createDrizzleCashPoolDirectoryBootstrapPort({ database });
    const command = {
      bankCashPoolId: "elevenhouse-rub-main",
      currency: "RUB" as const,
      bankAccountFingerprint: digest,
      statementSourceFingerprint: digest
    } as const;

    const first = await port.ensureEmptySystemCashPoolReference(command);
    const replay = await port.ensureEmptySystemCashPoolReference(command);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      monetaryInitialization: "reference_only_zero",
      balanceBearingRowsCreated: 0,
      journalTransactionId: null,
      persistenceTransactionBoundaryRef: expect.stringMatching(/^postgres-xid:[0-9]+$/)
    });
    await expect(pool.query("select count(*)::int as count from finance_bank_cash_pools")).resolves.toMatchObject({ rows: [{ count: 1 }] });
    await expect(pool.query("select count(*)::int as count from finance_cash_pool_directory_receipts")).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });
});

const minimalDirectorySchemaSql = `
create extension if not exists pgcrypto;
create table finance_bank_cash_pools (
  id varchar(160) primary key, currency text not null, bank_account_fingerprint varchar(71) not null,
  statement_source_fingerprint varchar(71) not null, activated_at timestamptz not null default now(),
  retired_at timestamptz, created_at timestamptz not null default now()
);
create table finance_cash_pool_directory_receipts (
  receipt_id varchar(200) primary key default gen_random_uuid()::text, receipt_version integer not null default 1,
  bank_cash_pool_id varchar(160) not null, currency text not null, bank_account_fingerprint varchar(71) not null,
  statement_source_fingerprint varchar(71) not null, monetary_initialization text not null default 'reference_only_zero',
  balance_bearing_rows_created integer not null default 0, journal_transaction_id varchar(200),
  persistence_transaction_boundary_ref varchar(200) not null, canonical_preimage text not null default '',
  canonical_digest varchar(71) not null default '', issued_at timestamptz not null default now()
);
create or replace function issue_directory_receipt() returns trigger language plpgsql as $$
begin
  new.receipt_id := gen_random_uuid()::text; new.receipt_version := 1;
  new.monetary_initialization := 'reference_only_zero'; new.balance_bearing_rows_created := 0;
  new.journal_transaction_id := null; new.issued_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object('receiptId', new.receipt_id, 'pool', new.bank_cash_pool_id)::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end; $$;
create trigger issue_directory_receipt before insert on finance_cash_pool_directory_receipts
for each row execute function issue_directory_receipt();
`;

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  assertDevelopmentDatabaseUrl(value);
  return value;
}
function withDatabaseName(url: string, database: string): string {
  const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString();
}
