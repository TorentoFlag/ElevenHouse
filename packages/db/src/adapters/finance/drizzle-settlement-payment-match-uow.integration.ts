import { randomUUID } from "node:crypto";

import {
  createProviderSettlementEntryKey,
  digestFinanceCanonicalValueV1,
  type MatchSettlementPaymentCommand,
  type ResolvedFinanceOperationEnvelope,
  type SettlementBatchIngestionCommitReceiptRef,
  type SettlementPaymentCorrelationRule
} from "@elevenhouse/domain/finance-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { financeCanonicalJsonV1Sql } from "../../schema/finance/canonical-json.sql";
import { financeSettlementIntegritySql } from "../../schema/finance/settlement.schema";
import {
  SettlementPaymentMatchPersistenceError,
  createDrizzleSettlementPaymentMatchUnitOfWork,
  type SettlementPaymentCorrelationRuleDefinition,
  type SettlementPaymentMatchWriteBoundary
} from "./drizzle-settlement-payment-match-uow";

const baseDatabaseUrl = integrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_settlement_match_${randomUUID().replaceAll("-", "")}`;
if (!/^elevenhouse_settlement_match_[0-9a-f]{32}$/.test(databaseName)) {
  throw new Error("Invalid isolated settlement payment match test database name");
}
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const providerAccount = Object.freeze({
  seriesId: "arc-series-main",
  providerAccountId: "arc-account-main",
  identityVersion: 1
});
const operationEnvelope = Object.freeze({
  kind: "resolved_finance_operation_envelope" as const,
  policyId: "settlement-match-policy",
  policyVersion: 3,
  policyDigest: sha("9"),
  maximumRows: 20,
  maximumDecimalDigits: 38,
  maximumArtifactBytes: 524_288
}) as ResolvedFinanceOperationEnvelope;

describe.sequential("settlement payment match PostgreSQL integration", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl, max: 8 });
    database = drizzle(pool);
    await pool.query(minimalSettlementPaymentMatchSchemaSql);
    await pool.query(financeCanonicalJsonV1Sql);
    await pool.query(exactSettlementPaymentMatchIntegritySql(financeSettlementIntegritySql));
  }, 30_000);

  beforeEach(async () => {
    await pool.query(`
      begin;
      alter table finance_settlement_payment_match_commit_receipts
        disable trigger finance_settlement_payment_match_receipts_no_truncate;
      truncate table
        finance_settlement_payment_match_commit_receipts,
        finance_settlement_exceptions,
        finance_settlement_ledger_page_entries,
        finance_settlement_ledger_entries,
        finance_settlement_batch_ingestion_commit_receipts,
        finance_settlement_pages,
        finance_capture_facts,
        finance_payment_clearing_heads,
        finance_economic_payment_intents,
        finance_provider_accounts
      restart identity cascade
      ;
      alter table finance_settlement_payment_match_commit_receipts
        enable trigger finance_settlement_payment_match_receipts_no_truncate;
      commit;
    `);
  });

  afterAll(async () => {
    try {
      await pool?.end();
      await adminClient.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("persists one DB-issued exact match receipt and replays it after clearing advances", async () => {
    const fixture = await seedPaymentFixture(pool);
    const unitOfWork = createDrizzleSettlementPaymentMatchUnitOfWork({
      database,
      correlationRules: [fixture.rule]
    });

    const committed = await unitOfWork.matchSettlementPayment(fixture.command);
    const replayed = await unitOfWork.matchSettlementPayment(fixture.command);

    await pool.query(
      `update finance_payment_clearing_heads
       set state = 'provider_matched', version = 3, updated_at = clock_timestamp()
       where economic_payment_intent_id = $1`,
      [fixture.command.economicPaymentIntentId]
    );
    const replayedAfterAdvance = await unitOfWork.matchSettlementPayment(fixture.command);

    expect(replayed).toEqual(committed);
    expect(replayedAfterAdvance).toEqual(committed);
    expect(committed).toMatchObject({
      providerEntryKey: fixture.command.providerEntryKey,
      economicPaymentIntentId: fixture.command.economicPaymentIntentId,
      matchResult: "matched",
      correlationRuleId: fixture.command.correlationRule.ruleId,
      clearingVersion: 2
    });
    expect(committed.ref).toMatchObject({
      kind: "settlement_payment_match_commit_receipt",
      version: 1,
      canonicalDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    });
    expect(committed.ref.receiptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(committed.persistenceTransactionBoundaryRef).toMatch(/^postgres-xid:[0-9]+$/);
    expect(Number.isNaN(Date.parse(committed.committedAt))).toBe(false);

    await expectCounts(pool, { receipts: 1, exceptions: 0 });
    const clearing = await pool.query<{ state: string; version: string }>(
      `select state, version from finance_payment_clearing_heads`
    );
    expect(clearing.rows).toEqual([{ state: "provider_matched", version: "3" }]);
  });

  it("quarantines an unknown pinned-rule combination without changing clearing or money state", async () => {
    const fixture = await seedPaymentFixture(pool, { direction: "future_provider_direction" });
    const unitOfWork = createDrizzleSettlementPaymentMatchUnitOfWork({
      database,
      correlationRules: [fixture.rule]
    });

    const committed = await unitOfWork.matchSettlementPayment(fixture.command);
    const replayed = await unitOfWork.matchSettlementPayment(fixture.command);

    expect(replayed).toEqual(committed);
    expect(committed.matchResult).toBe("quarantined_no_effect");
    await expectCounts(pool, { receipts: 1, exceptions: 1 });
    const exception = await pool.query<{
      exception_code: string;
      evidence_digest: string;
      resolved_at: Date | null;
    }>(
      `select exception_code, evidence_digest, resolved_at
       from finance_settlement_exceptions`
    );
    expect(exception.rows).toEqual([
      {
        exception_code: "settlement_payment_correlation_mismatch",
        evidence_digest: sha("e"),
        resolved_at: null
      }
    ]);
    const clearing = await pool.query<{ state: string; version: string }>(
      `select state, version from finance_payment_clearing_heads`
    );
    expect(clearing.rows).toEqual([{ state: "settlement_seen", version: "2" }]);
    const forbiddenTables = await pool.query<{ name: string | null }>(`
      select to_regclass('public.finance_journal_transactions')::text as name
      union all select to_regclass('public.finance_wallets')::text
      union all select to_regclass('public.finance_bank_cash_pools')::text
    `);
    expect(forbiddenTables.rows).toEqual([{ name: null }, { name: null }, { name: null }]);
  });

  it("rejects a conflicting replay instead of retargeting one provider entry", async () => {
    const fixture = await seedPaymentFixture(pool);
    const unitOfWork = createDrizzleSettlementPaymentMatchUnitOfWork({
      database,
      correlationRules: [fixture.rule]
    });
    await unitOfWork.matchSettlementPayment(fixture.command);

    await expect(
      unitOfWork.matchSettlementPayment({
        ...fixture.command,
        economicPaymentIntentId: "economic-substitution"
      })
    ).rejects.toMatchObject({
      code: "settlement_payment_match_persistence_error",
      reason: "settlement_match_conflict"
    });
    await expectCounts(pool, { receipts: 1, exceptions: 0 });
  });

  it("rejects stale clearing CAS and an unsupported rule before any write", async () => {
    const fixture = await seedPaymentFixture(pool);
    const unitOfWork = createDrizzleSettlementPaymentMatchUnitOfWork({
      database,
      correlationRules: [fixture.rule]
    });

    await expect(
      unitOfWork.matchSettlementPayment({
        ...fixture.command,
        expectedClearingVersion: fixture.command.expectedClearingVersion + 1
      })
    ).rejects.toMatchObject({ reason: "clearing_version_conflict" });

    const unsupportedRule = Object.freeze({
      ...fixture.command.correlationRule,
      ruleId: "unapproved-rule"
    }) as SettlementPaymentCorrelationRule;
    await expect(
      unitOfWork.matchSettlementPayment({
        ...fixture.command,
        correlationRule: unsupportedRule
      })
    ).rejects.toMatchObject({ reason: "correlation_rule_not_supported" });
    await expectCounts(pool, { receipts: 0, exceptions: 0 });
  });

  it("rejects a valid batch receipt whose exact page does not contain the provider entry", async () => {
    const fixture = await seedPaymentFixture(pool);
    const otherPage = await pool.query<{ id: string }>(
      `insert into finance_settlement_pages (stream) values ('settlement_ledger') returning id`
    );
    const otherBatch = Object.freeze({
      kind: "settlement_batch_ingestion_commit_receipt" as const,
      receiptId: "batch-other-page",
      version: 1 as const,
      canonicalDigest: sha("c")
    }) as SettlementBatchIngestionCommitReceiptRef;
    await pool.query(
      `insert into finance_settlement_batch_ingestion_commit_receipts
         (receipt_id, receipt_version, canonical_digest, settlement_page_id,
          provider_account_series_id, provider_account_id, provider_identity_version, stream)
       values ($1, 1, $2, $3, $4, $5, $6, 'settlement_ledger')`,
      [
        otherBatch.receiptId,
        otherBatch.canonicalDigest,
        requiredRow(otherPage.rows).id,
        providerAccount.seriesId,
        providerAccount.providerAccountId,
        providerAccount.identityVersion
      ]
    );
    const unitOfWork = createDrizzleSettlementPaymentMatchUnitOfWork({
      database,
      correlationRules: [fixture.rule]
    });

    await expect(
      unitOfWork.matchSettlementPayment({ ...fixture.command, batchIngestion: otherBatch })
    ).rejects.toMatchObject({ reason: "settlement_entry_batch_conflict" });
    await expectCounts(pool, { receipts: 0, exceptions: 0 });
  });

  it.each([
    "settlement_exception",
    "settlement_payment_match_receipt"
  ] satisfies readonly SettlementPaymentMatchWriteBoundary[])(
    "rolls back quarantine evidence and receipt after %s",
    async (failedBoundary) => {
      const fixture = await seedPaymentFixture(pool, { direction: "unknown_direction" });
      const unitOfWork = createDrizzleSettlementPaymentMatchUnitOfWork({
        database,
        correlationRules: [fixture.rule],
        afterWriteBoundary(boundary) {
          if (boundary === failedBoundary) throw new Error(`injected:${boundary}`);
        }
      });

      await expect(unitOfWork.matchSettlementPayment(fixture.command)).rejects.toThrow(
        `injected:${failedBoundary}`
      );
      await expectCounts(pool, { receipts: 0, exceptions: 0 });
      const clearing = await pool.query<{ state: string; version: string }>(
        `select state, version from finance_payment_clearing_heads`
      );
      expect(clearing.rows).toEqual([{ state: "settlement_seen", version: "2" }]);
    }
  );

  it("serializes concurrent duplicate matches to one nominal receipt", async () => {
    const fixture = await seedPaymentFixture(pool);
    const first = createDrizzleSettlementPaymentMatchUnitOfWork({
      database,
      correlationRules: [fixture.rule]
    });
    const second = createDrizzleSettlementPaymentMatchUnitOfWork({
      database,
      correlationRules: [fixture.rule]
    });

    const [left, right] = await Promise.all([
      first.matchSettlementPayment(fixture.command),
      second.matchSettlementPayment(fixture.command)
    ]);

    expect(left).toEqual(right);
    await expectCounts(pool, { receipts: 1, exceptions: 0 });
  });

  it("rejects correlation-rule configuration whose digest does not bind its semantics", async () => {
    const fixture = await seedPaymentFixture(pool);
    expect(() =>
      createDrizzleSettlementPaymentMatchUnitOfWork({
        database,
        correlationRules: [{ ...fixture.rule, entryType: "substituted_entry_type" }]
      })
    ).toThrowError(
      expect.objectContaining<Partial<SettlementPaymentMatchPersistenceError>>({
        code: "settlement_payment_match_persistence_error",
        reason: "invalid_correlation_rule_configuration"
      })
    );
    await expectCounts(pool, { receipts: 0, exceptions: 0 });
  });

  it("rejects two different semantics under the same provider rule id and version", async () => {
    const fixture = await seedPaymentFixture(pool);
    const alternateSemantics = Object.freeze({
      referenceType: fixture.rule.referenceType,
      direction: "different_direction",
      entryType: fixture.rule.entryType,
      settlementStatus: fixture.rule.settlementStatus,
      amountRelation: fixture.rule.amountRelation
    });
    const alternateIdentity = Object.freeze({
      kind: fixture.rule.rule.kind,
      ruleId: fixture.rule.rule.ruleId,
      ruleVersion: fixture.rule.rule.ruleVersion,
      providerAccount
    });
    const alternateRule = Object.freeze({
      rule: Object.freeze({
        ...alternateIdentity,
        ruleDigest: digestFinanceCanonicalValueV1({
          ...alternateIdentity,
          semantics: alternateSemantics
        })
      }) as SettlementPaymentCorrelationRule,
      ...alternateSemantics
    });

    expect(() =>
      createDrizzleSettlementPaymentMatchUnitOfWork({
        database,
        correlationRules: [fixture.rule, alternateRule]
      })
    ).toThrowError(
      expect.objectContaining<Partial<SettlementPaymentMatchPersistenceError>>({
        code: "settlement_payment_match_persistence_error",
        reason: "invalid_correlation_rule_configuration"
      })
    );
    await expectCounts(pool, { receipts: 0, exceptions: 0 });
  });

  it("keeps the nominal receipt immutable at the database boundary", async () => {
    const fixture = await seedPaymentFixture(pool);
    const unitOfWork = createDrizzleSettlementPaymentMatchUnitOfWork({
      database,
      correlationRules: [fixture.rule]
    });
    const receipt = await unitOfWork.matchSettlementPayment(fixture.command);

    await expect(
      pool.query(
        `update finance_settlement_payment_match_commit_receipts
         set match_result = 'quarantined_no_effect'
         where receipt_id = $1`,
        [receipt.ref.receiptId]
      )
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      pool.query(`delete from finance_settlement_payment_match_commit_receipts`)
    ).rejects.toMatchObject({ code: "55000" });
    await expectCounts(pool, { receipts: 1, exceptions: 0 });
  });
});

async function seedPaymentFixture(
  pool: Pool,
  input: Readonly<{
    suffix?: string;
    direction?: string;
    entryType?: string;
    referenceType?: string;
    referenceId?: string;
    settlementStatus?: string | null;
    settlementAmountMinor?: string;
    clearingVersion?: number;
  }> = {}
): Promise<
  Readonly<{
    command: MatchSettlementPaymentCommand;
    rule: SettlementPaymentCorrelationRuleDefinition;
  }>
> {
  const suffix = input.suffix ?? "one";
  const economicPaymentIntentId = `economic-${suffix}`;
  const captureFactId = `capture-${suffix}`;
  const providerPaymentId = `provider-payment-${suffix}`;
  const providerEntryId = `settlement-entry-${suffix}`;
  const amountMinor = "9600";
  const batchReceiptId = `batch-${suffix}`;
  const batchReceiptDigest = sha("b");
  const rawPayloadDigest = sha("e");
  const rule = correlationRuleDefinition();

  await pool.query(
    `insert into finance_provider_accounts
       (series_id, provider_account_id, identity_version, provider)
     values ($1, $2, $3, 'arc_pay')
     on conflict do nothing`,
    [providerAccount.seriesId, providerAccount.providerAccountId, providerAccount.identityVersion]
  );
  const page = await pool.query<{ id: string }>(
    `insert into finance_settlement_pages (stream) values ('settlement_ledger') returning id`
  );
  const settlementPageId = requiredRow(page.rows).id;
  await pool.query(
    `insert into finance_settlement_batch_ingestion_commit_receipts
       (receipt_id, receipt_version, canonical_digest, settlement_page_id,
        provider_account_series_id, provider_account_id, provider_identity_version, stream)
     values ($1, 1, $2, $3, $4, $5, $6, 'settlement_ledger')`,
    [
      batchReceiptId,
      batchReceiptDigest,
      settlementPageId,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion
    ]
  );
  const entry = await pool.query<{ id: string }>(
    `insert into finance_settlement_ledger_entries
       (provider_account_series_id, provider_account_id, provider_identity_version,
        provider_entry_id, first_seen_page_id, amount_minor, currency, direction,
        entry_type, reference_type, reference_id, settlement_status, raw_payload_digest)
     values ($1, $2, $3, $4, $5, $6, 'RUB', $7, $8, $9, $10, $11, $12)
     returning id`,
    [
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion,
      providerEntryId,
      settlementPageId,
      input.settlementAmountMinor ?? amountMinor,
      input.direction ?? rule.direction,
      input.entryType ?? rule.entryType,
      input.referenceType ?? rule.referenceType,
      input.referenceId ?? providerPaymentId,
      input.settlementStatus === undefined ? rule.settlementStatus : input.settlementStatus,
      rawPayloadDigest
    ]
  );
  const settlementEntryId = requiredRow(entry.rows).id;
  await pool.query(
    `insert into finance_settlement_ledger_page_entries
       (settlement_page_id, settlement_entry_id, stream, row_index)
     values ($1, $2, 'settlement_ledger', 0)`,
    [settlementPageId, settlementEntryId]
  );
  await pool.query(
    `insert into finance_economic_payment_intents
       (id, purpose, source_id, series_id, provider_account_id, provider_identity_version,
        amount_minor, currency, state, version)
     values ($1, 'client_order', $2, $3, $4, $5, $6, 'RUB', 'captured', 4)`,
    [
      economicPaymentIntentId,
      `order-${suffix}`,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion,
      amountMinor
    ]
  );
  await pool.query(
    `insert into finance_capture_facts
       (id, economic_payment_intent_id, series_id, provider_account_id,
        provider_identity_version, provider_payment_id, amount_minor, currency)
     values ($1, $2, $3, $4, $5, $6, $7, 'RUB')`,
    [
      captureFactId,
      economicPaymentIntentId,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion,
      providerPaymentId,
      amountMinor
    ]
  );
  const clearingVersion = input.clearingVersion ?? 2;
  await pool.query(
    `insert into finance_payment_clearing_heads
       (economic_payment_intent_id, series_id, provider_account_id,
        provider_identity_version, currency, state, version)
     values ($1, $2, $3, $4, 'RUB', 'settlement_seen', $5)`,
    [
      economicPaymentIntentId,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion,
      clearingVersion
    ]
  );

  const batchIngestion = Object.freeze({
    kind: "settlement_batch_ingestion_commit_receipt" as const,
    receiptId: batchReceiptId,
    version: 1 as const,
    canonicalDigest: batchReceiptDigest
  }) as SettlementBatchIngestionCommitReceiptRef;
  const command = Object.freeze({
    providerEntryKey: createProviderSettlementEntryKey({ providerAccount, providerEntryId }),
    economicPaymentIntentId,
    expectedClearingVersion: clearingVersion,
    batchIngestion,
    correlationRule: rule.rule,
    operationEnvelope
  });
  return Object.freeze({ command, rule });
}

function correlationRuleDefinition(): SettlementPaymentCorrelationRuleDefinition {
  const semantics = Object.freeze({
    referenceType: "provider_payment",
    direction: "provider_credit",
    entryType: "captured_payment",
    settlementStatus: "settled" as string | null,
    amountRelation: "same_minor" as const
  });
  const identity = {
    kind: "settlement_payment_correlation_rule" as const,
    ruleId: "arc-pay-payment-credit-v1",
    ruleVersion: 1,
    providerAccount
  };
  const rule = Object.freeze({
    ...identity,
    ruleDigest: digestFinanceCanonicalValueV1({ ...identity, semantics })
  }) as SettlementPaymentCorrelationRule;
  return Object.freeze({ rule, ...semantics });
}

async function expectCounts(
  pool: Pool,
  expected: Readonly<{ receipts: number; exceptions: number }>
): Promise<void> {
  const counts = await pool.query<{ receipts: string; exceptions: string }>(`
    select
      (select count(*) from finance_settlement_payment_match_commit_receipts)::text as receipts,
      (select count(*) from finance_settlement_exceptions)::text as exceptions
  `);
  expect(requiredRow(counts.rows)).toEqual({
    receipts: String(expected.receipts),
    exceptions: String(expected.exceptions)
  });
}

function requiredRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Expected one PostgreSQL row");
  return row;
}

function exactSettlementPaymentMatchIntegritySql(source: string): string {
  const issueStart = source.indexOf(
    "create or replace function finance_issue_settlement_payment_match_receipt()"
  );
  const rejectStart = source.indexOf(
    "create or replace function finance_reject_settlement_history_mutation()",
    issueStart
  );
  const firstGenericTrigger = source.indexOf(
    "create trigger finance_settlement_pages_immutable",
    rejectStart
  );
  const matchImmutableStart = source.indexOf(
    "create trigger finance_settlement_payment_match_receipts_immutable",
    firstGenericTrigger
  );
  const matchImmutableEnd = source.indexOf(
    "create trigger finance_merchant_payout_confirmation_receipts_immutable",
    matchImmutableStart
  );
  if (
    issueStart < 0 ||
    rejectStart < 0 ||
    firstGenericTrigger < 0 ||
    matchImmutableStart < 0 ||
    matchImmutableEnd < 0
  ) {
    throw new Error("Settlement payment match integrity SQL boundary is missing");
  }
  return [
    source.slice(issueStart, rejectStart),
    source.slice(rejectStart, firstGenericTrigger),
    source.slice(matchImmutableStart, matchImmutableEnd)
  ].join("\n");
}

function sha(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
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

const minimalSettlementPaymentMatchSchemaSql = `
create extension if not exists pgcrypto;

create table finance_provider_accounts (
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  identity_version integer not null,
  provider text not null,
  primary key (series_id, provider_account_id, identity_version)
);
create table finance_settlement_pages (
  id uuid primary key default gen_random_uuid(),
  stream text not null
);
create table finance_settlement_batch_ingestion_commit_receipts (
  receipt_id varchar(200) primary key,
  receipt_version integer not null,
  canonical_digest varchar(71) not null,
  settlement_page_id uuid not null references finance_settlement_pages(id),
  provider_account_series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  stream text not null,
  unique (receipt_id, receipt_version, canonical_digest)
);
create table finance_settlement_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  provider_account_series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  provider_entry_id varchar(200) not null,
  first_seen_page_id uuid not null references finance_settlement_pages(id),
  amount_minor numeric(19,0) not null,
  currency varchar(500) not null,
  direction varchar(500) not null,
  entry_type varchar(500) not null,
  reference_type varchar(500) not null,
  reference_id varchar(500) not null,
  fee_amount_minor numeric(19,0),
  balance_after_minor numeric(19,0),
  occurred_at varchar(80),
  organization_id varchar(500),
  terminal_id varchar(500),
  bank_terminal_id varchar(500),
  bank_code varchar(500),
  bank_rrn varchar(500),
  bank_auth_code varchar(500),
  bank_internal_reference varchar(500),
  settlement_status varchar(500),
  raw_payload_digest varchar(71) not null,
  first_seen_at timestamptz not null default clock_timestamp(),
  unique (provider_account_series_id, provider_account_id, provider_identity_version, provider_entry_id),
  unique (id, provider_account_series_id, provider_account_id, provider_identity_version, provider_entry_id)
);
create table finance_settlement_ledger_page_entries (
  settlement_page_id uuid not null references finance_settlement_pages(id),
  settlement_entry_id uuid not null references finance_settlement_ledger_entries(id),
  stream text not null,
  row_index integer not null,
  linked_at timestamptz not null default clock_timestamp(),
  primary key (settlement_page_id, settlement_entry_id)
);
create table finance_economic_payment_intents (
  id varchar(160) primary key,
  purpose text not null,
  source_id varchar(160) not null,
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  amount_minor numeric(38,0) not null,
  currency text not null,
  state text not null,
  version numeric(38,0) not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, series_id, provider_account_id, provider_identity_version)
);
create table finance_capture_facts (
  id varchar(160) primary key,
  economic_payment_intent_id varchar(160) not null references finance_economic_payment_intents(id),
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  provider_payment_id varchar(160) not null,
  amount_minor numeric(38,0) not null,
  currency text not null,
  unique (series_id, provider_account_id, provider_identity_version, provider_payment_id)
);
create table finance_payment_clearing_heads (
  economic_payment_intent_id varchar(160) primary key references finance_economic_payment_intents(id),
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  currency text not null,
  state text not null,
  version numeric(38,0) not null,
  updated_at timestamptz not null default clock_timestamp()
);
create table finance_settlement_exceptions (
  id uuid primary key default gen_random_uuid(),
  provider_account_series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  stream text not null,
  settlement_page_id uuid not null references finance_settlement_pages(id),
  provider_entry_id varchar(200),
  merchant_payout_id varchar(200),
  exception_code varchar(160) not null,
  evidence_digest varchar(71) not null,
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  unique nulls not distinct
    (provider_account_series_id, provider_account_id, provider_identity_version,
     provider_entry_id, exception_code, resolved_at)
);
create table finance_settlement_payment_match_commit_receipts (
  receipt_id varchar(200) primary key default gen_random_uuid()::text,
  receipt_version integer not null default 1,
  canonical_preimage text not null default '',
  canonical_digest varchar(71) not null default '',
  batch_ingestion_receipt_id varchar(200) not null,
  batch_ingestion_receipt_version integer not null,
  batch_ingestion_receipt_digest varchar(71) not null,
  settlement_page_id uuid not null,
  settlement_entry_id uuid not null,
  provider_account_series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  provider_entry_id varchar(200) not null,
  economic_payment_intent_id varchar(160) not null,
  capture_fact_id varchar(160) not null references finance_capture_facts(id),
  provider_payment_id varchar(160) not null,
  amount_minor numeric(38,0) not null,
  currency text not null,
  match_result text not null,
  correlation_rule_id varchar(160) not null,
  correlation_rule_version integer not null,
  correlation_rule_digest varchar(71) not null,
  rule_reference_type varchar(500) not null,
  rule_direction varchar(500) not null,
  rule_entry_type varchar(500) not null,
  rule_settlement_status varchar(500),
  rule_amount_relation text not null,
  clearing_version numeric(38,0) not null,
  match_evidence_digest varchar(71) not null default '',
  settlement_exception_id uuid references finance_settlement_exceptions(id),
  operation_policy_id varchar(160) not null,
  operation_policy_version integer not null,
  operation_policy_digest varchar(71) not null,
  maximum_rows integer not null,
  maximum_decimal_digits integer not null,
  maximum_artifact_bytes numeric(38,0) not null,
  persistence_transaction_boundary_ref varchar(200) not null default '',
  committed_at timestamptz not null default clock_timestamp(),
  foreign key (batch_ingestion_receipt_id, batch_ingestion_receipt_version,
    batch_ingestion_receipt_digest)
    references finance_settlement_batch_ingestion_commit_receipts
      (receipt_id, receipt_version, canonical_digest),
  foreign key (settlement_entry_id, provider_account_series_id, provider_account_id,
    provider_identity_version, provider_entry_id)
    references finance_settlement_ledger_entries
      (id, provider_account_series_id, provider_account_id, provider_identity_version,
       provider_entry_id),
  foreign key (settlement_page_id, settlement_entry_id)
    references finance_settlement_ledger_page_entries
      (settlement_page_id, settlement_entry_id),
  foreign key (economic_payment_intent_id, provider_account_series_id,
    provider_account_id, provider_identity_version)
    references finance_economic_payment_intents
      (id, series_id, provider_account_id, provider_identity_version),
  foreign key (economic_payment_intent_id)
    references finance_payment_clearing_heads(economic_payment_intent_id),
  unique (receipt_id, receipt_version, canonical_digest),
  unique (provider_account_series_id, provider_account_id,
    provider_identity_version, provider_entry_id),
  unique (persistence_transaction_boundary_ref)
);
create unique index finance_settlement_payment_match_receipts_matched_capture_unique
  on finance_settlement_payment_match_commit_receipts(capture_fact_id)
  where match_result = 'matched';
`;
