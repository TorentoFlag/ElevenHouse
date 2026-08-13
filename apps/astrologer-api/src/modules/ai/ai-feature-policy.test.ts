import { describe, expect, it } from "vitest";

import { aiFeaturePolicyRegistry } from "./ai-feature-policy";

describe("AI feature policy", () => {
  it("freezes the server policy for every existing prompt contour", () => {
    expect(aiFeaturePolicyRegistry).toEqual({
      "dictionary.aiDraft": {
        dataClassification: "non_client_content",
        usageEvidence: "forbidden",
        availability: "enabled"
      },
      "chart.interpretationDraft": {
        dataClassification: "client_derived",
        usageEvidence: "required",
        availability: "enabled"
      },
      "matrix.reportDraft": {
        dataClassification: "client_derived",
        usageEvidence: "required",
        availability: "blocked_pending_purpose_authority"
      },
      "numerology.interpretationDraft": {
        dataClassification: "client_derived",
        usageEvidence: "required",
        availability: "blocked_pending_purpose_authority"
      },
      "humanDesign.interpretationDraft": {
        dataClassification: "client_derived",
        usageEvidence: "required",
        availability: "blocked_pending_purpose_authority"
      }
    });
  });

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
