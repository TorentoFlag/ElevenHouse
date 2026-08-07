import { randomUUID } from "node:crypto";

import type { FinanceReadinessEvidenceReader } from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createDrizzleFinanceReadinessEvidenceReader } from "./drizzle-finance-readiness-evidence-reader";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_finance_readiness_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);

describe.sequential("Drizzle finance readiness evidence reader", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    await pool.query(schemaSql);
    await pool.query(
      `insert into finance_readiness_evidence_versions
       (evidence_id, evidence_version, requirement_code, transaction_category, scope_key, is_current, status, effective_at, expires_at, safe_digest)
       values
       ('legal-platform', 3, 'legal_accounting_platform_subscription', 'platform_subscription', 'legal_accounting_platform_subscription:platform_subscription', true, 'active', '2026-01-01T00:00:00Z', null, $1),
       ('commercial', 2, 'commercial_tariff', null, 'commercial_tariff:global', true, 'active', '2026-01-01T00:00:00Z', null, $2),
       ('expired', 1, 'commercial_tariff', null, 'commercial_tariff:global:old', false, 'revoked', '2025-01-01T00:00:00Z', '2025-02-01T00:00:00Z', $3)`,
      [digest("a"), digest("b"), digest("c")]
    );
  }, 30_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await adminClient.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("returns only current evidence for the exact operation scope", async () => {
    const reader = createDrizzleFinanceReadinessEvidenceReader({ database: drizzle(pool) });
    const evidence = await reader.listFinanceReadinessEvidence({
      operationKind: "platform_invoice_charge",
      requirementCodes: [
        "legal_accounting_platform_subscription",
        "commercial_tariff"
      ],
      transactionCategory: "platform_subscription"
    });

    expect(evidence).toEqual([
      expect.objectContaining({
        id: "commercial",
        version: 2,
        requirementCode: "commercial_tariff",
        transactionCategory: null
      }),
      expect.objectContaining({
        id: "legal-platform",
        version: 3,
        requirementCode: "legal_accounting_platform_subscription",
        transactionCategory: "platform_subscription"
      })
    ]);
  });
});

const schemaSql = `
create table finance_readiness_evidence_versions (
  evidence_id varchar(160) not null,
  evidence_version numeric(38, 0) not null,
  requirement_code text not null,
  transaction_category text,
  scope_key varchar(240) not null,
  is_current boolean not null default true,
  status text not null,
  effective_at timestamptz not null,
  expires_at timestamptz,
  safe_digest varchar(71) not null,
  created_at timestamptz not null default now(),
  primary key (evidence_id, evidence_version)
);
`;

function digest(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV ?? "development", "integration-test");
  return value;
}

function withDatabaseName(url: string, nextDatabaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${nextDatabaseName}`;
  return parsed.toString();
}

const _readerShape: FinanceReadinessEvidenceReader | null = null;
void _readerShape;
