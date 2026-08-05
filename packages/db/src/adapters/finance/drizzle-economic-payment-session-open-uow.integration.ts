import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessionOpenReceipts,
  financeEconomicPaymentSessions
} from "../../schema/finance/economic-payments.schema";
import {
  EconomicPaymentSessionOpenPersistenceError,
  createDrizzleEconomicPaymentSessionOpenUnitOfWork,
  type EconomicPaymentSessionOpenWriteBoundary
} from "./drizzle-economic-payment-session-open-uow";

const baseDatabaseUrl = integrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_finance_session_${randomUUID().replaceAll("-", "")}`;
if (!/^elevenhouse_finance_session_[0-9a-f]{32}$/.test(databaseName)) {
  throw new Error("Invalid isolated economic-payment-session test database name");
}
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const providerAccount = Object.freeze({
  seriesId: "arc-series-main",
  providerAccountId: "arc-account-main",
  identityVersion: 1
});

describe.sequential("economic payment session opening PostgreSQL integration", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    database = drizzle(pool);
    await pool.query(minimalSessionOpenSchemaSql);
    await pool.query(
      `insert into finance_provider_account_series
         (series_id, provider, active_identity_version)
       values ($1, 'arc_pay', 1)`,
      [providerAccount.seriesId]
    );
    await pool.query(
      `insert into finance_provider_accounts
         (series_id, provider_account_id, identity_version, provider)
       values ($1, $2, $3, 'arc_pay')`,
      [providerAccount.seriesId, providerAccount.providerAccountId, providerAccount.identityVersion]
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

  it("atomically opens a non-monetary checkout session and replays its original receipt", async () => {
    const intentId = "intent-session-replay";
    const sessionId = "session-replay";
    await seedIntent(pool, intentId, "order-session-replay");
    const unitOfWork = createDrizzleEconomicPaymentSessionOpenUnitOfWork({ database });

    const created = await unitOfWork.openEconomicPaymentSession(
      sessionOpenCommand(intentId, sessionId)
    );
    await pool.query(
      `update finance_economic_payment_intents set state = 'captured', version = 4 where id = $1`,
      [intentId]
    );
    const replayed = await unitOfWork.openEconomicPaymentSession(
      sessionOpenCommand(intentId, sessionId)
    );

    expect(replayed).toEqual(created);
    expect(created).toMatchObject({
      kind: "economic_payment_session_open_receipt",
      economicPaymentSessionVersion: 1,
      economicPaymentHead: {
        economicPaymentIntentId: intentId,
        sourceId: "order-session-replay",
        purpose: "client_order",
        providerAccount,
        amountMinor: "10000",
        currency: "RUB",
        state: "checkout_opened",
        activeSessionId: sessionId,
        capturedProviderPaymentId: null,
        version: 2
      }
    });
    expect(created.persistenceTransactionBoundaryRef).toMatch(/^postgres-xid:[0-9]+$/);
    expect(
      await database
        .select()
        .from(financeEconomicPaymentSessionOpenReceipts)
        .where(eq(financeEconomicPaymentSessionOpenReceipts.economicPaymentSessionId, sessionId))
    ).toHaveLength(1);
  });

  it.each([
    "economic_payment_session",
    "economic_payment_head",
    "economic_payment_session_open_receipt"
  ] satisfies readonly EconomicPaymentSessionOpenWriteBoundary[])(
    "rolls back every write when failure is injected after %s",
    async (failedBoundary) => {
      const intentId = `intent-session-rollback-${failedBoundary}`;
      const sessionId = `session-rollback-${failedBoundary}`;
      await seedIntent(pool, intentId, `order-session-rollback-${failedBoundary}`);
      const unitOfWork = createDrizzleEconomicPaymentSessionOpenUnitOfWork({
        database,
        afterWriteBoundary(boundary) {
          if (boundary === failedBoundary) throw new Error(`injected:${boundary}`);
        }
      });

      await expect(
        unitOfWork.openEconomicPaymentSession(sessionOpenCommand(intentId, sessionId))
      ).rejects.toThrow(`injected:${failedBoundary}`);
      expect(
        await database
          .select()
          .from(financeEconomicPaymentSessions)
          .where(eq(financeEconomicPaymentSessions.id, sessionId))
      ).toHaveLength(0);
      expect(
        await database
          .select()
          .from(financeEconomicPaymentIntents)
          .where(eq(financeEconomicPaymentIntents.id, intentId))
      ).toEqual([expect.objectContaining({ state: "created", version: "1" })]);
    }
  );

  it("rejects stale versions and a session ID cross-wired to another intent", async () => {
    const firstIntentId = "intent-session-first";
    const secondIntentId = "intent-session-second";
    const sessionId = "session-cross-wired";
    await seedIntent(pool, firstIntentId, "order-session-first");
    await seedIntent(pool, secondIntentId, "order-session-second");
    const unitOfWork = createDrizzleEconomicPaymentSessionOpenUnitOfWork({ database });

    await expect(
      unitOfWork.openEconomicPaymentSession({
        ...sessionOpenCommand(firstIntentId, sessionId),
        expectedEconomicPaymentVersion: 2
      })
    ).rejects.toMatchObject({ reason: "economic_payment_version_conflict" });
    await unitOfWork.openEconomicPaymentSession(sessionOpenCommand(firstIntentId, sessionId));
    await expect(
      unitOfWork.openEconomicPaymentSession(sessionOpenCommand(secondIntentId, sessionId))
    ).rejects.toBeInstanceOf(EconomicPaymentSessionOpenPersistenceError);
    await expect(
      unitOfWork.openEconomicPaymentSession(sessionOpenCommand(secondIntentId, sessionId))
    ).rejects.toMatchObject({ reason: "session_identity_conflict" });
  });
});

function sessionOpenCommand(economicPaymentIntentId: string, economicPaymentSessionId: string) {
  return Object.freeze({
    economicPaymentIntentId,
    economicPaymentSessionId,
    expectedEconomicPaymentVersion: 1,
    providerAccount
  });
}

async function seedIntent(pool: Pool, id: string, sourceId: string): Promise<void> {
  await pool.query(
    `insert into finance_economic_payment_intents
       (id, purpose, source_id, series_id, provider_account_id, provider_identity_version,
        amount_minor, currency, state, version)
     values ($1, 'client_order', $2, $3, $4, $5, 10000, 'RUB', 'created', 1)`,
    [
      id,
      sourceId,
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

const minimalSessionOpenSchemaSql = `
create extension if not exists pgcrypto;

create table finance_provider_account_series (
  series_id varchar(160) primary key,
  provider text not null,
  active_identity_version integer not null
);
create table finance_provider_accounts (
  series_id varchar(160) not null references finance_provider_account_series(series_id),
  provider_account_id varchar(160) not null,
  identity_version integer not null,
  provider text not null,
  primary key (series_id, provider_account_id, identity_version)
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (series_id, provider_account_id, provider_identity_version)
    references finance_provider_accounts(series_id, provider_account_id, identity_version)
);
create table finance_economic_payment_sessions (
  id varchar(160) primary key,
  economic_payment_intent_id varchar(160) not null references finance_economic_payment_intents(id),
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  state text not null,
  version numeric(38,0) not null,
  intent_version_opened numeric(38,0) not null,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  terminal_at timestamptz
);
create table finance_economic_payment_session_open_receipts (
  id uuid primary key default gen_random_uuid(),
  economic_payment_intent_id varchar(160) not null,
  economic_payment_session_id varchar(160) not null unique,
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  economic_payment_version numeric(38,0) not null,
  economic_payment_session_version numeric(38,0) not null,
  canonical_preimage text not null default '',
  canonical_digest varchar(71) not null default '',
  persistence_transaction_boundary_ref varchar(200) not null unique default '',
  committed_at timestamptz not null default now(),
  foreign key (economic_payment_session_id) references finance_economic_payment_sessions(id)
);
create function finance_test_issue_economic_session_open_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  intent finance_economic_payment_intents%rowtype;
  session finance_economic_payment_sessions%rowtype;
begin
  select * into strict intent from finance_economic_payment_intents where id = new.economic_payment_intent_id;
  select * into strict session from finance_economic_payment_sessions where id = new.economic_payment_session_id;
  new.series_id := intent.series_id;
  new.provider_account_id := intent.provider_account_id;
  new.provider_identity_version := intent.provider_identity_version;
  new.economic_payment_version := intent.version;
  new.economic_payment_session_version := session.version;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object('receiptId', new.id::text)::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;
create trigger finance_test_issue_economic_session_open_receipt
before insert on finance_economic_payment_session_open_receipts
for each row execute function finance_test_issue_economic_session_open_receipt();
`;
