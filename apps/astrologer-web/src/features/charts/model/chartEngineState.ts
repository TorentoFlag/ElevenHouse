import type {
  ChartInputSnapshot,
  ChartHoraryQuestionCategory,
  ChartHoraryQuestionSnapshot,
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
export type ChartHoraryQuestionDraft = {
  readonly question: string;
  readonly category?: ChartHoraryQuestionCategory;
  readonly date: string;
  readonly time: string;
  readonly timezone: string;
  readonly latitude: string | number | null | undefined;
  readonly longitude: string | number | null | undefined;
};

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

export function getChartHoraryQuestionReadiness(
  question: ChartHoraryQuestionDraft | null | undefined
): ChartBirthDataReadiness {
  const missing: string[] = [];

  if (!question?.question.trim()) {
    missing.push("вопрос");
  }
  if (!question?.date) {
    missing.push("дата вопроса");
  }
  if (!question?.time) {
    missing.push("время вопроса");
  }
  if (!question?.timezone.trim()) {
    missing.push("часовой пояс");
  }
  if (!isFiniteNumberInRange(question?.latitude, -90, 90)) {
    missing.push("широта вопроса");
  }
  if (!isFiniteNumberInRange(question?.longitude, -180, 180)) {
    missing.push("долгота вопроса");
  }

  return missing.length > 0 ? { ready: false, missing } : { ready: true };
}

export function toChartHoraryQuestionSnapshot(
  question: ChartHoraryQuestionDraft
): ChartHoraryQuestionSnapshot {
  const latitude = normalizeFiniteNumber(question.latitude);
  const longitude = normalizeFiniteNumber(question.longitude);

  if (
    !question.question.trim() ||
    !question.date ||
    !question.time ||
    !question.timezone.trim() ||
    latitude == null ||
    longitude == null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("Заполните вопрос, момент и координаты хорара");
  }

  return {
    question: question.question.trim(),
    category: question.category ?? "other",
    date: question.date,
    time: question.time,
    timezone: question.timezone.trim(),
    latitude,
    longitude
  };
}

export function isChartResultStale(
  result: StoredChartCalculationPayload,
  birthData: NatalBirthData | null | undefined,
  settings: ChartSettings,
  currentMethod?: StoredChartCalculationPayload["method"],
  transitMoment?: {
    readonly date: string;
    readonly time: string;
    readonly timezone?: string;
    readonly latitude?: number;
    readonly longitude?: number;
  },
  partnerBirthData?: NatalBirthData | null | undefined,
  solarReturnYear?: number,
  progressionTargetDate?: string,
  horaryQuestion?: ChartHoraryQuestionDraft | ChartHoraryQuestionSnapshot
): boolean {
  if (currentMethod && result.method !== currentMethod) {
    return true;
  }
  const settingsStale =
    result.settings.zodiac !== settings.zodiac ||
    result.settings.houseSystem !== settings.houseSystem ||
    result.settings.nodeType !== settings.nodeType ||
    result.settings.aspectPreset !== settings.aspectPreset ||
    result.settings.orbMultiplier !== settings.orbMultiplier;

  if (settingsStale) {
    return true;
  }

  if (result.method === "horary") {
    if (!horaryQuestion) {
      return false;
    }

    return isHoraryQuestionSnapshotStale(result.questionSnapshot, horaryQuestion);
  }

  if (birthData === undefined) {
    return false;
  }
  if (!birthData || getChartBirthDataReadiness(birthData).ready === false) {
    return true;
  }

  const snapshot = result.inputSnapshot;

  const baseSnapshotStale = isInputSnapshotStale(snapshot, birthData);

  if (baseSnapshotStale) {
    return true;
  }

  if (result.method === "synastry" || result.method === "composite") {
    if (partnerBirthData === undefined) {
      return false;
    }
    if (!partnerBirthData || getChartBirthDataReadiness(partnerBirthData).ready === false) {
      return true;
    }

    return isInputSnapshotStale(result.partnerInputSnapshot, partnerBirthData);
  }

  if (result.method === "solar_return") {
    return solarReturnYear != null && result.solarReturnSnapshot.year !== solarReturnYear;
  }

  if (result.method === "progression") {
    return (
      progressionTargetDate != null &&
      result.progressionSnapshot.targetDate !== progressionTargetDate
    );
  }

  if (result.method !== "transit") {
    return false;
  }

  if (!transitMoment) {
    return false;
  }

  return (
    result.transitSnapshot.date !== transitMoment.date ||
    result.transitSnapshot.time !== transitMoment.time ||
    (transitMoment.timezone != null &&
      result.transitSnapshot.timezone !== transitMoment.timezone) ||
    (transitMoment.latitude != null &&
      !areNumbersEquivalent(result.transitSnapshot.latitude, transitMoment.latitude)) ||
    (transitMoment.longitude != null &&
      !areNumbersEquivalent(result.transitSnapshot.longitude, transitMoment.longitude))
  );
}

function isHoraryQuestionSnapshotStale(
  snapshot: ChartHoraryQuestionSnapshot,
  question: ChartHoraryQuestionDraft | ChartHoraryQuestionSnapshot
): boolean {
  let current: ChartHoraryQuestionSnapshot;
  try {
    current = toChartHoraryQuestionSnapshot(question);
  } catch {
    return true;
  }

  return (
    snapshot.question !== current.question ||
    snapshot.category !== current.category ||
    snapshot.date !== current.date ||
    snapshot.time !== current.time ||
    snapshot.timezone !== current.timezone ||
    !areNumbersEquivalent(snapshot.latitude, current.latitude) ||
    !areNumbersEquivalent(snapshot.longitude, current.longitude)
  );
}

function isInputSnapshotStale(
  snapshot: ChartInputSnapshot,
  birthData: NatalBirthData
): boolean {
  return (
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

function isFiniteNumberInRange(
  value: string | number | null | undefined,
  min: number,
  max: number
): boolean {
  const parsed = normalizeFiniteNumber(value);
  return parsed != null && parsed >= min && parsed <= max;
}

function normalizeFiniteNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
