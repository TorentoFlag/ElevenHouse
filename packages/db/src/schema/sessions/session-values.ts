export const sessionStateValues = [
  "scheduled",
  "active",
  "ended",
  "cancelled",
  "expired"
] as const;

export const sessionParticipantRoleValues = ["astrologer", "client"] as const;
export const sessionPresenceStateValues = ["absent", "present"] as const;
export const sessionEndReasonValues = ["astrologer_ended", "participants_absent"] as const;
export const sessionCommandKindValues = ["leave", "end"] as const;
export const sessionCommandStatusValues = ["prepared", "completed", "outcome_unknown"] as const;
export const sessionProviderEventTypeValues = [
  "participant_joined",
  "participant_left",
  "room_started",
  "room_finished"
] as const;
export const sessionProviderEventApplicationStatusValues = [
  "applied",
  "ignored",
  "failed"
] as const;
export const sessionRealtimeEventTypeValues = ["session.updated", "message.created"] as const;
export const sessionBookingLifecycleReceiptOutcomeValues = [
  "provisioned",
  "updated",
  "ignored"
] as const;

export function formatSessionSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")})`;
}
