import { randomUUID } from "node:crypto";

import {
  type ApplyVerifiedProviderResultCommand,
  type ResolvedFinanceOperationEnvelope,
  type VerifiedProviderOperationEvidence
} from "@elevenhouse/domain/finance-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  ProviderOperationResultApplicationPersistenceError,
  createDrizzleProviderOperationResultApplicationUnitOfWork,
  type ProviderOperationResultApplicationWriteBoundary
} from "./drizzle-provider-operation-result-application-uow";
import { createDrizzleProviderOperationTransportUnknownUnitOfWork } from "./drizzle-provider-operation-transport-unknown-uow";

const baseDatabaseUrl = integrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_provider_result_${randomUUID().replaceAll("-", "")}`;
if (!/^elevenhouse_provider_result_[0-9a-f]{32}$/.test(databaseName)) {
  throw new Error("Invalid isolated provider-result test database name");
}
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const providerAccount = Object.freeze({
  seriesId: "arc-series-main",
  providerAccountId: "arc-account-main",
  identityVersion: 1
});

describe.sequential("provider operation result PostgreSQL integration", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let pool: Pool;
  let database: ElevenHouseDatabase;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl });
    database = drizzle(pool) as unknown as ElevenHouseDatabase;
    await pool.query(minimalProviderResultSchemaSql);
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

  it("commits one DB-correlated result and replays its original correlation after economic advance", async () => {
    const fixture = await seedSavedCardOperation(pool, "exact");
    const unitOfWork = createDrizzleProviderOperationResultApplicationUnitOfWork({ database });

    const created = await unitOfWork.applyVerifiedProviderResult(fixture.command);
    await pool.query(
      `update finance_economic_payment_intents set version = 3, state = 'captured', updated_at = clock_timestamp()
       where id = $1`,
      [fixture.economicPaymentIntentId]
    );
    const replayedAfterCapture = await unitOfWork.applyVerifiedProviderResult(fixture.command);

    expect(replayedAfterCapture).toEqual(created);
    expect(created).toMatchObject({
      kind: "provider_operation_result_commit_receipt",
      providerOperationIntentId: fixture.providerOperationIntentId,
      providerOperationIntentVersion: 1,
      providerOperationId: fixture.providerOperationId,
      operationKind: "saved_card_charge",
      economicPaymentIntentId: fixture.economicPaymentIntentId,
      correlatedEconomicPaymentVersion: 2,
      economicPaymentSessionId: fixture.economicPaymentSessionId,
      sourceId: fixture.sourceId,
      purpose: "platform_invoice",
      providerAccount,
      outcome: "succeeded",
      providerPaymentId: fixture.providerPaymentId,
      amountMinor: "199000",
      currency: "RUB",
      evidenceArtifactId: fixture.artifactId,
      evidenceArtifactDigest: fixture.evidenceDigest,
      canonicalRequestDigest: fixture.requestDigest
    });
    expect(created.providerOperationResultId).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.persistenceTransactionBoundaryRef).toMatch(/^postgres-xid:[0-9]+$/);
    expect(await operationHead(pool, fixture.providerOperationIntentId)).toMatchObject({
      status: "succeeded",
      version: "1"
    });
    expect(await resultCount(pool, fixture.providerOperationIntentId)).toBe(1);
  });

  it("atomically fences a transport-unknown provider operation without creating provider result evidence", async () => {
    const fixture = await seedSavedCardOperation(pool, "transport-unknown");
    const unitOfWork = createDrizzleProviderOperationTransportUnknownUnitOfWork(database);
    const command = {
      economicPaymentIntentId: fixture.economicPaymentIntentId,
      expectedEconomicPaymentVersion: 2,
      providerOperationIntentId: fixture.providerOperationIntentId,
      expectedProviderOperationIntentVersion: 0
    };

    const created = await unitOfWork.markProviderOperationTransportUnknown(command);
    const replayed = await unitOfWork.markProviderOperationTransportUnknown(command);

    expect(replayed).toEqual(created);
    expect(created).toMatchObject({
      kind: "provider_operation_transport_unknown_commit_receipt",
      providerOperationIntentId: fixture.providerOperationIntentId,
      providerOperationIntentVersion: 1,
      economicPaymentIntentId: fixture.economicPaymentIntentId,
      correlatedEconomicPaymentVersion: 2,
      operationKind: "saved_card_charge"
    });
    expect(await operationHead(pool, fixture.providerOperationIntentId)).toMatchObject({
      status: "provider_unknown",
      version: "1"
    });
    expect(await resultCount(pool, fixture.providerOperationIntentId)).toBe(0);
    expect(await transportUnknownReceiptCount(pool, fixture.providerOperationIntentId)).toBe(1);
  });

  it.each([
    "provider_operation_result",
    "provider_operation_head",
    "provider_operation_result_receipt"
  ] satisfies readonly ProviderOperationResultApplicationWriteBoundary[])(
    "rolls back result and operation head after %s",
    async (failedBoundary) => {
      const fixture = await seedSavedCardOperation(pool, `rollback-${failedBoundary}`);
      const unitOfWork = createDrizzleProviderOperationResultApplicationUnitOfWork({
        database,
        afterWriteBoundary(boundary) {
          if (boundary === failedBoundary) throw new Error(`injected:${boundary}`);
        }
      });

      await expect(unitOfWork.applyVerifiedProviderResult(fixture.command)).rejects.toThrow(
        `injected:${failedBoundary}`
      );
      expect(await operationHead(pool, fixture.providerOperationIntentId)).toMatchObject({
        status: "pending_dispatch",
        version: "0"
      });
      expect(await resultCount(pool, fixture.providerOperationIntentId)).toBe(0);
      expect(await economicHead(pool, fixture.economicPaymentIntentId)).toMatchObject({
        state: "pending",
        version: "2"
      });
    }
  );

  it("serializes two sessions onto one physical result and one receipt", async () => {
    const fixture = await seedSavedCardOperation(pool, "concurrent");
    const entered = deferred<void>();
    const release = deferred<void>();
    let held = false;
    const first = createDrizzleProviderOperationResultApplicationUnitOfWork({
      database,
      async afterWriteBoundary(boundary) {
        if (boundary !== "provider_operation_result" || held) return;
        held = true;
        entered.resolve();
        await release.promise;
      }
    });
    const second = createDrizzleProviderOperationResultApplicationUnitOfWork({ database });

    const firstAttempt = first.applyVerifiedProviderResult(fixture.command);
    await entered.promise;
    const secondAttempt = second.applyVerifiedProviderResult(fixture.command);
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    release.resolve();
    const [firstReceipt, secondReceipt] = await Promise.all([firstAttempt, secondAttempt]);

    expect(secondReceipt).toEqual(firstReceipt);
    expect(await resultCount(pool, fixture.providerOperationIntentId)).toBe(1);
  });

  it("rejects contradictory evidence for the same expected operation version", async () => {
    const fixture = await seedSavedCardOperation(pool, "contradictory");
    const unitOfWork = createDrizzleProviderOperationResultApplicationUnitOfWork({ database });
    await unitOfWork.applyVerifiedProviderResult(fixture.command);

    const contradictory = {
      ...fixture.command,
      evidence: {
        ...fixture.command.evidence,
        outcome: "failed"
      } as VerifiedProviderOperationEvidence
    } as ApplyVerifiedProviderResultCommand;
    await expect(unitOfWork.applyVerifiedProviderResult(contradictory)).rejects.toBeInstanceOf(
      ProviderOperationResultApplicationPersistenceError
    );
    await expect(unitOfWork.applyVerifiedProviderResult(contradictory)).rejects.toMatchObject({
      reason: "provider_evidence_conflict"
    });
  });

  it("keeps ambiguous provider truth explicit and does not mutate economic state", async () => {
    const fixture = await seedSavedCardOperation(pool, "ambiguous", "ambiguous");
    const unitOfWork = createDrizzleProviderOperationResultApplicationUnitOfWork({ database });

    const receipt = await unitOfWork.applyVerifiedProviderResult(fixture.command);

    expect(receipt.outcome).toBe("ambiguous");
    expect(await operationHead(pool, fixture.providerOperationIntentId)).toMatchObject({
      status: "provider_unknown",
      version: "1"
    });
    expect(await economicHead(pool, fixture.economicPaymentIntentId)).toMatchObject({
      state: "pending",
      version: "2"
    });
  });

  it.each([
    ["missing amount", { amountMinor: null, currency: null }],
    ["wrong amount", { amountMinor: "198999", currency: "RUB" }],
    ["missing provider payment", { providerPaymentId: null }]
  ] as const)("rejects succeeded saved-card evidence with %s", async (_label, evidencePatch) => {
    const fixture = await seedSavedCardOperation(
      pool,
      `invalid-saved-card-${_label.replaceAll(" ", "-")}`
    );
    const unitOfWork = createDrizzleProviderOperationResultApplicationUnitOfWork({ database });
    const command = withEvidence(fixture.command, evidencePatch);

    await expect(unitOfWork.applyVerifiedProviderResult(command)).rejects.toMatchObject({
      reason: "provider_evidence_conflict"
    });
    expect(await resultCount(pool, fixture.providerOperationIntentId)).toBe(0);
  });

  it("accepts only the ArcPay zero-amount RUB shape for a successful card setup", async () => {
    const fixture = await seedSavedCardOperation(pool, "card-setup-zero");
    await convertFixtureToCardSetup(pool, fixture);
    const unitOfWork = createDrizzleProviderOperationResultApplicationUnitOfWork({ database });
    const command = asCardSetupCommand(fixture.command, {
      amountMinor: "0",
      currency: "RUB"
    });

    const receipt = await unitOfWork.applyVerifiedProviderResult(command);

    expect(receipt).toMatchObject({
      purpose: "platform_card_setup",
      operationKind: "card_setup_execute",
      outcome: "succeeded",
      providerPaymentId: fixture.providerPaymentId,
      amountMinor: "0",
      currency: "RUB"
    });
  });

  it("accepts the same canonical zero-amount evidence after a completed 3DS Method", async () => {
    const fixture = await seedSavedCardOperation(pool, "card-setup-three-ds-method-zero");
    await convertFixtureToCardSetupThreeDsMethod(pool, fixture);
    const unitOfWork = createDrizzleProviderOperationResultApplicationUnitOfWork({ database });
    const command = asCardSetupThreeDsMethodCommand(fixture.command, {
      amountMinor: "0",
      currency: "RUB"
    });

    await expect(unitOfWork.applyVerifiedProviderResult(command)).resolves.toMatchObject({
      purpose: "platform_card_setup",
      operationKind: "card_setup_3ds_method_complete",
      outcome: "succeeded",
      providerPaymentId: fixture.providerPaymentId,
      amountMinor: "0",
      currency: "RUB"
    });
  });

  it.each([
    ["nullable money", { amountMinor: null, currency: null }],
    ["positive amount", { amountMinor: "1", currency: "RUB" }]
  ] as const)("rejects a successful card setup with %s", async (_label, evidencePatch) => {
    const fixture = await seedSavedCardOperation(
      pool,
      `invalid-card-setup-${_label.replaceAll(" ", "-")}`
    );
    await convertFixtureToCardSetup(pool, fixture);
    const unitOfWork = createDrizzleProviderOperationResultApplicationUnitOfWork({ database });
    const command = asCardSetupCommand(fixture.command, evidencePatch);

    await expect(unitOfWork.applyVerifiedProviderResult(command)).rejects.toMatchObject({
      reason: "provider_evidence_conflict"
    });
    expect(await resultCount(pool, fixture.providerOperationIntentId)).toBe(0);
  });
});

function withEvidence(
  command: ApplyVerifiedProviderResultCommand,
  patch: Partial<VerifiedProviderOperationEvidence>
): ApplyVerifiedProviderResultCommand {
  return {
    ...command,
    evidence: {
      ...command.evidence,
      ...patch
    } as VerifiedProviderOperationEvidence
  } as ApplyVerifiedProviderResultCommand;
}

function asCardSetupCommand(
  command: ApplyVerifiedProviderResultCommand,
  patch: Partial<VerifiedProviderOperationEvidence>
): ApplyVerifiedProviderResultCommand {
  return {
    ...withEvidence(command, {
      purpose: "platform_card_setup",
      operationKind: "card_setup_execute",
      ...patch
    }),
    expectedProviderOperationIntentVersion: 1
  };
}

function asCardSetupThreeDsMethodCommand(
  command: ApplyVerifiedProviderResultCommand,
  patch: Partial<VerifiedProviderOperationEvidence>
): ApplyVerifiedProviderResultCommand {
  return {
    ...withEvidence(command, {
      purpose: "platform_card_setup",
      operationKind: "card_setup_3ds_method_complete",
      ...patch
    }),
    expectedProviderOperationIntentVersion: 1
  };
}

async function convertFixtureToCardSetup(
  pool: Pool,
  fixture: Awaited<ReturnType<typeof seedSavedCardOperation>>
): Promise<void> {
  await pool.query(
    `update finance_economic_payment_intents
       set purpose = 'platform_card_setup', amount_minor = 0
     where id = $1`,
    [fixture.economicPaymentIntentId]
  );
  await pool.query(
    `update finance_provider_operation_intents
       set purpose = 'platform_card_setup', operation_kind = 'card_setup_execute', version = version + 1
     where id = $1`,
    [fixture.providerOperationIntentId]
  );
}

async function convertFixtureToCardSetupThreeDsMethod(
  pool: Pool,
  fixture: Awaited<ReturnType<typeof seedSavedCardOperation>>
): Promise<void> {
  await pool.query(
    `update finance_economic_payment_intents
       set purpose = 'platform_card_setup', amount_minor = 0
     where id = $1`,
    [fixture.economicPaymentIntentId]
  );
  await pool.query(
    `update finance_provider_operation_intents
       set purpose = 'platform_card_setup', operation_kind = 'card_setup_3ds_method_complete', version = version + 1
     where id = $1`,
    [fixture.providerOperationIntentId]
  );
}

async function seedSavedCardOperation(
  pool: Pool,
  suffix: string,
  outcome: "succeeded" | "ambiguous" = "succeeded"
) {
  const providerOperationIntentId = randomUUID();
  const economicPaymentIntentId = `economic-${suffix}`;
  const economicPaymentSessionId = `session-${suffix}`;
  const sourceId = `invoice-${suffix}`;
  const providerOperationId = `arc-operation-${suffix}`;
  const providerPaymentId = outcome === "succeeded" ? `arc-payment-${suffix}` : null;
  const artifactId = `evidence-${suffix}`;
  const requestDigest = sha("c");
  const evidenceDigest = sha("d");
  const observedAt = new Date(Date.now() + 1_000).toISOString();
  await pool.query(
    `insert into finance_economic_payment_intents
       (id, purpose, source_id, series_id, provider_account_id,
        provider_identity_version, amount_minor, currency, state, version)
     values ($1, 'platform_invoice', $2, $3, $4, $5, 199000, 'RUB', 'pending', 2)`,
    [
      economicPaymentIntentId,
      sourceId,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion
    ]
  );
  await pool.query(
    `insert into finance_economic_payment_sessions
       (id, economic_payment_intent_id, series_id, provider_account_id,
        provider_identity_version, state, version, intent_version_opened)
     values ($1, $2, $3, $4, $5, 'pending', 1, 2)`,
    [
      economicPaymentSessionId,
      economicPaymentIntentId,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion
    ]
  );
  await pool.query(
    `insert into finance_provider_operation_intents
       (id, economic_payment_intent_id, correlated_economic_payment_version,
        economic_payment_session_id, series_id, provider_account_id,
        provider_identity_version, purpose, source_id, operation_kind, status, version,
        source_chain_version, idempotency_key, idempotency_retention_deadline,
        canonical_request_digest, dispatch_authorization_id,
        dispatch_authorization_version, dispatch_authorization_digest, restricted_credential_id,
        restricted_credential_version, created_at, updated_at)
     values ($1, $2, 2, $3, $4, $5, $6, 'platform_invoice', $7, 'saved_card_charge',
       'pending_dispatch', 0, 1, $8, clock_timestamp() + interval '71 hours', $9,
       $10, 1, $11, $12, 3, clock_timestamp() - interval '1 minute',
       clock_timestamp() - interval '1 minute')`,
    [
      providerOperationIntentId,
      economicPaymentIntentId,
      economicPaymentSessionId,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion,
      sourceId,
      `finance:saved-card:${suffix}`,
      requestDigest,
      `invoice-authority-${suffix}`,
      sha("a"),
      `credential-${suffix}`
    ]
  );
  await pool.query(
    `insert into finance_artifacts
       (id, artifact_class, sha256_digest, byte_length, content_type, binding_kind,
        series_id, provider_account_id, provider_identity_version, private_object_key,
        private_object_version, envelope_key_version, retention_policy_id,
        retention_policy_version, retained_until)
     values ($1, 'provider_response', $2, 1024, 'application/json', 'provider',
       $3, $4, $5, $6, 'v1', 'kms-v1', 'provider-response-policy', 1,
       clock_timestamp() + interval '30 days')`,
    [
      artifactId,
      evidenceDigest,
      providerAccount.seriesId,
      providerAccount.providerAccountId,
      providerAccount.identityVersion,
      `finance/provider-response/${artifactId}`
    ]
  );
  const evidence = {
    kind: "verified_provider_operation_evidence",
    providerAccount,
    economicPaymentIntentId,
    economicPaymentSessionId,
    sourceId,
    purpose: "platform_invoice",
    providerOperationIntentId,
    operationKind: "saved_card_charge",
    providerOperationId,
    canonicalRequestDigest: requestDigest,
    idempotencyKey: `finance:saved-card:${suffix}`,
    outcome,
    providerPaymentId,
    amountMinor: outcome === "succeeded" ? "199000" : null,
    currency: outcome === "succeeded" ? "RUB" : null,
    artifact: { artifactId, sha256Digest: evidenceDigest, byteLength: 1024 },
    observedAt
  } as unknown as VerifiedProviderOperationEvidence;
  const command = {
    economicPaymentIntentId,
    expectedEconomicPaymentVersion: 2,
    providerOperationIntentId,
    expectedProviderOperationIntentVersion: 0,
    evidence,
    operationEnvelope: operationEnvelope()
  } as ApplyVerifiedProviderResultCommand;
  return {
    command,
    providerOperationIntentId,
    economicPaymentIntentId,
    economicPaymentSessionId,
    sourceId,
    providerOperationId,
    providerPaymentId,
    artifactId,
    requestDigest,
    evidenceDigest
  };
}

async function operationHead(pool: Pool, id: string) {
  const result = await pool.query(
    `select status, version::text as version from finance_provider_operation_intents where id = $1`,
    [id]
  );
  return result.rows[0];
}

async function economicHead(pool: Pool, id: string) {
  const result = await pool.query(
    `select state, version::text as version from finance_economic_payment_intents where id = $1`,
    [id]
  );
  return result.rows[0];
}

async function resultCount(pool: Pool, operationId: string) {
  const result = await pool.query(
    `select count(*)::int as count from finance_provider_operation_results
     where provider_operation_intent_id = $1`,
    [operationId]
  );
  return Number(result.rows[0]?.count);
}

async function transportUnknownReceiptCount(pool: Pool, operationId: string) {
  const result = await pool.query(
    `select count(*)::int as count from finance_provider_operation_transport_unknown_receipts
     where provider_operation_intent_id = $1`,
    [operationId]
  );
  return Number(result.rows[0]?.count);
}

function operationEnvelope() {
  return Object.freeze({
    kind: "resolved_finance_operation_envelope" as const,
    policyId: "finance-provider-result-v1",
    policyVersion: 1,
    policyDigest: sha("e"),
    maximumRows: 100,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 64 * 1024
  }) as unknown as ResolvedFinanceOperationEnvelope;
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

const minimalProviderResultSchemaSql = `
create extension if not exists pgcrypto;

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
  dispatch_authorization_digest varchar(71) not null,
  operation_policy_id varchar(160), operation_policy_version integer,
  operation_policy_digest varchar(71), operation_maximum_rows integer,
  operation_maximum_decimal_digits integer, operation_maximum_artifact_bytes integer,
  restricted_credential_id varchar(160),
  restricted_credential_version numeric(38,0), transient_secret_ref_id varchar(160),
  provider_unknown_observed_at timestamptz, terminal_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table finance_provider_operation_transport_unknown_receipts (
  id uuid primary key default gen_random_uuid(), provider_operation_intent_id varchar(160) not null,
  provider_operation_intent_version numeric(38,0) not null,
  economic_payment_intent_id varchar(160) not null,
  correlated_economic_payment_version numeric(38,0) not null,
  economic_payment_session_id varchar(160), series_id varchar(160) not null,
  provider_account_id varchar(160) not null, provider_identity_version integer not null,
  purpose text not null, source_id varchar(160) not null, operation_kind text not null,
  canonical_request_digest varchar(71) not null, idempotency_key varchar(160) not null,
  observed_at timestamptz not null, canonical_preimage text not null default 'test',
  canonical_digest varchar(71) not null default 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  persistence_transaction_boundary_ref varchar(200) not null default 'postgres-xid:1',
  committed_at timestamptz not null default now(),
  unique(provider_operation_intent_id, provider_operation_intent_version)
);
create table finance_provider_operation_results (
  id varchar(160) primary key, provider_operation_intent_id varchar(160) not null,
  provider_operation_intent_version numeric(38,0) not null,
  correlated_economic_payment_version numeric(38,0) not null,
  series_id varchar(160) not null, provider_account_id varchar(160) not null,
  provider_identity_version integer not null, outcome text not null,
  provider_operation_id varchar(160) not null, provider_payment_id varchar(160),
  amount_minor numeric(38,0), currency text, canonical_request_digest varchar(71) not null,
  idempotency_key varchar(160) not null, evidence_artifact_id varchar(160) not null,
  evidence_artifact_digest varchar(71) not null, observed_at timestamptz not null,
  committed_at timestamptz not null default now(),
  unique(provider_operation_intent_id, provider_operation_intent_version)
);
create table finance_provider_operation_result_commit_receipts (
  id uuid primary key default gen_random_uuid(), provider_operation_result_id varchar(160) not null unique,
  provider_operation_intent_id varchar(160) not null,
  provider_operation_intent_version numeric(38,0) not null,
  economic_payment_intent_id varchar(160) not null,
  correlated_economic_payment_version numeric(38,0) not null,
  economic_payment_session_id varchar(160), series_id varchar(160) not null,
  provider_account_id varchar(160) not null, provider_identity_version integer not null,
  purpose text not null, source_id varchar(160) not null, operation_kind text not null,
  outcome text not null, provider_operation_id varchar(160) not null,
  provider_payment_id varchar(160), amount_minor numeric(38,0), currency text,
  canonical_request_digest varchar(71) not null, idempotency_key varchar(160) not null,
  evidence_artifact_id varchar(160) not null, evidence_artifact_digest varchar(71) not null,
  observed_at timestamptz not null, result_committed_at timestamptz not null,
  canonical_preimage text not null default '', canonical_digest varchar(71) not null default '',
  persistence_transaction_boundary_ref varchar(200) not null unique default '',
  committed_at timestamptz not null default now()
);

create function finance_test_issue_provider_result()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare economic_version numeric(38,0);
begin
  select economic.version into strict economic_version
    from finance_provider_operation_intents operation
    join finance_economic_payment_intents economic
      on economic.id = operation.economic_payment_intent_id
    where operation.id = new.provider_operation_intent_id for update of economic;
  new.correlated_economic_payment_version := economic_version;
  new.committed_at := clock_timestamp();
  return new;
end;
$$;
create trigger finance_test_issue_provider_result before insert on finance_provider_operation_results
for each row execute function finance_test_issue_provider_result();

create function finance_test_update_provider_operation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.updated_at := clock_timestamp();
  if new.version <> old.version + 1 then
    raise exception 'provider operation version conflict' using errcode = '40001';
  end if;
  return new;
end;
$$;
create trigger finance_test_update_provider_operation
before update on finance_provider_operation_intents
for each row execute function finance_test_update_provider_operation();

create function finance_test_issue_provider_result_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare result_row finance_provider_operation_results%rowtype;
declare operation finance_provider_operation_intents%rowtype;
begin
  select * into strict result_row from finance_provider_operation_results
    where id = new.provider_operation_result_id;
  select * into strict operation from finance_provider_operation_intents
    where id = result_row.provider_operation_intent_id;
  new.provider_operation_intent_id := result_row.provider_operation_intent_id;
  new.provider_operation_intent_version := result_row.provider_operation_intent_version;
  new.economic_payment_intent_id := operation.economic_payment_intent_id;
  new.correlated_economic_payment_version := result_row.correlated_economic_payment_version;
  new.economic_payment_session_id := operation.economic_payment_session_id;
  new.series_id := result_row.series_id; new.provider_account_id := result_row.provider_account_id;
  new.provider_identity_version := result_row.provider_identity_version;
  new.purpose := operation.purpose; new.source_id := operation.source_id;
  new.operation_kind := operation.operation_kind; new.outcome := result_row.outcome;
  new.provider_operation_id := result_row.provider_operation_id;
  new.provider_payment_id := result_row.provider_payment_id; new.amount_minor := result_row.amount_minor;
  new.currency := result_row.currency; new.canonical_request_digest := result_row.canonical_request_digest;
  new.idempotency_key := result_row.idempotency_key; new.evidence_artifact_id := result_row.evidence_artifact_id;
  new.evidence_artifact_digest := result_row.evidence_artifact_digest;
  new.observed_at := result_row.observed_at; new.result_committed_at := result_row.committed_at;
  new.id := gen_random_uuid();
  new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text;
  new.committed_at := clock_timestamp();
  new.canonical_preimage := jsonb_build_object(
    'kind', 'provider_operation_result_commit_receipt',
    'providerOperationResultId', new.provider_operation_result_id,
    'correlatedEconomicPaymentVersion', new.correlated_economic_payment_version::text,
    'boundary', new.persistence_transaction_boundary_ref
  )::text;
  new.canonical_digest := 'sha256:' || encode(digest(new.canonical_preimage, 'sha256'), 'hex');
  return new;
end;
$$;
create trigger finance_test_issue_provider_result_receipt
before insert on finance_provider_operation_result_commit_receipts
for each row execute function finance_test_issue_provider_result_receipt();
`;
