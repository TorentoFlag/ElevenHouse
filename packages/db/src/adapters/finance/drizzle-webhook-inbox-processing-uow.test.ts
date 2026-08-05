import { describe, expect, it } from "vitest";

import {
  WebhookInboxProcessingPersistenceError,
  normalizeVerifiedWebhookSemanticFactCommand
} from "./drizzle-webhook-inbox-processing-uow";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

describe("webhook inbox semantic processing command boundary", () => {
  it("accepts a canonical payment transition only when its session money facts are complete", () => {
    const normalized = normalizeVerifiedWebhookSemanticFactCommand({
      inboxItemId: "webhook-inbox-1",
      expectedInboxVersion: 2,
      expectedCheckpointSequence: 1,
      processorVersion: 1,
      semanticEvidence: {
        kind: "verified_webhook_semantic_evidence",
        providerAccount: {
          seriesId: "arc-sandbox",
          providerAccountId: "merchant-sandbox",
          identityVersion: 1
        },
        webhookId: "arc-event-1",
        semanticSourceKind: "payment_transition",
        semanticSourceId: "captured",
        economicPaymentIntentId: "economic-payment-1",
        economicPaymentSessionId: "economic-session-1",
        providerPaymentId: "arc-payment-1",
        amountMinor: "9600",
        currency: "RUB",
        purpose: "client_order",
        canonicalFactDigest: digest,
        artifact: { artifactId: "canonical-payment-1", sha256Digest: digest, byteLength: 512 },
        observedAt: "2026-08-05T00:00:00.000Z"
      } as never,
      operationEnvelope: {
        kind: "resolved_finance_operation_envelope",
        policyId: "webhook-processing",
        policyVersion: 1,
        policyDigest: digest,
        maximumRows: 1,
        maximumDecimalDigits: 38,
        maximumArtifactBytes: 4096
      } as never
    });
    expect(normalized).toMatchObject({
      inboxItemId: "webhook-inbox-1",
      expectedInboxVersion: 2,
      semanticEvidence: {
        semanticSourceKind: "payment_transition",
        amountMinor: 9600n,
        currency: "RUB"
      }
    });
  });

  it("rejects a payment transition that omits the provider payment identity", () => {
    expect(() =>
      normalizeVerifiedWebhookSemanticFactCommand({
        inboxItemId: "webhook-inbox-1",
        expectedInboxVersion: 2,
        expectedCheckpointSequence: 1,
        processorVersion: 1,
        semanticEvidence: {
          kind: "verified_webhook_semantic_evidence",
          providerAccount: {
            seriesId: "arc-sandbox",
            providerAccountId: "merchant-sandbox",
            identityVersion: 1
          },
          webhookId: "arc-event-1",
          semanticSourceKind: "payment_transition",
          semanticSourceId: "captured",
          economicPaymentIntentId: "economic-payment-1",
          economicPaymentSessionId: "economic-session-1",
          providerPaymentId: null,
          amountMinor: "9600",
          currency: "RUB",
          purpose: "client_order",
          canonicalFactDigest: digest,
          artifact: { artifactId: "canonical-payment-1", sha256Digest: digest, byteLength: 512 },
          observedAt: "2026-08-05T00:00:00.000Z"
        } as never,
        operationEnvelope: {
          kind: "resolved_finance_operation_envelope",
          policyId: "webhook-processing",
          policyVersion: 1,
          policyDigest: digest,
          maximumRows: 1,
          maximumDecimalDigits: 38,
          maximumArtifactBytes: 4096
        } as never
      })
    ).toThrow(WebhookInboxProcessingPersistenceError);
  });
});
