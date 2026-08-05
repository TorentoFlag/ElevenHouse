import { createHash } from "node:crypto";

import {
  createCapturedProviderPaymentSemanticSourceId,
  createProviderAccountIdentityBinding
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import { createCanonicalClientOrderCaptureEvidenceSealer } from "./canonical-client-order-capture-evidence-sealer";

const providerAccount = createProviderAccountIdentityBinding({
  seriesId: "arc-sandbox",
  providerAccountId: "merchant-sandbox",
  identityVersion: 1
});
const webhookId = "11111111-1111-4111-8111-111111111111";
const providerPaymentId = "22222222-2222-4222-8222-222222222222";
const responseBytes = new TextEncoder().encode(
  JSON.stringify({ id: providerPaymentId, external_id: "order-1", status: "captured" })
);
const responseDigest = digest(responseBytes);

describe("canonical client-order capture evidence sealer", () => {
  it("seals exact second-read bytes and issues only the stable captured-payment semantic authority", async () => {
    const writeImmutable = vi.fn(async ({ artifactId }: { artifactId: string }) => ({
      privateObjectKey: `finance/artifacts/${artifactId}.json`,
      privateObjectVersion: "v1",
      envelopeKeyVersion: "kms-v1",
      sha256Digest: responseDigest,
      byteLength: responseBytes.byteLength,
      contentType: "application/json"
    }));
    const registerSealedArtifact = vi.fn(async ({ artifact }: { artifact: unknown }) => artifact);
    const sealer = createCanonicalClientOrderCaptureEvidenceSealer({
      privateObjectStorage: { writeImmutable } as never,
      artifactRegistry: { registerSealedArtifact } as never,
      retention: { policyId: "canonical-payment", policyVersion: "1" }
    });

    await expect(sealer.sealCanonicalCapture(input())).resolves.toMatchObject({
      kind: "verified_webhook_semantic_evidence",
      providerAccount,
      webhookId,
      semanticSourceKind: "payment_transition",
      semanticSourceId: createCapturedProviderPaymentSemanticSourceId(providerPaymentId),
      economicPaymentIntentId: "economic-payment-1",
      economicPaymentSessionId: "economic-session-1",
      providerPaymentId,
      amountMinor: "50000",
      currency: "RUB",
      purpose: "client_order",
      canonicalFactDigest: digestCanonicalCapture(),
      artifact: {
        artifactId: expect.stringMatching(/^arc-canonical-payment:/),
        sha256Digest: responseDigest,
        byteLength: responseBytes.byteLength
      }
    });
    expect(writeImmutable).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: expect.stringMatching(/^arc-canonical-payment:/),
        contentType: "application/json",
        bytes: responseBytes,
        expectedSha256Digest: responseDigest
      })
    );
    expect(registerSealedArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactClass: "provider_canonical_read",
        binding: { kind: "provider", providerAccount },
        retentionPolicyId: "canonical-payment",
        retentionPolicyVersion: "1"
      })
    );
  });
});

function input() {
  return {
    claim: {
      inboxItemId: "finance-webhook-inbox-1",
      inboxVersion: 2,
      expectedCheckpointSequence: 1,
      leaseFence: 1,
      providerAccount,
      receivingEnvironment: "sandbox" as const,
      webhookId,
      providerEventType: "payment.captured" as const,
      sealedWebhookArtifact: {
        artifactId: "arc-webhook:1",
        sha256Digest: `sha256:${"a".repeat(64)}` as const,
        byteLength: 10,
        contentType: "application/json" as const
      }
    },
    correlation: {
      externalId: "order-1",
      providerAccount,
      economicPaymentIntentId: "economic-payment-1",
      economicPaymentSessionId: "economic-session-1",
      expectedEconomicPaymentVersion: 2,
      expectedAmountMinor: "50000",
      expectedCurrency: "RUB" as const,
      operationEnvelope: {} as never
    },
    canonicalPayment: {
      providerPaymentId,
      externalId: "order-1",
      amountMinor: 50_000,
      capturedAmountMinor: 50_000,
      currency: "RUB" as const,
      status: "captured" as const,
      observedAt: "2026-08-05T12:01:00.000Z"
    },
    rawCanonicalResponseBytes: responseBytes
  };
}

function digestCanonicalCapture(): `sha256:${string}` {
  return digest(
    new TextEncoder().encode(
      JSON.stringify({
        kind: "arc_pay_client_order_captured_payment",
        schemaVersion: 1,
        providerAccount: {
          seriesId: providerAccount.seriesId,
          providerAccountId: providerAccount.providerAccountId,
          identityVersion: providerAccount.identityVersion
        },
        providerPaymentId,
        externalId: "order-1",
        amountMinor: "50000",
        currency: "RUB"
      })
    )
  );
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
