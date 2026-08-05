import { describe, expect, it } from "vitest";
import {
  astrologerRiskProfileResponseSchema,
  financePoliciesResponseSchema,
  financePolicySnapshotSchema,
  riskTierSchema,
  updateAstrologerRiskProfileRequestSchema,
  updateFinancePolicyRequestSchema
} from "./finance-policies";

describe("finance policy contracts", () => {
  it("captures admin-configurable hold, risk and reserve snapshots", () => {
    const snapshot = {
      id: "11111111-1111-4111-8111-111111111111",
      policyVersion: 3,
      riskTier: "standard",
      holdDurationHours: 48,
      reserveBps: 500,
      reserveReleaseDelayDays: 30,
      providerSettlementRequired: true,
      snapshottedAt: "2026-07-24T10:00:00.000Z"
    } as const;

    expect(financePolicySnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("validates admin policy updates and rejects unknown risk tiers", () => {
    const update = {
      riskTier: "elevated",
      holdDurationHours: 72,
      reserveBps: 1500,
      reserveReleaseDelayDays: 90,
      providerSettlementRequired: true
    } as const;

    expect(updateFinancePolicyRequestSchema.parse(update)).toEqual(update);

    expect(riskTierSchema.parse("standard")).toBe("standard");
    expect(riskTierSchema.parse("manual_review")).toBe("manual_review");
    expect(() => riskTierSchema.parse("vip")).toThrow();
    expect(() =>
      updateFinancePolicyRequestSchema.parse({
        ...update,
        reserveBps: 10_001
      })
    ).toThrow();
  });

  it("validates admin policy list and astrologer risk profile responses", () => {
    const policy = {
      id: "11111111-1111-4111-8111-111111111111",
      policyVersion: 3,
      riskTier: "standard",
      holdDurationHours: 48,
      reserveBps: 500,
      reserveReleaseDelayDays: 30,
      providerSettlementRequired: true,
      isActive: true,
      createdByUserId: "22222222-2222-4222-8222-222222222222",
      snapshottedAt: "2026-07-24T10:00:00.000Z",
      createdAt: "2026-07-24T10:00:00.000Z"
    } as const;

    expect(financePoliciesResponseSchema.parse({ policies: [policy] })).toEqual({
      policies: [policy]
    });
    expect(
      astrologerRiskProfileResponseSchema.parse({
        astrologerUserId: "33333333-3333-4333-8333-333333333333",
        riskTier: "standard",
        manualRiskTier: "high",
        manualOverrideReason: "Manual review",
        holdDurationHoursOverride: 168,
        reserveBpsOverride: 2000,
        reserveReleaseDelayDaysOverride: 90,
        providerSettlementRequiredOverride: true,
        reviewedByUserId: "22222222-2222-4222-8222-222222222222",
        reviewedAt: "2026-07-25T10:00:00.000Z",
        updatedAt: "2026-07-25T10:00:00.000Z"
      })
    ).toMatchObject({ manualRiskTier: "high", holdDurationHoursOverride: 168 });
  });

  it("requires a reason for manual risk override requests", () => {
    const request = {
      riskTier: "standard",
      manualRiskTier: "high",
      manualOverrideReason: "Chargeback risk",
      holdDurationHoursOverride: 168,
      reserveBpsOverride: 2000,
      reserveReleaseDelayDaysOverride: 90,
      providerSettlementRequiredOverride: true
    } as const;

    expect(updateAstrologerRiskProfileRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      updateAstrologerRiskProfileRequestSchema.parse({
        ...request,
        manualOverrideReason: null
      })
    ).toThrow();
  });
});
