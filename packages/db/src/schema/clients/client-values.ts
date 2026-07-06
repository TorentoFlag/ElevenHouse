export const clientBirthTimePrecisionValues = ["exact", "approximate", "unknown"] as const;
export const clientBirthDataSourceValues = ["client_profile", "booking", "import", "manual"] as const;
export const clientRelationshipSourceValues = [
  "direct_link",
  "booking",
  "order",
  "lead_magnet",
  "manual"
] as const;
export const clientRelationshipStatusValues = ["active", "archived", "blocked"] as const;
export const clientJoinIntentStatusValues = ["pending", "claimed", "expired"] as const;

export function formatClientSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
