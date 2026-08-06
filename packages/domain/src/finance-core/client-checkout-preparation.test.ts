import { describe, expect, it } from "vitest";

import {
  ClientCheckoutPreparationIntegrityError,
  createClientCheckoutPreparation,
  publishClientCheckoutReady,
  recordClientCheckoutProviderSessionUnknown
} from "./client-checkout-preparation";

const requested = createClientCheckoutPreparation({
  checkoutPreparationId: "11111111-1111-4111-8111-111111111111",
  orderId: "22222222-2222-4222-8222-222222222222",
  clientUserId: "33333333-3333-4333-8333-333333333333",
  economicPaymentIntentId: "intent-order-1",
  economicPaymentSessionId: "session-order-1",
  providerOperationIntentId: "44444444-4444-4444-8444-444444444444",
  requestArtifactId: "request-artifact-1",
  requestArtifactDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
});

describe("client checkout preparation", () => {
  it("starts as a worker-owned request without an HPP action or a payment fact", () => {
    expect(requested).toEqual({
      checkoutPreparationId: "11111111-1111-4111-8111-111111111111",
      orderId: "22222222-2222-4222-8222-222222222222",
      clientUserId: "33333333-3333-4333-8333-333333333333",
      economicPaymentIntentId: "intent-order-1",
      economicPaymentSessionId: "session-order-1",
      providerOperationIntentId: "44444444-4444-4444-8444-444444444444",
      requestArtifactId: "request-artifact-1",
      requestArtifactDigest:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      version: 1,
      state: "checkout_requested",
      providerCheckoutId: null,
      responseArtifactId: null,
      responseArtifactDigest: null,
      failureCode: null
    });
  });

  it("publishes a ready action only from the worker-requested state", () => {
    expect(
      publishClientCheckoutReady(requested, {
        providerCheckoutId: "55555555-5555-4555-8555-555555555555",
        responseArtifactId: "response-artifact-1",
        responseArtifactDigest:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      })
    ).toMatchObject({
      state: "checkout_ready",
      version: 2,
      providerCheckoutId: "55555555-5555-4555-8555-555555555555",
      responseArtifactId: "response-artifact-1"
    });
  });

  it("accepts ArcPay's UUIDv7 hosted checkout identifier", () => {
    expect(
      publishClientCheckoutReady(requested, {
        providerCheckoutId: "019fd91e-4ac6-7e0f-a536-4d8b10782d51",
        responseArtifactId: "response-artifact-1",
        responseArtifactDigest:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      })
    ).toMatchObject({
      state: "checkout_ready",
      providerCheckoutId: "019fd91e-4ac6-7e0f-a536-4d8b10782d51"
    });
  });

  it("keeps an ambiguous ArcPay creation result blocked instead of creating another session", () => {
    expect(recordClientCheckoutProviderSessionUnknown(requested)).toMatchObject({
      state: "provider_session_unknown",
      version: 2,
      providerCheckoutId: null,
      responseArtifactId: null
    });
  });

  it("rejects a browser or duplicate caller trying to turn any non-requested state into ready", () => {
    const unknown = recordClientCheckoutProviderSessionUnknown(requested);
    expect(() =>
      publishClientCheckoutReady(unknown, {
        providerCheckoutId: "55555555-5555-4555-8555-555555555555",
        responseArtifactId: "response-artifact-1",
        responseArtifactDigest:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      })
    ).toThrow(ClientCheckoutPreparationIntegrityError);
  });
});
