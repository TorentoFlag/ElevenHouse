import type { ClientBirthDataResponse } from "@elevenhouse/contracts";

export type BackendChartJobStatus = "queued" | "processing" | "calculating" | "succeeded" | "failed";
export type VisibleChartJobState = "calculating" | "succeeded" | "failed";

export type ChartBirthDataReadiness =
  | { readonly ready: true }
  | { readonly ready: false; readonly missing: readonly string[] };

type NatalBirthData = Pick<
  ClientBirthDataResponse,
  | "birthDate"
  | "birthTime"
  | "birthTimePrecision"
  | "birthTimezone"
  | "birthLatitude"
  | "birthLongitude"
>;

export function toVisibleChartJobState(status: BackendChartJobStatus): VisibleChartJobState {
  if (status === "queued" || status === "processing" || status === "calculating") {
    return "calculating";
  }

  return status;
}

export function getChartBirthDataReadiness(
  birthData: NatalBirthData | null | undefined
): ChartBirthDataReadiness {
  const missing: string[] = [];

  if (!birthData?.birthDate) {
    missing.push("дата рождения");
  }
  if (!birthData?.birthTime || birthData.birthTimePrecision === "unknown") {
    missing.push("время рождения");
  }
  if (!birthData?.birthTimezone) {
    missing.push("часовой пояс");
  }
  if (birthData?.birthLatitude == null || birthData?.birthLongitude == null) {
    missing.push("координаты места рождения");
  }

  return missing.length > 0 ? { ready: false, missing } : { ready: true };
}
