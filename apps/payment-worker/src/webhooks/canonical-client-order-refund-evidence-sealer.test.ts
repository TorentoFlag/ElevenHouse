import { createHash } from "node:crypto";

import { createProviderAccountIdentityBinding } from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import { createCanonicalClientOrderRefundEvidenceSealer } from "./canonical-client-order-refund-evidence-sealer";

const providerAccount = createProviderAccountIdentityBinding({
  seriesId: "arc-sandbox",
  providerAccountId: "merchant-sandbox",
  identityVersion: 1
});
const webhookId = "11111111-1111-4111-8111-111111111111";
const providerPaymentId = "22222222-2222-4222-8222-222222222222";
const providerRefundId = "33333333-3333-4333-8333-333333333333";
const responseBytes = new TextEncoder().encode(
  JSON.stringify({ id: providerPaymentId, refunded_amount: 5_000, operations: [] })
);
const responseDigest = digest(responseBytes);

describe("canonical client-order refund evidence sealer", () => {
  it("seals exact canonical bytes and emits only refund-scoped semantic evidence", async () => {
    const writeImmutable = vi.fn(async ({ artifactId }: { artifactId: string }) => ({
      privateObjectKey: `finance/artifacts/${artifactId}.json`,
      privateObjectVersion: "v1",
      envelopeKeyVersion: "kms-v1",
      sha256Digest: responseDigest,
      byteLength: responseBytes.byteLength,
      contentType: "application/json"
    }));
    const registerSealedArtifact = vi.fn(async ({ artifact }: { artifact: unknown }) => artifact);
    const sealer = createCanonicalClientOrderRefundEvidenceSealer({
      privateObjectStorage: { writeImmutable } as never,
      artifactRegistry: { registerSealedArtifact } as never,
      retention: { policyId: "canonical-refund", policyVersion: "1" }
    });

    await expect(sealer.sealCanonicalRefund(input())).resolves.toMatchObject({
      kind: "verified_webhook_semantic_evidence",
      providerAccount,
      webhookId,
      semanticSourceKind: "refund",
      semanticSourceId: providerRefundId,
      economicPaymentIntentId: "economic-payment-1",
      economicPaymentSessionId: null,
      providerPaymentId: null,
      amountMinor: null,
      currency: null,
      purpose: "client_order",
      canonicalFactDigest: digestCanonicalRefund(),
      observedAt: "2026-08-05T12:01:00.000Z",
      artifact: {
        artifactId: expect.stringMatching(/^arc-canonical-refund:/),
        sha256Digest: responseDigest,
        byteLength: responseBytes.byteLength
      }
    });
    expect(writeImmutable).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: expect.stringMatching(/^arc-canonical-refund:/),
        contentType: "application/json",
        bytes: responseBytes,
        expectedSha256Digest: responseDigest
      })
    );
    expect(registerSealedArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactClass: "provider_canonical_read",
        binding: { kind: "provider", providerAccount },
        retentionPolicyId: "canonical-refund",
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
      webhookId,
      providerEventType: "payment.refunded" as const,
      sealedWebhookArtifact: {
        artifactId: "arc-webhook:1",
        sha256Digest: `sha256:${"a".repeat(64)}` as const,
        byteLength: 10,
        contentType: "application/json" as const
      }
    },
    economicPaymentIntentId: "economic-payment-1",
    providerPaymentId,
    providerRefundId,
    refundDeltaMinor: 5_000,
    previousCumulativeRefundedMinor: 0,
    cumulativeRefundedMinor: 5_000,
    observedAt: "2026-08-05T12:01:00.000Z",
    rawCanonicalResponseBytes: responseBytes
  };
}

function digestCanonicalRefund(): `sha256:${string}` {
  return digest(
    new TextEncoder().encode(
      JSON.stringify({
        kind: "arc_pay_client_order_refund",
        schemaVersion: 1,
        providerAccount: {
          seriesId: providerAccount.seriesId,
          providerAccountId: providerAccount.providerAccountId,
          identityVersion: providerAccount.identityVersion
        },
        economicPaymentIntentId: "economic-payment-1",
        providerPaymentId,
        providerRefundId,
        refundDeltaMinor: "5000",
        previousCumulativeRefundedMinor: "0",
        cumulativeRefundedMinor: "5000",
        currency: "RUB"
      })
    )
  );
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
