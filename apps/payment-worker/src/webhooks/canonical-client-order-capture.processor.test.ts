import { createHash } from "node:crypto";

import {
  createCapturedProviderPaymentSemanticSourceId,
  createProviderAccountIdentityBinding
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";

import {
  CanonicalClientOrderCaptureProcessorError,
  createCanonicalClientOrderCaptureProcessor
} from "./canonical-client-order-capture.processor";

const providerAccount = createProviderAccountIdentityBinding({
  seriesId: "arc-sandbox",
  providerAccountId: "merchant-sandbox",
  identityVersion: 1
});
const webhookId = "11111111-1111-4111-8111-111111111111";
const providerPaymentId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const rawWebhook = new TextEncoder().encode(
  JSON.stringify({
    event_id: webhookId,
    event_type: "payment.captured",
    environment: "sandbox",
    livemode: false,
    created_at: "2026-08-05T12:00:00.000Z",
    tenant_id: "44444444-4444-4444-8444-444444444444",
    data: {
      payment_id: providerPaymentId,
      amount: 50_000,
      captured_amount: 50_000,
      currency: "RUB"
    }
  })
);
const canonicalBytes = new TextEncoder().encode(
  JSON.stringify({ id: providerPaymentId, external_id: orderId })
);

describe("canonical client-order capture inbox processor", () => {
  it("uses a non-mutating canonical lookup only to resolve correlation, then commits only the second correlated capture", async () => {
    const calls: string[] = [];
    const harness = createHarness(calls);
    const processor = createCanonicalClientOrderCaptureProcessor(harness as never);

    await expect(processor.processOne()).resolves.toEqual({
      kind: "committed",
      effect: "applied_once",
      inboxItemId: "finance-webhook-inbox-1"
    });

    expect(calls).toEqual([
      "claim",
      "load-webhook",
      "read-untrusted",
      "resolve-correlation",
      "read-correlated",
      "seal",
      "commit"
    ]);
    expect(harness.committed).toMatchObject({
      correlation: {
        economicPaymentIntentId: "economic-payment-1",
        economicPaymentSessionId: "economic-session-1",
        expectedAmountMinor: "50000",
        expectedCurrency: "RUB"
      },
      semanticEvidence: {
        semanticSourceKind: "payment_transition",
        providerPaymentId,
        amountMinor: "50000",
        currency: "RUB"
      }
    });
  });

  it("records a retryable canonical-read failure without sealing evidence or applying capture", async () => {
    const calls: string[] = [];
    const harness = createHarness(calls, { canonicalReadFails: true });
    const processor = createCanonicalClientOrderCaptureProcessor(harness as never);

    await expect(processor.processOne()).rejects.toMatchObject({
      code: "canonical_client_order_capture_processor_error",
      reason: "canonical_read_unavailable"
    } satisfies Partial<CanonicalClientOrderCaptureProcessorError>);

    expect(calls).toEqual(["claim", "load-webhook", "read-untrusted", "record-failure"]);
    expect(harness.failure).toMatchObject({
      errorClass: "canonical_provider_read_unavailable"
    });
    expect(harness.committed).toBeUndefined();
  });
});

function createHarness(calls: string[], options: Readonly<{ canonicalReadFails?: boolean }> = {}) {
  let committed: unknown;
  let failure: unknown;
  const claim = {
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
      sha256Digest: digest(rawWebhook),
      byteLength: rawWebhook.byteLength,
      contentType: "application/json" as const
    }
  };
  const correlation = {
    externalId: orderId,
    providerAccount,
    economicPaymentIntentId: "economic-payment-1",
    economicPaymentSessionId: "economic-session-1",
    expectedEconomicPaymentVersion: 2,
    expectedAmountMinor: "50000",
    expectedCurrency: "RUB" as const,
    operationEnvelope: { kind: "resolved_finance_operation_envelope" }
  };
  return {
    claims: {
      async claimNextCapturedClientOrderWebhook() {
        calls.push("claim");
        return claim;
      },
      async recordFailure(value: unknown) {
        calls.push("record-failure");
        failure = value;
      }
    },
    webhookArtifacts: {
      async loadClaimedWebhookBytes() {
        calls.push("load-webhook");
        return rawWebhook;
      }
    },
    canonicalPayments: {
      async readPaymentOutcomeById() {
        calls.push("read-untrusted");
        if (options.canonicalReadFails) {
          throw Object.assign(new Error("Arc unavailable"), {
            code: "ARC_PAY_CANONICAL_PAYMENT_READER_ERROR",
            reason: "transport"
          });
        }
        return {
          payment: {
            providerPaymentId,
            externalId: orderId,
            amountMinor: 50_000,
            capturedAmountMinor: 50_000,
            currency: "RUB" as const,
            status: "captured" as const,
            observedAt: "2026-08-05T12:01:00.000Z"
          },
          rawResponseBytes: canonicalBytes
        };
      },
      async readCapturedPayment() {
        calls.push("read-correlated");
        return {
          payment: {
            providerPaymentId,
            externalId: orderId,
            amountMinor: 50_000,
            capturedAmountMinor: 50_000,
            currency: "RUB" as const,
            status: "captured" as const,
            observedAt: "2026-08-05T12:01:00.000Z"
          },
          rawResponseBytes: canonicalBytes
        };
      }
    },
    correlations: {
      async resolveCapturedClientOrder() {
        calls.push("resolve-correlation");
        return correlation;
      }
    },
    evidence: {
      async sealCanonicalCapture() {
        calls.push("seal");
        return {
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
          canonicalFactDigest: digest(canonicalBytes),
          artifact: {
            artifactId: "canonical-payment:1",
            sha256Digest: digest(canonicalBytes),
            byteLength: canonicalBytes.byteLength
          },
          observedAt: "2026-08-05T12:01:00.000Z"
        } as never;
      }
    },
    commit: {
      async commitCapturedClientOrder(value: unknown) {
        calls.push("commit");
        committed = value;
        return { effect: "applied_once" as const };
      }
    },
    get committed() {
      return committed;
    },
    get failure() {
      return failure;
    }
  };
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
