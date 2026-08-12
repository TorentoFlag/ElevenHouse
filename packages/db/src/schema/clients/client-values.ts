export const clientBirthTimePrecisionValues = ["exact", "approximate", "unknown"] as const;
export const clientBirthTimeDstOccurrenceValues = ["first", "second"] as const;
export type ClientBirthTimeDstOccurrence = (typeof clientBirthTimeDstOccurrenceValues)[number];
export const clientBirthDataSourceValues = ["client_profile", "import", "manual"] as const;
export const clientBirthDataEditorRoleValues = ["client", "astrologer"] as const;
export const clientRelationshipSourceValues = [
  "direct_link",
  "booking",
  "order",
  "lead_magnet",
  "manual"
] as const;
export const clientRelationshipStatusValues = ["active", "archived", "blocked"] as const;
export const clientLifecycleStatusValues = [
  "new",
  "active",
  "waiting_for_client",
  "in_service",
  "inactive"
] as const;
export const clientLifecycleModeValues = ["automatic", "manual_override"] as const;
export const clientLifecycleCauseKindValues = [
  "relationship_created",
  "captured_order",
  "inbound_message",
  "booking_started",
  "booking_completed",
  "inactivity_elapsed",
  "manual_astrologer_action",
  "manual_override",
  "return_to_automatic"
] as const;
export const clientLifecycleDispositionValues = ["applied", "candidate_recorded", "no_change"] as const;
export const clientJoinIntentStatusValues = ["pending", "claimed", "expired"] as const;

export function formatClientSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
