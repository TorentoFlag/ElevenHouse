import { randomUUID } from "node:crypto";

import {
  createLosslessSettlementEntry,
  createLosslessSettlementPayout,
  createSettlementCursorKey,
  createSettlementPageCheckpointKey,
  digestFinanceCanonicalValueV1,
  type LosslessSettlementEntry,
  type LosslessSettlementPayout,
  type RawProviderArtifactRef,
  type ResolvedFinanceOperationEnvelope,
  type SettlementCursorLeaseReceipt,
  type VerifiedSettlementPageBundle
} from "@elevenhouse/domain/finance-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import {
  SettlementBatchIngestionPersistenceError,
  createDrizzleSettlementBatchIngestionUnitOfWork,
  type SettlementBatchIngestionWriteBoundary
} from "./drizzle-settlement-batch-ingestion-uow";
import { createDrizzleSettlementCursorLeaseUnitOfWork } from "./drizzle-settlement-cursor-lease-uow";

const baseDatabaseUrl = integrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_settlement_ingest_${randomUUID().replaceAll("-", "")}`;
if (!/^elevenhouse_settlement_ingest_[0-9a-f]{32}$/.test(databaseName)) {
  throw new Error("Invalid isolated settlement ingestion test database name");
}
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const providerAccount = Object.freeze({
  seriesId: "arc-series-main",
  providerAccountId: "arc-account-main",
  identityVersion: 1
});
const envelope = Object.freeze({
  kind: "resolved_finance_operation_envelope" as const,
  policyId: "settlement-policy",
  policyVersion: 1,
  policyDigest: sha("e"),
  maximumRows: 100,
  maximumDecimalDigits: 38,
  maximumArtifactBytes: 512 * 1024
}) as ResolvedFinanceOperationEnvelope;

describe.sequential("settlement batch ingestion PostgreSQL integration", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    database = drizzle(pool);
    await pool.query(minimalSettlementSchemaSql);
  }, 30_000);

  beforeEach(async () => {
    await pool.query(`
      truncate table
        finance_settlement_batch_ingestion_commit_receipts,
        finance_settlement_page_checkpoints,
        finance_settlement_ledger_page_entries,
        finance_settlement_payout_page_entries,
        finance_settlement_ledger_entries,
        finance_settlement_payouts,
        finance_settlement_pages,
        finance_artifact_tombstones,
        finance_artifacts,
        finance_settlement_cursors
      restart identity cascade
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

  it("atomically ingests lossless int64 ledger rows and replays the same committed page once", async () => {
    const lease = await seedAndClaimCursor(pool, database, "settlement_ledger");
    const artifact = await seedArtifact(pool, "ledger-page-a", sha("a"), 4_096);
    const rows = [
      ledgerEntry("entry-max", "9223372036854775807", sha("1")),
      ledgerEntry("entry-min", "-9223372036854775808", sha("2"))
    ];
    const pageBundle = settlementBundle({
      stream: "settlement_ledger",
      providerPageCursor: null,
      nextCursor: "cursor-b",
      artifact,
      rows
    });
    const unitOfWork = createDrizzleSettlementBatchIngestionUnitOfWork({ database });

    const committed = await unitOfWork.ingestVerifiedPage({
      expectedCursorVersion: 2,
      lease,
      pageBundle
    });
    const replayed = await unitOfWork.ingestVerifiedPage({
      expectedCursorVersion: 2,
      lease,
      pageBundle
    });
    const substitutedVerificationTime = Object.freeze({
      ...pageBundle,
      verifiedAt: "2026-08-04T00:00:02Z"
    }) as unknown as VerifiedSettlementPageBundle;

    await expect(
      unitOfWork.ingestVerifiedPage({
        expectedCursorVersion: 2,
        lease,
        pageBundle: substitutedVerificationTime
      })
    ).rejects.toMatchObject({ reason: "checkpoint_conflict" });

    expect(replayed).toEqual(committed);
    expect(committed).toMatchObject({
      providerAccount,
      stream: "settlement_ledger",
      insertedEntryCount: 2,
      replayedEntryCount: 0,
      cursorVersion: 3,
      fencingToken: 1,
      rawArtifact: artifact,
      decodedEntriesDigest: digestFinanceCanonicalValueV1(rows)
    });
    expect(committed.ref).toMatchObject({
      kind: "settlement_batch_ingestion_commit_receipt",
      version: 1,
      canonicalDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    });
    expect(committed.persistenceTransactionBoundaryRef).toMatch(/^postgres-xid:[0-9]+$/);

    const persistedRows = await pool.query<{
      provider_entry_id: string;
      amount_minor: string;
      fee_amount_minor: string | null;
      balance_after_minor: string | null;
    }>(
      `select provider_entry_id, amount_minor, fee_amount_minor, balance_after_minor
       from finance_settlement_ledger_entries order by provider_entry_id`
    );
    expect(persistedRows.rows).toEqual([
      {
        provider_entry_id: "entry-max",
        amount_minor: "9223372036854775807",
        fee_amount_minor: "-9223372036854775808",
        balance_after_minor: "9223372036854775807"
      },
      {
        provider_entry_id: "entry-min",
        amount_minor: "-9223372036854775808",
        fee_amount_minor: "-9223372036854775808",
        balance_after_minor: "9223372036854775807"
      }
    ]);
    await expectCounts(pool, { pages: 1, checkpoints: 1, receipts: 1, ledger: 2, payouts: 0 });
  });

  it("rejects A-B-A pagination even when A is an exact earlier page replay", async () => {
    const lease = await seedAndClaimCursor(pool, database, "settlement_ledger");
    const artifactFirst = await seedArtifact(pool, "cycle-page-first", sha("a"), 1_024);
    const artifactA = await seedArtifact(pool, "cycle-page-a", sha("b"), 1_024);
    const artifactB = await seedArtifact(pool, "cycle-page-b", sha("c"), 1_024);
    const firstPage = settlementBundle({
      stream: "settlement_ledger",
      providerPageCursor: null,
      nextCursor: "cursor-a",
      artifact: artifactFirst,
      rows: [ledgerEntry("cycle-entry-first", "5", sha("0"))]
    });
    const pageA = settlementBundle({
      stream: "settlement_ledger",
      providerPageCursor: "cursor-a",
      nextCursor: "cursor-b",
      artifact: artifactA,
      rows: [ledgerEntry("cycle-entry-a", "10", sha("1"))]
    });
    const pageB = settlementBundle({
      stream: "settlement_ledger",
      providerPageCursor: "cursor-b",
      nextCursor: "cursor-a",
      artifact: artifactB,
      rows: [ledgerEntry("cycle-entry-b", "20", sha("2"))]
    });
    const unitOfWork = createDrizzleSettlementBatchIngestionUnitOfWork({ database });
    await unitOfWork.ingestVerifiedPage({
      expectedCursorVersion: 2,
      lease,
      pageBundle: firstPage
    });
    await unitOfWork.ingestVerifiedPage({
      expectedCursorVersion: 3,
      lease,
      pageBundle: pageA
    });
    await expect(
      unitOfWork.ingestVerifiedPage({
        expectedCursorVersion: 4,
        lease,
        pageBundle: pageB
      })
    ).rejects.toMatchObject({ reason: "pagination_cycle_detected" });
    await expectCounts(pool, { pages: 2, checkpoints: 2, receipts: 2, ledger: 2, payouts: 0 });
  });

  it("keeps merchant payout history in its own stream and table", async () => {
    const lease = await seedAndClaimCursor(pool, database, "settlement_payouts");
    const artifact = await seedArtifact(pool, "payout-page-a", sha("c"), 2_048);
    const rows = [payout("merchant-payout-1", "9223372036854775807", sha("3"))];
    const pageBundle = settlementBundle({
      stream: "settlement_payouts",
      providerPageCursor: null,
      nextCursor: null,
      artifact,
      rows
    });
    const unitOfWork = createDrizzleSettlementBatchIngestionUnitOfWork({ database });

    await expect(
      unitOfWork.ingestVerifiedPage({ expectedCursorVersion: 2, lease, pageBundle })
    ).resolves.toMatchObject({
      stream: "settlement_payouts",
      insertedEntryCount: 1,
      replayedEntryCount: 0,
      cursorVersion: 3
    });
    const stored = await pool.query<{
      merchant_payout_id: string;
      amount_minor: string;
      provider_bank_payout_id: string;
    }>(
      `select merchant_payout_id, amount_minor, provider_bank_payout_id
       from finance_settlement_payouts`
    );
    expect(stored.rows).toEqual([
      {
        merchant_payout_id: "merchant-payout-1",
        amount_minor: "9223372036854775807",
        provider_bank_payout_id: "wire-merchant-payout-1"
      }
    ]);
    await expectCounts(pool, { pages: 1, checkpoints: 1, receipts: 1, ledger: 0, payouts: 1 });
  });

  it.each([
    "settlement_page",
    "normalized_entries",
    "settlement_checkpoint",
    "settlement_cursor",
    "ingestion_receipt"
  ] satisfies readonly SettlementBatchIngestionWriteBoundary[])(
    "rolls back page, rows, checkpoint, cursor and receipt after %s",
    async (failedBoundary) => {
      const lease = await seedAndClaimCursor(pool, database, "settlement_ledger");
      const artifact = await seedArtifact(pool, `rollback-${failedBoundary}`, sha("d"), 512);
      const pageBundle = settlementBundle({
        stream: "settlement_ledger",
        providerPageCursor: null,
        nextCursor: "cursor-next",
        artifact,
        rows: [ledgerEntry(`rollback-${failedBoundary}`, "100", sha("4"))]
      });
      const unitOfWork = createDrizzleSettlementBatchIngestionUnitOfWork({
        database,
        afterWriteBoundary(boundary) {
          if (boundary === failedBoundary) throw new Error(`injected:${boundary}`);
        }
      });

      await expect(
        unitOfWork.ingestVerifiedPage({ expectedCursorVersion: 2, lease, pageBundle })
      ).rejects.toThrow(`injected:${failedBoundary}`);
      await expectCounts(pool, { pages: 0, checkpoints: 0, receipts: 0, ledger: 0, payouts: 0 });
      const cursor = await pool.query<{ version: string; next_page_cursor: string | null }>(
        `select version, next_page_cursor from finance_settlement_cursors`
      );
      expect(cursor.rows).toEqual([{ version: "2", next_page_cursor: null }]);
      expect(
        await pool.query(`select 1 from finance_artifacts where id = $1`, [artifact.artifactId])
      ).toHaveProperty("rowCount", 1);
    }
  );

  it("rejects a cross-wired raw artifact or decoded-entry digest before any write", async () => {
    const lease = await seedAndClaimCursor(pool, database, "settlement_ledger");
    const artifact = await seedArtifact(pool, "cross-wire-page", sha("f"), 1_024);
    const valid = settlementBundle({
      stream: "settlement_ledger",
      providerPageCursor: null,
      nextCursor: null,
      artifact,
      rows: [ledgerEntry("cross-wire-entry", "100", sha("5"))]
    });
    const unitOfWork = createDrizzleSettlementBatchIngestionUnitOfWork({ database });

    for (const pageBundle of [
      { ...valid, rawArtifact: { ...artifact, sha256Digest: sha("0") } },
      { ...valid, decodedEntriesDigest: sha("0") }
    ] as unknown as VerifiedSettlementPageBundle[]) {
      await expect(
        unitOfWork.ingestVerifiedPage({ expectedCursorVersion: 2, lease, pageBundle })
      ).rejects.toBeInstanceOf(SettlementBatchIngestionPersistenceError);
    }
    await expectCounts(pool, { pages: 0, checkpoints: 0, receipts: 0, ledger: 0, payouts: 0 });
  });
});

async function seedAndClaimCursor(
  pool: Pool,
  database: ReturnType<typeof drizzle>,
  stream: "settlement_ledger" | "settlement_payouts"
): Promise<SettlementCursorLeaseReceipt & Readonly<{ state: "active" }>> {
  await pool.query(
    `insert into finance_settlement_cursors
      (provider_account_series_id, provider_account_id, provider_identity_version, stream,
       initial_backfill_start, overlap_seconds, high_water_mark, active_window_start,
       active_window_end, next_page_cursor, checkpointed_page_count, max_page_count,
       fencing_token, window_generation, version, updated_at)
     values ($1, $2, $3, $4, '2026-07-01T00:00:00Z', 300,
       '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z', '2026-07-02T00:00:00Z',
       null, 0, 10, 0, 1, 1, clock_timestamp())`,
    [
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion,
      stream
    ]
  );
  const lease = await createDrizzleSettlementCursorLeaseUnitOfWork({ database }).claimLease({
    cursorKey: createSettlementCursorKey({ providerAccount, stream }),
    expectedCursorVersion: 1,
    leaseOwnerId: `worker-${stream}`,
    leaseToken: `lease-token-${stream}`,
    leaseDurationSeconds: 600
  });
  return lease as SettlementCursorLeaseReceipt & Readonly<{ state: "active" }>;
}

async function seedArtifact(
  pool: Pool,
  artifactId: string,
  sha256Digest: `sha256:${string}`,
  byteLength: number
): Promise<RawProviderArtifactRef> {
  await pool.query(
    `insert into finance_artifacts
      (id, artifact_class, binding_kind, series_id, provider_account_id,
       provider_identity_version, sha256_digest, byte_length)
     values ($1, 'provider_settlement_page', 'provider', $2, $3, $4, $5, $6)`,
    [
      artifactId,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion,
      sha256Digest,
      String(byteLength)
    ]
  );
  return Object.freeze({ artifactId, sha256Digest, byteLength });
}

function settlementBundle(
  input:
    | Readonly<{
        stream: "settlement_ledger";
        providerPageCursor: string | null;
        nextCursor: string | null;
        artifact: RawProviderArtifactRef;
        rows: readonly LosslessSettlementEntry[];
      }>
    | Readonly<{
        stream: "settlement_payouts";
        providerPageCursor: string | null;
        nextCursor: string | null;
        artifact: RawProviderArtifactRef;
        rows: readonly LosslessSettlementPayout[];
      }>
): VerifiedSettlementPageBundle {
  const cursorKey = createSettlementCursorKey({ providerAccount, stream: input.stream });
  const checkpointIdentity = createSettlementPageCheckpointKey({
    cursorKey,
    windowGeneration: 1,
    providerPageCursor: input.providerPageCursor
  });
  const normalizedEntries = Object.freeze({
    rows: input.rows,
    nextCursor: input.nextCursor,
    returnedCount: input.rows.length,
    operationEnvelope: envelope
  });
  return Object.freeze({
    kind: "verified_settlement_page_bundle",
    providerAccount,
    checkpointIdentity,
    rawArtifact: input.artifact,
    decodedEntriesDigest: digestFinanceCanonicalValueV1(input.rows),
    pageEvidence: Object.freeze({
      kind: "verified_settlement_page_evidence",
      providerAccount,
      stream: input.stream,
      windowGeneration: 1,
      providerPageCursor: input.providerPageCursor,
      artifact: input.artifact,
      fetchedAt: "2026-08-04T00:00:00Z"
    }),
    verifiedAt: "2026-08-04T00:00:01Z",
    stream: input.stream,
    normalizedEntries
  }) as unknown as VerifiedSettlementPageBundle;
}

function ledgerEntry(
  providerEntryId: string,
  amountMinor: string,
  rawPayloadDigest: `sha256:${string}`
): LosslessSettlementEntry {
  return createLosslessSettlementEntry({
    key: { providerAccount, providerEntryId },
    amountMinor,
    currency: "RUB",
    direction: amountMinor.startsWith("-") ? "debit" : "credit",
    entryType: "provider_defined_unknown_value",
    referenceType: "payment",
    referenceId: `payment-${providerEntryId}`,
    feeAmountMinor: "-9223372036854775808",
    balanceAfterMinor: "9223372036854775807",
    occurredAt: "2026-08-03T23:59:59.123456789Z",
    organizationId: null,
    terminalId: null,
    bankTerminalId: null,
    bankCode: null,
    bankRrn: "opaque-rrn",
    bankAuthCode: "opaque-auth",
    bankInternalReference: "opaque-internal-reference",
    settlementStatus: "provider_defined_status",
    rawPayloadDigest
  });
}

function payout(
  merchantPayoutId: string,
  amountMinor: string,
  rawPayloadDigest: `sha256:${string}`
): LosslessSettlementPayout {
  return createLosslessSettlementPayout({
    key: { providerAccount, providerPayoutId: merchantPayoutId },
    amountMinor,
    currency: "RUB",
    status: "completed",
    payoutMethod: "bank_wire",
    bankCode: "opaque-bank",
    bankTerminalId: null,
    providerBankPayoutId: `wire-${merchantPayoutId}`,
    bankPayoutStatus: "completed",
    initiatedAt: "2026-08-03T10:00:00Z",
    completedAt: "2026-08-04T10:00:00Z",
    failedReason: null,
    rawPayloadDigest
  });
}

async function expectCounts(
  pool: Pool,
  expected: {
    pages: number;
    checkpoints: number;
    receipts: number;
    ledger: number;
    payouts: number;
  }
): Promise<void> {
  const result = await pool.query<{
    pages: string;
    checkpoints: string;
    receipts: string;
    ledger: string;
    payouts: string;
  }>(`select
      (select count(*) from finance_settlement_pages) as pages,
      (select count(*) from finance_settlement_page_checkpoints) as checkpoints,
      (select count(*) from finance_settlement_batch_ingestion_commit_receipts) as receipts,
      (select count(*) from finance_settlement_ledger_entries) as ledger,
      (select count(*) from finance_settlement_payouts) as payouts`);
  expect(result.rows[0]).toEqual({
    pages: String(expected.pages),
    checkpoints: String(expected.checkpoints),
    receipts: String(expected.receipts),
    ledger: String(expected.ledger),
    payouts: String(expected.payouts)
  });
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

const minimalSettlementSchemaSql = `
create extension if not exists pgcrypto;

create table finance_artifacts (
  id varchar(160) primary key,
  artifact_class text not null,
  binding_kind text not null,
  series_id varchar(160),
  provider_account_id varchar(160),
  provider_identity_version integer,
  sha256_digest varchar(71) not null,
  byte_length numeric(38,0) not null
);
create table finance_artifact_tombstones (
  artifact_id varchar(160) primary key references finance_artifacts(id)
);
create table finance_settlement_cursors (
  id uuid primary key default gen_random_uuid(),
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
create table finance_settlement_pages (
  id uuid primary key default gen_random_uuid(),
  settlement_cursor_id uuid not null references finance_settlement_cursors(id),
  provider_account_series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  stream text not null,
  window_generation numeric(38,0) not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  checkpoint_identity varchar(2000) not null,
  provider_page_cursor varchar(1000),
  next_page_cursor varchar(1000),
  raw_artifact_id varchar(160) not null references finance_artifacts(id),
  raw_artifact_digest varchar(71) not null,
  raw_artifact_byte_length numeric(38,0) not null,
  decoded_entries_digest varchar(71) not null,
  returned_count integer not null,
  operation_policy_id varchar(160) not null,
  operation_policy_version integer not null,
  operation_policy_digest varchar(71) not null,
  maximum_rows integer not null,
  maximum_decimal_digits integer not null,
  maximum_artifact_bytes numeric(38,0) not null,
  fetched_at timestamptz not null,
  verified_at timestamptz not null,
  committed_at timestamptz not null,
  unique (settlement_cursor_id, window_generation, checkpoint_identity),
  unique nulls not distinct (settlement_cursor_id, window_generation, provider_page_cursor),
  unique (id, settlement_cursor_id, window_generation, checkpoint_identity),
  unique (id, stream)
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
  first_seen_at timestamptz not null,
  unique (provider_account_series_id, provider_account_id, provider_identity_version, provider_entry_id)
);
create table finance_settlement_payouts (
  id uuid primary key default gen_random_uuid(),
  provider_account_series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  merchant_payout_id varchar(200) not null,
  first_seen_page_id uuid not null references finance_settlement_pages(id),
  amount_minor numeric(38,0) not null,
  currency varchar(500) not null,
  status varchar(500) not null,
  payout_method varchar(500),
  bank_code varchar(500),
  bank_terminal_id varchar(500),
  provider_bank_payout_id varchar(500),
  bank_payout_status varchar(500),
  initiated_at varchar(80),
  completed_at varchar(80),
  failed_reason varchar(500),
  raw_payload_digest varchar(71) not null,
  first_seen_at timestamptz not null,
  unique (provider_account_series_id, provider_account_id, provider_identity_version, merchant_payout_id)
);
create table finance_settlement_ledger_page_entries (
  settlement_page_id uuid not null references finance_settlement_pages(id),
  settlement_entry_id uuid not null references finance_settlement_ledger_entries(id),
  stream text not null,
  row_index integer not null,
  linked_at timestamptz not null,
  primary key (settlement_page_id, settlement_entry_id),
  unique (settlement_page_id, row_index)
);
create table finance_settlement_payout_page_entries (
  settlement_page_id uuid not null references finance_settlement_pages(id),
  settlement_payout_id uuid not null references finance_settlement_payouts(id),
  stream text not null,
  row_index integer not null,
  linked_at timestamptz not null,
  primary key (settlement_page_id, settlement_payout_id),
  unique (settlement_page_id, row_index)
);
create table finance_settlement_page_checkpoints (
  id uuid primary key default gen_random_uuid(),
  settlement_cursor_id uuid not null references finance_settlement_cursors(id),
  window_generation numeric(38,0) not null,
  checkpoint_identity varchar(2000) not null,
  provider_page_cursor varchar(1000),
  next_page_cursor varchar(1000),
  settlement_page_id uuid not null references finance_settlement_pages(id),
  fencing_token numeric(38,0) not null,
  cursor_version_before numeric(38,0) not null,
  cursor_version_after numeric(38,0) not null,
  committed_at timestamptz not null,
  unique (settlement_cursor_id, window_generation, checkpoint_identity),
  unique nulls not distinct (settlement_cursor_id, window_generation, provider_page_cursor),
  unique (settlement_page_id),
  unique (id, settlement_page_id, settlement_cursor_id, window_generation, checkpoint_identity)
);
create table finance_settlement_batch_ingestion_commit_receipts (
  receipt_id varchar(200) primary key default gen_random_uuid()::text,
  receipt_version integer not null default 1,
  canonical_preimage text not null default '',
  canonical_digest varchar(71) not null default '',
  settlement_page_id uuid not null unique references finance_settlement_pages(id),
  settlement_checkpoint_id uuid not null references finance_settlement_page_checkpoints(id),
  settlement_cursor_id uuid not null references finance_settlement_cursors(id),
  provider_account_series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  stream text not null,
  window_generation numeric(38,0) not null,
  checkpoint_identity varchar(2000) not null,
  provider_page_cursor varchar(1000),
  raw_artifact_id varchar(160) not null references finance_artifacts(id),
  raw_artifact_digest varchar(71) not null,
  raw_artifact_byte_length numeric(38,0) not null,
  decoded_entries_digest varchar(71) not null,
  inserted_entry_count integer not null,
  replayed_entry_count integer not null,
  cursor_version numeric(38,0) not null,
  fencing_token numeric(38,0) not null,
  persistence_transaction_boundary_ref varchar(200) not null default '',
  database_committed_at timestamptz not null default clock_timestamp(),
  unique (receipt_id, receipt_version, canonical_digest),
  unique (persistence_transaction_boundary_ref)
);
create function finance_test_issue_settlement_ingestion_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.receipt_id := coalesce(nullif(new.receipt_id, ''), gen_random_uuid()::text);
  new.receipt_version := 1;
  new.database_committed_at := clock_timestamp();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.canonical_preimage := concat_ws('|', 'settlement-v1', new.settlement_page_id,
    new.settlement_checkpoint_id, new.settlement_cursor_id, new.checkpoint_identity,
    new.raw_artifact_digest, new.decoded_entries_digest, new.cursor_version, new.fencing_token);
  new.canonical_digest := 'sha256:' || encode(
    digest(convert_to(new.canonical_preimage, 'UTF8'), 'sha256'), 'hex');
  return new;
end;
$$;
create trigger finance_test_issue_settlement_ingestion_receipt
before insert on finance_settlement_batch_ingestion_commit_receipts
for each row execute function finance_test_issue_settlement_ingestion_receipt();
`;
