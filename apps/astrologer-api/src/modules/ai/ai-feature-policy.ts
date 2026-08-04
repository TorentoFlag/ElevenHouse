export type AiFeaturePolicy = {
  readonly dataClassification: "non_client_content" | "client_derived";
  readonly consentEvidence: "forbidden" | "optional" | "required";
  readonly usageEvidence: "forbidden" | "required";
  readonly availability: "enabled" | "blocked_pending_purpose_authority";
  readonly approvedPurpose: string | null;
};

/**
 * Server authority for every shared AI feature. Unknown features are not
 * allowed to inherit a permissive default. A client-derived feature becomes
 * enabled only after its own processing authority and evidence requirements
 * are implemented end to end.
 */
export const aiFeaturePolicyRegistry = Object.freeze({
  "dictionary.aiDraft": Object.freeze({
    dataClassification: "non_client_content",
    consentEvidence: "forbidden",
    usageEvidence: "forbidden",
    availability: "enabled",
    approvedPurpose: null
  }),
  "chart.interpretationDraft": Object.freeze({
    dataClassification: "client_derived",
    consentEvidence: "optional",
    usageEvidence: "required",
    availability: "enabled",
    approvedPurpose: "external_chart_ai_interpretation"
  }),
  "matrix.reportDraft": Object.freeze({
    dataClassification: "client_derived",
    consentEvidence: "required",
    usageEvidence: "required",
    availability: "blocked_pending_purpose_authority",
    approvedPurpose: null
  }),
  "numerology.interpretationDraft": Object.freeze({
    dataClassification: "client_derived",
    consentEvidence: "required",
    usageEvidence: "required",
    availability: "blocked_pending_purpose_authority",
    approvedPurpose: null
  }),
  "humanDesign.interpretationDraft": Object.freeze({
    dataClassification: "client_derived",
    consentEvidence: "required",
    usageEvidence: "required",
    availability: "blocked_pending_purpose_authority",
    approvedPurpose: null
  })
} as const satisfies Readonly<Record<string, AiFeaturePolicy>>);

export function getAiFeaturePolicy(feature: string): AiFeaturePolicy | null {
  return (
    aiFeaturePolicyRegistry[feature as keyof typeof aiFeaturePolicyRegistry] ?? null
  );
}
