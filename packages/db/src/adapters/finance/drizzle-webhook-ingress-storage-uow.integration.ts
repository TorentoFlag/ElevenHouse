import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { createHash, randomUUID } from "node:crypto";

import {
  createProviderAccountIdentityBinding,
  type StoreWebhookBeforeAcknowledgementCommand
} from "@elevenhouse/domain/finance-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { financeArtifactRetentionPolicies } from "../../schema/finance/finance-artifacts.schema";
import {
  financeProviderAccountSeries,
  financeProviderAccounts
} from "../../schema/finance/provider-accounts.schema";
import {
  financeWebhookInbox,
  financeWebhookStoredReceipts
} from "../../schema/finance/webhook-inbox.schema";

import {
  createFinanceArtifactRegistry,
  type FinanceArtifactRegistry,
  type ProviderArtifactRegistration
} from "./finance-artifact-registry";
import { createDrizzleActiveProviderAccountWebhookContextReader } from "./drizzle-active-provider-account-reader";
import { createDrizzleWebhookIngressStorageUnitOfWork } from "./drizzle-webhook-ingress-storage-uow";

const baseDatabaseUrl = integrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_webhook_ingress_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(baseDatabaseUrl, databaseName);
const providerAccount = createProviderAccountIdentityBinding({
  seriesId: "arc-webhook-main",
  providerAccountId: "arc-webhook-account-main",
  identityVersion: 1
});

describe.sequential("Drizzle webhook ingress storage UOW", () => {
  const adminClient = new Client({ connectionString: baseDatabaseUrl });
  let runtime: PostgresRuntime;
  let artifacts: FinanceArtifactRegistry;

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
    await runtime.pool.query(readCurrentMigrationSql());
    artifacts = createFinanceArtifactRegistry(runtime.database);
    await runtime.database.transaction(async (transaction) => {
      await transaction.insert(financeProviderAccountSeries).values({
        seriesId: providerAccount.seriesId,
        provider: "arc_pay",
        activeIdentityVersion: 1,
        headVersion: "1"
      });
      await transaction.insert(financeProviderAccounts).values({
        seriesId: providerAccount.seriesId,
        providerAccountId: providerAccount.providerAccountId,
        identityVersion: providerAccount.identityVersion,
        provider: "arc_pay",
        merchantTenantId: "merchant-webhook-main",
        environment: "sandbox",
        terminalScope: "hosted-and-saved-card",
        settlementScope: "company-settlement",
        predecessorProviderAccountId: null,
        predecessorIdentityVersion: null
      });
      await transaction.insert(financeArtifactRetentionPolicies).values({
        policyId: "provider-webhook-test",
        policyVersion: "1",
        artifactClass: "provider_webhook",
        retainForSeconds: "3600",
        authorityRef: "test-retention-policy",
        effectiveAt: new Date("2020-01-01T00:00:00.000Z")
      });
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

  it("persists one immutable receipt, replays a valid redelivery, and rejects a changed payload", async () => {
    const unitOfWork = createDrizzleWebhookIngressStorageUnitOfWork({ database: runtime.database });
    const webhookId = `arc-event-${randomUUID()}`;
    const body = JSON.stringify({ id: webhookId, event: "payment.captured", amount: 9_600 });
    const firstArtifact = await registerWebhookArtifact("first", body);
    const first = await unitOfWork.storeBeforeAcknowledgement(
      command({ webhookId, body, sealedPayloadRef: firstArtifact.artifactId })
    );

    expect(first).toMatchObject({
      kind: "stored_webhook_receipt",
      webhookId,
      dedupeResult: "stored_new",
      providerAccount
    });
    expect(first.persistenceTransactionBoundaryRef).toMatch(/^postgres-xid:\d+$/);

    // The artifact registry deduplicates the exact provider payload; a valid redelivery is a
    // new local verification attempt over that immutable sealed evidence.
    const replay = await unitOfWork.storeBeforeAcknowledgement(
      command({
        webhookId,
        body,
        sealedPayloadRef: firstArtifact.artifactId,
        signedTimestamp: "2026-08-04T12:01:00.000Z",
        verifiedAt: "2026-08-04T12:01:01.000Z",
        receivedAt: "2026-08-04T12:01:02.000Z",
        signatureSeed: "replay"
      })
    );
    expect(replay).toEqual({ ...first, dedupeResult: "transport_replay" });

    const changedBody = JSON.stringify({ id: webhookId, event: "payment.captured", amount: 9_700 });
    const changedArtifact = await registerWebhookArtifact("changed", changedBody);
    await expect(
      unitOfWork.storeBeforeAcknowledgement(
        command({ webhookId, body: changedBody, sealedPayloadRef: changedArtifact.artifactId })
      )
    ).rejects.toEqual(
      expect.objectContaining({
        code: "webhook_ingress_storage_persistence_error",
        reason: "transport_identity_conflict"
      })
    );

    await expect(
      runtime.database.select().from(financeWebhookInbox)
    ).resolves.toHaveLength(1);
    await expect(
      runtime.database.select().from(financeWebhookStoredReceipts)
    ).resolves.toHaveLength(1);
  });

  it("binds the signed webhook tenant to the active immutable provider identity", async () => {
    const reader = createDrizzleActiveProviderAccountWebhookContextReader(runtime.database);

    await expect(
      reader.findActiveWebhookContext({ provider: "arc_pay", environment: "sandbox" })
    ).resolves.toEqual({
      providerAccount,
      merchantTenantId: "merchant-webhook-main"
    });
    await expect(
      reader.findActiveWebhookContext({ provider: "arc_pay", environment: "live" })
    ).resolves.toBeNull();
  });

  it("fails closed when more than one active provider identity is configured for an environment", async () => {
    await runtime.database.transaction(async (transaction) => {
      await transaction.insert(financeProviderAccountSeries).values({
        seriesId: "arc-webhook-duplicate",
        provider: "arc_pay",
        activeIdentityVersion: 1,
        headVersion: "1"
      });
      await transaction.insert(financeProviderAccounts).values({
        seriesId: "arc-webhook-duplicate",
        providerAccountId: "arc-webhook-duplicate-account",
        identityVersion: 1,
        provider: "arc_pay",
        merchantTenantId: "merchant-webhook-duplicate",
        environment: "sandbox",
        terminalScope: "hosted-and-saved-card",
        settlementScope: "company-settlement",
        predecessorProviderAccountId: null,
        predecessorIdentityVersion: null
      });
    });
    const reader = createDrizzleActiveProviderAccountWebhookContextReader(runtime.database);

    await expect(
      reader.findActiveWebhookContext({ provider: "arc_pay", environment: "sandbox" })
    ).rejects.toMatchObject({ reason: "identity_integrity_conflict" });
  });

  async function registerWebhookArtifact(label: string, body: string) {
    const artifactId = `webhook-artifact-${label}-${randomUUID()}`;
    const sha256Digest = digest(body);
    const byteLength = Buffer.byteLength(body, "utf8");
    return artifacts.registerSealedArtifact({
      artifact: { artifactId, sha256Digest, byteLength },
      artifactClass: "provider_webhook",
      contentType: "application/json",
      binding: { kind: "provider", providerAccount },
      privateObject: {
        privateObjectKey: `private/webhooks/${artifactId}`,
        privateObjectVersion: "version-one",
        envelopeKeyVersion: "kms-finance-v1",
        sha256Digest,
        byteLength,
        contentType: "application/json"
      },
      retentionPolicyId: "provider-webhook-test",
      retentionPolicyVersion: "1"
    } satisfies ProviderArtifactRegistration);
  }
});

function command(input: Readonly<{
  webhookId: string;
  body: string;
  sealedPayloadRef: string;
  signedTimestamp?: string;
  verifiedAt?: string;
  receivedAt?: string;
  signatureSeed?: string;
}>): StoreWebhookBeforeAcknowledgementCommand {
  return {
    expectedTransportIdentityAbsent: true,
    ingressEvidence: {
      kind: "verified_webhook_ingress_evidence",
      provider: "arc_pay",
      providerAccount,
      receivingEnvironment: "sandbox",
      webhookId: input.webhookId,
      providerEventType: "payment.captured",
      rawBodyDigest: digest(input.body),
      sealedPayloadRef: input.sealedPayloadRef,
      signatureScheme: "arc_pay_hmac_sha256_v1",
      verifierContractVersion: "arc_pay_webhook_ingress_v1",
      webhookSigningKeyVersionId: "arc-webhook-key-v1",
      signedTimestamp: input.signedTimestamp ?? "2026-08-04T12:00:00.000Z",
      signatureEvidenceDigest: digest(input.signatureSeed ?? "first"),
      verifiedAt: input.verifiedAt ?? "2026-08-04T12:00:01.000Z",
      receivedAt: input.receivedAt ?? "2026-08-04T12:00:02.000Z"
    } as StoreWebhookBeforeAcknowledgementCommand["ingressEvidence"]
  };
}

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function integrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, targetDatabaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${targetDatabaseName}`;
  return url.toString();
}
