import { describe, expect, it } from "vitest";

import {
  ClientOrderCheckoutCaptureAuthorityReaderPersistenceError,
  mapClientOrderCheckoutCaptureAuthority
} from "./drizzle-client-order-checkout-capture-authority-reader";

const digest = (letter: string) => `sha256:${letter.repeat(64)}`;

describe("client-order checkout capture authority reader", () => {
  it("binds the exact order policy version and configured fulfillment decision", () => {
    expect(mapClientOrderCheckoutCaptureAuthority(rows() as never)).toEqual({
      riskPolicy: {
        policyId: "11111111-1111-4111-8111-111111111111",
        policyVersion: 7,
        canonicalDigest: digest("a")
      },
      fulfillmentDecision: {
        registryKey: "single.once.live.solo",
        registryRevision: 1,
        canonicalDigest: digest("b")
      }
    });
  });

  it("rejects a risk snapshot that differs from the order snapshot instead of choosing another policy", () => {
    const input = rows();
    input.risk.reserveBps = 501;

    expect(() => mapClientOrderCheckoutCaptureAuthority(input as never)).toThrow(
      ClientOrderCheckoutCaptureAuthorityReaderPersistenceError
    );
  });

  it("rejects fulfillment authority whose registry key is not the locked product shape", () => {
    const input = rows();
    input.fulfillment.registryKey = "single.once.live.group";

    expect(() => mapClientOrderCheckoutCaptureAuthority(input as never)).toThrow(
      ClientOrderCheckoutCaptureAuthorityReaderPersistenceError
    );
  });
});

function rows() {
  return {
    order: {
      financePolicySnapshotId: "11111111-1111-4111-8111-111111111111",
      financePolicyRiskTier: "standard",
      financePolicyHoldDurationHours: 48,
      financePolicyReserveBps: 500,
      financePolicyReserveReleaseDelayDays: 30,
      financePolicyProviderSettlementRequired: true
    },
    policy: { policyVersion: 7 },
    risk: {
      policyId: "11111111-1111-4111-8111-111111111111",
      policyVersion: "7",
      effectiveRiskTier: "standard",
      holdDurationHours: 48,
      reserveBps: 500,
      reserveReleaseDelayDays: 30,
      providerSettlementRequired: true,
      canonicalDigest: digest("a")
    },
    fulfillment: {
      registryKey: "single.once.live.solo",
      registryRevision: "1",
      canonicalDigest: digest("b")
    },
    registryKey: "single.once.live.solo"
  };
}
