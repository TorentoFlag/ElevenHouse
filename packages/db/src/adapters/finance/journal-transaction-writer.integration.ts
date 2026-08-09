import { randomUUID } from "node:crypto";
import {
  createFinanceJournalTransaction,
  createFinanceLedgerAccountRef,
  createFinanceSourceKey,
  digestFinanceCanonicalValueV1,
  type FinanceJournalLinkProof,
  type FinancePostingDecoderEnvelope
} from "@elevenhouse/domain/finance-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import {
  financeAccounts,
  financeAllocationLinkProofEntries,
  financeAllocationLinkProofs,
  financeJournalEntries,
  financeJournalTransactions,
  financePersistenceCommitReceipts,
  financeSourceIdentities
} from "../../schema/finance/ledger.schema";
import {
  financeProviderAccountSeries,
  financeProviderAccounts
} from "../../schema/finance/provider-accounts.schema";
import { financeJournalIntegritySql } from "../../schema/finance/journal-integrity.sql";
import {
  JournalTransactionWriterIntegrityError,
  writeSealedJournalTransaction
} from "./journal-transaction-writer";

const baseDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const isolatedDatabaseName = `elevenhouse_finance_journal_${randomUUID().replaceAll("-", "")}`;
if (!/^elevenhouse_finance_journal_[0-9a-f]{32}$/.test(isolatedDatabaseName)) {
  throw new Error("Invalid isolated finance journal database name");
}
const isolatedDatabaseUrl = withDatabase(baseDatabaseUrl, isolatedDatabaseName);
const providerAccountVersionId = "11111111-1111-4111-8111-111111111111";
const substitutedProviderAccountVersionId = "22222222-2222-4222-8222-222222222222";
const decoderEnvelope: FinancePostingDecoderEnvelope = Object.freeze({
  maxJournalEntries: 16,
  maxProofEdges: 16,
  maxComponentBindings: 16,
  maxAllocations: 16,
  maxDecimalDigits: 38
});

const schema = {
  financeProviderAccountSeries,
  financeProviderAccounts,
  financeAccounts,
  financeSourceIdentities,
  financeJournalTransactions,
  financeJournalEntries,
  financeAllocationLinkProofs,
  financeAllocationLinkProofEntries,
  financePersistenceCommitReceipts
};

describe("sealed journal writer PostgreSQL integration", () => {
  const adminPool = new Pool({ connectionString: baseDatabaseUrl });
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    await adminPool.query(`create database "${isolatedDatabaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    database = drizzle(pool, { schema });
    await pool.query(minimalJournalSchemaSql);
    await pool.query(
      `insert into finance_provider_account_series
         (series_id, provider, active_identity_version, head_version)
       values ('arc-series-1', 'arc_pay', 1, 1)`
    );
    await pool.query(
      `insert into finance_provider_accounts
         (id, series_id, provider_account_id, identity_version, provider,
          merchant_tenant_id, environment, terminal_scope, settlement_scope)
       values ($1, 'arc-series-1', 'arc-account-1', 1, 'arc_pay',
               'merchant-1', 'test', 'terminal-1', 'settlement-1')`,
      [providerAccountVersionId]
    );
    await pool.query(
      `insert into finance_provider_account_series
         (series_id, provider, active_identity_version, head_version)
       values ('arc-series-2', 'arc_pay', 1, 1)`
    );
    await pool.query(
      `insert into finance_provider_accounts
         (id, series_id, provider_account_id, identity_version, provider,
          merchant_tenant_id, environment, terminal_scope, settlement_scope)
       values ($1, 'arc-series-2', 'arc-account-2', 1, 'arc_pay',
               'merchant-2', 'test', 'terminal-2', 'settlement-2')`,
      [substitutedProviderAccountVersionId]
    );
    await pool.query(
      `insert into finance_accounts
         (code, account_class, normal_side, scope_kind,
          provider_account_version_id, provider_account_series_id,
          provider_account_id, provider_identity_version, currency)
       values ('arc_provider_clearing', 'asset', 'debit', 'arc_provider_account',
               $1, 'arc-series-1', 'arc-account-1', 1, 'RUB')`,
      [providerAccountVersionId]
    );
    await pool.query(
      `insert into finance_accounts
         (code, account_class, normal_side, scope_kind, currency)
       values ('platform_subscription_deferred', 'liability', 'credit', 'platform', 'RUB')`
    );
    await pool.query(financeJournalIntegritySql);
  });

  afterAll(async () => {
    if (pool) await pool.end();
    await adminPool.query(`drop database "${isolatedDatabaseName}"`);
    await adminPool.end();
  });

  it("commits source-first unsealed-to-sealed history and a DB-verifiable receipt", async () => {
    const fixture = postingFixture("invoice-1", "journal-1", "proof-1");

    const receipt = await database.transaction((transaction) =>
      writeSealedJournalTransaction(transaction, {
        ...fixture,
        resolvedSourceScope: providerScope(),
        decoderEnvelope
      })
    );

    expect(receipt).toMatchObject({
      kind: "verified_finance_journal_commit_receipt",
      journalTransactionId: fixture.transaction.id,
      journalTransactionDigest: digestFinanceCanonicalValueV1(fixture.transaction),
      journalLinkProofId: fixture.proof.proofId,
      persistenceTransactionBoundaryRef: expect.stringMatching(/^postgres-xid:[0-9]+$/)
    });
    const persisted = await pool.query<{
      sealed_at: Date;
      posted_at: Date;
      issued_at: Date;
      canonical_digest: string;
      verified_digest: string;
      journal_canonical_preimage: string;
      journal_canonical_digest: string;
      verified_journal_digest: string;
    }>(
      `select transaction.sealed_at,
              transaction.posted_at,
              receipt.issued_at,
              receipt.canonical_digest,
              'sha256:' || encode(digest(receipt.canonical_preimage, 'sha256'), 'hex')
                as verified_digest,
              transaction.canonical_preimage as journal_canonical_preimage,
              transaction.canonical_digest as journal_canonical_digest,
              'sha256:' || encode(digest(transaction.canonical_preimage, 'sha256'), 'hex')
                as verified_journal_digest
       from finance_journal_transactions transaction
       join finance_persistence_commit_receipts receipt
         on receipt.journal_transaction_id = transaction.id
       where transaction.id = $1`,
      [fixture.transaction.id]
    );
    expect(persisted.rows[0]?.sealed_at.getTime()).toBeGreaterThanOrEqual(
      persisted.rows[0]?.posted_at.getTime() ?? Number.POSITIVE_INFINITY
    );
    expect(persisted.rows[0]?.issued_at.getTime()).toBeGreaterThanOrEqual(
      persisted.rows[0]?.sealed_at.getTime() ?? Number.POSITIVE_INFINITY
    );
    expect(persisted.rows[0]?.canonical_digest).toBe(persisted.rows[0]?.verified_digest);
    expect(persisted.rows[0]?.journal_canonical_digest).toBe(
      digestFinanceCanonicalValueV1(fixture.transaction)
    );
    expect(persisted.rows[0]?.journal_canonical_digest).toBe(
      persisted.rows[0]?.verified_journal_digest
    );
  });

  it("rejects a duplicate typed natural source identity", async () => {
    const fixture = postingFixture("invoice-1", "journal-duplicate", "proof-duplicate");

    await expectPostgresCode(
      database.transaction((transaction) =>
        writeSealedJournalTransaction(transaction, {
          ...fixture,
          resolvedSourceScope: providerScope(),
          decoderEnvelope
        })
      ),
      "23505"
    );
  });

  it("keeps DB-derived and domain journal digests identical for escaped IDs and milliseconds", async () => {
    const fixture = postingFixture(
      'invoice-"quoted"\\юникод',
      'journal-"quoted"\\юникод',
      "proof-canonical-escaped",
      {
        occurredAt: "2026-08-03T23:00:00.123Z",
        postedAt: "2026-08-03T23:00:01.456Z"
      }
    );

    const receipt = await database.transaction((transaction) =>
      writeSealedJournalTransaction(transaction, {
        ...fixture,
        resolvedSourceScope: providerScope(),
        decoderEnvelope
      })
    );

    expect(receipt.journalTransactionDigest).toBe(
      digestFinanceCanonicalValueV1(fixture.transaction)
    );
  });

  it("rejects a journal instant whose precision the persistence codec cannot preserve", async () => {
    const fixture = postingFixture(
      "invoice-submillisecond-rejected",
      "journal-submillisecond-rejected",
      "proof-submillisecond-rejected",
      {
        occurredAt: "2026-08-03T23:00:00.1234Z",
        postedAt: "2026-08-03T23:00:01.1234Z"
      }
    );

    await expect(
      database.transaction((transaction) =>
        writeSealedJournalTransaction(transaction, {
          ...fixture,
          resolvedSourceScope: providerScope(),
          decoderEnvelope
        })
      )
    ).rejects.toBeInstanceOf(JournalTransactionWriterIntegrityError);

    const persisted = await pool.query(
      "select 1 from finance_source_identities where source_id = 'invoice-submillisecond-rejected'"
    );
    expect(persisted.rowCount).toBe(0);
  });

  it("rejects bank-cash posting through the generic writer before persistence", async () => {
    const bankCashPoolId = "bank-pool-rub-1";
    const transaction = createFinanceJournalTransaction({
      id: "journal-generic-bank-rejected",
      sourceKey: createFinanceSourceKey({
        kind: "bank",
        sourceId: "bank-row-generic-rejected",
        operation: "unknown_credit_recorded"
      }),
      occurredAt: "2026-08-03T23:00:00.000Z",
      postedAt: "2026-08-03T23:00:01.000Z",
      reversesTransactionId: null,
      entries: [
        {
          account: createFinanceLedgerAccountRef({
            code: "bank_cash",
            bankCashPoolId,
            currency: "RUB"
          }),
          side: "debit",
          amount: { amountMinor: 1_000, currency: "RUB" },
          links: noLinks
        },
        {
          account: createFinanceLedgerAccountRef({
            code: "bank_unmatched_credit_suspense",
            bankCashPoolId,
            currency: "RUB"
          }),
          side: "credit",
          amount: { amountMinor: 1_000, currency: "RUB" },
          links: noLinks
        }
      ]
    });

    await expect(
      database.transaction((databaseTransaction) =>
        writeSealedJournalTransaction(databaseTransaction, {
          transaction,
          proof: proofForTransaction(transaction, "proof-generic-bank-rejected"),
          resolvedSourceScope: {
            kind: "bank_cash_pool",
            bankCashPoolId
          } as never,
          decoderEnvelope
        })
      )
    ).rejects.toBeInstanceOf(JournalTransactionWriterIntegrityError);

    const persisted = await pool.query(
      "select 1 from finance_source_identities where source_id = 'bank-row-generic-rejected'"
    );
    expect(persisted.rowCount).toBe(0);
  });

  it.each(["extra_field", "accessor"] as const)(
    "rejects structurally untrusted resolved source scope: %s",
    async (counterexample) => {
      const fixture = postingFixture(
        `invoice-scope-${counterexample}`,
        `journal-scope-${counterexample}`,
        `proof-scope-${counterexample}`
      );
      const resolvedSourceScope: Record<string, unknown> = {
        ...providerScope(),
        providerAccount: { ...providerScope().providerAccount }
      };
      if (counterexample === "extra_field") resolvedSourceScope.untrusted = true;
      if (counterexample === "accessor") {
        Object.defineProperty(resolvedSourceScope.providerAccount, "providerAccountId", {
          enumerable: true,
          get: () => "arc-account-1"
        });
      }

      await expect(
        database.transaction((transaction) =>
          writeSealedJournalTransaction(transaction, {
            ...fixture,
            resolvedSourceScope: resolvedSourceScope as never,
            decoderEnvelope
          })
        )
      ).rejects.toBeInstanceOf(JournalTransactionWriterIntegrityError);
    }
  );

  it("rejects an orphan source and an unsealed insert-only journal at deferred commit", async () => {
    await expectPostgresCode(
      pool.query(
        `begin;
         insert into finance_source_identities
           (source_kind, source_id, source_operation_key, source_scope_kind,
            provider_account_version_id, provider_account_series_id,
            provider_account_id, provider_identity_version)
         values ('platform_invoice', 'orphan-invoice', 'captured', 'provider_account',
                 '${providerAccountVersionId}', 'arc-series-1', 'arc-account-1', 1);
         commit;`
      ),
      "23514"
    );
    await pool.query("rollback");

    const client = await pool.connect();
    try {
      await client.query("begin");
      const source = await client.query<{ id: string }>(
        `insert into finance_source_identities
           (source_kind, source_id, source_operation_key, source_scope_kind,
            provider_account_version_id, provider_account_series_id,
            provider_account_id, provider_identity_version)
         values ('platform_invoice', 'unsealed-invoice', 'captured', 'provider_account',
                 $1, 'arc-series-1', 'arc-account-1', 1)
         returning id`,
        [providerAccountVersionId]
      );
      await client.query(
        `insert into finance_journal_transactions
           (id, source_identity_id, occurred_at, posted_at, currency)
         values ('journal-unsealed', $1, now(), now(), 'RUB')`,
        [source.rows[0]?.id]
      );
      await expectPostgresCode(client.query("commit"), "23514");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("rejects a lone reversal and commits reversal plus replacement only as one pair", async () => {
    const pair = correctionPairFixture();

    await expectPostgresCode(
      database.transaction((transaction) =>
        writeSealedJournalTransaction(transaction, {
          ...pair.reversal,
          resolvedSourceScope: providerScope(),
          decoderEnvelope
        })
      ),
      "23514"
    );

    await database.transaction(async (transaction) => {
      await writeSealedJournalTransaction(transaction, {
        ...pair.reversal,
        resolvedSourceScope: providerScope(),
        decoderEnvelope
      });
      await writeSealedJournalTransaction(transaction, {
        ...pair.replacement,
        resolvedSourceScope: providerScope(),
        decoderEnvelope
      });
    });

    const paired = await pool.query<{ source_operation_key: string }>(
      `select source.source_operation_key
       from finance_source_identities source
       join finance_journal_transactions transaction
         on transaction.source_identity_id = source.id
       where source.source_kind = 'correction' and source.source_id = 'journal-1'
       order by source.source_operation_key`
    );
    expect(paired.rows.map((row) => row.source_operation_key)).toEqual(["replacement", "reversal"]);
  });

  it.each([
    ["zero", "0", "RUB"],
    ["negative", "-1", "RUB"],
    ["cross-currency", "1000", "USD"]
  ])("rejects a %s journal entry before it can be sealed", async (_label, amount, currency) => {
    await expectPostgresCode(
      insertInvalidEntry(pool, `invalid-${_label}`, amount, currency),
      "23514"
    );
  });

  it("rejects journal-entry occurrence time drift from its parent transaction", async () => {
    await expectPostgresCode(
      insertInvalidEntry(pool, "invalid-entry-occurred-at", "1000", "RUB", "2026-08-03T23:00:02Z"),
      "23503"
    );
  });

  it("rejects unbalanced history at deferred commit", async () => {
    await expectPostgresCode(
      insertRawJournalGraph(pool, {
        suffix: "unbalanced",
        creditAmountMinor: "900",
        proofCreditAmountMinor: "900",
        proofSourceId: "raw-unbalanced"
      }),
      "23514"
    );
  });

  it("rejects a journal account cross-wired to another provider identity", async () => {
    await expectPostgresCode(
      insertRawJournalGraph(pool, {
        suffix: "provider-account-cross-wire",
        creditAmountMinor: "1000",
        proofCreditAmountMinor: "1000",
        proofSourceId: "raw-provider-account-cross-wire",
        substitutedProviderAccount: {
          versionId: substitutedProviderAccountVersionId,
          seriesId: "arc-series-2",
          providerAccountId: "arc-account-2",
          identityVersion: 1
        }
      }),
      "23514"
    );
  });

  it.each([
    ["proof amount drift", "999", "raw-proof-amount-drift"],
    ["proof/source cross-wire", "1000", "different-source"]
  ])("rejects %s before issuing a receipt", async (_label, proofCredit, proofSourceId) => {
    await expectPostgresCode(
      insertRawJournalGraph(pool, {
        suffix: _label.replaceAll(" ", "-"),
        creditAmountMinor: "1000",
        proofCreditAmountMinor: proofCredit,
        proofSourceId
      }),
      "23514"
    );
  });

  it("overrides caller-supplied seal and receipt timestamps with database time", async () => {
    const beforeWrite = Date.now();
    const persisted = await insertRawJournalGraph(pool, {
      suffix: "database-issued-time",
      creditAmountMinor: "1000",
      proofCreditAmountMinor: "1000",
      proofSourceId: "raw-database-issued-time",
      requestedSealAt: "2099-01-01T00:00:00.000Z",
      requestedReceiptIssuedAt: "2099-01-01T00:00:01.000Z"
    });
    const afterWrite = Date.now();

    expect(persisted.sealedAt.getTime()).toBeGreaterThanOrEqual(beforeWrite - 1_000);
    expect(persisted.sealedAt.getTime()).toBeLessThanOrEqual(afterWrite + 1_000);
    expect(persisted.receiptIssuedAt.getTime()).toBeGreaterThanOrEqual(
      persisted.sealedAt.getTime()
    );
    expect(persisted.receiptIssuedAt.getTime()).toBeLessThanOrEqual(afterWrite + 1_000);
  });

  it("rejects post-seal update, delete and truncate", async () => {
    await expectPostgresCode(
      pool.query(
        `update finance_journal_transactions
         set total_debit_minor = total_debit_minor
         where id = 'journal-1'`
      ),
      "55000"
    );
    await expectPostgresCode(
      pool.query("delete from finance_journal_entries where journal_transaction_id = 'journal-1'"),
      "55000"
    );
    await expectPostgresCode(pool.query("truncate finance_journal_entries cascade"), "55000");
  });
});

function postingFixture(
  sourceId: string,
  transactionId: string,
  proofId: string,
  times: {
    occurredAt: string;
    postedAt: string;
  } = {
    occurredAt: "2026-08-03T23:00:00.000Z",
    postedAt: "2026-08-03T23:00:01.000Z"
  }
) {
  const sourceKey = createFinanceSourceKey({
    kind: "platform_invoice",
    sourceId,
    operation: "captured"
  });
  const provider = createFinanceLedgerAccountRef({
    code: "arc_provider_clearing",
    arcProviderAccountId: "arc-account-1",
    currency: "RUB"
  });
  const deferred = createFinanceLedgerAccountRef({
    code: "platform_subscription_deferred",
    currency: "RUB"
  });
  const transaction = createFinanceJournalTransaction({
    id: transactionId,
    sourceKey,
    occurredAt: times.occurredAt,
    postedAt: times.postedAt,
    reversesTransactionId: null,
    entries: [
      {
        account: provider,
        side: "debit",
        amount: { amountMinor: 1_000, currency: "RUB" },
        links: noLinks
      },
      {
        account: deferred,
        side: "credit",
        amount: { amountMinor: 1_000, currency: "RUB" },
        links: noLinks
      }
    ]
  });
  return { transaction, proof: proofForTransaction(transaction, proofId) };
}

function proofForTransaction(
  transaction: ReturnType<typeof createFinanceJournalTransaction>,
  proofId: string
): FinanceJournalLinkProof {
  const proofCore = Object.freeze({
    kind: "finance_allocation_link_proof" as const,
    proofId,
    version: 1 as const,
    allocationAuthorityRef: Object.freeze({
      kind: "platform_tariff_invoice_capture_authority",
      authorityId: `authority-${transaction.id}`,
      version: 1,
      canonicalDigest: digestFinanceCanonicalValueV1({ authority: transaction.id })
    }),
    sourceEvidenceRef: Object.freeze({
      kind: "canonical_platform_invoice_capture",
      evidenceId: `evidence-${transaction.id}`,
      canonicalDigest: digestFinanceCanonicalValueV1({ evidence: transaction.id })
    }),
    journalTransactionId: transaction.id,
    journalSourceKey: transaction.sourceKey,
    operationId: `operation-${transaction.id}`,
    operationSnapshotRef: null,
    edges: Object.freeze(
      transaction.entries.map((entry, entryIndex) =>
        Object.freeze({
          entryIndex,
          account: entry.account,
          side: entry.side,
          amount: entry.amount,
          links: entry.links,
          semanticEdgeId: null,
          lotAllocationId: null
        })
      )
    )
  });
  return Object.freeze({
    ...proofCore,
    proofDigest: digestFinanceCanonicalValueV1(proofCore)
  });
}

function correctionPairFixture() {
  const original = postingFixture("invoice-1", "journal-1", "proof-original").transaction;
  const reversal = createFinanceJournalTransaction({
    id: "journal-reversal",
    sourceKey: createFinanceSourceKey({
      kind: "correction",
      sourceId: original.id,
      operation: "reversal"
    }),
    occurredAt: "2026-08-03T23:10:00.000Z",
    postedAt: "2026-08-03T23:10:01.000Z",
    reversesTransactionId: original.id,
    entries: original.entries.map((entry) => ({
      ...entry,
      side: entry.side === "debit" ? ("credit" as const) : ("debit" as const)
    }))
  });
  const replacement = createFinanceJournalTransaction({
    id: "journal-replacement",
    sourceKey: createFinanceSourceKey({
      kind: "correction",
      sourceId: original.id,
      operation: "replacement"
    }),
    occurredAt: "2026-08-03T23:10:00.000Z",
    postedAt: "2026-08-03T23:10:02.000Z",
    reversesTransactionId: null,
    entries: original.entries
  });
  return {
    reversal: { transaction: reversal, proof: proofForTransaction(reversal, "proof-reversal") },
    replacement: {
      transaction: replacement,
      proof: proofForTransaction(replacement, "proof-replacement")
    }
  };
}

function providerScope() {
  return {
    kind: "provider_account" as const,
    providerAccount: {
      versionId: providerAccountVersionId,
      seriesId: "arc-series-1",
      providerAccountId: "arc-account-1",
      identityVersion: 1
    }
  };
}

const noLinks = Object.freeze({
  originalSaleId: null,
  componentId: null,
  payableLotId: null,
  payoutAllocationId: null
});

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "test sealed finance journal");
}

function withDatabase(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function expectPostgresCode(promise: Promise<unknown>, expectedCode: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    let current: unknown = error;
    const seen = new Set<object>();
    while (typeof current === "object" && current !== null && !seen.has(current)) {
      seen.add(current);
      if ("code" in current && current.code === expectedCode) return;
      current = "cause" in current ? current.cause : null;
    }
    throw error;
  }
  throw new Error(`Expected PostgreSQL error ${expectedCode}`);
}

async function insertInvalidEntry(
  pool: Pool,
  suffix: string,
  amountMinor: string,
  currency: string,
  entryOccurredAt = "2026-08-03T23:00:00Z"
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const source = await client.query<{ id: string }>(
      `insert into finance_source_identities
         (source_kind, source_id, source_operation_key, source_scope_kind,
          provider_account_version_id, provider_account_series_id,
          provider_account_id, provider_identity_version)
       values ('platform_invoice', $1, 'captured', 'provider_account',
               $2, 'arc-series-1', 'arc-account-1', 1)
       returning id`,
      [suffix, providerAccountVersionId]
    );
    await client.query(
      `insert into finance_journal_transactions
         (id, source_identity_id, occurred_at, posted_at, currency)
       values ($1, $2, '2026-08-03T23:00:00Z', '2026-08-03T23:00:01Z', 'RUB')`,
      [`journal-${suffix}`, source.rows[0]?.id]
    );
    const account = await client.query<{ id: string }>(
      "select id from finance_accounts where code = 'arc_provider_clearing' limit 1"
    );
    await client.query(
      `insert into finance_journal_entries
         (journal_transaction_id, occurred_at, entry_index, account_id, side,
          amount_minor, currency)
       values ($1, $2, 0, $3, 'debit', $4, $5)`,
      [`journal-${suffix}`, entryOccurredAt, account.rows[0]?.id, amountMinor, currency]
    );
    await client.query("commit");
  } finally {
    await client.query("rollback");
    client.release();
  }
}

async function insertRawJournalGraph(
  pool: Pool,
  input: {
    suffix: string;
    creditAmountMinor: string;
    proofCreditAmountMinor: string;
    proofSourceId: string;
    requestedSealAt?: string;
    requestedReceiptIssuedAt?: string;
    substitutedProviderAccount?: {
      versionId: string;
      seriesId: string;
      providerAccountId: string;
      identityVersion: number;
    };
  }
): Promise<{ sealedAt: Date; receiptIssuedAt: Date }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const sourceId = `raw-${input.suffix}`;
    const journalId = `journal-${input.suffix}`;
    const source = await client.query<{ id: string }>(
      `insert into finance_source_identities
         (source_kind, source_id, source_operation_key, source_scope_kind,
          provider_account_version_id, provider_account_series_id,
          provider_account_id, provider_identity_version)
       values ('platform_invoice', $1, 'captured', 'provider_account',
               $2, 'arc-series-1', 'arc-account-1', 1)
       returning id`,
      [sourceId, providerAccountVersionId]
    );
    await client.query(
      `insert into finance_journal_transactions
         (id, source_identity_id, occurred_at, posted_at, currency)
       values ($1, $2, '2026-08-03T23:00:00Z', '2026-08-03T23:00:01Z', 'RUB')`,
      [journalId, source.rows[0]?.id]
    );
    const accounts = await client.query<{ id: string; code: string }>(
      `select id, code from finance_accounts
       where code in ('arc_provider_clearing', 'platform_subscription_deferred')`
    );
    const accountId = (code: string) =>
      accounts.rows.find((row) => row.code === code)?.id ?? raise(`Missing ${code}`);
    let debitAccountId = accountId("arc_provider_clearing");
    if (input.substitutedProviderAccount) {
      const substituted = await client.query<{ id: string }>(
        `insert into finance_accounts
           (code, account_class, normal_side, scope_kind,
            provider_account_version_id, provider_account_series_id,
            provider_account_id, provider_identity_version, currency)
         values ('arc_provider_clearing', 'asset', 'debit', 'arc_provider_account',
                 $1, $2, $3, $4, 'RUB')
         returning id`,
        [
          input.substitutedProviderAccount.versionId,
          input.substitutedProviderAccount.seriesId,
          input.substitutedProviderAccount.providerAccountId,
          input.substitutedProviderAccount.identityVersion
        ]
      );
      debitAccountId =
        substituted.rows[0]?.id ?? raise("Missing substituted provider finance account");
    }
    const debit = await client.query<{ id: string }>(
      `insert into finance_journal_entries
         (journal_transaction_id, occurred_at, entry_index, account_id, side,
          amount_minor, currency)
       values ($1, '2026-08-03T23:00:00Z', 0, $2, 'debit', 1000, 'RUB') returning id`,
      [journalId, debitAccountId]
    );
    const credit = await client.query<{ id: string }>(
      `insert into finance_journal_entries
         (journal_transaction_id, occurred_at, entry_index, account_id, side,
          amount_minor, currency)
       values ($1, '2026-08-03T23:00:00Z', 1, $2, 'credit', $3, 'RUB') returning id`,
      [journalId, accountId("platform_subscription_deferred"), input.creditAmountMinor]
    );
    const proof = await client.query<{ id: string }>(
      `insert into finance_allocation_link_proofs
         (proof_id, version, allocation_authority_kind, allocation_authority_id,
          allocation_authority_version, allocation_authority_digest,
          source_evidence_kind, source_evidence_id, source_evidence_digest,
          journal_transaction_id, journal_source_kind, journal_source_id,
          journal_source_operation_key, operation_id, proof_digest)
       values ($1, 1, 'raw_authority', $2, 1, $3,
               'raw_evidence', $4, $5, $6, 'platform_invoice', $7,
               'captured', $8, $9)
       returning id`,
      [
        `proof-${input.suffix}`,
        `authority-${input.suffix}`,
        sha("1"),
        `evidence-${input.suffix}`,
        sha("2"),
        journalId,
        input.proofSourceId,
        `operation-${input.suffix}`,
        sha("3")
      ]
    );
    await client.query(
      `insert into finance_allocation_link_proof_entries
         (proof_record_id, journal_entry_id, entry_index, account_id, side, amount_minor, currency)
       values ($1, $2, 0, $3, 'debit', 1000, 'RUB'),
              ($1, $4, 1, $5, 'credit', $6, 'RUB')`,
      [
        proof.rows[0]?.id,
        debit.rows[0]?.id,
        debitAccountId,
        credit.rows[0]?.id,
        accountId("platform_subscription_deferred"),
        input.proofCreditAmountMinor
      ]
    );
    await client.query(
      `update finance_journal_transactions
       set entry_count = 2, total_debit_minor = 1000, total_credit_minor = 1000,
           sealed_at = $2::timestamptz
       where id = $1`,
      [journalId, input.requestedSealAt ?? new Date().toISOString()]
    );
    await client.query(
      `with receipt_values as (
         select $1::varchar(200) as receipt_id,
                $2::uuid as source_identity_id,
                $3::varchar(200) as journal_transaction_id,
                $4::uuid as proof_record_id,
                $5::text as proof_digest,
                $6::varchar(200) as boundary
       ), preimage as (
         select *, finance_journal_receipt_preimage(
           receipt_id, source_identity_id, journal_transaction_id,
           proof_record_id, proof_digest, boundary
         ) as value
         from receipt_values
       )
       insert into finance_persistence_commit_receipts
         (receipt_id, receipt_kind, source_identity_id, journal_transaction_id,
          proof_record_id, canonical_preimage, canonical_digest,
          persistence_transaction_boundary_ref, issued_at)
       select receipt_id, 'sealed_journal_transaction', source_identity_id,
              journal_transaction_id, proof_record_id, value,
              'sha256:' || encode(digest(value, 'sha256'), 'hex'), boundary,
              $7::timestamptz
       from preimage`,
      [
        `receipt-${input.suffix}`,
        source.rows[0]?.id,
        journalId,
        proof.rows[0]?.id,
        sha("3"),
        `boundary-${input.suffix}`,
        input.requestedReceiptIssuedAt ?? new Date().toISOString()
      ]
    );
    await client.query("commit");
    const persisted = await client.query<{ sealed_at: Date; issued_at: Date }>(
      `select transaction.sealed_at, receipt.issued_at
       from finance_journal_transactions transaction
       join finance_persistence_commit_receipts receipt
         on receipt.journal_transaction_id = transaction.id
       where transaction.id = $1`,
      [journalId]
    );
    const row = persisted.rows[0];
    if (!row) throw new Error("Persisted journal timestamp row is missing");
    return { sealedAt: row.sealed_at, receiptIssuedAt: row.issued_at };
  } finally {
    await client.query("rollback");
    client.release();
  }
}

function sha(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function raise(message: string): never {
  throw new Error(message);
}

const minimalJournalSchemaSql = `
create extension if not exists pgcrypto;
create table users (id uuid primary key);
create table finance_provider_account_series (
  id uuid primary key default gen_random_uuid(),
  series_id varchar(160) not null,
  provider text not null,
  active_identity_version integer not null,
  head_version numeric(38, 0) not null,
  created_at timestamptz not null default now(),
  unique (series_id, provider)
);
create table finance_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null unique,
  identity_version integer not null,
  provider text not null,
  merchant_tenant_id varchar(160) not null,
  environment text not null,
  terminal_scope varchar(160) not null,
  settlement_scope varchar(160) not null,
  predecessor_provider_account_id varchar(160),
  predecessor_identity_version integer,
  created_at timestamptz not null default now(),
  unique (id, series_id, provider_account_id, identity_version),
  unique (series_id, provider_account_id, identity_version),
  foreign key (series_id, provider) references finance_provider_account_series(series_id, provider)
);
create table finance_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  account_class text not null,
  normal_side text not null,
  scope_kind text not null,
  provider_account_version_id uuid,
  provider_account_series_id varchar(160),
  provider_account_id varchar(160),
  provider_identity_version integer,
  bank_cash_pool_id varchar(160),
  astrologer_user_id uuid references users(id),
  refund_id varchar(160),
  payout_request_id varchar(160),
  currency text not null check (currency = 'RUB'),
  created_at timestamptz not null default now(),
  unique (id, currency),
  foreign key (provider_account_version_id, provider_account_series_id,
               provider_account_id, provider_identity_version)
    references finance_provider_accounts(id, series_id, provider_account_id, identity_version)
);
create unique index finance_accounts_provider_unique
  on finance_accounts(code, provider_account_version_id, currency)
  where scope_kind = 'arc_provider_account';
create unique index finance_accounts_provider_bank_unique
  on finance_accounts(code, provider_account_version_id, bank_cash_pool_id, currency)
  where scope_kind = 'arc_provider_account_and_bank_cash_pool';
create unique index finance_accounts_bank_unique
  on finance_accounts(code, bank_cash_pool_id, currency)
  where scope_kind = 'bank_cash_pool';
create unique index finance_accounts_astrologer_unique
  on finance_accounts(code, astrologer_user_id, currency)
  where scope_kind = 'astrologer';
create unique index finance_accounts_refund_payout_unique
  on finance_accounts(code, refund_id, payout_request_id, currency)
  where scope_kind = 'refund_and_payout';
create unique index finance_accounts_platform_unique
  on finance_accounts(code, currency)
  where scope_kind = 'platform';
create table finance_source_identities (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null,
  source_id varchar(200) not null,
  source_operation_key text not null,
  source_scope_kind text not null,
  provider_account_version_id uuid,
  provider_account_series_id varchar(160),
  provider_account_id varchar(160),
  provider_identity_version integer,
  bank_cash_pool_id varchar(160),
  astrologer_user_id uuid references users(id),
  refund_id varchar(160),
  payout_request_id varchar(160),
  created_at timestamptz not null default now(),
  unique (source_kind, source_id, source_operation_key),
  foreign key (provider_account_version_id, provider_account_series_id,
               provider_account_id, provider_identity_version)
    references finance_provider_accounts(id, series_id, provider_account_id, identity_version)
);
create table finance_journal_transactions (
  id varchar(200) primary key,
  source_identity_id uuid not null unique references finance_source_identities(id),
  occurred_at timestamptz not null,
  posted_at timestamptz not null,
  reverses_journal_transaction_id varchar(200) references finance_journal_transactions(id),
  currency text not null check (currency = 'RUB'),
  entry_count integer not null default 0,
  total_debit_minor numeric(38, 0),
  total_credit_minor numeric(38, 0),
  canonical_preimage text,
  canonical_digest varchar(71),
  sealed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, currency),
  unique (id, currency, occurred_at),
  unique (id, canonical_digest),
  check ((sealed_at is null and entry_count = 0 and total_debit_minor is null
          and total_credit_minor is null and canonical_preimage is null
          and canonical_digest is null)
      or (sealed_at is not null and sealed_at >= posted_at and entry_count >= 2
          and total_debit_minor > 0 and total_credit_minor > 0
          and total_debit_minor = total_credit_minor and canonical_preimage is not null
          and canonical_digest ~ '^sha256:[0-9a-f]{64}$'))
);
create unique index finance_journal_transactions_reversal_unique
  on finance_journal_transactions(reverses_journal_transaction_id)
  where reverses_journal_transaction_id is not null;
-- The current journal commit trigger checks for a v2 wallet mutation before
-- applying its legacy-proof branch. Keep this isolated fixture shape-compatible
-- with that trigger without modelling the unrelated wallet graph.
create table finance_online_wallet_mutations (
  mutation_id varchar(200) primary key,
  journal_transaction_id varchar(200) not null unique references finance_journal_transactions(id)
);
create table finance_online_wallet_chargeback_cases (
  id uuid primary key default gen_random_uuid(),
  journal_transaction_id varchar(200) not null unique references finance_journal_transactions(id),
  status text not null
);
create table finance_online_wallet_chargeback_resolutions (
  id uuid primary key default gen_random_uuid(),
  journal_transaction_id varchar(200) not null unique references finance_journal_transactions(id)
);
create table finance_online_sale_capture_journal_proofs (
  proof_id varchar(200) primary key,
  journal_transaction_id varchar(200) not null unique references finance_journal_transactions(id)
);
create table finance_journal_entries (
  id uuid primary key default gen_random_uuid(),
  journal_transaction_id varchar(200) not null,
  occurred_at timestamptz not null,
  entry_index integer not null,
  account_id uuid not null,
  side text not null check (side in ('debit', 'credit')),
  amount_minor numeric(38, 0) not null check (amount_minor > 0),
  currency text not null check (currency = 'RUB'),
  original_sale_id varchar(200), component_id varchar(200), payable_lot_id varchar(200),
  payout_allocation_id varchar(200),
  created_at timestamptz not null default now(),
  unique (journal_transaction_id, entry_index),
  foreign key (journal_transaction_id, currency, occurred_at)
    references finance_journal_transactions(id, currency, occurred_at),
  foreign key (account_id, currency) references finance_accounts(id, currency)
);
create table finance_allocation_link_proofs (
  id uuid primary key default gen_random_uuid(),
  proof_id varchar(200) not null unique,
  version integer not null,
  allocation_authority_kind varchar(200) not null,
  allocation_authority_id varchar(200) not null,
  allocation_authority_version integer not null,
  allocation_authority_digest text not null,
  source_evidence_kind varchar(200) not null,
  source_evidence_id varchar(200) not null,
  source_evidence_digest text not null,
  journal_transaction_id varchar(200) not null unique references finance_journal_transactions(id),
  journal_source_kind varchar(200) not null,
  journal_source_id varchar(200) not null,
  journal_source_operation_key varchar(200) not null,
  operation_id varchar(200) not null,
  operation_snapshot_id varchar(200), operation_snapshot_operation_id varchar(200),
  operation_snapshot_previous_wallet_revision numeric(38, 0),
  operation_snapshot_next_wallet_revision numeric(38, 0),
  operation_snapshot_previous_lot_state_digest text,
  operation_snapshot_next_lot_state_digest text,
  operation_snapshot_history_record_digest text,
  operation_snapshot_digest text,
  proof_digest text not null,
  created_at timestamptz not null default now()
);
create table finance_allocation_link_proof_entries (
  id uuid primary key default gen_random_uuid(),
  proof_record_id uuid not null references finance_allocation_link_proofs(id),
  journal_entry_id uuid not null unique references finance_journal_entries(id),
  entry_index integer not null,
  account_id uuid not null,
  side text not null check (side in ('debit', 'credit')),
  amount_minor numeric(38, 0) not null check (amount_minor > 0),
  currency text not null check (currency = 'RUB'),
  original_sale_id varchar(200), component_id varchar(200), payable_lot_id varchar(200),
  payout_allocation_id varchar(200), semantic_edge_id varchar(200), lot_allocation_id varchar(200),
  created_at timestamptz not null default now(),
  unique (proof_record_id, entry_index)
);
create table finance_persistence_commit_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_id varchar(200) not null unique,
  receipt_kind text not null,
  source_identity_id uuid not null unique references finance_source_identities(id),
  journal_transaction_id varchar(200) not null unique references finance_journal_transactions(id),
  proof_record_id uuid not null unique references finance_allocation_link_proofs(id),
  canonical_preimage text not null,
  canonical_digest text not null,
  persistence_transaction_boundary_ref varchar(200) not null,
  issued_at timestamptz not null default statement_timestamp()
);
`;
