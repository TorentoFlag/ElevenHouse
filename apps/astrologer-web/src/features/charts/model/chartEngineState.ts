import type {
  ChartSettings,
  ClientBirthDataResponse,
  StoredChartCalculationPayload
} from "@elevenhouse/contracts";

export type BackendChartJobStatus =
  | "queued"
  | "processing"
  | "calculating"
  | "succeeded"
  | "failed";
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
> &
  Partial<Pick<ClientBirthDataResponse, "birthTimeDstOccurrence">>;

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

export function isChartResultStale(
  result: StoredChartCalculationPayload,
  birthData: NatalBirthData | null | undefined,
  settings: ChartSettings
): boolean {
  if (birthData === undefined) {
    return false;
  }
  if (!birthData || getChartBirthDataReadiness(birthData).ready === false) {
    return true;
  }

  const snapshot = result.inputSnapshot;

  return (
    result.settings.zodiac !== settings.zodiac ||
    result.settings.houseSystem !== settings.houseSystem ||
    result.settings.nodeType !== settings.nodeType ||
    result.settings.aspectPreset !== settings.aspectPreset ||
    result.settings.orbMultiplier !== settings.orbMultiplier ||
    snapshot.birthDate !== birthData.birthDate ||
    snapshot.birthTime !== birthData.birthTime ||
    snapshot.birthTimePrecision !== birthData.birthTimePrecision ||
    snapshot.timezone !== birthData.birthTimezone ||
    !areNumbersEquivalent(snapshot.latitude, birthData.birthLatitude) ||
    !areNumbersEquivalent(snapshot.longitude, birthData.birthLongitude) ||
    (snapshot.dstOccurrence ?? null) !== (birthData.birthTimeDstOccurrence ?? null)
  );
}

function areNumbersEquivalent(left: number, right: number | null | undefined): boolean {
  return right != null && Math.abs(left - right) < 0.000001;
}
