export const verificationApplicationStatusValues = [
  "pending",
  "approved",
  "rejected",
  "revoked"
] as const;

export const verificationDocumentKindValues = ["identity", "qualification"] as const;

export function formatVerificationSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
