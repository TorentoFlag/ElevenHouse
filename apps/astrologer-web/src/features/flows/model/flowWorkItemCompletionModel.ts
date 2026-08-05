import type { FlowWorkItemResultSummaryRequirementV2 } from "@elevenhouse/contracts";

export type FlowWorkItemCompletionValidation = "required" | "too_long" | null;

export function resolveFlowWorkItemCompletionDraft(input: {
  readonly resultSummary: string;
  readonly requirement: FlowWorkItemResultSummaryRequirementV2;
}) {
  const resultSummary = input.resultSummary.trim();
  const characterCount = resultSummary.length;

  if (characterCount > 1_000) {
    return {
      canSubmit: false,
      resultSummary,
      validation: "too_long" as const,
      characterCount
    };
  }
  if (input.requirement === "required" && characterCount === 0) {
    return {
      canSubmit: false,
      resultSummary: undefined,
      validation: "required" as const,
      characterCount
    };
  }
  return {
    canSubmit: true,
    resultSummary: characterCount === 0 ? undefined : resultSummary,
    validation: null,
    characterCount
  } as const;
}
