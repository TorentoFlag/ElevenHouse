import { describe, expect, it } from "vitest";
import {
  canonicalizeFinanceOperationResourcePolicy,
  createFinanceOperationResourcePolicyDraft,
  publishFinanceOperationResourcePolicyDraft
} from "@elevenhouse/domain/finance-core";

import {
  CapturedClientOrderCorrelationPersistenceError,
  mapCapturedClientOrderCorrelation
} from "./drizzle-captured-client-order-webhook-correlation-port";

describe("captured client-order webhook correlation port", () => {
  it("requires the canonical external id to match the locked client-order authority and provider scope", () => {
    const policy = publishedPolicy();
    expect(
      mapCapturedClientOrderCorrelation({
        externalId: "c74901be-a78d-4fb4-b693-e42302c1ff4f",
        providerPaymentId: "arc-payment-1",
        orderId: "c74901be-a78d-4fb4-b693-e42302c1ff4f",
        authorizationOrderId: "c74901be-a78d-4fb4-b693-e42302c1ff4f",
        authorizationEconomicPaymentIntentId: "economic-intent-1",
        authorizationEconomicPaymentSessionId: "economic-session-1",
        authorizationProviderOperationIntentId: "provider-operation-1",
        economicPaymentIntentId: "economic-intent-1",
        economicPaymentSessionId: "economic-session-1",
        intentPurpose: "client_order",
        intentSourceId: "c74901be-a78d-4fb4-b693-e42302c1ff4f",
        intentVersion: "3",
        amountMinor: "9600",
        currency: "RUB",
        seriesId: "series-live-1",
        providerAccountId: "arc-live-1",
        providerIdentityVersion: 1,
        operationKind: "checkout_session_create",
        operationId: "provider-operation-1",
        operationPurpose: "client_order",
        operationSourceId: "c74901be-a78d-4fb4-b693-e42302c1ff4f",
        operationSeriesId: "series-live-1",
        operationProviderAccountId: "arc-live-1",
        operationProviderIdentityVersion: 1,
        policyId: policy.policy.policyId,
        policyVersion: policy.policy.version,
        policyOperationKind: policy.policy.operationKind,
        policyLifecycle: policy.lifecycle,
        policyDraftRevision: policy.draftRevision,
        policyMaximumRows: policy.policy.maximumRows,
        policyMaximumDecimalDigits: policy.policy.maximumDecimalDigits,
        policyMaximumArtifactBytes: policy.policy.maximumArtifactBytes,
        policyCanonicalPreimage: canonicalizeFinanceOperationResourcePolicy(policy.policy),
        policyCanonicalDigest: policy.policy.canonicalDigest,
        policyPublishedAt: new Date("2026-08-05T10:00:00.000Z"),
        policyRetiredAt: null
      } as never)
    ).toMatchObject({
      externalId: "c74901be-a78d-4fb4-b693-e42302c1ff4f",
      economicPaymentIntentId: "economic-intent-1",
      economicPaymentSessionId: "economic-session-1",
      expectedEconomicPaymentVersion: 3,
      expectedAmountMinor: "9600",
      expectedCurrency: "RUB",
      providerAccount: {
        seriesId: "series-live-1",
        providerAccountId: "arc-live-1",
        identityVersion: 1
      }
    });
  });

  it("rejects an ArcPay external_id that only looks like an order but is not the checkout source", () => {
    expect(() =>
      mapCapturedClientOrderCorrelation({
        externalId: "order-forged",
        orderId: "order-real",
        authorizationOrderId: "order-real",
        intentSourceId: "order-real"
      } as never)
    ).toThrow(CapturedClientOrderCorrelationPersistenceError);
  });
});

function publishedPolicy() {
  return publishFinanceOperationResourcePolicyDraft(
    createFinanceOperationResourcePolicyDraft({
      policyId: "capture-limits",
      version: 2,
      operationKind: "client_order_capture",
      maximumRows: 100,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 2_097_152
    })
  );
}
