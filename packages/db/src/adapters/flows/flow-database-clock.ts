export function parseFlowDatabaseEpochMilliseconds(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return null;

  const epochMilliseconds = Number(value);
  if (!Number.isFinite(epochMilliseconds)) return null;

  const ceilingEpochMilliseconds = Math.ceil(epochMilliseconds);
  if (!Number.isSafeInteger(ceilingEpochMilliseconds)) return null;

  const instant = new Date(ceilingEpochMilliseconds);
  return Number.isNaN(instant.getTime()) ? null : instant;
}
