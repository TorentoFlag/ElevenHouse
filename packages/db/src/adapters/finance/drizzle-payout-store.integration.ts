import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { financeArtifactRetentionPolicies } from "../../schema/finance/finance-artifacts.schema";
import { createFinanceArtifactRegistry } from "./finance-artifact-registry";
import { createDrizzlePayoutStore } from "./drizzle-payout-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_payout_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;

describe("payout Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
    await runtime.pool.query(readCurrentMigrationSql());
    await runtime.database.insert(financeArtifactRetentionPolicies).values({
      policyId: "manual-payout-proof",
      policyVersion: "1",
      artifactClass: "bank_transfer_evidence",
      retainForSeconds: "315360000",
      authorityRef: "test-manual-payout-proof-policy",
      effectiveAt: new Date("2020-01-01T00:00:00.000Z")
    });
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("marks rejected manual payout requests completed with admin evidence", async () => {
    const fixture = await createFixture();
    const store = createDrizzlePayoutStore(runtime.database);

    const rejected = await store.updateRequestStatus({
      payoutRequestId: fixture.payoutRequestId,
      expectedVersion: 1,
      status: "rejected",
      adminUserId: fixture.adminUserId,
      failureReason: "Bank details do not match recipient",
      adminNote: "Astrologer must update payout method",
      now: "2026-07-27T10:00:00.000Z"
    });

    expect(rejected).toMatchObject({
      id: fixture.payoutRequestId,
      status: "rejected",
      reviewedAt: "2026-07-27T10:00:00.000Z",
      completedAt: "2026-07-27T10:00:00.000Z",
      adminUserId: fixture.adminUserId,
      failureReason: "Bank details do not match recipient",
      adminNote: "Astrologer must update payout method"
    });
  });

  it("marks cancelled manual payout requests completed without failure evidence", async () => {
    const fixture = await createFixture();
    const store = createDrizzlePayoutStore(runtime.database);

    const cancelled = await store.updateRequestStatus({
      payoutRequestId: fixture.payoutRequestId,
      expectedVersion: 1,
      status: "cancelled",
      adminUserId: fixture.adminUserId,
      adminNote: "Duplicate request",
      now: "2026-07-27T10:30:00.000Z"
    });

    expect(cancelled).toMatchObject({
      id: fixture.payoutRequestId,
      status: "cancelled",
      reviewedAt: "2026-07-27T10:30:00.000Z",
      completedAt: "2026-07-27T10:30:00.000Z",
      adminUserId: fixture.adminUserId,
      failureReason: null,
      adminNote: "Duplicate request"
    });
  });

  it("rejects a stale administrative transition rather than overwriting a newer payout state", async () => {
    const fixture = await createFixture();
    const store = createDrizzlePayoutStore(runtime.database);

    const first = await store.updateRequestStatus({
      payoutRequestId: fixture.payoutRequestId,
      expectedVersion: 1,
      status: "under_review",
      adminUserId: fixture.adminUserId,
      adminNote: "Initial review",
      now: "2026-07-27T10:45:00.000Z"
    });
    const stale = await store.updateRequestStatus({
      payoutRequestId: fixture.payoutRequestId,
      expectedVersion: 1,
      status: "rejected",
      adminUserId: fixture.adminUserId,
      failureReason: "Stale browser state",
      now: "2026-07-27T10:46:00.000Z"
    });

    expect(first).toMatchObject({ status: "under_review", version: 2 });
    expect(stale).toBeNull();
  });

  it("marks a payout paid only with an exact active private bank-transfer proof artifact", async () => {
    const fixture = await createFixture();
    const store = createDrizzlePayoutStore(runtime.database);
    const proof = await registerProofArtifact("manual-payout-proof:paid");

    const paid = await store.updateRequestStatus({
      payoutRequestId: fixture.payoutRequestId,
      expectedVersion: 1,
      status: "paid",
      adminUserId: fixture.adminUserId,
      externalReference: "bank-transfer-1001",
      transferredAt: "2026-07-27T11:00:00.000Z",
      proofArtifact: proof,
      now: "2026-07-27T11:00:00.000Z"
    });

    expect(paid).toMatchObject({
      status: "paid",
      version: 2,
      paidProofArtifact: proof
    });
  });

  it("rejects a direct SQL paid transition whose proof digest does not match the sealed artifact", async () => {
    const fixture = await createFixture();
    const proof = await registerProofArtifact("manual-payout-proof:wrong-digest");

    await expect(
      runtime.pool.query(
        `update payout_requests
         set status = 'paid', external_reference = $2, transferred_at = $3,
             paid_proof_artifact_id = $4, paid_proof_artifact_digest = $5,
             paid_proof_artifact_byte_length = $6
         where id = $1`,
        [
          fixture.payoutRequestId,
          "bank-transfer-1002",
          "2026-07-27T11:05:00.000Z",
          proof.artifactId,
          "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          proof.byteLength
        ]
      )
    ).rejects.toThrow("paid payout proof must reference one active exact bank transfer artifact");
  });
});

async function registerProofArtifact(artifactId: string) {
  const digest = `sha256:${createHash("sha256").update(artifactId).digest("hex")}` as const;
  const byteLength = 1_024;
  const result = await createFinanceArtifactRegistry(runtime.database).registerSealedArtifact({
    artifact: {
      artifactId,
      sha256Digest: digest,
      byteLength,
      bankCashPoolId: "manual-payout-bank-cash-pool",
      statementSourceFingerprint:
        "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    },
    artifactClass: "bank_transfer_evidence",
    binding: {
      kind: "bank_cash_pool",
      bankCashPoolId: "manual-payout-bank-cash-pool",
      currency: "RUB"
    },
    contentType: "application/pdf",
    privateObject: {
      privateObjectKey: `private/manual-payout-proofs/${artifactId}`,
      privateObjectVersion: "immutable-version-1",
      envelopeKeyVersion: "kms-finance-v1",
      sha256Digest: digest,
      byteLength,
      contentType: "application/pdf"
    },
    retentionPolicyId: "manual-payout-proof",
    retentionPolicyVersion: "1"
  });
  if (!("bankCashPoolId" in result)) throw new Error("Expected bank-bound payout proof artifact");
  return {
    artifactId: result.artifactId,
    sha256Digest: result.sha256Digest,
    byteLength: result.byteLength
  };
}

async function createFixture(): Promise<{
  readonly astrologerUserId: string;
  readonly adminUserId: string;
  readonly payoutRequestId: string;
}> {
  const astrologerUserId = randomUUID();
  const adminUserId = randomUUID();
  const payoutMethodId = randomUUID();
  const payoutRequestId = randomUUID();

  await runtime.pool.query("insert into users (id) values ($1), ($2)", [
    astrologerUserId,
    adminUserId
  ]);
  await runtime.pool.query(
    `insert into payout_methods
      (id, astrologer_user_id, method, currency, display_name, is_default)
     values ($1, $2, 'manual_bank_transfer', 'RUB', 'Main account', true)`,
    [payoutMethodId, astrologerUserId]
  );
  await runtime.pool.query(
    `insert into payout_method_versions
      (payout_method_id, version, destination_kind, beneficiary_fingerprint, redacted_display, sealed_destination_ref)
     values ($1, 1, 'bank_account', $2, 'Счёт •••• 4417', 'kms://test/payout-destination')`,
    [payoutMethodId, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
  );
  await runtime.pool.query(
    `insert into payout_requests
      (id, astrologer_user_id, payout_method_id, payout_method_version, destination_kind, beneficiary_fingerprint, redacted_display, sealed_destination_ref, status, amount_minor, currency, method, requested_at, metadata)
     values ($1, $2, $3, 1, 'bank_account', $4, 'Счёт •••• 4417', 'kms://test/payout-destination', 'requested', 1000000, 'RUB', 'manual_bank_transfer',
       '2026-07-27T09:00:00.000Z', '{}'::jsonb)`,
    [payoutRequestId, astrologerUserId, payoutMethodId, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
  );

  return { astrologerUserId, adminUserId, payoutRequestId };
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
