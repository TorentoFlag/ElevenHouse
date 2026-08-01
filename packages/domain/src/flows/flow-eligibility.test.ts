import { describe, expect, it } from "vitest";

import { checkFlowRunEligibility } from "./flow-eligibility";

const baseInput = {
  status: "active",
  publishedVersionId: "33333333-3333-4333-8333-333333333333",
  subjectType: "client",
  hasOwnerRelationship: true,
  hasChannelConsent: true,
  isQuietHours: false,
  isFrequencyCapped: false,
  isPlanLimitReached: false,
  containsAutoSendNode: false
} as const;

describe("checkFlowRunEligibility", () => {
  it("blocks flows without a published immutable version", () => {
    expect(
      checkFlowRunEligibility({
        ...baseInput,
        publishedVersionId: null
      })
    ).toEqual({ allowed: false, reason: "FLOW_NOT_PUBLISHED" });
  });

  it("blocks flows that are not active", () => {
    expect(
      checkFlowRunEligibility({
        ...baseInput,
        status: "published"
      })
    ).toEqual({ allowed: false, reason: "FLOW_NOT_ACTIVE" });
  });

  it("requires an explicit owner relationship for client-scoped events", () => {
    expect(
      checkFlowRunEligibility({
        ...baseInput,
        hasOwnerRelationship: false
      })
    ).toEqual({ allowed: false, reason: "OWNER_RELATIONSHIP_REQUIRED" });
  });

  it("holds runtime execution during quiet hours", () => {
    expect(
      checkFlowRunEligibility({
        ...baseInput,
        isQuietHours: true
      })
    ).toEqual({ allowed: false, reason: "QUIET_HOURS_HOLD" });
  });

  it("allows active published flows after owner and delivery gates pass", () => {
    expect(checkFlowRunEligibility(baseInput)).toEqual({ allowed: true });
  });
});
