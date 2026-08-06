import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createProviderAccountIdentityBinding } from "@elevenhouse/domain/finance-core";

import {
  FinanceReversalWebhookIngressError,
  createFinanceReversalWebhookIngress
} from "./finance-reversal-webhook-ingress";

const providerAccount = createProviderAccountIdentityBinding({
  seriesId: "arc-main",
  providerAccountId: "arc-company-merchant",
  identityVersion: 1
});
const rawBody = new TextEncoder().encode(
  '{"event_id":"11111111-1111-4111-8111-111111111111","event_type":"payment.refunded"}'
);
const sha256Digest = digest(rawBody);

describe("finance reversal webhook ingress", () => {
  it("stores a signed chargeback transport unchanged for the V2 provisional-loss worker", async () => {
    const chargebackBody = new TextEncoder().encode(
      '{"event_id":"11111111-1111-4111-8111-111111111111","event_type":"payment.chargeback"}'
    );
    const chargebackDigest = digest(chargebackBody);
    const writeImmutable = vi.fn(async ({ artifactId }: { artifactId: string }) => ({
      privateObjectKey: `private/${artifactId}`,
      privateObjectVersion: "v1",
      envelopeKeyVersion: "kms-key-1",
      sha256Digest: chargebackDigest,
      byteLength: chargebackBody.byteLength,
      contentType: "application/json"
    }));
    const storeBeforeAcknowledgement = vi.fn(async () => ({ dedupeResult: "stored_new" }));
    const ingress = createFinanceReversalWebhookIngress({
      providerAccounts: { findActiveWebhookContext: vi.fn(async () => ({ providerAccount, merchantTenantId: "22222222-2222-4222-8222-222222222222" })) },
      privateObjectStorage: { writeImmutable } as never,
      artifactRegistry: { registerSealedArtifact: vi.fn(async ({ artifact }: { artifact: unknown }) => artifact) } as never,
      ingressStorage: { storeBeforeAcknowledgement } as never,
      webhookSigningKeyVersionId: "arc-webhook-key-v1",
      webhookArtifactRetention: { policyId: "provider-webhook", policyVersion: "1" }
    });

    await expect(ingress.store({ ...request(), transport: { ...request().transport, providerEventType: "payment.chargeback" }, rawBody: chargebackBody })).resolves.toEqual({ duplicate: false });
    expect(storeBeforeAcknowledgement).toHaveBeenCalledWith(expect.objectContaining({
      ingressEvidence: expect.objectContaining({ providerEventType: "payment.chargeback", rawBodyDigest: chargebackDigest })
    }));
  });

  it("seals, registers and stores verified reversal transport evidence before acknowledging it", async () => {
    const writeImmutable = vi.fn(async ({ artifactId }: { artifactId: string }) => ({
      privateObjectKey: `private/${artifactId}`,
      privateObjectVersion: "v1",
      envelopeKeyVersion: "kms-key-1",
      sha256Digest,
      byteLength: rawBody.byteLength,
      contentType: "application/json"
    }));
    const registerSealedArtifact = vi.fn(async ({ artifact }: { artifact: unknown }) => artifact);
    const storeBeforeAcknowledgement = vi.fn(async () => ({ dedupeResult: "stored_new" }));
    const ingress = createFinanceReversalWebhookIngress({
      providerAccounts: {
        findActiveWebhookContext: vi.fn(async () => ({
          providerAccount,
          merchantTenantId: "22222222-2222-4222-8222-222222222222"
        }))
      },
      privateObjectStorage: { writeImmutable } as never,
      artifactRegistry: { registerSealedArtifact } as never,
      ingressStorage: { storeBeforeAcknowledgement } as never,
      webhookSigningKeyVersionId: "arc-webhook-key-v1",
      webhookArtifactRetention: { policyId: "provider-webhook", policyVersion: "1" },
      now: () => new Date("2026-08-05T12:00:00.000Z")
    });

    await expect(ingress.store(request())).resolves.toEqual({ duplicate: false });

    expect(writeImmutable).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: expect.stringMatching(/^arc-webhook:[a-f0-9]{64}$/),
        bytes: rawBody,
        expectedSha256Digest: sha256Digest
      })
    );
    expect(registerSealedArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactClass: "provider_webhook",
        binding: { kind: "provider", providerAccount },
        retentionPolicyId: "provider-webhook",
        retentionPolicyVersion: "1"
      })
    );
    expect(storeBeforeAcknowledgement).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedTransportIdentityAbsent: true,
        ingressEvidence: expect.objectContaining({
          sealedPayloadRef: expect.stringMatching(/^arc-webhook:[a-f0-9]{64}$/),
          rawBodyDigest: sha256Digest,
          webhookSigningKeyVersionId: "arc-webhook-key-v1",
          providerAccount
        })
      })
    );
  });

  it("does not upload or acknowledge an event when the active merchant identity is unavailable", async () => {
    const writeImmutable = vi.fn();
    const ingress = createFinanceReversalWebhookIngress({
      providerAccounts: {
        findActiveWebhookContext: vi.fn(async () => null)
      },
      privateObjectStorage: { writeImmutable } as never,
      artifactRegistry: { registerSealedArtifact: vi.fn() } as never,
      ingressStorage: { storeBeforeAcknowledgement: vi.fn() } as never,
      webhookSigningKeyVersionId: "arc-webhook-key-v1",
      webhookArtifactRetention: { policyId: "provider-webhook", policyVersion: "1" }
    });

    await expect(ingress.store(request())).rejects.toEqual(
      expect.objectContaining({
        code: "FINANCE_REVERSAL_WEBHOOK_INGRESS_ERROR",
        reason: "provider_account_unavailable"
      } satisfies Partial<FinanceReversalWebhookIngressError>)
    );
    expect(writeImmutable).not.toHaveBeenCalled();
  });

  it("rejects a signed webhook from a different ArcPay tenant before sealing it", async () => {
    const writeImmutable = vi.fn();
    const ingress = createFinanceReversalWebhookIngress({
      providerAccounts: {
        findActiveWebhookContext: vi.fn(async () => ({
          providerAccount,
          merchantTenantId: "99999999-9999-4999-8999-999999999999"
        }))
      },
      privateObjectStorage: { writeImmutable } as never,
      artifactRegistry: { registerSealedArtifact: vi.fn() } as never,
      ingressStorage: { storeBeforeAcknowledgement: vi.fn() } as never,
      webhookSigningKeyVersionId: "arc-webhook-key-v1",
      webhookArtifactRetention: { policyId: "provider-webhook", policyVersion: "1" }
    });

    await expect(ingress.store(request())).rejects.toEqual(
      expect.objectContaining({
        code: "FINANCE_REVERSAL_WEBHOOK_INGRESS_ERROR",
        reason: "tenant_mismatch"
      } satisfies Partial<FinanceReversalWebhookIngressError>)
    );
    expect(writeImmutable).not.toHaveBeenCalled();
  });
});

function request() {
  return {
    signature: {
      kind: "verified" as const,
      webhookId: "11111111-1111-4111-8111-111111111111",
      signedTimestamp: "2026-08-05T11:59:59.000Z",
      signatureEvidenceDigest: `sha256:${"a".repeat(64)}` as const
    },
    transport: {
      providerWebhookId: "11111111-1111-4111-8111-111111111111",
      providerEventType: "payment.refunded",
      merchantTenantId: "22222222-2222-4222-8222-222222222222",
      environment: "sandbox" as const,
      occurredAt: "2026-08-05T11:59:58.000Z"
    },
    rawBody
  };
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
