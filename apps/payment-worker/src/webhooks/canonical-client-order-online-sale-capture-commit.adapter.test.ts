import {
  createCapturedProviderPaymentSemanticSourceId,
  createProviderAccountIdentityBinding
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it } from "vitest";

import { createCanonicalClientOrderOnlineSaleCaptureCommitAdapter } from "./canonical-client-order-online-sale-capture-commit.adapter";

describe("canonical client-order online-sale capture commit adapter", () => {
  it("forwards sealed semantic evidence through one v2 composite UoW without a v1 financial mutation", async () => {
    const providerAccount = createProviderAccountIdentityBinding({
      seriesId: "arc-sandbox",
      providerAccountId: "merchant-sandbox",
      identityVersion: 1
    });
    let received: unknown;
    const commit = createCanonicalClientOrderOnlineSaleCaptureCommitAdapter({
      processorVersion: 1,
      capture: {
        async applyCanonicalOnlineSaleCapture(command: unknown) {
          received = command;
          return {
            kind: "canonical_online_sale_capture_commit_receipt",
            effect: "applied_once",
            semanticCommitReceipt: { kind: "webhook_semantic_commit_receipt" },
            captureReceipt: { kind: "online_sale_capture_receipt", schemaVersion: 2 }
          } as never;
        }
      }
    });

    await expect(
      commit.commitCapturedClientOrder({
        claim: {
          inboxItemId: "inbox-1",
          inboxVersion: 3,
          expectedCheckpointSequence: 7,
          leaseFence: 2,
          providerAccount,
          receivingEnvironment: "sandbox",
          webhookId: "webhook-1",
          providerEventType: "payment.captured",
          sealedWebhookArtifact: {
            artifactId: "webhook-artifact-1",
            sha256Digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            byteLength: 10,
            contentType: "application/json"
          }
        },
        correlation: {
          externalId: "order-1",
          providerAccount,
          economicPaymentIntentId: "intent-1",
          economicPaymentSessionId: "session-1",
          expectedEconomicPaymentVersion: 4,
          expectedAmountMinor: "50000",
          expectedCurrency: "RUB",
          operationEnvelope: { kind: "resolved_finance_operation_envelope" } as never
        },
        semanticEvidence: {
          kind: "verified_webhook_semantic_evidence",
          providerAccount,
          webhookId: "webhook-1",
          semanticSourceKind: "payment_transition",
          semanticSourceId: createCapturedProviderPaymentSemanticSourceId("payment-1"),
          economicPaymentIntentId: "intent-1",
          economicPaymentSessionId: "session-1",
          providerPaymentId: "payment-1",
          amountMinor: "50000",
          currency: "RUB",
          purpose: "client_order",
          canonicalFactDigest:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          artifact: {
            artifactId: "canonical-artifact-1",
            sha256Digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            byteLength: 10
          },
          observedAt: "2026-08-05T12:00:00.000Z"
        } as never
      })
    ).resolves.toEqual({ effect: "applied_once" });

    expect(received).toMatchObject({
      semanticFact: {
        inboxItemId: "inbox-1",
        expectedInboxVersion: 3,
        expectedCheckpointSequence: 7,
        processorVersion: 1
      },
      capture: {
        economicPaymentIntentId: "intent-1",
        expectedEconomicPaymentVersion: 4,
        operationEnvelope: { kind: "resolved_finance_operation_envelope" }
      }
    });
    expect(received).not.toHaveProperty("financialMutation");
    expect((received as { capture: object }).capture).not.toHaveProperty("financialMutation");
  });
});
