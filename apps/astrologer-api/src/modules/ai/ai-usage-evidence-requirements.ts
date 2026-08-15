export type AiUsageEvidenceRequirement = {
  readonly usageEvidence: "forbidden" | "required";
};

/**
 * Defines only the audit linkage required for a feature. It is not an
 * authorization or consent policy: access is checked by each feature's own
 * ownership and tariff rules before generation is requested.
 */
export const aiUsageEvidenceRequirements = Object.freeze({
  "dictionary.aiDraft": Object.freeze({ usageEvidence: "forbidden" }),
  "chart.interpretationDraft": Object.freeze({ usageEvidence: "required" }),
  "matrix.reportDraft": Object.freeze({ usageEvidence: "required" }),
  "numerology.interpretationDraft": Object.freeze({ usageEvidence: "required" }),
  "humanDesign.interpretationDraft": Object.freeze({ usageEvidence: "required" })
} as const satisfies Readonly<Record<string, AiUsageEvidenceRequirement>>);

export function getAiUsageEvidenceRequirement(feature: string): AiUsageEvidenceRequirement | null {
  return aiUsageEvidenceRequirements[feature as keyof typeof aiUsageEvidenceRequirements] ?? null;
}
