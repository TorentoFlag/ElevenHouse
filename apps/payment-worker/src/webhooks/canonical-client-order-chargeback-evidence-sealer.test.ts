import { createHash } from "node:crypto";

import { createProviderAccountIdentityBinding } from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import { createCanonicalClientOrderChargebackEvidenceSealer } from "./canonical-client-order-chargeback-evidence-sealer";

const providerAccount = createProviderAccountIdentityBinding({ seriesId: "arc-sandbox", providerAccountId: "merchant-sandbox", identityVersion: 1 });
const webhookId = "11111111-1111-4111-8111-111111111111";
const providerPaymentId = "22222222-2222-4222-8222-222222222222";
const bytes = new TextEncoder().encode(JSON.stringify({ id: providerPaymentId, status: "chargeback" }));
const sha256Digest = digest(bytes);

describe("canonical client-order chargeback evidence sealer", () => {
  it("seals the canonical provider resource and binds the semantic fact to one webhook", async () => {
    const writeImmutable = vi.fn(async ({ artifactId }: { artifactId: string }) => ({
      privateObjectKey: `finance/${artifactId}`, privateObjectVersion: "v1", envelopeKeyVersion: "kms-v1", sha256Digest, byteLength: bytes.byteLength, contentType: "application/json"
    }));
    const registerSealedArtifact = vi.fn(async ({ artifact }: { artifact: unknown }) => artifact);
    const sealer = createCanonicalClientOrderChargebackEvidenceSealer({
      privateObjectStorage: { writeImmutable } as never,
      artifactRegistry: { registerSealedArtifact } as never,
      retention: { policyId: "canonical-chargeback", policyVersion: "1" }
    });

    await expect(sealer.sealCanonicalChargeback(input())).resolves.toMatchObject({
      semanticSourceKind: "chargeback", semanticSourceId: webhookId, webhookId,
      economicPaymentIntentId: "economic-payment-1", economicPaymentSessionId: null,
      providerPaymentId: null, amountMinor: null, currency: null,
      artifact: { artifactId: expect.stringMatching(/^arc-canonical-chargeback:/), sha256Digest, byteLength: bytes.byteLength }
    });
    expect(registerSealedArtifact).toHaveBeenCalledWith(expect.objectContaining({
      artifactClass: "provider_canonical_read", binding: { kind: "provider", providerAccount },
      retentionPolicyId: "canonical-chargeback", retentionPolicyVersion: "1"
    }));
  });
});

function input() {
  return {
    claim: { inboxItemId: "inbox-1", inboxVersion: 2, expectedCheckpointSequence: 1, leaseFence: 1, providerAccount, webhookId, providerEventType: "payment.chargeback" as const, sealedWebhookArtifact: { artifactId: "webhook:1", sha256Digest, byteLength: bytes.byteLength, contentType: "application/json" as const } },
    economicPaymentIntentId: "economic-payment-1", providerPaymentId, disputedPrincipalMinor: 5_000,
    observedAt: "2026-08-05T12:01:00.000Z", rawCanonicalResponseBytes: bytes
  };
}

function digest(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
