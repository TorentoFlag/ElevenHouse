import { randomUUID } from "node:crypto";

import {
  createFiscalChargeSnapshot,
  createFiscalProfile,
  digestFinanceCanonicalValueV1,
  type PersistProviderOperationBeforeIoCommand,
  type ProviderDispatchAuthorizationReceipt,
  type ResolvedFinanceOperationEnvelope
} from "@elevenhouse/domain/finance-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import {
  ProviderOperationIntentCreationPersistenceError,
  createDrizzleProviderOperationIntentCreationUnitOfWork,
  type ProviderOperationIntentCreationWriteBoundary
} from "./drizzle-provider-operation-intent-creation-uow";

const baseDatabaseUrl = integrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_provider_intent_${randomUUID().replaceAll("-", "")}`;
if (!/^elevenhouse_provider_intent_[0-9a-f]{32}$/.test(databaseName)) {
  throw new Error("Invalid isolated provider-intent test database name");
}
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const providerAccount = Object.freeze({
  seriesId: "arc-series-main",
  providerAccountId: "arc-account-main",
  identityVersion: 1
});

describe.sequential("provider operation intent PostgreSQL integration", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    database = drizzle(pool);
    await pool.query(minimalProviderIntentSchemaSql);
    await pool.query(
      `insert into finance_provider_account_series
         (series_id, provider, active_identity_version, head_version)
       values ($1, 'arc_pay', 1, 1)`,
      [providerAccount.seriesId]
    );
    await pool.query(
      `insert into finance_provider_accounts
         (series_id, provider_account_id, identity_version, provider,
          merchant_tenant_id, terminal_scope, settlement_scope)
       values ($1, $2, $3, 'arc_pay', 'merchant-main', 'terminal-main', 'settlement-main')`,
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

  it("commits intent, sealed artifact link, DB receipt and dispatch outbox exactly once", async () => {
    const fixture = await seedCheckout(pool, "exact");
    const unitOfWork = createDrizzleProviderOperationIntentCreationUnitOfWork({ database });

    const created = await unitOfWork.persistBeforeProviderIo(fixture.command);
    await pool.query(
      `update finance_economic_payment_intents set version = 3, updated_at = clock_timestamp()
       where id = $1`,
      [fixture.economicPaymentIntentId]
    );
    const replayedAfterEconomicAdvance = await unitOfWork.persistBeforeProviderIo(fixture.command);

    expect(replayedAfterEconomicAdvance).toEqual(created);
    expect(created).toMatchObject({
      kind: "persisted_provider_dispatch_receipt",
      providerOperationIntentId: fixture.providerOperationIntentId,
      providerOperationIntentVersion: 0,
      economicPaymentIntentId: fixture.economicPaymentIntentId,
      economicPaymentVersion: 2,
      economicPaymentSessionId: fixture.economicPaymentSessionId,
      sourceId: fixture.sourceId,
      purpose: "client_order",
      amountMinor: "10000",
      currency: "RUB",
      providerAccount,
      sealedDispatchPayloadRef: fixture.artifactId
    });
    expect(created.persistenceTransactionBoundaryRef).toMatch(/^postgres-xid:[0-9]+$/);
    expect(
      await countRows(pool, "finance_provider_operation_intents", fixture.providerOperationIntentId)
    ).toBe(1);
    expect(
      await countRows(
        pool,
        "finance_provider_operation_intent_creation_receipts",
        fixture.providerOperationIntentId,
        "provider_operation_intent_id"
      )
    ).toBe(1);
    expect(
      await countRows(pool, "outbox_events", fixture.providerOperationIntentId, "aggregate_id")
    ).toBe(1);
  });

  it.each([
    "provider_operation_intent",
    "provider_operation_source_head",
    "provider_dispatch_artifact",
    "provider_operation_creation_receipt",
    "provider_dispatch_outbox"
  ] satisfies readonly ProviderOperationIntentCreationWriteBoundary[])(
    "rolls the complete dispatch transaction back after %s",
    async (failedBoundary) => {
      const fixture = await seedCheckout(pool, `rollback-${failedBoundary}`);
      const unitOfWork = createDrizzleProviderOperationIntentCreationUnitOfWork({
        database,
        afterWriteBoundary(boundary) {
          if (boundary === failedBoundary) throw new Error(`injected:${boundary}`);
        }
      });

      await expect(unitOfWork.persistBeforeProviderIo(fixture.command)).rejects.toThrow(
        `injected:${failedBoundary}`
      );
      expect(
        await countRows(
          pool,
          "finance_provider_operation_intents",
          fixture.providerOperationIntentId
        )
      ).toBe(0);
      expect(
        await countRows(pool, "outbox_events", fixture.providerOperationIntentId, "aggregate_id")
      ).toBe(0);
    }
  );

  it("rolls one-time secret consumption back with the operation", async () => {
    const fixture = await seedCardSetupExecute(pool, "secret-rollback");
    const unitOfWork = createDrizzleProviderOperationIntentCreationUnitOfWork({
      database,
      afterWriteBoundary(boundary) {
        if (boundary === "transient_secret_consumption") {
          throw new Error("injected:transient_secret_consumption");
        }
      }
    });

    await expect(unitOfWork.persistBeforeProviderIo(fixture.command)).rejects.toThrow(
      "injected:transient_secret_consumption"
    );
    const consumption = await pool.query(
      `select 1 from finance_transient_secret_consumptions where secret_ref_id = $1`,
      [fixture.secretRefId]
    );
    expect(consumption.rowCount).toBe(0);
    expect(
      await countRows(pool, "finance_provider_operation_intents", fixture.providerOperationIntentId)
    ).toBe(0);
  });

  it("serializes two sessions onto one physical dispatch and one DB receipt", async () => {
    const fixture = await seedCheckout(pool, "concurrent");
    const entered = deferred<void>();
    const release = deferred<void>();
    let held = false;
    const first = createDrizzleProviderOperationIntentCreationUnitOfWork({
      database,
      async afterWriteBoundary(boundary) {
        if (boundary !== "provider_operation_intent" || held) return;
        held = true;
        entered.resolve();
        await release.promise;
      }
    });
    const second = createDrizzleProviderOperationIntentCreationUnitOfWork({ database });

    const firstAttempt = first.persistBeforeProviderIo(fixture.command);
    await entered.promise;
    const secondAttempt = second.persistBeforeProviderIo(fixture.command);
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    release.resolve();
    const [firstReceipt, secondReceipt] = await Promise.all([firstAttempt, secondAttempt]);

    expect(secondReceipt).toEqual(firstReceipt);
    expect(
      await countRows(pool, "finance_provider_operation_intents", fixture.providerOperationIntentId)
    ).toBe(1);
    expect(
      await countRows(
        pool,
        "finance_provider_operation_intent_creation_receipts",
        fixture.providerOperationIntentId,
        "provider_operation_intent_id"
      )
    ).toBe(1);
    expect(
      await countRows(pool, "outbox_events", fixture.providerOperationIntentId, "aggregate_id")
    ).toBe(1);
  });

  it("rejects a same-id replay with different immutable dispatch evidence", async () => {
    const fixture = await seedCheckout(pool, "conflict");
    const unitOfWork = createDrizzleProviderOperationIntentCreationUnitOfWork({ database });
    await unitOfWork.persistBeforeProviderIo(fixture.command);

    await expect(
      unitOfWork.persistBeforeProviderIo({
        ...fixture.command,
        dispatchAuthorization: {
          ...fixture.command.dispatchAuthorization,
          authorityDigest: sha("f")
        } as ProviderDispatchAuthorizationReceipt
      } as unknown as PersistProviderOperationBeforeIoCommand)
    ).rejects.toBeInstanceOf(ProviderOperationIntentCreationPersistenceError);
  });

  it("allows a charge only while the exact credential-bound recurring consent remains granted", async () => {
    const active = await seedSavedCardCharge(pool, "consent-active", "granted");
    const revoked = await seedSavedCardCharge(pool, "consent-revoked", "revoked");
    const unitOfWork = createDrizzleProviderOperationIntentCreationUnitOfWork({ database });

    await expect(unitOfWork.persistBeforeProviderIo(active.command)).resolves.toMatchObject({
      providerOperationIntentId: active.providerOperationIntentId,
      purpose: "platform_invoice"
    });
    await expect(unitOfWork.persistBeforeProviderIo(revoked.command)).rejects.toMatchObject({
      code: "provider_operation_intent_creation_persistence_error",
      reason: "saved_card_consent_not_active"
    });
  });
});

async function seedCheckout(pool: Pool, suffix: string) {
  const providerOperationIntentId = randomUUID();
  const economicPaymentIntentId = `economic-${suffix}`;
  const economicPaymentSessionId = `session-${suffix}`;
  const sourceId = `order-${suffix}`;
  const artifactId = `dispatch-${suffix}`;
  const dispatchEnvelope = {
    kind: "checkout_session_create" as const,
    amount: { amountMinor: 10_000, currency: "RUB" as const },
    captureMode: "one_stage" as const,
    paymentMethods: [{ method: "bank_card" as const, paymentMode: "redirect" as const }],
    successUrl: "https://client.elevenhouse.test/payments/success",
    failureUrl: "https://client.elevenhouse.test/payments/failure",
    cancelUrl: "https://client.elevenhouse.test/payments/cancel",
    externalId: `attempt-${suffix}`,
    orderId: sourceId,
    fiscalSnapshot: fiscalSnapshot("client_purchase", sourceId, 10_000)
  };
  const digest = digestFinanceCanonicalValueV1(dispatchEnvelope);
  await seedEconomic(pool, {
    economicPaymentIntentId,
    economicPaymentSessionId,
    sourceId,
    purpose: "client_order",
    amountMinor: "10000"
  });
  await seedArtifact(pool, artifactId, digest, 512);
  const command = {
    providerOperationIntentId,
    economicPaymentIntentId,
    expectedEconomicPaymentVersion: 2,
    expectedProviderOperationSourceVersion: 0,
    providerAccount,
    dispatchArtifact: { artifactId, sha256Digest: digest, byteLength: 512 },
    replacementAuthority: null,
    idempotencyKey: `finance:checkout:${suffix}`,
    idempotencyRetentionDeadline: new Date(Date.now() + 71 * 60 * 60 * 1_000).toISOString(),
    operationEnvelope: operationEnvelope(),
    operationKind: "checkout_session_create",
    economicPaymentSessionId,
    dispatchEnvelope,
    dispatchAuthorization: {
      kind: "client_order_checkout_authorization",
      authorityId: `checkout-authority-${suffix}`,
      authorityVersion: "1",
      authorityDigest: sha("a"),
      sourceId,
      orderId: sourceId,
      orderSnapshotVersion: 1,
      paymentCommandId: `payment-command-${suffix}`
    }
  } as unknown as PersistProviderOperationBeforeIoCommand;
  return {
    command,
    providerOperationIntentId,
    economicPaymentIntentId,
    economicPaymentSessionId,
    sourceId,
    artifactId
  };
}

async function seedCardSetupExecute(pool: Pool, suffix: string) {
  const providerOperationIntentId = randomUUID();
  const economicPaymentIntentId = `economic-${suffix}`;
  const economicPaymentSessionId = `session-${suffix}`;
  const sourceId = `setup-${suffix}`;
  const artifactId = `dispatch-${suffix}`;
  const secretRefId = `secret-id-${suffix}`;
  const providerExpiresAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
  const dispatchEnvelope = {
    kind: "card_setup" as const,
    step: "execute" as const,
    customerId: `customer-${suffix}`,
    providerSetupId: `provider-setup-${suffix}`,
    setupExternalId: sourceId,
    tokenizationSecret: {
      kind: "sealed_one_time_provider_secret_ref" as const,
      secretRef: `vault://arc/tokenization/${suffix}`,
      providerExpiresAt,
      providerConsumption: "one_time" as const
    }
  };
  const digest = digestFinanceCanonicalValueV1(dispatchEnvelope);
  await seedEconomic(pool, {
    economicPaymentIntentId,
    economicPaymentSessionId,
    sourceId,
    purpose: "platform_card_setup",
    amountMinor: "0"
  });
  await seedArtifact(pool, artifactId, digest, 384);
  await pool.query(
    `insert into finance_transient_secret_refs
       (secret_ref_id, series_id, provider_account_id, provider_identity_version,
        provider_setup_id, sealed_secret_ref, provider_expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      secretRefId,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion,
      dispatchEnvelope.providerSetupId,
      dispatchEnvelope.tokenizationSecret.secretRef,
      providerExpiresAt
    ]
  );
  const command = {
    providerOperationIntentId,
    economicPaymentIntentId,
    expectedEconomicPaymentVersion: 2,
    expectedProviderOperationSourceVersion: 0,
    providerAccount,
    dispatchArtifact: { artifactId, sha256Digest: digest, byteLength: 384 },
    replacementAuthority: null,
    idempotencyKey: `finance:setup:${suffix}`,
    idempotencyRetentionDeadline: new Date(Date.now() + 71 * 60 * 60 * 1_000).toISOString(),
    operationEnvelope: operationEnvelope(),
    operationKind: "card_setup_execute",
    economicPaymentSessionId,
    dispatchEnvelope,
    dispatchAuthorization: {
      kind: "platform_card_setup_authorization",
      authorityId: `setup-authority-${suffix}`,
      authorityVersion: "1",
      authorityDigest: sha("b"),
      sourceId,
      setupSessionId: sourceId,
      setupConsentId: `setup-consent-${suffix}`,
      setupConsentVersion: 1
    }
  } as unknown as PersistProviderOperationBeforeIoCommand;
  return { command, providerOperationIntentId, secretRefId };
}

async function seedSavedCardCharge(
  pool: Pool,
  suffix: string,
  consentLifecycle: "granted" | "revoked"
) {
  const providerOperationIntentId = randomUUID();
  const economicPaymentIntentId = `economic-saved-${suffix}`;
  const economicPaymentSessionId = `session-saved-${suffix}`;
  const sourceId = `invoice-${suffix}`;
  const artifactId = `dispatch-saved-${suffix}`;
  const credentialId = `credential-${suffix}`;
  const consentId = `consent-${suffix}`;
  const dispatchEnvelope = {
    kind: "saved_card_charge" as const,
    amount: { amountMinor: 2_500, currency: "RUB" as const },
    savedCardCredential: {
      kind: "restricted_saved_card_credential_ref" as const,
      schemaVersion: 1 as const,
      credentialId,
      credentialVersion: 1
    },
    externalId: `attempt-saved-${suffix}`,
    storedCredentialReason: "recurring" as const,
    recurringFrequencyDays: 31,
    fiscalSnapshot: fiscalSnapshot("platform_subscription", sourceId, 2_500)
  };
  const digest = digestFinanceCanonicalValueV1(dispatchEnvelope);
  await seedEconomic(pool, {
    economicPaymentIntentId,
    economicPaymentSessionId,
    sourceId,
    purpose: "platform_invoice",
    amountMinor: "2500"
  });
  await seedArtifact(pool, artifactId, digest, 384);
  await pool.query(
    `insert into finance_restricted_provider_credentials
       (credential_id, credential_version, consent_id, consent_version)
     values ($1, 1, $2, 1)`,
    [credentialId, consentId]
  );
  await pool.query(
    `insert into finance_restricted_provider_credential_heads
       (series_id, provider_account_id, provider_identity_version, provider_customer_id,
        current_credential_id, current_credential_version, current_lifecycle,
        lifecycle_event_sequence, head_version)
     values ($1, $2, $3, $4, $5, 1, 'active', 1, 1)`,
    [
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion,
      `customer-${suffix}`,
      credentialId
    ]
  );
  await pool.query(
    `insert into finance_saved_card_consent_heads
       (consent_id, consent_version, current_lifecycle, lifecycle_event_sequence, head_version)
     values ($1, 1, $2, $3, $3)`,
    [consentId, consentLifecycle, consentLifecycle === "granted" ? 1 : 2]
  );
  const command = {
    providerOperationIntentId,
    economicPaymentIntentId,
    expectedEconomicPaymentVersion: 2,
    expectedProviderOperationSourceVersion: 0,
    providerAccount,
    dispatchArtifact: { artifactId, sha256Digest: digest, byteLength: 384 },
    replacementAuthority: null,
    idempotencyKey: `finance:saved-card:${suffix}`,
    idempotencyRetentionDeadline: new Date(Date.now() + 71 * 60 * 60 * 1_000).toISOString(),
    operationEnvelope: operationEnvelope(),
    operationKind: "saved_card_charge",
    economicPaymentSessionId,
    dispatchEnvelope,
    dispatchAuthorization: {
      kind: "platform_invoice_charge_authorization",
      authorityId: `invoice-authority-${suffix}`,
      authorityVersion: "1",
      authorityDigest: sha("c"),
      sourceId,
      invoiceId: sourceId,
      invoiceVersion: 1,
      subscriptionId: `subscription-${suffix}`,
      subscriptionVersion: 1,
      recurringConsentId: consentId,
      recurringConsentVersion: 1,
      savedCardCredentialId: credentialId,
      savedCardCredentialVersion: 1
    }
  } as unknown as PersistProviderOperationBeforeIoCommand;
  return { command, providerOperationIntentId };
}

function fiscalSnapshot(
  transactionCategory: "client_purchase" | "platform_subscription",
  sourceLineId: string,
  amountMinor: number
) {
  return createFiscalChargeSnapshot({
    profile: createFiscalProfile({
      profileSeriesId: `${transactionCategory}-fiscal-profile`,
      version: 1,
      transactionCategory,
      currency: "RUB",
      fiscalizationProvider: "arc_pay_embedded",
      merchantTaxId: "7701234567",
      buyerContactRequirement: "email_or_phone",
      lineTemplate: {
        vatRate: "no_vat",
        paymentObject: "service",
        paymentMethod: "full_payment",
        measure: "piece",
        itemCode: "elevenhouse-service"
      }
    }),
    buyerContact: { kind: "email", value: "billing@example.com" },
    lines: [{ sourceLineId, name: "ElevenHouse service", amountMinor }]
  });
}

async function seedEconomic(
  pool: Pool,
  input: {
    economicPaymentIntentId: string;
    economicPaymentSessionId: string;
    sourceId: string;
    purpose: "client_order" | "platform_card_setup" | "platform_invoice";
    amountMinor: string;
  }
) {
  await pool.query(
    `insert into finance_economic_payment_intents
       (id, purpose, source_id, series_id, provider_account_id,
        provider_identity_version, amount_minor, currency, state, version)
     values ($1, $2, $3, $4, $5, $6, $7, 'RUB', 'pending', 2)`,
    [
      input.economicPaymentIntentId,
      input.purpose,
      input.sourceId,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion,
      input.amountMinor
    ]
  );
  await pool.query(
    `insert into finance_economic_payment_sessions
       (id, economic_payment_intent_id, series_id, provider_account_id,
        provider_identity_version, state, version, intent_version_opened)
     values ($1, $2, $3, $4, $5, 'pending', 1, 2)`,
    [
      input.economicPaymentSessionId,
      input.economicPaymentIntentId,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion
    ]
  );
}

async function seedArtifact(pool: Pool, artifactId: string, digest: string, byteLength: number) {
  await pool.query(
    `insert into finance_artifacts
       (id, artifact_class, sha256_digest, byte_length, content_type, binding_kind,
        series_id, provider_account_id, provider_identity_version, private_object_key,
        private_object_version, envelope_key_version, retention_policy_id,
        retention_policy_version, retained_until)
     values ($1, 'provider_request', $2, $3, 'application/json', 'provider',
       $4, $5, $6, $7, 'v1', 'kms-v1', 'provider-request-policy', 1,
       clock_timestamp() + interval '30 days')`,
    [
      artifactId,
      digest,
      byteLength,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion,
      `finance/provider-request/${artifactId}`
    ]
  );
}

function operationEnvelope() {
  return Object.freeze({
    kind: "resolved_finance_operation_envelope" as const,
    policyId: "finance-provider-operation-v1",
    policyVersion: 1,
    policyDigest: sha("e"),
    maximumRows: 100,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 64 * 1024
  }) as unknown as ResolvedFinanceOperationEnvelope;
}

async function countRows(pool: Pool, table: string, value: string, column = "id") {
  const allowed = new Set([
    "finance_provider_operation_intents:id",
    "finance_provider_operation_intent_creation_receipts:provider_operation_intent_id",
    "outbox_events:aggregate_id"
  ]);
  if (!allowed.has(`${table}:${column}`)) throw new Error("Unsafe test count target");
  const result = await pool.query(
    `select count(*)::int as count from ${table} where ${column} = $1`,
    [value]
  );
  return Number(result.rows[0]?.count);
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

const minimalProviderIntentSchemaSql = `
create extension if not exists pgcrypto;

create table finance_provider_account_series (
  id uuid primary key default gen_random_uuid(), series_id varchar(160) not null unique,
  provider text not null, active_identity_version integer not null,
  head_version numeric(38,0) not null, created_at timestamptz not null default now()
);
create table finance_provider_accounts (
  id uuid primary key default gen_random_uuid(), series_id varchar(160) not null,
  provider_account_id varchar(160) not null, identity_version integer not null,
  provider text not null, merchant_tenant_id varchar(160) not null,
  terminal_scope varchar(160) not null,
  settlement_scope varchar(160) not null, predecessor_provider_account_id varchar(160),
  predecessor_identity_version integer, created_at timestamptz not null default now(),
  unique(series_id, provider_account_id, identity_version)
);
create table finance_economic_payment_intents (
  id varchar(160) primary key, purpose text not null, source_id varchar(160) not null,
  series_id varchar(160) not null, provider_account_id varchar(160) not null,
  provider_identity_version integer not null, amount_minor numeric(38,0) not null,
  currency text not null, state text not null, version numeric(38,0) not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table finance_economic_payment_sessions (
  id varchar(160) primary key, economic_payment_intent_id varchar(160) not null,
  series_id varchar(160) not null, provider_account_id varchar(160) not null,
  provider_identity_version integer not null, state text not null, version numeric(38,0) not null,
  intent_version_opened numeric(38,0) not null, opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), terminal_at timestamptz
);
create table finance_artifacts (
  id varchar(160) primary key, artifact_class text not null, sha256_digest varchar(71) not null,
  byte_length numeric(38,0) not null, content_type varchar(160) not null, binding_kind text not null,
  series_id varchar(160), provider_account_id varchar(160), provider_identity_version integer,
  bank_cash_pool_id varchar(160), currency text, statement_source_fingerprint varchar(71),
  private_object_key varchar(640) not null, private_object_version varchar(320) not null,
  envelope_key_version varchar(320) not null, retention_policy_id varchar(160) not null,
  retention_policy_version numeric(38,0) not null, retained_until timestamptz not null,
  registered_at timestamptz not null default now()
);
create table finance_artifact_tombstones (artifact_id varchar(160) primary key);
create table finance_restricted_provider_credentials (
  credential_id varchar(160) not null,
  credential_version numeric(38,0) not null,
  consent_id varchar(160) not null,
  consent_version numeric(38,0) not null,
  primary key(credential_id, credential_version)
);
create table finance_restricted_provider_credential_heads (
  series_id varchar(160) not null, provider_account_id varchar(160) not null,
  provider_identity_version integer not null, provider_customer_id varchar(160) not null,
  current_credential_id varchar(160) not null, current_credential_version numeric(38,0) not null,
  current_lifecycle text not null, lifecycle_event_sequence numeric(38,0) not null,
  head_version numeric(38,0) not null, updated_at timestamptz not null default now(),
  primary key(series_id, provider_account_id, provider_identity_version, provider_customer_id)
);
create table finance_saved_card_consent_heads (
  consent_id varchar(160) not null,
  consent_version numeric(38,0) not null,
  current_lifecycle text not null,
  lifecycle_event_sequence numeric(38,0) not null,
  head_version numeric(38,0) not null,
  primary key(consent_id, consent_version)
);
create table finance_transient_secret_refs (
  secret_ref_id varchar(160) primary key, series_id varchar(160) not null,
  provider_account_id varchar(160) not null, provider_identity_version integer not null,
  provider_setup_id varchar(160) not null, sealed_secret_ref varchar(640) not null unique,
  provider_expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table finance_transient_secret_consumptions (
  secret_ref_id varchar(160) primary key, provider_operation_intent_id varchar(160) not null unique,
  consumed_at timestamptz not null default now()
);
create table finance_provider_operation_intents (
  id varchar(160) primary key, economic_payment_intent_id varchar(160) not null,
  correlated_economic_payment_version numeric(38,0) not null,
  economic_payment_session_id varchar(160), series_id varchar(160) not null,
  provider_account_id varchar(160) not null, provider_identity_version integer not null,
  purpose text not null, source_id varchar(160) not null, operation_kind text not null,
  dispatch_step text, status text not null, version numeric(38,0) not null,
  source_chain_version numeric(38,0) not null, predecessor_intent_id varchar(160),
  predecessor_source_chain_version numeric(38,0), replacement_authority_digest varchar(71),
  idempotency_key varchar(160) not null, idempotency_retention_deadline timestamptz not null,
  canonical_request_digest varchar(71) not null, dispatch_authorization_id varchar(160) not null,
  dispatch_authorization_version numeric(38,0) not null,
  dispatch_authorization_digest varchar(71) not null, operation_policy_id varchar(160) not null,
  operation_policy_version numeric(38,0) not null, operation_policy_digest varchar(71) not null,
  operation_maximum_rows integer not null, operation_maximum_decimal_digits integer not null,
  operation_maximum_artifact_bytes integer not null, restricted_credential_id varchar(160),
  restricted_credential_version numeric(38,0), transient_secret_ref_id varchar(160),
  provider_unknown_observed_at timestamptz, terminal_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(series_id, provider_account_id, provider_identity_version, operation_kind, idempotency_key),
  unique(series_id, provider_account_id, provider_identity_version, purpose, source_id,
         operation_kind, source_chain_version)
);
create table finance_provider_operation_source_heads (
  series_id varchar(160) not null, provider_account_id varchar(160) not null,
  provider_identity_version integer not null, purpose text not null, source_id varchar(160) not null,
  economic_payment_intent_id varchar(160) not null, economic_payment_session_id varchar(160),
  operation_kind text not null, current_operation_intent_id varchar(160) not null,
  head_version numeric(38,0) not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(series_id, provider_account_id, provider_identity_version, purpose, source_id, operation_kind)
);
create table finance_provider_dispatch_artifacts (
  provider_operation_intent_id varchar(160) primary key, artifact_id varchar(160) not null unique,
  artifact_digest varchar(71) not null, canonical_request_digest varchar(71) not null,
  registered_at timestamptz not null default now()
);
create table finance_provider_operation_intent_creation_receipts (
  id uuid primary key default gen_random_uuid(), provider_operation_intent_id varchar(160) not null unique,
  provider_operation_intent_version numeric(38,0) not null,
  economic_payment_intent_id varchar(160) not null,
  correlated_economic_payment_version numeric(38,0) not null,
  economic_payment_session_id varchar(160), series_id varchar(160) not null,
  provider_account_id varchar(160) not null, provider_identity_version integer not null,
  purpose text not null, source_id varchar(160) not null, operation_kind text not null,
  source_chain_version numeric(38,0) not null, idempotency_key varchar(160) not null,
  canonical_request_digest varchar(71) not null, dispatch_authorization_id varchar(160) not null,
  dispatch_authorization_version numeric(38,0) not null,
  dispatch_authorization_digest varchar(71) not null, dispatch_artifact_id varchar(160) not null,
  dispatch_artifact_digest varchar(71) not null, canonical_preimage text not null default '',
  canonical_digest varchar(71) not null default '',
  persistence_transaction_boundary_ref varchar(200) not null unique default '',
  committed_at timestamptz not null default now()
);
create table outbox_events (
  id uuid primary key default gen_random_uuid(), event_type text not null, aggregate_id uuid not null,
  payload jsonb not null, status text not null default 'pending', attempts integer not null default 0,
  claim_fence bigint not null default 0, available_at timestamptz not null default now(),
  locked_at timestamptz, published_at timestamptz, quarantined_at timestamptz,
  quarantine_reason_code text, last_error text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(event_type, aggregate_id)
);

create function finance_test_issue_provider_intent()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare economic_version numeric(38,0);
begin
  select version into strict economic_version from finance_economic_payment_intents
    where id = new.economic_payment_intent_id for update;
  new.correlated_economic_payment_version := economic_version;
  new.created_at := clock_timestamp(); new.updated_at := new.created_at;
  return new;
end;
$$;
create trigger finance_test_issue_provider_intent before insert on finance_provider_operation_intents
for each row execute function finance_test_issue_provider_intent();

create function finance_test_issue_provider_intent_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare operation finance_provider_operation_intents%rowtype;
declare dispatch finance_provider_dispatch_artifacts%rowtype;
begin
  select * into strict operation from finance_provider_operation_intents
    where id = new.provider_operation_intent_id;
  select * into strict dispatch from finance_provider_dispatch_artifacts
    where provider_operation_intent_id = operation.id;
  new.provider_operation_intent_version := operation.version;
  new.economic_payment_intent_id := operation.economic_payment_intent_id;
  new.correlated_economic_payment_version := operation.correlated_economic_payment_version;
  new.economic_payment_session_id := operation.economic_payment_session_id;
  new.series_id := operation.series_id; new.provider_account_id := operation.provider_account_id;
  new.provider_identity_version := operation.provider_identity_version; new.purpose := operation.purpose;
  new.source_id := operation.source_id; new.operation_kind := operation.operation_kind;
  new.source_chain_version := operation.source_chain_version; new.idempotency_key := operation.idempotency_key;
  new.canonical_request_digest := operation.canonical_request_digest;
  new.dispatch_authorization_id := operation.dispatch_authorization_id;
  new.dispatch_authorization_version := operation.dispatch_authorization_version;
  new.dispatch_authorization_digest := operation.dispatch_authorization_digest;
  new.dispatch_artifact_id := dispatch.artifact_id; new.dispatch_artifact_digest := dispatch.artifact_digest;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'provider_operation_intent_creation_receipt',
    'providerOperationIntentId', new.provider_operation_intent_id,
    'correlatedEconomicPaymentVersion', new.correlated_economic_payment_version::text,
    'boundary', new.persistence_transaction_boundary_ref
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;
create trigger finance_test_issue_provider_intent_receipt
before insert on finance_provider_operation_intent_creation_receipts
for each row execute function finance_test_issue_provider_intent_receipt();
`;
