export const astroCalendarGenerationStatusValues = [
  "calculating",
  "ready",
  "failed",
  "stale"
] as const;

export const astroCalendarEventSourceValues = ["global", "client"] as const;

export const astroCalendarEventTypeValues = [
  "global.moon_phase",
  "global.eclipse",
  "global.ingress",
  "client.birthday",
  "client.solar_window",
  "client.transit_aspect"
] as const;

export const astroCalendarTimePrecisionValues = ["exact", "hour", "day"] as const;

export function formatAstroCalendarSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
