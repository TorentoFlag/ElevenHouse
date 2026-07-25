import { describe, expect, it } from "vitest";
import {
  createInitialRiskProfileForm,
  formatBasisPoints,
  holdLabel,
  policyFormToRequest,
  policyToForm,
  riskProfileFormToRequest
} from "./financePolicyFormModel";

describe("finance policy form model", () => {
  it("uses the production default hold policy when the backend has no active standard policy yet", () => {
    expect(policyToForm(null)).toMatchObject({
      riskTier: "standard",
      holdDurationHours: 48,
      reserveBps: 0,
      reserveReleaseDelayDays: 0,
      platformFeeBps: 1000,
      providerSettlementRequired: true
    });
  });

  it("serializes policy settings without frontend-side financial recalculation", () => {
    expect(
      policyFormToRequest({
        riskTier: "high",
        holdDurationHours: 168,
        reserveBps: 1500,
        reserveReleaseDelayDays: 30,
        platformFeeBps: 1200,
        providerSettlementRequired: true
      })
    ).toEqual({
      riskTier: "high",
      holdDurationHours: 168,
      reserveBps: 1500,
      reserveReleaseDelayDays: 30,
      platformFeeBps: 1200,
      providerSettlementRequired: true
    });
  });

  it("requires manual risk overrides to carry a trimmed reason", () => {
    expect(
      riskProfileFormToRequest({
        ...createInitialRiskProfileForm(),
        manualOverrideReason: "  Chargeback review  "
      })
    ).toMatchObject({
      manualRiskTier: "high",
      manualOverrideReason: "Chargeback review"
    });
  });

  it("formats hold and basis-point values for dense admin tables", () => {
    expect(holdLabel(48)).toBe("2 д");
    expect(holdLabel(50)).toBe("50 ч");
    expect(formatBasisPoints(1500)).toBe("15%");
    expect(formatBasisPoints(1250)).toBe("12,50%");
  });
});
