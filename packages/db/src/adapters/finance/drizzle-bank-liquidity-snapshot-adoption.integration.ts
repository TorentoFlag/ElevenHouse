import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import { hashFinanceCommandPayload } from "@elevenhouse/domain";
import {
  createBankLiquiditySnapshotAttestationAuthorizationPayload
} from "@elevenhouse/domain/finance-core";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { financeArtifactRetentionPolicies, financeArtifacts } from "../../schema/finance/finance-artifacts.schema";
import { financeAuthorizationGrants } from "../../schema/identity/finance-webauthn.schema";
import { userSessions } from "../../schema/identity/auth-sessions.schema";
import { users } from "../../schema/identity/accounts.schema";
import { createDrizzleCurrentEligibleBankLiquiditySnapshotReader } from "./drizzle-current-eligible-bank-liquidity-snapshot-reader";
import { createDrizzleBankLiquiditySnapshotAdoptionUnitOfWork } from "./drizzle-bank-liquidity-snapshot-adoption-uow";
import {
  BankLiquiditySnapshotAttestationPersistenceError,
  createDrizzleBankLiquiditySnapshotAttestationUnitOfWork
} from "./drizzle-bank-liquidity-snapshot-attestation-uow";
import { createDrizzleCashPoolDirectoryBootstrapPort } from "./drizzle-cash-pool-directory-bootstrap";

const baseDatabaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_bank_liquidity_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

describe.sequential("bank liquidity snapshot adoption PostgreSQL integration", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`create database "${databaseName}"`);
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
    await runtime.pool.query(readCurrentMigrationSql());
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`drop database if exists "${databaseName}" with (force)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("adopts verified evidence exactly once and leaves an immutable liquidity head", async () => {
    const bankCashPoolId = "elevenhouse-rub-main";
    await createDrizzleCashPoolDirectoryBootstrapPort({ database: runtime.database })
      .ensureEmptySystemCashPoolReference({
        bankCashPoolId,
        currency: "RUB",
        bankAccountFingerprint: digest,
        statementSourceFingerprint: digest
      });

    const asOf = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const attested = await createAttestedSnapshotEvidence({
      bankCashPoolId,
      asOf,
      expiresAt,
      expectedBankLiquidityRevision: "0",
      unrestrictedAvailableMinor: "100000",
      sourceCheckpoint: "statement:2026-08-05:row-100"
    });
    const command = {
      bankCashPoolId,
      currency: "RUB" as const,
      expectedBankLiquidityRevision: "0",
      evidence: attested.evidence,
      operationEnvelope: {
        kind: "resolved_finance_operation_envelope",
        policyId: "integration-bank-liquidity",
        policyVersion: 1,
        policyDigest: digest,
        maximumRows: 100,
        maximumDecimalDigits: 38,
        maximumArtifactBytes: 1_000_000
      }
    };

    const unitOfWork = createDrizzleBankLiquiditySnapshotAdoptionUnitOfWork({
      database: runtime.database
    });
    const first = await unitOfWork.adoptVerifiedLiquiditySnapshot(command as never);
    const replay = await unitOfWork.adoptVerifiedLiquiditySnapshot(command as never);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      bankCashPoolId,
      currency: "RUB",
      bankLiquidityRevision: "1",
      sourceCheckpoint: command.evidence.sourceCheckpoint,
      persistenceTransactionBoundaryRef: expect.stringMatching(/^postgres-xid:[0-9]+$/)
    });
    expect(attested.ref).toMatchObject({
      attestationId: expect.any(String),
      version: 1,
      canonicalDigest: command.evidence.evidenceDigest
    });
    await expect(
      createDrizzleCurrentEligibleBankLiquiditySnapshotReader(runtime.database)
        .findCurrentEligibleBankLiquiditySnapshot({ bankCashPoolId, currency: "RUB" })
    ).resolves.toMatchObject({
      bankCashPoolId,
      currency: "RUB",
      bankLiquidityRevision: "1",
      sourceCheckpoint: command.evidence.sourceCheckpoint,
      adoptedSnapshot: first.ref
    });
    await expect(
      runtime.pool.query(
        `select head.revision::text as revision,
                head.snapshot_state as snapshot_state,
                head.unrestricted_available_minor::text as unrestricted_available_minor,
                head.open_payout_exposure_minor::text as open_payout_exposure_minor,
                head.available_liquidity_minor::text as available_liquidity_minor,
                (select count(*)::int from finance_bank_liquidity_snapshots) as snapshot_count,
                (select count(*)::int from finance_bank_liquidity_attestation_receipts) as attestation_count,
                (select count(*)::int from finance_bank_liquidity_snapshot_adoption_receipts) as receipt_count,
                (select count(*)::int from finance_bank_liquidity_history) as history_count
           from finance_bank_liquidity_heads head
          where head.bank_cash_pool_id = $1 and head.currency = 'RUB'`,
        [bankCashPoolId]
      )
    ).resolves.toMatchObject({
      rows: [
        {
          revision: "1",
          snapshot_state: "adopted",
          unrestricted_available_minor: "100000",
          open_payout_exposure_minor: "0",
          available_liquidity_minor: "100000",
          snapshot_count: 1,
          attestation_count: 1,
          receipt_count: 1,
          history_count: 1
        }
      ]
    });
  });

  it("rejects a snapshot attestation when its passkey grant was not consumed in the same transaction", async () => {
    const bankCashPoolId = "elevenhouse-rub-main";
    await expect(
      createAttestedSnapshotEvidence({
        bankCashPoolId,
        asOf: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        expectedBankLiquidityRevision: "1",
        unrestrictedAvailableMinor: "100000",
        sourceCheckpoint: "statement:2026-08-05:row-active-grant",
        authorizationGrantStatus: "active"
      })
    ).rejects.toMatchObject({
      constructor: BankLiquiditySnapshotAttestationPersistenceError,
      reason: "attestation_binding_invalid"
    });
  });

  async function createAttestedSnapshotEvidence(input: Readonly<{
    bankCashPoolId: string;
    expectedBankLiquidityRevision: string;
    unrestrictedAvailableMinor: string;
    sourceCheckpoint: string;
    asOf: string;
    expiresAt: string;
    authorizationGrantStatus?: "active" | "consumed";
  }>) {
    const actorUserId = randomUUID();
    const sessionId = randomUUID();
    const attestationId = randomUUID();
    const authorizationId = randomUUID();
    const artifactId = `bank-statement-${randomUUID()}`;
    const artifactDigest = `sha256:${attestationId.replaceAll("-", "").repeat(2)}` as const;
    const statementSourceFingerprint = `sha256:${actorUserId.replaceAll("-", "").repeat(2)}` as const;
    const now = new Date();
    const attestationInput = {
      attestationId,
      bankCashPoolId: input.bankCashPoolId,
      currency: "RUB" as const,
      expectedBankLiquidityRevision: input.expectedBankLiquidityRevision,
      unrestrictedAvailableMinor: input.unrestrictedAvailableMinor,
      sourceCheckpoint: input.sourceCheckpoint,
      asOf: input.asOf,
      expiresAt: input.expiresAt,
      evidenceArtifact: {
        artifactId,
        sha256Digest: artifactDigest,
        byteLength: 1024,
        bankCashPoolId: input.bankCashPoolId,
        statementSourceFingerprint
      }
    } as const;
    const payloadHash = hashFinanceCommandPayload(
      createBankLiquiditySnapshotAttestationAuthorizationPayload(attestationInput)
    );
    await runtime.database.insert(users).values({ id: actorUserId });
    await runtime.database.insert(userSessions).values({
      id: sessionId,
      userId: actorUserId,
      tokenHash: `token-${sessionId}`,
      expiresAt: new Date(now.getTime() + 60 * 60_000)
    });
    await runtime.database.insert(financeArtifactRetentionPolicies).values({
      policyId: `bank-evidence-retention-${attestationId}`,
      policyVersion: "1",
      artifactClass: "bank_statement",
      retainForSeconds: "86400",
      authorityRef: "integration-test",
      effectiveAt: now
    });
    await runtime.database.insert(financeArtifacts).values({
      id: artifactId,
      artifactClass: "bank_statement",
      sha256Digest: artifactDigest,
      byteLength: "1024",
      contentType: "application/pdf",
      bindingKind: "bank_cash_pool",
      seriesId: null,
      providerAccountId: null,
      providerIdentityVersion: null,
      bankCashPoolId: input.bankCashPoolId,
      currency: "RUB",
      statementSourceFingerprint,
      privateObjectKey: `private/bank/${artifactId}`,
      privateObjectVersion: "version-1",
      envelopeKeyVersion: "kms-finance-v1",
      retentionPolicyId: `bank-evidence-retention-${attestationId}`,
      retentionPolicyVersion: "1",
      retainedUntil: new Date(now.getTime() + 86_400_000)
    });
    await runtime.database.insert(financeAuthorizationGrants).values({
      authorizationId,
      actorUserId,
      sessionId,
      actionKind: "bank_snapshot_attest",
      aggregateId: attestationId,
      expectedVersion: 0,
      payloadHash,
      verifiedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      status: input.authorizationGrantStatus ?? "consumed",
      consumedAt: input.authorizationGrantStatus === "active" ? null : now
    });
    return createDrizzleBankLiquiditySnapshotAttestationUnitOfWork({ database: runtime.database })
      .attestBankLiquiditySnapshot({
        ...attestationInput,
        authorization: {
          authorizationId,
          actorUserId,
          sessionId,
          actionKind: "bank_snapshot_attest",
          aggregateId: attestationId,
          expectedVersion: 0,
          payloadHash,
          verifiedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 60_000).toISOString(),
          status: "consumed"
        }
      });
  }
});

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  assertDevelopmentDatabaseUrl(value);
  return value;
}

function withDatabaseName(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
