import { describe, expect, it } from "vitest";
import {
  financePolicySnapshotSchema,
  riskTierSchema,
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
      platformFeeBps: 1000,
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
	      platformFeeBps: 1200,
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
	});
