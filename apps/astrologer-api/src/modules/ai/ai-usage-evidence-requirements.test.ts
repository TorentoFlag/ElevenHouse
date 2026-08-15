import { describe, expect, it } from "vitest";
import { aiUsageEvidenceRequirements } from "./ai-usage-evidence-requirements";

describe("AI usage evidence requirements", () => {
  it("requires immutable resource evidence for every client calculation draft", () => {
    expect(aiUsageEvidenceRequirements).toMatchObject({
      "dictionary.aiDraft": { usageEvidence: "forbidden" },
      "chart.interpretationDraft": { usageEvidence: "required" },
      "matrix.reportDraft": { usageEvidence: "required" },
      "numerology.interpretationDraft": { usageEvidence: "required" },
      "humanDesign.interpretationDraft": { usageEvidence: "required" }
    });
  });

  it("does not carry consent, purpose, or availability controls", () => {
    for (const requirement of Object.values(aiUsageEvidenceRequirements)) {
      expect(requirement).not.toHaveProperty("availability");
      expect(requirement).not.toHaveProperty("dataClassification");
    }
  });
});
