export const availabilityOverrideModeValues = ["available", "unavailable"] as const;
export const scheduleReservationKindValues = ["booking", "hold", "manual_block"] as const;
export const scheduleReservationLifecycleValues = [
  "active",
  "consumed",
  "released",
  "expired",
  "cancelled"
] as const;
export const manualCalendarBlockStateValues = ["active", "released"] as const;
export const bookingStateValues = [
  "hold",
  "pending_payment",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
  "expired"
] as const;
export const bookingSourceValues = ["manual", "client_paid"] as const;
export const bookingLifecycleEventKindValues = [
  "confirmed",
  "rescheduled",
  "completed",
  "cancelled"
] as const;
export const bookingLifecycleActorKindValues = ["system", "astrologer", "client"] as const;
export const bookingCancellationReasonCodeValues = [
  "astrologer_unavailable",
  "client_request",
  "mutual_agreement",
  "other"
] as const;
export const idempotencyCommandStateValues = ["processing", "completed"] as const;

export function formatSchedulingSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
