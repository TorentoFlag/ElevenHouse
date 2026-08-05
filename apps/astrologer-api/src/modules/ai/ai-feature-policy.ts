export type AiFeaturePolicy = {
  readonly dataClassification: "non_client_content" | "client_derived";
  readonly usageEvidence: "forbidden" | "required";
  readonly availability: "enabled" | "blocked_pending_purpose_authority";
};

/**
 * Server authority for every shared AI feature. Unknown features are not
 * allowed to inherit a permissive default. A client-derived feature becomes
 * enabled only after its own technical resource evidence is implemented end
 * to end.
 */
export const aiFeaturePolicyRegistry = Object.freeze({
  "dictionary.aiDraft": Object.freeze({
    dataClassification: "non_client_content",
    usageEvidence: "forbidden",
    availability: "enabled"
  }),
  "chart.interpretationDraft": Object.freeze({
    dataClassification: "client_derived",
    usageEvidence: "required",
    availability: "enabled"
  }),
  "matrix.reportDraft": Object.freeze({
    dataClassification: "client_derived",
    usageEvidence: "required",
    availability: "blocked_pending_purpose_authority"
  }),
  "numerology.interpretationDraft": Object.freeze({
    dataClassification: "client_derived",
    usageEvidence: "required",
    availability: "blocked_pending_purpose_authority"
  }),
  "humanDesign.interpretationDraft": Object.freeze({
    dataClassification: "client_derived",
    usageEvidence: "required",
    availability: "blocked_pending_purpose_authority"
  })
} as const satisfies Readonly<Record<string, AiFeaturePolicy>>);

export function getAiFeaturePolicy(feature: string): AiFeaturePolicy | null {
  return (
    aiFeaturePolicyRegistry[feature as keyof typeof aiFeaturePolicyRegistry] ?? null
  );
}
