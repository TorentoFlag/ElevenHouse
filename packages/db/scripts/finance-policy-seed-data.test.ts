import { describe, expect, it } from "vitest";

import {
  defaultClientCheckoutPreparePolicySeedData,
  defaultFinanceArtifactRetentionPolicySeedData,
  defaultFinancePolicySeedData
} from "./finance-policy-seed-data";

describe("default finance policy seed", () => {
  it("defines the active standard policy required for client purchase options", () => {
    expect(defaultFinancePolicySeedData).toEqual({
      riskTier: "standard",
      holdDurationHours: 48,
      reserveBps: 0,
      reserveReleaseDelayDays: 0,
      providerSettlementRequired: true
    });
  });

  it("defines the published resource policy required to prepare client checkout", () => {
    expect(defaultClientCheckoutPreparePolicySeedData).toEqual({
      policyId: "default-client-checkout-prepare",
      version: 1,
      draftRevision: 1,
      operationKind: "client_checkout_prepare",
      lifecycle: "published",
      maximumRows: 100,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 65_536,
      canonicalPreimage:
        '{"maximumArtifactBytes":65536,"maximumDecimalDigits":38,"maximumRows":100,"operationKind":"client_checkout_prepare","policyId":"default-client-checkout-prepare","version":1}',
      canonicalDigest: "sha256:f4a054273879d230e093a06e8312567861173c2a5005b1012d89c933385f3f94"
    });
  });

  it("defines the artifact retention policies required by finance checkout and dispatch", () => {
    expect(defaultFinanceArtifactRetentionPolicySeedData).toEqual([
      {
        policyId: "provider-request",
        policyVersion: "1",
        artifactClass: "provider_request",
        retainForSeconds: "31536000",
        authorityRef: "docs/decisions/0014-hosted-checkout-capture-authority.md"
      },
      {
        policyId: "provider-response",
        policyVersion: "1",
        artifactClass: "provider_response",
        retainForSeconds: "31536000",
        authorityRef: "docs/decisions/0014-hosted-checkout-capture-authority.md"
      },
      {
        policyId: "provider-webhook",
        policyVersion: "1",
        artifactClass: "provider_webhook",
        retainForSeconds: "31536000",
        authorityRef: "docs/decisions/0014-hosted-checkout-capture-authority.md"
      },
      {
        policyId: "provider-canonical-read",
        policyVersion: "1",
        artifactClass: "provider_canonical_read",
        retainForSeconds: "31536000",
        authorityRef: "docs/decisions/0014-hosted-checkout-capture-authority.md"
      },
      {
        policyId: "provider-settlement-page",
        policyVersion: "1",
        artifactClass: "provider_settlement_page",
        retainForSeconds: "31536000",
        authorityRef: "docs/decisions/0014-hosted-checkout-capture-authority.md"
      }
    ]);
  });
});
