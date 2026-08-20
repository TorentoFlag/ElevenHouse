import { describe, expect, it } from "vitest";

import type { ClientOrderHostedCheckoutCaptureReconciliationCandidate } from "@elevenhouse/domain/finance-core";

import { createClientOrderHostedCheckoutCaptureReconciliationProcessor } from "./client-order-hosted-checkout-capture-reconciliation-processor";

describe("client-order hosted checkout capture reconciliation processor", () => {
  it("commits an exact captured ArcPay payment through provider canonical read evidence", async () => {
    const candidate = candidateFixture();
    const observed: string[] = [];
    const processor = createClientOrderHostedCheckoutCaptureReconciliationProcessor({
      batchSize: 10,
      candidates: {
        async listPendingClientOrderHostedCheckoutCandidates() {
          observed.push("list-candidates");
          return [candidate];
        }
      },
      canonicalPayments: {
        async listCapturedPayments(input) {
          observed.push(`list-provider:${input.expectedExternalId}:${input.expectedAmountMinor}`);
          expect(input.expectedExternalId).toBe(candidate.correlation.externalId);
          expect(input.expectedAmountMinor).toBe(1000);
          expect(input.expectedCurrency).toBe("RUB");
          return {
            payments: [
              {
                providerPaymentId: "01a01f3f-0332-7979-8b7f-8ecedf247071",
                externalId: candidate.correlation.externalId,
                amountMinor: 1000,
                capturedAmountMinor: 1000,
                currency: "RUB",
                status: "captured",
                observedAt: "2026-08-20T12:57:13.331Z"
              }
            ]
          };
        },
        async readCapturedPayment(input) {
          observed.push(`read-provider:${input.providerPaymentId}`);
          expect(input.expectedExternalId).toBe(candidate.correlation.externalId);
          return {
            payment: {
              providerPaymentId: input.providerPaymentId,
              externalId: candidate.correlation.externalId,
              amountMinor: 1000,
              capturedAmountMinor: 1000,
              currency: "RUB",
              status: "captured",
              observedAt: "2026-08-20T12:57:13.331Z"
            },
            rawResponseBytes: new TextEncoder().encode('{"status":"captured"}')
          };
        }
      },
      evidence: {
        async sealCanonicalCaptureFromProviderRead(input) {
          observed.push(`seal:${input.canonicalPayment.providerPaymentId}`);
          expect(input.correlation).toBe(candidate.correlation);
          return {
            kind: "verified_webhook_semantic_evidence",
            sourceDelivery: "provider_canonical_read",
            providerAccount: candidate.correlation.providerAccount,
            webhookId: null,
            semanticSourceKind: "payment_transition",
            semanticSourceId: `captured-provider-payment:${input.canonicalPayment.providerPaymentId}`,
            economicPaymentIntentId: candidate.correlation.economicPaymentIntentId,
            economicPaymentSessionId: candidate.correlation.economicPaymentSessionId,
            providerPaymentId: input.canonicalPayment.providerPaymentId,
            amountMinor: "1000",
            currency: "RUB",
            purpose: "client_order",
            canonicalFactDigest:
              "sha256:1111111111111111111111111111111111111111111111111111111111111111",
            artifact: {
              artifactId: "arc-canonical-payment:01a01f3f-0332-7979-8b7f-8ecedf247071",
              sha256Digest:
                "sha256:2222222222222222222222222222222222222222222222222222222222222222",
              byteLength: 21
            },
            observedAt: "2026-08-20T12:57:13.331Z"
          } as never;
        }
      },
      commit: {
        async commitCapturedClientOrderFromProviderRead(input) {
          observed.push(`commit:${input.semanticEvidence.sourceDelivery}`);
          expect(input.correlation).toBe(candidate.correlation);
          expect(input.semanticEvidence.webhookId).toBeNull();
          return { effect: "applied_once" };
        }
      }
    });

    await expect(processor.tick()).resolves.toEqual({
      scanned: 1,
      awaitingProvider: 0,
      committed: 1,
      replayed: 0
    });
    expect(observed).toEqual([
      "list-candidates",
      `list-provider:${candidate.correlation.externalId}:1000`,
      "read-provider:01a01f3f-0332-7979-8b7f-8ecedf247071",
      "seal:01a01f3f-0332-7979-8b7f-8ecedf247071",
      "commit:provider_canonical_read"
    ]);
  });

  it("leaves a pending checkout untouched when ArcPay has no exact captured payment", async () => {
    const processor = createClientOrderHostedCheckoutCaptureReconciliationProcessor({
      batchSize: 1,
      candidates: {
        async listPendingClientOrderHostedCheckoutCandidates() {
          return [candidateFixture()];
        }
      },
      canonicalPayments: {
        async listCapturedPayments() {
          return { payments: [] };
        },
        async readCapturedPayment() {
          throw new Error("must not read without an exact list match");
        }
      },
      evidence: {
        async sealCanonicalCaptureFromProviderRead() {
          throw new Error("must not seal without a captured payment");
        }
      },
      commit: {
        async commitCapturedClientOrderFromProviderRead() {
          throw new Error("must not commit without a captured payment");
        }
      }
    });

    await expect(processor.tick()).resolves.toEqual({
      scanned: 1,
      awaitingProvider: 1,
      committed: 0,
      replayed: 0
    });
  });
});

function candidateFixture(): ClientOrderHostedCheckoutCaptureReconciliationCandidate {
  return {
    correlation: {
      externalId: "4a15078e-aae9-4081-ab6f-243eb096650c",
      providerAccount: {
        seriesId: "arc-pay-sandbox",
        providerAccountId: "arc-pay-sandbox-primary-identity-1",
        identityVersion: 1
      },
      economicPaymentIntentId: "client-order-intent:26fe625a-6e85-5776-9b44-018ea8316ea1",
      economicPaymentSessionId: "client-order-session:647a0ae6-b122-58b6-a4f6-97ffdb74c706",
      expectedEconomicPaymentVersion: 2,
      expectedAmountMinor: "1000",
      expectedCurrency: "RUB",
      operationEnvelope: {
        kind: "resolved_finance_operation_envelope",
        policyId: "finance-operation-resource-policy",
        policyVersion: 1,
        policyDigest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
        maximumRows: 100,
        maximumDecimalDigits: 38,
        maximumArtifactBytes: 2_097_152
      } as never
    }
  };
}
