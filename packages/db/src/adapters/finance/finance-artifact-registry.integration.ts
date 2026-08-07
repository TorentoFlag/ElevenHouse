import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import {
  financeArtifactAccessEvents,
  financeArtifactLegalHolds,
  financeArtifactRetentionPolicies,
  financeArtifactSecurityIncidents,
  financeArtifactTombstones,
  financeArtifacts
} from "../../schema/finance/finance-artifacts.schema";
import {
  financeProviderAccountSeries,
  financeProviderAccounts
} from "../../schema/finance/provider-accounts.schema";
import {
  financeSavedCardConsentHeads,
  financeSavedCardConsentLifecycleEvents,
  financeSavedCardConsents
} from "../../schema/finance/saved-card-consents.schema";
import { financeSavedCardDisclosureVersions } from "../../schema/finance/saved-card-disclosures.schema";
import {
  financeRestrictedProviderCredentialHeads,
  financeRestrictedProviderCredentialLifecycleEvents,
  financeRestrictedProviderCredentials,
  financeTransientSecretConsumptions,
  financeTransientSecretRefs
} from "../../schema/finance/provider-credentials.schema";
import { users } from "../../schema/identity/accounts.schema";
import {
  platformTariffSeries,
  platformTariffSubscriptions,
  platformTariffVersions
} from "../../schema/platform-billing/tariff-authority.schema";

import {
  FinanceArtifactRegistryError,
  assertSealedPrivateObjectReceiptAgreement,
  assertFinanceArtifactPayloadAllowed,
  createFinanceArtifactRegistry,
  type FinanceArtifactRegistry,
  type ProviderArtifactRegistration
} from "./finance-artifact-registry";

describe("finance artifact payload boundary", () => {
  it.each([
    { pan: "4242424242424242" },
    { card: { cvv: "123" } },
    { encryptedCard: "opaque-but-forbidden" },
    { raw_card: { number: "redacted" } },
    { savedCardTokenId: "credential-secret" },
    { split: [{ beneficiary: "merchant-two" }] },
    { subMerchant: { id: "merchant-two" } },
    { arbitrary: "4242 4242 4242 4242" }
  ])(
    "rejects forbidden card or split/sub-merchant material without retaining it: %j",
    (payload) => {
      try {
        assertFinanceArtifactPayloadAllowed(payload);
        throw new Error("expected payload rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(FinanceArtifactRegistryError);
        expect(error).not.toHaveProperty("payload");
        expect(String(error)).not.toContain("4242424242424242");
        expect(String(error)).not.toContain("opaque-but-forbidden");
        expect(String(error)).not.toContain("merchant-two");
      }
    }
  );

  it("accepts bounded provider facts that contain no card or marketplace material", () => {
    expect(() =>
      assertFinanceArtifactPayloadAllowed({
        paymentId: "payment_8be7",
        status: "captured",
        amount: { minor: "9600", currency: "RUB" },
        events: [{ kind: "capture", occurredAt: "2026-08-04T00:00:00Z" }]
      })
    ).not.toThrow();
  });

  it("fails closed on unbounded or executable object graphs", () => {
    let value: unknown = "leaf";
    for (let index = 0; index < 40; index += 1) value = { value };

    expect(() => assertFinanceArtifactPayloadAllowed(value)).toThrow(
      expect.objectContaining({ reason: "payload_limit_exceeded" })
    );
    expect(() =>
      assertFinanceArtifactPayloadAllowed({
        get status() {
          return "captured";
        }
      })
    ).toThrow(expect.objectContaining({ reason: "invalid_payload_shape" }));

    const arrayWithExtraProperty = ["captured"] as string[] & { metadata?: string };
    arrayWithExtraProperty.metadata = "extra";
    expect(() => assertFinanceArtifactPayloadAllowed(arrayWithExtraProperty)).toThrow(
      expect.objectContaining({ reason: "invalid_payload_shape" })
    );

    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, "0", {
      enumerable: true,
      get: () => "captured"
    });
    Object.defineProperty(accessorArray, "length", { value: 1 });
    expect(() => assertFinanceArtifactPayloadAllowed(accessorArray)).toThrow(
      expect.objectContaining({ reason: "invalid_payload_shape" })
    );

    expect(() =>
      assertFinanceArtifactPayloadAllowed(
        Array.from({ length: 10 }, (_, index) => `${index}:${"x".repeat(2_000_000)}`)
      )
    ).toThrow(expect.objectContaining({ reason: "payload_limit_exceeded" }));
  });

  it("rejects a sealed-object receipt that does not match the exact artifact bytes", () => {
    const artifact = {
      artifactId: "artifact-receipt-agreement",
      sha256Digest: digestFor("receipt-agreement"),
      byteLength: 512
    } as const;
    const receipt = {
      privateObjectKey: "private/provider/artifact-receipt-agreement",
      privateObjectVersion: "object-version-one",
      envelopeKeyVersion: "kms-finance-v1",
      sha256Digest: artifact.sha256Digest,
      byteLength: artifact.byteLength,
      contentType: "application/json"
    } as const;

    expect(() =>
      assertSealedPrivateObjectReceiptAgreement({
        artifact,
        contentType: "application/json",
        privateObject: receipt
      })
    ).not.toThrow();
    expect(() =>
      assertSealedPrivateObjectReceiptAgreement({
        artifact,
        contentType: "application/json",
        privateObject: { ...receipt, byteLength: 511 }
      })
    ).toThrow(expect.objectContaining({ reason: "artifact_integrity_violation" }));
    expect(() =>
      assertSealedPrivateObjectReceiptAgreement({
        artifact,
        contentType: "application/json",
        privateObject: { ...receipt, sha256Digest: digestFor("different-bytes") }
      })
    ).toThrow(expect.objectContaining({ reason: "artifact_integrity_violation" }));
    expect(() =>
      assertSealedPrivateObjectReceiptAgreement({
        artifact,
        contentType: "application/json",
        privateObject: { ...receipt, contentType: "application/octet-stream" }
      })
    ).toThrow(expect.objectContaining({ reason: "artifact_integrity_violation" }));
    const receiptWithRawCardMaterial = { ...receipt, pan: "4242424242424242" };
    expect(() =>
      assertSealedPrivateObjectReceiptAgreement({
        artifact,
        contentType: "application/json",
        privateObject: receiptWithRawCardMaterial
      })
    ).toThrow(expect.objectContaining({ reason: "invalid_input" }));
  });
});

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_finance_artifacts_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;
let registry: FinanceArtifactRegistry;

describe.sequential("finance artifact registry Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
    await runtime.pool.query(readCurrentMigrationSql());
    registry = createFinanceArtifactRegistry(runtime.database);
    await seedProviderIdentity("arc-main", "arc-account-main");
    await runtime.database.insert(financeArtifactRetentionPolicies).values([
      {
        policyId: "provider-response-short",
        policyVersion: "1",
        artifactClass: "provider_response",
        retainForSeconds: "1",
        authorityRef: "test-policy-short",
        effectiveAt: new Date("2020-01-01T00:00:00.000Z")
      },
      {
        policyId: "provider-response-long",
        policyVersion: "1",
        artifactClass: "provider_response",
        retainForSeconds: "3600",
        authorityRef: "test-policy-long",
        effectiveAt: new Date("2020-01-01T00:00:00.000Z")
      },
      {
        policyId: "provider-webhook-long",
        policyVersion: "1",
        artifactClass: "provider_webhook",
        retainForSeconds: "3600",
        authorityRef: "test-policy-webhook",
        effectiveAt: new Date("2020-01-01T00:00:00.000Z")
      }
    ]);
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("enforces exact immutable provider identity creation and one-step series replacement", async () => {
    await expect(
      runtime.database.insert(financeProviderAccountSeries).values({
        seriesId: "arc-invalid-start",
        provider: "arc_pay",
        activeIdentityVersion: 5,
        headVersion: "5"
      })
    ).rejects.toThrow();

    await seedProviderIdentity("arc-replacement", "arc-account-replacement-v1");
    await expect(
      runtime.database.transaction(async (transaction) => {
        await transaction
          .update(financeProviderAccountSeries)
          .set({ activeIdentityVersion: 2, headVersion: "2" })
          .where(eq(financeProviderAccountSeries.seriesId, "arc-replacement"));
      })
    ).rejects.toThrow();

    await runtime.database.transaction(async (transaction) => {
      await transaction.insert(financeProviderAccounts).values({
        seriesId: "arc-replacement",
        providerAccountId: "arc-account-replacement-v2",
        identityVersion: 2,
        provider: "arc_pay",
        merchantTenantId: "merchant-replacement",
        terminalScope: "hosted-and-saved-card",
        settlementScope: "company-settlement",
        predecessorProviderAccountId: "arc-account-replacement-v1",
        predecessorIdentityVersion: 1
      });
      await transaction
        .update(financeProviderAccountSeries)
        .set({ activeIdentityVersion: 2, headVersion: "2" })
        .where(eq(financeProviderAccountSeries.seriesId, "arc-replacement"));
    });

    await expect(
      runtime.database
        .update(financeProviderAccountSeries)
        .set({ activeIdentityVersion: 100, headVersion: "3" })
        .where(eq(financeProviderAccountSeries.seriesId, "arc-replacement"))
    ).rejects.toThrow();
    await expect(
      runtime.database
        .update(financeProviderAccounts)
        .set({ terminalScope: "mutated" })
        .where(eq(financeProviderAccounts.providerAccountId, "arc-account-replacement-v2"))
    ).rejects.toThrow();

    await expect(
      runtime.database.transaction(async (transaction) => {
        await transaction.insert(financeProviderAccountSeries).values({
          seriesId: "arc-duplicate-account-id",
          provider: "arc_pay",
          activeIdentityVersion: 1,
          headVersion: "1"
        });
        await transaction.insert(financeProviderAccounts).values({
          seriesId: "arc-duplicate-account-id",
          providerAccountId: "arc-account-main",
          identityVersion: 1,
          provider: "arc_pay",
          merchantTenantId: "merchant-duplicate",
          terminalScope: "hosted-and-saved-card",
          settlementScope: "company-settlement",
          predecessorProviderAccountId: null,
          predecessorIdentityVersion: null
        });
      })
    ).rejects.toThrow();
  });

  it("registers deterministic scoped artifacts and derives retention only from exact policy", async () => {
    const beforeRegistration = Date.now();
    const registration = providerRegistration({
      artifactId: "artifact-deterministic",
      retentionPolicyId: "provider-response-long",
      digestSeed: "deterministic"
    });

    const created = await registry.registerSealedArtifact(registration);
    const replayed = await registry.registerSealedArtifact(registration);
    const afterRegistration = Date.now();
    expect(replayed).toEqual(created);

    const [row] = await runtime.database
      .select()
      .from(financeArtifacts)
      .where(eq(financeArtifacts.id, registration.artifact.artifactId));
    expect(row?.registeredAt.getTime()).toBeGreaterThanOrEqual(beforeRegistration);
    expect(row?.registeredAt.getTime()).toBeLessThanOrEqual(afterRegistration);
    expect((row?.retainedUntil.getTime() ?? 0) - (row?.registeredAt.getTime() ?? 0)).toBe(
      3_600_000
    );
    const callerTimestampAttempt = {
      ...registration,
      registeredAt: "2000-01-01T00:00:00.000Z"
    };
    await expect(registry.registerSealedArtifact(callerTimestampAttempt)).rejects.toMatchObject({
      reason: "invalid_input"
    });

    await expect(
      registry.registerSealedArtifact({
        ...registration,
        artifact: { ...registration.artifact, artifactId: "artifact-deterministic-alias" },
        privateObject: {
          ...registration.privateObject,
          privateObjectKey: "private/provider/artifact-deterministic-alias"
        }
      })
    ).rejects.toMatchObject({ reason: "artifact_identity_conflict" });
    await expect(
      registry.registerSealedArtifact({
        ...registration,
        artifact: {
          ...registration.artifact,
          artifactId: "artifact-missing-policy",
          sha256Digest: digestFor("missing-policy")
        },
        retentionPolicyId: "unknown-policy",
        privateObject: {
          ...registration.privateObject,
          privateObjectKey: "private/provider/artifact-missing-policy",
          sha256Digest: digestFor("missing-policy")
        }
      })
    ).rejects.toMatchObject({ reason: "retention_policy_not_found" });
  });

  it("applies a closed read matrix and commits both allowed and denied audits", async () => {
    const registration = providerRegistration({
      artifactId: "artifact-access",
      retentionPolicyId: "provider-response-long",
      digestSeed: "access"
    });
    await registry.registerSealedArtifact(registration);

    const allowed = await registry.resolvePrivateArtifact({
      artifactId: registration.artifact.artifactId,
      serviceIdentity: "payment_processing",
      purpose: "provider_operation_result_verification",
      requestId: "request-access-allowed"
    });
    expect(allowed.privateObject).toEqual({
      privateObjectKey: registration.privateObject.privateObjectKey,
      privateObjectVersion: registration.privateObject.privateObjectVersion,
      envelopeKeyVersion: registration.privateObject.envelopeKeyVersion
    });

    await expect(
      registry.resolvePrivateArtifact({
        artifactId: registration.artifact.artifactId,
        serviceIdentity: "bank_reconciliation",
        purpose: "bank_statement_ingestion",
        requestId: "request-access-denied"
      })
    ).rejects.toMatchObject({ reason: "artifact_access_denied" });
    await expect(
      registry.resolvePrivateArtifact({
        artifactId: "artifact-does-not-exist",
        serviceIdentity: "payment_processing",
        purpose: "provider_operation_result_verification",
        requestId: "request-access-not-found"
      })
    ).rejects.toMatchObject({ reason: "artifact_not_found" });

    const audits = await runtime.database
      .select()
      .from(financeArtifactAccessEvents)
      .where(eq(financeArtifactAccessEvents.action, "read"));
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactId: registration.artifact.artifactId,
          outcome: "allowed",
          requestId: "request-access-allowed"
        }),
        expect.objectContaining({
          artifactId: registration.artifact.artifactId,
          outcome: "denied",
          requestId: "request-access-denied"
        }),
        expect.objectContaining({
          artifactId: null,
          outcome: "denied",
          requestId: "request-access-not-found"
        })
      ])
    );
  });

  it("keeps purge retryable after deletion failure and tombstones only verified exact deletion", async () => {
    const registration = providerRegistration({
      artifactId: "artifact-purge-retry",
      retentionPolicyId: "provider-response-short",
      digestSeed: "purge-retry"
    });
    await registry.registerSealedArtifact(registration);
    await waitUntilArtifactRetentionExpires(registration.artifact.artifactId);
    await registry.applyLegalHold({
      artifactId: registration.artifact.artifactId,
      holdId: "legal-hold-purge",
      authorityRef: "legal-case-100",
      reasonCode: "dispute-open"
    });
    await expect(
      registry.prepareArtifactPurge({
        artifactId: registration.artifact.artifactId,
        requestId: "purge-held",
        reasonCode: "retention-expired"
      })
    ).rejects.toMatchObject({ reason: "artifact_legal_hold_active" });
    await registry.releaseLegalHold({
      artifactId: registration.artifact.artifactId,
      holdId: "legal-hold-purge",
      authorityRef: "legal-case-100-release",
      reasonCode: "dispute-closed"
    });

    const prepared = await registry.prepareArtifactPurge({
      artifactId: registration.artifact.artifactId,
      requestId: "purge-prepared",
      reasonCode: "retention-expired"
    });
    await registry.recordArtifactPurgeFailure({
      purgeRequestId: prepared.purgeRequestId,
      attemptId: "purge-attempt-failed",
      reasonCode: "object-store-timeout"
    });
    expect(
      await runtime.database
        .select()
        .from(financeArtifactTombstones)
        .where(eq(financeArtifactTombstones.artifactId, registration.artifact.artifactId))
    ).toEqual([]);

    const retry = await registry.prepareArtifactPurge({
      artifactId: registration.artifact.artifactId,
      requestId: "purge-retry",
      reasonCode: "retention-expired"
    });
    expect(retry).toEqual(prepared);
    await expect(
      registry.resolvePrivateArtifact({
        artifactId: registration.artifact.artifactId,
        serviceIdentity: "payment_processing",
        purpose: "provider_operation_result_verification",
        requestId: "read-purge-pending"
      })
    ).rejects.toMatchObject({ reason: "artifact_purge_pending" });
    await expect(
      registry.applyLegalHold({
        artifactId: registration.artifact.artifactId,
        holdId: "late-legal-hold",
        authorityRef: "late-case",
        reasonCode: "too-late"
      })
    ).rejects.toMatchObject({ reason: "artifact_purge_pending" });
    await expect(
      runtime.database.insert(financeArtifactLegalHolds).values({
        artifactId: registration.artifact.artifactId,
        holdId: "late-legal-hold-direct-db",
        action: "applied",
        appliedEventId: null,
        appliedEventAction: null,
        authorityRef: "late-case-direct-db",
        reasonCode: "too-late"
      })
    ).rejects.toThrow();

    await expect(
      registry.completeArtifactPurge({
        artifactId: registration.artifact.artifactId,
        purgeRequestId: prepared.purgeRequestId,
        attemptId: "purge-attempt-verified",
        deletionVerificationDigest: digestFor("verified-delete"),
        deletedPrivateObjectVersion: "wrong-object-version"
      })
    ).rejects.toMatchObject({ reason: "artifact_integrity_violation" });

    const completed = await registry.completeArtifactPurge({
      artifactId: registration.artifact.artifactId,
      purgeRequestId: prepared.purgeRequestId,
      attemptId: "purge-attempt-verified",
      deletionVerificationDigest: digestFor("verified-delete"),
      deletedPrivateObjectVersion: registration.privateObject.privateObjectVersion
    });
    const replay = await registry.completeArtifactPurge({
      artifactId: registration.artifact.artifactId,
      purgeRequestId: prepared.purgeRequestId,
      attemptId: "purge-attempt-verified",
      deletionVerificationDigest: digestFor("verified-delete"),
      deletedPrivateObjectVersion: registration.privateObject.privateObjectVersion
    });
    expect(replay).toEqual(completed);
    expect(completed).not.toHaveProperty("privateObject");
    expect(JSON.stringify(completed)).not.toContain(registration.privateObject.privateObjectKey);

    await expect(
      registry.resolvePrivateArtifact({
        artifactId: registration.artifact.artifactId,
        serviceIdentity: "payment_processing",
        purpose: "provider_operation_result_verification",
        requestId: "read-after-tombstone"
      })
    ).rejects.toMatchObject({ reason: "artifact_tombstoned" });
    await expect(
      registry.prepareArtifactPurge({
        artifactId: registration.artifact.artifactId,
        requestId: "purge-after-tombstone",
        reasonCode: "retention-expired"
      })
    ).rejects.toMatchObject({ reason: "artifact_tombstoned" });

    const [tombstone] = await runtime.database
      .select()
      .from(financeArtifactTombstones)
      .where(eq(financeArtifactTombstones.artifactId, registration.artifact.artifactId));
    expect(tombstone).toMatchObject({
      sha256Digest: registration.artifact.sha256Digest,
      byteLength: String(registration.artifact.byteLength),
      seriesId: "arc-main",
      providerAccountId: "arc-account-main",
      providerIdentityVersion: 1,
      purgeRequestId: prepared.purgeRequestId,
      verifiedPurgeAttemptId: "purge-attempt-verified",
      deletedPrivateObjectVersion: registration.privateObject.privateObjectVersion
    });

    const retentionAudits = await runtime.database
      .select()
      .from(financeArtifactAccessEvents)
      .where(eq(financeArtifactAccessEvents.requestId, "purge-prepared"));
    expect(retentionAudits).toContainEqual(
      expect.objectContaining({
        artifactId: registration.artifact.artifactId,
        serviceIdentity: "finance_retention",
        purpose: "retention_deletion",
        action: "retention_delete",
        outcome: "allowed"
      })
    );
  });

  it("persists only a redacted DLP incident reference and exact source binding", async () => {
    await registry.recordRejectedPayloadIncident({
      incidentRef: "dlp-incident-one",
      ruleCode: "forbidden_card_field",
      binding: {
        kind: "provider",
        providerAccount: {
          seriesId: "arc-main",
          providerAccountId: "arc-account-main",
          identityVersion: 1
        }
      }
    });
    const [incident] = await runtime.database
      .select()
      .from(financeArtifactSecurityIncidents)
      .where(eq(financeArtifactSecurityIncidents.incidentRef, "dlp-incident-one"));
    expect(incident).toMatchObject({
      incidentRef: "dlp-incident-one",
      ruleCode: "forbidden_card_field",
      bindingKind: "provider",
      seriesId: "arc-main",
      providerAccountId: "arc-account-main",
      providerIdentityVersion: 1
    });
  });

  it("keeps credential versions immutable while the guarded head can revoke and replace", async () => {
    await insertCredential("credential-one", "1", digestFor("credential-one"));
    await runtime.database.transaction(async (transaction) => {
      await transaction.insert(financeRestrictedProviderCredentialLifecycleEvents).values({
        credentialId: "credential-one",
        credentialVersion: "1",
        eventSequence: "1",
        lifecycle: "pending_activation",
        reasonCode: null,
        occurredAt: new Date()
      });
      await transaction.insert(financeRestrictedProviderCredentialHeads).values({
        seriesId: "arc-main",
        providerAccountId: "arc-account-main",
        providerIdentityVersion: 1,
        providerCustomerId: "provider-customer-one",
        currentCredentialId: "credential-one",
        currentCredentialVersion: "1",
        currentLifecycle: "pending_activation",
        lifecycleEventSequence: "1",
        headVersion: "1"
      });
    });
    await advanceCredentialHead({
      credentialId: "credential-one",
      eventSequence: "2",
      lifecycle: "active",
      reasonCode: null,
      headVersion: "2"
    });
    await expect(
      advanceCredentialHead({
        credentialId: "credential-one",
        eventSequence: "3",
        lifecycle: "pending_activation",
        reasonCode: null,
        headVersion: "3"
      })
    ).rejects.toThrow();
    await advanceCredentialHead({
      credentialId: "credential-one",
      eventSequence: "3",
      lifecycle: "revoked",
      reasonCode: "user-revoked",
      headVersion: "3"
    });
    await expect(
      advanceCredentialHead({
        credentialId: "credential-one",
        eventSequence: "4",
        lifecycle: "active",
        reasonCode: null,
        headVersion: "4"
      })
    ).rejects.toThrow();

    await insertCredential("credential-two", "1", digestFor("credential-two"));
    await runtime.database.transaction(async (transaction) => {
      await transaction.insert(financeRestrictedProviderCredentialLifecycleEvents).values({
        credentialId: "credential-two",
        credentialVersion: "1",
        eventSequence: "1",
        lifecycle: "pending_activation",
        reasonCode: null,
        occurredAt: new Date()
      });
      await transaction
        .update(financeRestrictedProviderCredentialHeads)
        .set({
          currentCredentialId: "credential-two",
          currentCredentialVersion: "1",
          currentLifecycle: "pending_activation",
          lifecycleEventSequence: "1",
          headVersion: "4"
        })
        .where(
          eq(financeRestrictedProviderCredentialHeads.providerCustomerId, "provider-customer-one")
        );
    });
    await advanceCredentialHead({
      credentialId: "credential-two",
      eventSequence: "2",
      lifecycle: "active",
      reasonCode: null,
      headVersion: "5"
    });

    const [head] = await runtime.database
      .select()
      .from(financeRestrictedProviderCredentialHeads)
      .where(
        eq(financeRestrictedProviderCredentialHeads.providerCustomerId, "provider-customer-one")
      );
    expect(head).toMatchObject({
      currentCredentialId: "credential-two",
      currentLifecycle: "active",
      lifecycleEventSequence: "2",
      headVersion: "5"
    });
    expect(
      await runtime.database
        .select()
        .from(financeRestrictedProviderCredentials)
        .where(eq(financeRestrictedProviderCredentials.credentialId, "credential-one"))
    ).toHaveLength(1);
  });

  it("uses DB time for one-use transient secret consumption and rejects expiry/replay", async () => {
    await runtime.database.insert(financeTransientSecretRefs).values([
      {
        secretRefId: "secret-live",
        seriesId: "arc-main",
        providerAccountId: "arc-account-main",
        providerIdentityVersion: 1,
        providerSetupId: "setup-live",
        sealedSecretRef: "vault://finance/secret-live",
        providerExpiresAt: new Date(Date.now() + 60_000)
      },
      {
        secretRefId: "secret-expired",
        seriesId: "arc-main",
        providerAccountId: "arc-account-main",
        providerIdentityVersion: 1,
        providerSetupId: "setup-expired",
        sealedSecretRef: "vault://finance/secret-expired",
        providerExpiresAt: new Date("2020-01-01T00:01:00.000Z"),
        createdAt: new Date("2020-01-01T00:00:00.000Z")
      }
    ]);
    await runtime.database.insert(financeTransientSecretConsumptions).values({
      secretRefId: "secret-live",
      providerOperationIntentId: "provider-operation-one",
      consumedAt: new Date("2000-01-01T00:00:00.000Z")
    });
    const [consumption] = await runtime.database
      .select()
      .from(financeTransientSecretConsumptions)
      .where(eq(financeTransientSecretConsumptions.secretRefId, "secret-live"));
    expect(consumption?.consumedAt.getTime()).toBeGreaterThan(Date.now() - 30_000);
    await expect(
      runtime.database.insert(financeTransientSecretConsumptions).values({
        secretRefId: "secret-live",
        providerOperationIntentId: "provider-operation-two"
      })
    ).rejects.toThrow();
    await expect(
      runtime.database.insert(financeTransientSecretConsumptions).values({
        secretRefId: "secret-expired",
        providerOperationIntentId: "provider-operation-expired",
        consumedAt: new Date("2020-01-01T00:00:30.000Z")
      })
    ).rejects.toThrow();
  });

  it("blocks mutation and truncate of private evidence/history rows", async () => {
    await expect(
      runtime.database
        .update(financeArtifacts)
        .set({ contentType: "text/plain" })
        .where(eq(financeArtifacts.id, "artifact-access"))
    ).rejects.toThrow();
    await expect(
      runtime.database
        .delete(financeArtifactAccessEvents)
        .where(eq(financeArtifactAccessEvents.requestId, "request-access-denied"))
    ).rejects.toThrow();
    for (const table of [
      "finance_provider_account_series",
      "finance_provider_accounts",
      "finance_artifact_retention_policies",
      "finance_artifacts",
      "finance_artifact_access_events",
      "finance_artifact_purge_requests",
      "finance_artifact_purge_attempts",
      "finance_artifact_tombstones",
      "finance_artifact_legal_holds",
      "finance_artifact_security_incidents",
      "finance_restricted_provider_credentials",
      "finance_restricted_provider_credential_lifecycle_events",
      "finance_restricted_provider_credential_heads",
      "finance_transient_secret_refs",
      "finance_transient_secret_consumptions"
    ]) {
      await expect(runtime.pool.query(`truncate table ${table}`)).rejects.toThrow();
    }
  });
});

async function seedProviderIdentity(seriesId: string, providerAccountId: string): Promise<void> {
  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(financeProviderAccountSeries).values({
      seriesId,
      provider: "arc_pay",
      activeIdentityVersion: 1,
      headVersion: "1"
    });
    await transaction.insert(financeProviderAccounts).values({
      seriesId,
      providerAccountId,
      identityVersion: 1,
      provider: "arc_pay",
      merchantTenantId: `merchant-${seriesId}`,
      terminalScope: "hosted-and-saved-card",
      settlementScope: "company-settlement",
      predecessorProviderAccountId: null,
      predecessorIdentityVersion: null
    });
  });
}

function providerRegistration(input: {
  readonly artifactId: string;
  readonly retentionPolicyId: string;
  readonly digestSeed: string;
}): ProviderArtifactRegistration {
  return {
    artifact: {
      artifactId: input.artifactId,
      sha256Digest: digestFor(input.digestSeed),
      byteLength: 512
    },
    artifactClass: "provider_response",
    contentType: "application/json",
    binding: {
      kind: "provider",
      providerAccount: {
        seriesId: "arc-main",
        providerAccountId: "arc-account-main",
        identityVersion: 1
      }
    },
    privateObject: {
      privateObjectKey: `private/provider/${input.artifactId}`,
      privateObjectVersion: `version-${input.artifactId}`,
      envelopeKeyVersion: "kms-finance-v1",
      sha256Digest: digestFor(input.digestSeed),
      byteLength: 512,
      contentType: "application/json"
    },
    retentionPolicyId: input.retentionPolicyId,
    retentionPolicyVersion: "1"
  };
}

async function waitUntilArtifactRetentionExpires(artifactId: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const result = await runtime.pool.query<{ expired: boolean }>(
      `select clock_timestamp() >= retained_until as expired
         from finance_artifacts
        where id = $1`,
      [artifactId]
    );
    if (result.rows[0]?.expired) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("artifact retention did not expire within the integration-test deadline");
}

async function insertCredential(
  credentialId: string,
  credentialVersion: string,
  providerCredentialFingerprint: `sha256:${string}`
): Promise<void> {
  const consentId = `saved-card-consent-${credentialId}`;
  await insertGrantedSavedCardConsent({ consentId, credentialId });
  await runtime.database.insert(financeRestrictedProviderCredentials).values({
    credentialId,
    credentialVersion,
    seriesId: "arc-main",
    providerAccountId: "arc-account-main",
    providerIdentityVersion: 1,
    providerCustomerId: "provider-customer-one",
    providerCredentialFingerprint,
    restrictedTokenHandleRef: `vault://finance/${credentialId}`,
    displayBrand: "visa",
    displayLast4: "4242",
    displayMask: "************4242",
    expiryMonth: 12,
    expiryYear: 2030,
    consentId,
    consentVersion: "1"
  });
}

async function insertGrantedSavedCardConsent(input: {
  readonly consentId: string;
  readonly credentialId: string;
}): Promise<void> {
  const ownerUserId = randomUUID();
  const tariffSeriesId = `credential-tariff-${input.credentialId}`;
  const tariffDigest = digestFor(`credential-tariff:${input.credentialId}`);
  const subscriptionId = randomUUID();
  const disclosureSeriesId = `credential-disclosure-${input.credentialId}`;
  const disclosureDigest = digestFor(`credential-disclosure:${input.credentialId}`);
  const now = new Date();

  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(users).values({ id: ownerUserId });
    await transaction.insert(platformTariffSeries).values({
      id: tariffSeriesId,
      code: tariffSeriesId
    });
    await transaction.insert(platformTariffVersions).values({
      tariffSeriesId,
      version: 1,
      lifecycle: "published",
      name: "Credential integration tariff",
      tagline: "Credential integration tariff",
      monthlyPriceMinor: 1,
      yearlyPriceMinor: 0,
      monthlyRecurringFrequencyDays: 30,
      yearlyRecurringFrequencyDays: null,
      currency: "RUB",
      clientSaleCommissionBps: 1000,
      displayOrder: 0,
      canonicalPreimage: `credential-tariff:${input.credentialId}`,
      canonicalDigest: tariffDigest,
      publishedAt: now
    });
    await transaction.insert(platformTariffSubscriptions).values({
      id: subscriptionId,
      ownerUserId,
      tariffSeriesId,
      tariffVersion: 1,
      tariffVersionDigest: tariffDigest,
      commissionBpsSnapshot: 1000,
      billingCycle: "month",
      state: "incomplete_setup",
      version: 1,
      startsAt: null,
      endsAt: null,
      cancelledAt: null
    });
    await transaction.insert(financeSavedCardDisclosureVersions).values({
      disclosureSeriesId,
      version: 1,
      locale: "ru",
      lifecycle: "published",
      body: "Тестовое согласие на сохранение карты.",
      canonicalPreimage: `credential-disclosure:${input.credentialId}`,
      canonicalDigest: disclosureDigest,
      publishedAt: now
    });
    await transaction.insert(financeSavedCardConsents).values({
      consentId: input.consentId,
      consentVersion: "1",
      subscriptionId,
      ownerUserId,
      tariffSeriesId,
      tariffVersion: 1,
      tariffVersionDigest: tariffDigest,
      seriesId: "arc-main",
      providerAccountId: "arc-account-main",
      providerIdentityVersion: 1,
      providerCustomerId: "provider-customer-one",
      buyerContactKind: "email",
      buyerContactValue: "credential@example.test",
      consentScope: "platform_tariff_saved_card_and_recurring_charge",
      noticeLocale: "ru",
      disclosureSeriesId,
      disclosureVersion: 1,
      disclosureDigest,
      acceptedAt: now
    });
    await transaction.insert(financeSavedCardConsentLifecycleEvents).values({
      consentId: input.consentId,
      consentVersion: "1",
      eventSequence: "1",
      lifecycle: "granted",
      reasonCode: null,
      occurredAt: now
    });
    await transaction.insert(financeSavedCardConsentHeads).values({
      consentId: input.consentId,
      consentVersion: "1",
      currentLifecycle: "granted",
      lifecycleEventSequence: "1",
      headVersion: "1"
    });
  });
}

async function advanceCredentialHead(input: {
  readonly credentialId: string;
  readonly eventSequence: string;
  readonly lifecycle: "pending_activation" | "active" | "revoked" | "expired" | "compromised";
  readonly reasonCode: string | null;
  readonly headVersion: string;
}): Promise<void> {
  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(financeRestrictedProviderCredentialLifecycleEvents).values({
      credentialId: input.credentialId,
      credentialVersion: "1",
      eventSequence: input.eventSequence,
      lifecycle: input.lifecycle,
      reasonCode: input.reasonCode,
      occurredAt: new Date()
    });
    await transaction
      .update(financeRestrictedProviderCredentialHeads)
      .set({
        currentCredentialId: input.credentialId,
        currentCredentialVersion: "1",
        currentLifecycle: input.lifecycle,
        lifecycleEventSequence: input.eventSequence,
        headVersion: input.headVersion
      })
      .where(
        eq(financeRestrictedProviderCredentialHeads.providerCustomerId, "provider-customer-one")
      );
  });
}

function digestFor(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, targetDatabaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${targetDatabaseName}`;
  return url.toString();
}
