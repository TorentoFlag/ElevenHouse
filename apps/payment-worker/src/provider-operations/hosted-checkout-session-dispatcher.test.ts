import { createHash } from "node:crypto";

import {
  createFiscalChargeSnapshot,
  createFiscalProfile,
  digestFinanceCanonicalValueV1,
  type ClientCheckoutProviderTransportUnknownUnitOfWork,
  type ProviderOperationDispatchWorkItem
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import { ArcPayCheckoutSessionClientError } from "../arc-pay/arc-pay-checkout-session-client";
import { createHostedCheckoutSessionDispatcher } from "./hosted-checkout-session-dispatcher";

const providerOperationIntentId = "20000000-0000-4000-8000-000000000002";
const economicPaymentIntentId = "40000000-0000-4000-8000-000000000004";
const economicPaymentSessionId = "50000000-0000-4000-8000-000000000005";

describe("hosted checkout session dispatcher", () => {
  it("fences a transport-indeterminate HPP request instead of rethrowing it for blind retry", async () => {
    const envelope = checkoutEnvelope();
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    const markTransportUnknown = vi.fn(async () => undefined);
    const transportUnknown = {
      markClientCheckoutProviderTransportUnknown: markTransportUnknown
    } as unknown as ClientCheckoutProviderTransportUnknownUnitOfWork;
    const sessionResult = { completeClientCheckoutSession: vi.fn() };
    const checkoutClient = {
      createHostedCheckout: vi.fn(async () => {
        throw new ArcPayCheckoutSessionClientError("transport");
      })
    };
    const dispatcher = createHostedCheckoutSessionDispatcher({
      privateObjectStorage: {
        readImmutable: vi.fn(async () => ({
          contentType: "application/json",
          sha256Digest: digest(bytes),
          byteLength: bytes.byteLength,
          bytes
        })),
        writeImmutable: vi.fn(),
        deleteImmutable: vi.fn()
      },
      artifactRegistry: { registerSealedArtifact: vi.fn() },
      checkoutClient,
      sessionResult,
      transportUnknown,
      responseArtifactRetention: { policyId: "provider-response", policyVersion: "1" }
    });

    await expect(dispatcher.dispatch(workItem(envelope, bytes))).resolves.toBeUndefined();

    expect(markTransportUnknown).toHaveBeenCalledWith({
      economicPaymentIntentId,
      expectedEconomicPaymentVersion: 1,
      providerOperationIntentId,
      expectedProviderOperationIntentVersion: 0
    });
    expect(sessionResult.completeClientCheckoutSession).not.toHaveBeenCalled();
  });
});

function workItem(
  envelope: ReturnType<typeof checkoutEnvelope>,
  requestBytes: Uint8Array
): ProviderOperationDispatchWorkItem {
  const requestDigest = digest(requestBytes);
  return {
    status: "pending_dispatch",
    operationKind: "checkout_session_create",
    dispatch: {
      kind: "persisted_provider_dispatch_receipt",
      providerOperationIntentId,
      providerOperationIntentVersion: 0,
      economicPaymentIntentId,
      economicPaymentVersion: 1,
      economicPaymentSessionId,
      sourceId: "order-1",
      purpose: "client_order",
      amountMinor: "12000",
      currency: "RUB",
      providerAccount: { seriesId: "arc-main", providerAccountId: "arc-live", identityVersion: 1 },
      canonicalRequestDigest: digestFinanceCanonicalValueV1(envelope),
      dispatchAuthorizationId: "authorization-1",
      dispatchAuthorizationDigest:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      idempotencyKey: economicPaymentSessionId,
      sealedDispatchPayloadRef: "artifact-1",
      persistenceTransactionBoundaryRef: "postgres-xid:1",
      committedAt: "2026-08-04T12:00:00.000Z"
    } as unknown as ProviderOperationDispatchWorkItem["dispatch"],
    operationEnvelope: {
      kind: "resolved_finance_operation_envelope",
      policyId: "finance-operation-policy",
      policyVersion: 1,
      policyDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      maximumRows: 1_000,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 1_048_576
    } as unknown as ProviderOperationDispatchWorkItem["operationEnvelope"],
    dispatchArtifact: {
      artifactId: "artifact-1",
      sha256Digest: requestDigest,
      byteLength: requestBytes.byteLength
    },
    transientSecret: null,
    savedCardCredential: null,
    savedCardSetup: null,
    privateObject: {
      privateObjectKey: "finance/artifacts/artifact-1.json",
      privateObjectVersion: "version-1",
      envelopeKeyVersion: "arn:aws:kms:eu-central-1:123456789012:key/key-1"
    },
    artifactAccessAuditEventId: "60000000-0000-4000-8000-000000000006"
  };
}

function checkoutEnvelope() {
  return {
    kind: "checkout_session_create" as const,
    amount: { amountMinor: 12_000, currency: "RUB" as const },
    captureMode: "one_stage" as const,
    paymentMethods: [{ method: "bank_card" as const, paymentMode: "redirect" as const }],
    successUrl: "https://client.elevenhouse.test/payments/success",
    failureUrl: "https://client.elevenhouse.test/payments/failure",
    cancelUrl: "https://client.elevenhouse.test/payments/cancel",
    externalId: "payment-command-1",
    orderId: "order-1",
    fiscalSnapshot: createFiscalChargeSnapshot({
      profile: createFiscalProfile({
        profileSeriesId: "client-purchase-profile",
        version: 3,
        transactionCategory: "client_purchase",
        currency: "RUB",
        fiscalizationProvider: "arc_pay_embedded",
        merchantTaxId: "7701234567",
        buyerContactRequirement: "email_or_phone",
        lineTemplate: {
          vatRate: "no_vat",
          paymentObject: "service",
          paymentMethod: "full_payment",
          measure: "piece",
          itemCode: "astrology-service"
        }
      }),
      buyerContact: { kind: "email", value: "client@example.com" },
      lines: [
        {
          sourceLineId: "order-1",
          name: "Астрологическая консультация",
          amountMinor: 12_000
        }
      ]
    })
  };
}

function digest(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
