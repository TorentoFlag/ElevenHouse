import { createHash } from "node:crypto";

import {
  createFinanceOperationResourcePolicyDraft,
  createProviderAccountIdentityBinding,
  publishFinanceOperationResourcePolicyDraft
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";

import {
  CanonicalClientOrderChargebackProcessorError,
  createCanonicalClientOrderChargebackProcessor
} from "./canonical-client-order-chargeback.processor";

const providerAccount = createProviderAccountIdentityBinding({
  seriesId: "arc-sandbox",
  providerAccountId: "merchant-sandbox",
  identityVersion: 1
});
const webhookId = "11111111-1111-4111-8111-111111111111";
const providerPaymentId = "22222222-2222-4222-8222-222222222222";
const orderId = "44444444-4444-4444-8444-444444444444";
const rawWebhook = new TextEncoder().encode(
  JSON.stringify({
    event_id: webhookId,
    event_type: "payment.chargeback",
    environment: "sandbox",
    livemode: false,
    created_at: "2026-08-05T12:00:00.000Z",
    tenant_id: "55555555-5555-4555-8555-555555555555",
    data: { payment_id: providerPaymentId, amount: 50_000, currency: "RUB" }
  })
);
/**
 * `payment.chargeback` is an opening/hold fact in ArcPay's published contract.  A value that
 * looks like a terminal verdict but is not a documented canonical outcome must stay untrusted:
 * it cannot turn the provisional V2 case into a win or loss.
 */
const rawWebhookWithUntrustedTerminalHint = new TextEncoder().encode(
  JSON.stringify({
    event_id: webhookId,
    event_type: "payment.chargeback",
    environment: "sandbox",
    livemode: false,
    created_at: "2026-08-05T12:00:00.000Z",
    tenant_id: "55555555-5555-4555-8555-555555555555",
    data: {
      payment_id: providerPaymentId,
      amount: 50_000,
      currency: "RUB",
      resolution: "lost"
    }
  })
);
const canonicalBytes = new TextEncoder().encode(
  JSON.stringify({ id: providerPaymentId, external_id: orderId, status: "chargeback" })
);
const policy = publishFinanceOperationResourcePolicyDraft(
  createFinanceOperationResourcePolicyDraft({
    policyId: "chargeback-record-provisional",
    version: 1,
    operationKind: "chargeback_record_provisional",
    maximumRows: 50,
    maximumDecimalDigits: 38,
    maximumArtifactBytes: 1024 * 1024
  })
);

describe("canonical client-order chargeback inbox processor", () => {
  it("commits only a correlated provisional V2 provider loss", async () => {
    const calls: string[] = [];
    const harness = createHarness(calls);
    const processor = createCanonicalClientOrderChargebackProcessor(harness as never);

    await expect(processor.processOne()).resolves.toMatchObject({
      kind: "committed",
      inboxItemId: "finance-webhook-inbox-1"
    });
    expect(calls).toEqual([
      "claim",
      "load-webhook",
      "read-canonical",
      "resolve-correlation",
      "policy",
      "seal",
      "apply"
    ]);
    expect(harness.applied).toMatchObject({
      chargeback: {
        providerPaymentId,
        providerSource: { kind: "webhook_event_id", webhookEventId: webhookId },
        disputedPrincipalMinor: "50000"
      },
      semanticFact: {
        semanticEvidence: {
          semanticSourceKind: "chargeback",
          semanticSourceId: webhookId,
          economicPaymentSessionId: null,
          providerPaymentId: null,
          amountMinor: null,
          currency: null
        }
      }
    });
  });

  it("retries when the canonical payment has not reached chargeback state", async () => {
    const calls: string[] = [];
    const harness = createHarness(calls, { canonicalStatus: "captured" });
    const processor = createCanonicalClientOrderChargebackProcessor(harness as never);

    await expect(processor.processOne()).rejects.toMatchObject({
      code: "canonical_client_order_chargeback_processor_error",
      reason: "canonical_chargeback_not_confirmed"
    } satisfies Partial<CanonicalClientOrderChargebackProcessorError>);
    expect(calls).toEqual([
      "claim",
      "load-webhook",
      "read-canonical",
      "resolve-correlation",
      "record-failure"
    ]);
    expect(harness.applied).toBeUndefined();
  });

  it("keeps an ArcPay chargeback provisional when transport includes an undocumented terminal hint", async () => {
    const calls: string[] = [];
    const harness = createHarness(calls, { rawWebhook: rawWebhookWithUntrustedTerminalHint });
    const processor = createCanonicalClientOrderChargebackProcessor(harness as never);

    await expect(processor.processOne()).resolves.toMatchObject({
      kind: "committed",
      effect: "applied_once"
    });
    expect(calls).toEqual([
      "claim",
      "load-webhook",
      "read-canonical",
      "resolve-correlation",
      "policy",
      "seal",
      "apply"
    ]);
    expect(harness.applied).toMatchObject({
      chargeback: {
        providerSource: { kind: "webhook_event_id", webhookEventId: webhookId }
      }
    });
    expect(harness.applied).not.toHaveProperty("resolutionAuthority");
  });
});

function createHarness(
  calls: string[],
  options: Readonly<{
    canonicalStatus?: "chargeback" | "captured";
    rawWebhook?: Uint8Array;
  }> = {}
) {
  let applied: unknown;
  const claimedWebhook = options.rawWebhook ?? rawWebhook;
  const claim = {
    inboxItemId: "finance-webhook-inbox-1",
    inboxVersion: 2,
    expectedCheckpointSequence: 1,
    leaseFence: 1,
    providerAccount,
    webhookId,
    providerEventType: "payment.chargeback" as const,
    sealedWebhookArtifact: {
      artifactId: "arc-webhook:1",
      sha256Digest: digest(claimedWebhook),
      byteLength: claimedWebhook.byteLength,
      contentType: "application/json" as const
    }
  };
  return {
    claims: {
      async claimNextChargebackClientOrderWebhook() {
        calls.push("claim");
        return claim;
      },
      async recordFailure() {
        calls.push("record-failure");
      }
    },
    webhookArtifacts: {
      async loadClaimedWebhookBytes() {
        calls.push("load-webhook");
        return claimedWebhook;
      }
    },
    canonicalPayments: {
      async readPaymentOutcomeById() {
        calls.push("read-canonical");
        return {
          payment: {
            providerPaymentId,
            externalId: orderId,
            amountMinor: 50_000,
            capturedAmountMinor: 50_000,
            currency: "RUB" as const,
            status: options.canonicalStatus ?? ("chargeback" as const),
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
    policies: {
      async findPublishedForOperation() {
        calls.push("policy");
        return policy;
      }
    },
    evidence: {
      async sealCanonicalChargeback() {
        calls.push("seal");
        return {
          kind: "verified_webhook_semantic_evidence",
          providerAccount,
          webhookId,
          semanticSourceKind: "chargeback",
          semanticSourceId: webhookId,
          economicPaymentIntentId: "economic-payment-1",
          economicPaymentSessionId: null,
          providerPaymentId: null,
          amountMinor: null,
          currency: null,
          purpose: "client_order",
          canonicalFactDigest: digest(canonicalBytes),
          artifact: { artifactId: "canonical:chargeback", sha256Digest: digest(canonicalBytes), byteLength: canonicalBytes.byteLength },
          observedAt: "2026-08-05T12:01:00.000Z"
        };
      }
    },
    application: {
      async applyVerifiedOnlineWalletChargebackNotice(value: unknown) {
        calls.push("apply");
        applied = value;
        return { effect: "applied_once" as const };
      }
    },
    processorVersion: 1,
    get applied() {
      return applied;
    }
  };
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
