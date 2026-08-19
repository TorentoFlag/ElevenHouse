import { describe, expect, it } from "vitest";

import { defaultFinancePolicySeedData } from "./finance-policy-seed-data";

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
});
