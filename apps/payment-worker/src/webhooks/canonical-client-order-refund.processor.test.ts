import { createHash } from "node:crypto";

import {
  createFinanceOperationResourcePolicyDraft,
  createProviderAccountIdentityBinding,
  publishFinanceOperationResourcePolicyDraft
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";

import {
  CanonicalClientOrderRefundProcessorError,
  createCanonicalClientOrderRefundProcessor
} from "./canonical-client-order-refund.processor";

const providerAccount = createProviderAccountIdentityBinding({
  seriesId: "arc-sandbox",
  providerAccountId: "merchant-sandbox",
  identityVersion: 1
});
const webhookId = "11111111-1111-4111-8111-111111111111";
const providerPaymentId = "22222222-2222-4222-8222-222222222222";
const providerRefundId = "33333333-3333-4333-8333-333333333333";
const orderId = "44444444-4444-4444-8444-444444444444";
const rawWebhook = new TextEncoder().encode(
  JSON.stringify({
    event_id: webhookId,
    event_type: "payment.refunded",
    environment: "sandbox",
    livemode: false,
    created_at: "2026-08-05T12:00:00.000Z",
    tenant_id: "55555555-5555-4555-8555-555555555555",
    data: {
      payment_id: providerPaymentId,
      refund_id: providerRefundId,
      refund_amount: 5_000,
      total_refunded: 5_000,
      currency: "RUB"
    }
  })
);
const canonicalBytes = new TextEncoder().encode(
  JSON.stringify({ id: providerPaymentId, external_id: orderId, refunded_amount: 5_000 })
);
const refundExecutePolicy = publishFinanceOperationResourcePolicyDraft(
  createFinanceOperationResourcePolicyDraft({
    policyId: "refund-execute",
    version: 1,
    operationKind: "refund_execute",
    maximumRows: 50,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 1024 * 1024
  })
);

describe("canonical client-order refund inbox processor", () => {
  it("settles the exact approved refund case rather than re-planning live wallet sources", async () => {
    const calls: string[] = [];
    const harness = createHarness(calls);
    const processor = createCanonicalClientOrderRefundProcessor(harness as never);

    await expect(processor.processOne()).resolves.toMatchObject({
      kind: "committed",
      inboxItemId: "finance-webhook-inbox-1"
    });
    expect(calls).toEqual([
      "claim",
      "load-webhook",
      "read-untrusted",
      "resolve-correlation",
      "position",
      "approved-case",
      "policy",
      "read-correlated",
      "seal",
      "terminal"
    ]);
    expect(harness.terminalCommand).toMatchObject({
      refundCaseId: "online-wallet-refund:case-1",
      providerPaymentId,
      providerRefundId,
      previousCumulativeRefundedMinor: "0",
      cumulativeRefundedMinor: "5000",
      semanticFact: {
        inboxItemId: "finance-webhook-inbox-1",
        semanticEvidence: {
          semanticSourceKind: "refund",
          semanticSourceId: providerRefundId,
          providerPaymentId: null,
          amountMinor: null,
          currency: null
        }
      }
    });
  });

  it("records a retryable canonical-read failure without sealing evidence or applying refund", async () => {
    const calls: string[] = [];
    const harness = createHarness(calls, { canonicalReadFails: true });
    const processor = createCanonicalClientOrderRefundProcessor(harness as never);

    await expect(processor.processOne()).rejects.toMatchObject({
      code: "canonical_client_order_refund_processor_error",
      reason: "canonical_read_unavailable"
    } satisfies Partial<CanonicalClientOrderRefundProcessorError>);
    expect(calls).toEqual(["claim", "load-webhook", "read-untrusted", "record-failure"]);
    expect(harness.failure).toMatchObject({
      errorClass: "canonical_provider_read_unavailable"
    });
    expect(harness.terminalCommand).toBeUndefined();
  });

  it("retries a provider refund that is still in flight without sealing evidence or applying money", async () => {
    const calls: string[] = [];
    const harness = createHarness(calls, { refundStatus: "in_flight" });
    const processor = createCanonicalClientOrderRefundProcessor(harness as never);

    await expect(processor.processOne()).rejects.toMatchObject({
      code: "canonical_client_order_refund_processor_error",
      reason: "canonical_refund_not_succeeded"
    } satisfies Partial<CanonicalClientOrderRefundProcessorError>);
    expect(calls).toEqual([
      "claim",
      "load-webhook",
      "read-untrusted",
      "resolve-correlation",
      "position",
      "approved-case",
      "policy",
      "read-correlated",
      "record-failure"
    ]);
    expect(harness.failure).toMatchObject({
      errorClass: "canonical_provider_read_unavailable"
    });
    expect(harness.terminalCommand).toBeUndefined();
  });
});

function createHarness(
  calls: string[],
  options: Readonly<{
    canonicalReadFails?: boolean;
    refundStatus?: "succeeded" | "failed" | "in_flight" | "unknown";
  }> = {}
) {
  let terminalCommand: unknown;
  let failure: unknown;
  const claim = {
    inboxItemId: "finance-webhook-inbox-1",
    inboxVersion: 2,
    expectedCheckpointSequence: 1,
    leaseFence: 1,
    providerAccount,
    webhookId,
    providerEventType: "payment.refunded" as const,
    sealedWebhookArtifact: {
      artifactId: "arc-webhook:1",
      sha256Digest: digest(rawWebhook),
      byteLength: rawWebhook.byteLength,
      contentType: "application/json" as const
    }
  };
  return {
    claims: {
      async claimNextRefundedClientOrderWebhook() {
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
            status: "refunded" as const,
            observedAt: "2026-08-05T12:01:00.000Z"
          },
          rawResponseBytes: canonicalBytes
        };
      },
      async readRefundOutcome() {
        calls.push("read-correlated");
        return {
          refund: {
            providerPaymentId,
            externalId: orderId,
            providerRefundId,
            amountMinor: 5_000,
            cumulativeRefundedMinor: 5_000,
            currency: "RUB" as const,
            status: options.refundStatus ?? ("succeeded" as const),
            observedAt: "2026-08-05T12:01:00.000Z"
          },
          rawResponseBytes: canonicalBytes
        };
      }
    },
    correlations: {
      async resolveCapturedClientOrder() {
        calls.push("resolve-correlation");
        return {
          externalId: orderId,
          providerAccount,
          economicPaymentIntentId: "economic-payment-1",
          economicPaymentSessionId: "economic-session-1",
          expectedEconomicPaymentVersion: 2,
          expectedAmountMinor: "50000",
          expectedCurrency: "RUB" as const,
          operationEnvelope: {} as never
        };
      }
    },
    positions: {
      async findRefundPosition() {
        calls.push("position");
        return { economicPaymentIntentId: "economic-payment-1", previousCumulativeRefundedMinor: "0" };
      }
    },
    refundCases: {
      async findApprovedRefundCase() {
        calls.push("approved-case");
        return { refundCaseId: "online-wallet-refund:case-1" };
      }
    },
    policies: {
      async findPublishedForOperation() {
        calls.push("policy");
        return refundExecutePolicy;
      }
    },
    evidence: {
      async sealCanonicalRefund() {
        calls.push("seal");
        return {
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
          canonicalFactDigest: digest(canonicalBytes),
          artifact: {
            artifactId: "canonical-refund:1",
            sha256Digest: digest(canonicalBytes),
            byteLength: canonicalBytes.byteLength
          },
          observedAt: "2026-08-05T12:01:00.000Z"
        } as never;
      }
    },
    terminal: {
      async applyCanonicalApprovedOnlineWalletRefund(value: unknown) {
        calls.push("terminal");
        terminalCommand = value;
        return { effect: "applied_once" as const };
      }
    },
    get terminalCommand() {
      return terminalCommand;
    },
    get failure() {
      return failure;
    }
  };
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
