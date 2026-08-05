import { describe, expect, it } from "vitest";

import { aiFeaturePolicyRegistry } from "./ai-feature-policy";

describe("AI feature policy", () => {
  it("does not model client consent or processing-policy acceptance for chart drafts", () => {
    const chartDraftPolicy = aiFeaturePolicyRegistry["chart.interpretationDraft"];

    expect(chartDraftPolicy).toMatchObject({
      dataClassification: "client_derived",
      usageEvidence: "required",
      availability: "enabled"
    });
    expect(chartDraftPolicy).not.toHaveProperty("consentEvidence");
    expect(chartDraftPolicy).not.toHaveProperty("approvedPurpose");
  });
});
