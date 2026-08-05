import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import {
  financeEconomicPaymentIntentCreationReceipts,
  financeEconomicPaymentIntents,
  financePlatformInvoicePaymentBindings,
  financeEconomicPaymentSourceHeads
} from "../../schema/finance/economic-payments.schema";
import {
  EconomicPaymentIntentCreationPersistenceError,
  createDrizzleEconomicPaymentIntentCreationUnitOfWork,
  type EconomicPaymentIntentCreationWriteBoundary
} from "./drizzle-economic-payment-intent-creation-uow";

const baseDatabaseUrl = integrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_finance_intent_${randomUUID().replaceAll("-", "")}`;
if (!/^elevenhouse_finance_intent_[0-9a-f]{32}$/.test(databaseName)) {
  throw new Error("Invalid isolated economic-payment test database name");
}
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const providerAccount = Object.freeze({
  seriesId: "arc-series-main",
  providerAccountId: "arc-account-main",
  identityVersion: 1
});

describe.sequential("economic payment intent creation PostgreSQL integration", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    database = drizzle(pool);
    await pool.query(minimalEconomicIntentSchemaSql);
    await pool.query(
      `insert into finance_provider_account_series
         (series_id, provider, active_identity_version, head_version)
       values ($1, 'arc_pay', 1, 1)`,
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

  it("commits one DB-issued receipt and replays only an exactly equal immutable intent", async () => {
    const unitOfWork = createDrizzleEconomicPaymentIntentCreationUnitOfWork({
      database
    });
    const command = intentCommand({
      economicPaymentIntentId: "intent-exact-replay",
      sourceId: "order-exact-replay"
    });

    const created = await unitOfWork.createEconomicPaymentIntent(command);
    const replayed = await unitOfWork.createEconomicPaymentIntent(command);

    expect(replayed).toEqual(created);
    expect(created).toMatchObject({
      kind: "economic_payment_intent_creation_receipt",
      sourceUniquenessVersion: 1,
      economicPaymentHead: {
        economicPaymentIntentId: command.economicPaymentIntentId,
        sourceId: command.sourceId,
        purpose: command.purpose,
        providerAccount,
        amountMinor: command.amountMinor,
        currency: "RUB",
        state: "created",
        activeSessionId: null,
        capturedProviderPaymentId: null,
        version: 1
      }
    });
    expect(created.persistenceTransactionBoundaryRef).toMatch(/^postgres-xid:[0-9]+$/);
    expect(new Date(created.committedAt).toISOString()).toBe(created.committedAt);

    await expect(
      unitOfWork.createEconomicPaymentIntent({
        ...command,
        economicPaymentIntentId: "intent-cross-wired-replay"
      })
    ).rejects.toMatchObject({ reason: "source_identity_conflict" });

    expect(
      await database
        .select()
        .from(financeEconomicPaymentIntents)
        .where(eq(financeEconomicPaymentIntents.sourceId, command.sourceId))
    ).toHaveLength(1);
    expect(
      await database
        .select()
        .from(financeEconomicPaymentIntentCreationReceipts)
        .where(
          eq(
            financeEconomicPaymentIntentCreationReceipts.economicPaymentIntentId,
            command.economicPaymentIntentId
          )
        )
    ).toHaveLength(1);
  });

  it("binds a platform-invoice intent to the immutable tariff invoice in the same transaction", async () => {
    const invoiceId = "platform-tariff-invoice:11111111-1111-4111-8111-111111111111";
    await pool.query(
      `insert into platform_tariff_invoices (id, amount_minor, currency, state)
       values ($1, 2500, 'RUB', 'open')`,
      [invoiceId]
    );
    const unitOfWork = createDrizzleEconomicPaymentIntentCreationUnitOfWork({ database });
    const command = {
      economicPaymentIntentId: "intent-platform-invoice-binding",
      sourceId: invoiceId,
      purpose: "platform_invoice" as const,
      providerAccount,
      amountMinor: "2500",
      currency: "RUB" as const,
      expectedSourceUniquenessVersion: 0
    };

    await expect(unitOfWork.createEconomicPaymentIntent(command)).resolves.toMatchObject({
      economicPaymentHead: { purpose: "platform_invoice", sourceId: invoiceId }
    });
    expect(
      await database
        .select()
        .from(financePlatformInvoicePaymentBindings)
        .where(eq(financePlatformInvoicePaymentBindings.invoiceId, invoiceId))
    ).toEqual([
      expect.objectContaining({
        invoiceId,
        economicPaymentIntentId: command.economicPaymentIntentId
      })
    ]);
  });

  it("rolls back both platform invoice binding and intent when the binding boundary fails", async () => {
    const invoiceId = "platform-tariff-invoice:22222222-2222-4222-8222-222222222222";
    const intentId = "intent-platform-invoice-binding-rollback";
    await pool.query(
      `insert into platform_tariff_invoices (id, amount_minor, currency, state)
       values ($1, 2500, 'RUB', 'open')`,
      [invoiceId]
    );
    const unitOfWork = createDrizzleEconomicPaymentIntentCreationUnitOfWork({
      database,
      afterWriteBoundary(boundary) {
        if (boundary === "platform_invoice_payment_binding") throw new Error("injected:binding");
      }
    });

    await expect(
      unitOfWork.createEconomicPaymentIntent({
        economicPaymentIntentId: intentId,
        sourceId: invoiceId,
        purpose: "platform_invoice",
        providerAccount,
        amountMinor: "2500",
        currency: "RUB",
        expectedSourceUniquenessVersion: 0
      })
    ).rejects.toThrow("injected:binding");
    expect(
      await database
        .select()
        .from(financePlatformInvoicePaymentBindings)
        .where(eq(financePlatformInvoicePaymentBindings.invoiceId, invoiceId))
    ).toHaveLength(0);
    expect(
      await database
        .select()
        .from(financeEconomicPaymentIntents)
        .where(eq(financeEconomicPaymentIntents.id, intentId))
    ).toHaveLength(0);
  });

  it.each([
    "economic_payment_intent",
    "economic_payment_source_head",
    "economic_payment_creation_receipt"
  ] satisfies readonly EconomicPaymentIntentCreationWriteBoundary[])(
    "rolls back every row when failure is injected after %s",
    async (failedBoundary) => {
      const sourceId = `order-rollback-${failedBoundary}`;
      const unitOfWork = createDrizzleEconomicPaymentIntentCreationUnitOfWork({
        database,
        afterWriteBoundary(boundary) {
          if (boundary === failedBoundary) throw new Error(`injected:${boundary}`);
        }
      });

      await expect(
        unitOfWork.createEconomicPaymentIntent(
          intentCommand({
            economicPaymentIntentId: `intent-rollback-${failedBoundary}`,
            sourceId
          })
        )
      ).rejects.toThrow(`injected:${failedBoundary}`);

      expect(
        await database
          .select()
          .from(financeEconomicPaymentSourceHeads)
          .where(eq(financeEconomicPaymentSourceHeads.sourceId, sourceId))
      ).toHaveLength(0);
      expect(
        await database
          .select()
          .from(financeEconomicPaymentIntents)
          .where(eq(financeEconomicPaymentIntents.sourceId, sourceId))
      ).toHaveLength(0);
    }
  );

  it("serializes two sessions onto one physical intent and one receipt", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const command = intentCommand({
      economicPaymentIntentId: "intent-concurrent-replay",
      sourceId: "order-concurrent-replay"
    });
    let held = false;
    const first = createDrizzleEconomicPaymentIntentCreationUnitOfWork({
      database,
      async afterWriteBoundary(boundary) {
        if (boundary !== "economic_payment_intent" || held) return;
        held = true;
        entered.resolve();
        await release.promise;
      }
    });
    const second = createDrizzleEconomicPaymentIntentCreationUnitOfWork({
      database
    });

    const firstAttempt = first.createEconomicPaymentIntent(command);
    await entered.promise;
    const secondAttempt = second.createEconomicPaymentIntent(command);
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    release.resolve();
    const [firstReceipt, secondReceipt] = await Promise.all([firstAttempt, secondAttempt]);

    expect(secondReceipt).toEqual(firstReceipt);
    expect(
      await database
        .select()
        .from(financeEconomicPaymentIntents)
        .where(eq(financeEconomicPaymentIntents.sourceId, command.sourceId))
    ).toHaveLength(1);
    expect(
      await database
        .select()
        .from(financeEconomicPaymentIntentCreationReceipts)
        .where(
          eq(
            financeEconomicPaymentIntentCreationReceipts.economicPaymentIntentId,
            command.economicPaymentIntentId
          )
        )
    ).toHaveLength(1);
  });

  it("maps a racing non-equal source owner to a typed conflict", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    let held = false;
    const first = createDrizzleEconomicPaymentIntentCreationUnitOfWork({
      database,
      async afterWriteBoundary(boundary) {
        if (boundary !== "economic_payment_intent" || held) return;
        held = true;
        entered.resolve();
        await release.promise;
      }
    });
    const second = createDrizzleEconomicPaymentIntentCreationUnitOfWork({
      database
    });
    const firstCommand = intentCommand({
      economicPaymentIntentId: "intent-concurrent-owner-one",
      sourceId: "order-concurrent-conflict"
    });
    const secondCommand = {
      ...firstCommand,
      economicPaymentIntentId: "intent-concurrent-owner-two"
    };

    const firstAttempt = first.createEconomicPaymentIntent(firstCommand);
    await entered.promise;
    const secondAttempt = second.createEconomicPaymentIntent(secondCommand);
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    release.resolve();

    await expect(firstAttempt).resolves.toMatchObject({
      economicPaymentHead: { economicPaymentIntentId: firstCommand.economicPaymentIntentId }
    });
    await expect(secondAttempt).rejects.toBeInstanceOf(
      EconomicPaymentIntentCreationPersistenceError
    );
    await expect(secondAttempt).rejects.toMatchObject({ reason: "source_identity_conflict" });
  });
});

function intentCommand(input: {
  readonly economicPaymentIntentId: string;
  readonly sourceId: string;
}) {
  return Object.freeze({
    economicPaymentIntentId: input.economicPaymentIntentId,
    sourceId: input.sourceId,
    purpose: "client_order" as const,
    providerAccount,
    amountMinor: "10000",
    currency: "RUB" as const,
    expectedSourceUniquenessVersion: 0
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

const minimalEconomicIntentSchemaSql = `
create extension if not exists pgcrypto;

create table finance_provider_account_series (
  series_id varchar(160) primary key,
  provider text not null,
  active_identity_version integer not null,
  head_version numeric(38,0) not null
);

create table finance_provider_accounts (
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  identity_version integer not null,
  provider text not null,
  primary key (series_id, provider_account_id, identity_version),
  foreign key (series_id) references finance_provider_account_series(series_id)
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
  constraint finance_economic_payment_intents_purpose_source_unique unique (purpose, source_id),
  constraint finance_economic_payment_intents_exact_identity_unique
    unique (id, series_id, provider_account_id, provider_identity_version),
  constraint finance_economic_payment_intents_source_owner_unique unique (purpose, source_id, id),
  constraint finance_economic_payment_intents_creation_owner_unique
    unique (id, purpose, source_id, series_id, provider_account_id,
            provider_identity_version, amount_minor, currency),
  foreign key (series_id, provider_account_id, provider_identity_version)
    references finance_provider_accounts(series_id, provider_account_id, identity_version),
  check (purpose in ('client_order', 'platform_invoice', 'platform_card_setup')),
  check (currency = 'RUB'),
  check ((purpose = 'platform_card_setup' and amount_minor = 0)
      or (purpose in ('client_order', 'platform_invoice') and amount_minor > 0))
);

create table finance_economic_payment_source_heads (
  purpose text not null,
  source_id varchar(160) not null,
  economic_payment_intent_id varchar(160) not null unique,
  head_version numeric(38,0) not null,
  created_at timestamptz not null default now(),
  primary key (purpose, source_id),
  foreign key (purpose, source_id, economic_payment_intent_id)
    references finance_economic_payment_intents(purpose, source_id, id),
  constraint finance_economic_payment_source_heads_receipt_owner_unique
    unique (purpose, source_id, economic_payment_intent_id, head_version),
  check (head_version = 1)
);

create table finance_economic_payment_intent_creation_receipts (
  id uuid primary key default gen_random_uuid(),
  economic_payment_intent_id varchar(160) not null unique,
  purpose text not null,
  source_id varchar(160) not null,
  series_id varchar(160) not null,
  provider_account_id varchar(160) not null,
  provider_identity_version integer not null,
  amount_minor numeric(38,0) not null,
  currency text not null,
  economic_payment_version numeric(38,0) not null,
  source_uniqueness_version numeric(38,0) not null,
  canonical_preimage text not null default '',
  canonical_digest varchar(71) not null default '',
  persistence_transaction_boundary_ref varchar(200) not null unique default '',
  committed_at timestamptz not null default now(),
  foreign key (economic_payment_intent_id, purpose, source_id, series_id,
               provider_account_id, provider_identity_version, amount_minor, currency)
    references finance_economic_payment_intents(id, purpose, source_id, series_id,
      provider_account_id, provider_identity_version, amount_minor, currency),
  foreign key (purpose, source_id, economic_payment_intent_id, source_uniqueness_version)
    references finance_economic_payment_source_heads(
      purpose, source_id, economic_payment_intent_id, head_version)
);

create table platform_tariff_invoices (
  id varchar(160) primary key,
  amount_minor integer not null,
  currency text not null,
  state text not null,
  version integer not null default 1
);

create table finance_platform_invoice_payment_bindings (
  invoice_id varchar(160) primary key references platform_tariff_invoices(id),
  economic_payment_intent_id varchar(160) not null unique
    references finance_economic_payment_intents(id),
  created_at timestamptz not null default now()
);

create function finance_test_issue_economic_intent_head()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  if new.version <> 1 or new.state <> 'created' then
    raise exception 'economic payment intent must start at version one' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger finance_test_issue_economic_intent_head
before insert on finance_economic_payment_intents
for each row execute function finance_test_issue_economic_intent_head();

create function finance_test_issue_economic_source_head_time()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.created_at := clock_timestamp();
  return new;
end;
$$;
create trigger finance_test_issue_economic_source_head_time
before insert on finance_economic_payment_source_heads
for each row execute function finance_test_issue_economic_source_head_time();

create function finance_test_issue_economic_intent_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  intent finance_economic_payment_intents%rowtype;
  source_head finance_economic_payment_source_heads%rowtype;
begin
  select * into strict intent from finance_economic_payment_intents
    where id = new.economic_payment_intent_id;
  select * into strict source_head from finance_economic_payment_source_heads
    where purpose = intent.purpose and source_id = intent.source_id;
  new.purpose := intent.purpose;
  new.source_id := intent.source_id;
  new.series_id := intent.series_id;
  new.provider_account_id := intent.provider_account_id;
  new.provider_identity_version := intent.provider_identity_version;
  new.amount_minor := intent.amount_minor;
  new.currency := intent.currency;
  new.economic_payment_version := intent.version;
  new.source_uniqueness_version := source_head.head_version;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'economic_payment_intent_creation_receipt',
    'economicPaymentIntentId', new.economic_payment_intent_id,
    'sourceUniquenessVersion', new.source_uniqueness_version::text,
    'persistenceTransactionBoundaryRef', new.persistence_transaction_boundary_ref
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;
create trigger finance_test_issue_economic_intent_receipt
before insert on finance_economic_payment_intent_creation_receipts
for each row execute function finance_test_issue_economic_intent_receipt();

create function finance_test_require_economic_intent_dependencies()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from finance_economic_payment_source_heads head
    where head.economic_payment_intent_id = new.id
      and head.purpose = new.purpose
      and head.source_id = new.source_id
  ) or not exists (
    select 1 from finance_economic_payment_intent_creation_receipts receipt
    where receipt.economic_payment_intent_id = new.id
  ) then
    raise exception 'economic payment intent dependencies missing' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger finance_test_require_economic_intent_dependencies
after insert on finance_economic_payment_intents
deferrable initially deferred
for each row execute function finance_test_require_economic_intent_dependencies();
`;
