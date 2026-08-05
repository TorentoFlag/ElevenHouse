import { createProviderAccountIdentityBinding } from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";

import {
  createVerifiedArcPayWebhookIngressEvidence,
  VerifiedArcPayWebhookIngressEvidenceError
} from "./verified-arc-pay-webhook-ingress";

const providerAccount = createProviderAccountIdentityBinding({
  seriesId: "arc-pay-main",
  providerAccountId: "merchant-sandbox",
  identityVersion: 1
});

describe("verified ArcPay webhook ingress evidence", () => {
  it("issues branded ingress authority only for one verified, environment-matched sealed transport", () => {
    const evidence = createVerifiedArcPayWebhookIngressEvidence({
      signature: {
        kind: "verified",
        webhookId: "11111111-1111-4111-8111-111111111111",
        signedTimestamp: "2026-08-04T12:00:00.000Z",
        signatureEvidenceDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      transport: {
        providerWebhookId: "11111111-1111-4111-8111-111111111111",
        providerEventType: "payment.captured",
        merchantTenantId: "22222222-2222-4222-8222-222222222222",
        environment: "sandbox",
        occurredAt: "2026-08-04T12:00:00.000Z"
      },
      providerAccount,
      expectedEnvironment: "sandbox",
      sealedPayloadRef: "provider-webhook:11111111-1111-4111-8111-111111111111",
      rawBody: new TextEncoder().encode('{"event_type":"payment.captured"}'),
      webhookSigningKeyVersionId: "arc-pay-webhook-key:2026-08",
      verifiedAt: "2026-08-04T12:00:01.000Z",
      receivedAt: "2026-08-04T12:00:01.000Z"
    });

    expect(evidence).toMatchObject({
      kind: "verified_webhook_ingress_evidence",
      provider: "arc_pay",
      providerAccount,
      receivingEnvironment: "sandbox",
      webhookId: "11111111-1111-4111-8111-111111111111",
      providerEventType: "payment.captured",
      rawBodyDigest: "sha256:c82dfac6eb8bdab58339d62b86501e62027251bcbdf9e1ba5e4f7951f8e17fb3",
      sealedPayloadRef: "provider-webhook:11111111-1111-4111-8111-111111111111",
      signatureScheme: "arc_pay_hmac_sha256_v1",
      verifierContractVersion: "arc_pay_webhook_ingress_v1",
      webhookSigningKeyVersionId: "arc-pay-webhook-key:2026-08",
      signedTimestamp: "2026-08-04T12:00:00.000Z",
      signatureEvidenceDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
  });

  it("refuses to issue evidence when a signed transport is for a different environment", () => {
    try {
      createVerifiedArcPayWebhookIngressEvidence({
        signature: {
          kind: "verified",
          webhookId: "11111111-1111-4111-8111-111111111111",
          signedTimestamp: "2026-08-04T12:00:00.000Z",
          signatureEvidenceDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        transport: {
          providerWebhookId: "11111111-1111-4111-8111-111111111111",
          providerEventType: "payment.captured",
          merchantTenantId: "22222222-2222-4222-8222-222222222222",
          environment: "live",
          occurredAt: "2026-08-04T12:00:00.000Z"
        },
        providerAccount,
        expectedEnvironment: "sandbox",
        sealedPayloadRef: "provider-webhook:11111111-1111-4111-8111-111111111111",
        rawBody: new TextEncoder().encode('{"event_type":"payment.captured"}'),
        webhookSigningKeyVersionId: "arc-pay-webhook-key:2026-08",
        verifiedAt: "2026-08-04T12:00:01.000Z",
        receivedAt: "2026-08-04T12:00:01.000Z"
      });
      throw new Error("Expected environment mismatch");
    } catch (error) {
      expect(error).toBeInstanceOf(VerifiedArcPayWebhookIngressEvidenceError);
      expect(error).toMatchObject({ reason: "environment" });
    }
  });
});
