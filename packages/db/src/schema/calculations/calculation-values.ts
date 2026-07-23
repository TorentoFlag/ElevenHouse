export const calculationModuleValues = ["numerology", "chart", "matrix", "human_design"] as const;

export const calculationModeValues = ["individual", "compatibility"] as const;

export const calculationStatusValues = ["calculated", "linked", "published", "archived"] as const;

export const calculationParticipantRoleValues = ["subject", "partner"] as const;

export const calculationParticipantSourceValues = ["crm_client", "manual"] as const;

export const calculationClientVisibilityValues = [
  "private_to_astrologer",
  "visible_to_client"
] as const;

export const calculationInterpretationSourceValues = ["ai", "manual"] as const;

export const calculationInterpretationStatusValues = ["draft", "approved"] as const;

export const calculationArtifactTypeValues = ["pdf"] as const;

export const calculationArtifactStatusValues = ["generating", "ready", "failed"] as const;

export const calculationPdfLocaleValues = ["ru", "en"] as const;

export const calculationPdfJobStatusValues = ["queued", "processing", "ready", "failed"] as const;

export const chartCalculationJobMethodValues = [
  "natal",
  "transit",
  "synastry",
  "solar_return",
  "progression"
] as const;

export const chartCalculationJobStatusValues = [
  "queued",
  "processing",
  "succeeded",
  "failed"
] as const;

export const chartCalculationJobProviderValues = ["kerykeion"] as const;

export const chartCalculationJobSchemaVersionValues = ["chart-result.v1"] as const;

export function formatCalculationSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
