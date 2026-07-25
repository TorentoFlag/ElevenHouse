import type {
  ChartInputSnapshot,
  ChartPlanetaryPositionsRequestInput,
  ChartPlanetaryPositionsResponse,
  ChartPlanetaryPositionsSettings
} from "@elevenhouse/contracts";
import {
  resolveHumanDesignDesignMoment,
  type BuildHumanDesignActivationsInput,
  type HumanDesignBasePlanetaryLongitudes,
  type HumanDesignDesignMomentResolution
} from "@elevenhouse/domain";

const defaultPositionsSettings: ChartPlanetaryPositionsSettings = {
  zodiac: "tropical",
  nodeType: "true"
};
const minuteGranularPositionsToleranceMs = 60 * 1000;
const minuteMs = 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

type PositionBodyId = keyof HumanDesignBasePlanetaryLongitudes;

export type HumanDesignPositionsChartEngine = {
  calculatePlanetaryPositions(
    payload: ChartPlanetaryPositionsRequestInput
  ): Promise<ChartPlanetaryPositionsResponse>;
};

export type ResolveHumanDesignResolvedInputInput = {
  readonly chartEngine: HumanDesignPositionsChartEngine;
  readonly inputSnapshot: ChartInputSnapshot;
  readonly settings?: ChartPlanetaryPositionsSettings;
};

export type HumanDesignResolvedInput = {
  readonly resolvedLongitudes: BuildHumanDesignActivationsInput;
  readonly personalityPositions: ChartPlanetaryPositionsResponse;
  readonly designPositions: ChartPlanetaryPositionsResponse;
  readonly designMoment: HumanDesignDesignMomentResolution;
};

export async function resolveHumanDesignResolvedInput(
  input: ResolveHumanDesignResolvedInputInput
): Promise<HumanDesignResolvedInput> {
  const settings = input.settings ?? defaultPositionsSettings;
  const personalityPositions = await input.chartEngine.calculatePlanetaryPositions(
    buildPositionsRequest(input.inputSnapshot, settings)
  );
  const birthInstant = resolveSnapshotInstant(input.inputSnapshot);
  const birthSunLongitude = getPositionLongitude(personalityPositions, "sun");
  const designMoment = await resolveHumanDesignDesignMoment({
    birthInstant,
    birthSunLongitude,
    toleranceMs: minuteGranularPositionsToleranceMs,
    getSunLongitudeAt: async (instant) => {
      const positions = await input.chartEngine.calculatePlanetaryPositions(
        buildPositionsRequest(snapshotForInstant(input.inputSnapshot, instant), settings)
      );
      return getPositionLongitude(positions, "sun");
    }
  });
  const designPositions = await input.chartEngine.calculatePlanetaryPositions(
    buildPositionsRequest(
      snapshotForInstant(input.inputSnapshot, designMoment.designInstant),
      settings
    )
  );

  return {
    resolvedLongitudes: {
      personality: toBasePlanetaryLongitudes(personalityPositions),
      design: toBasePlanetaryLongitudes(designPositions)
    },
    personalityPositions,
    designPositions,
    designMoment
  };
}

function buildPositionsRequest(
  inputSnapshot: ChartInputSnapshot,
  settings: ChartPlanetaryPositionsSettings
): ChartPlanetaryPositionsRequestInput {
  return {
    schemaVersion: "chart-positions-request.v1",
    method: "planetary_positions",
    settings,
    inputSnapshot
  };
}

function toBasePlanetaryLongitudes(
  response: ChartPlanetaryPositionsResponse
): HumanDesignBasePlanetaryLongitudes {
  return {
    sun: getPositionLongitude(response, "sun"),
    moon: getPositionLongitude(response, "moon"),
    north_node: getPositionLongitude(response, "north_node"),
    mercury: getPositionLongitude(response, "mercury"),
    venus: getPositionLongitude(response, "venus"),
    mars: getPositionLongitude(response, "mars"),
    jupiter: getPositionLongitude(response, "jupiter"),
    saturn: getPositionLongitude(response, "saturn"),
    uranus: getPositionLongitude(response, "uranus"),
    neptune: getPositionLongitude(response, "neptune"),
    pluto: getPositionLongitude(response, "pluto")
  };
}

function getPositionLongitude(
  response: ChartPlanetaryPositionsResponse,
  id: PositionBodyId
): number {
  const position = response.positions.find((candidate) => candidate.id === id);
  if (!position) throw new Error(`Chart engine positions response is missing ${id}`);
  return position.longitude;
}

function snapshotForInstant(baseSnapshot: ChartInputSnapshot, instant: Date): ChartInputSnapshot {
  const parts = getLocalMinuteParts(instant, baseSnapshot.timezone);
  return {
    ...baseSnapshot,
    birthDate: [
      parts.year.toString().padStart(4, "0"),
      parts.month.toString().padStart(2, "0"),
      parts.day.toString().padStart(2, "0")
    ].join("-"),
    birthTime: [
      parts.hour.toString().padStart(2, "0"),
      parts.minute.toString().padStart(2, "0")
    ].join(":")
  };
}

function resolveSnapshotInstant(inputSnapshot: ChartInputSnapshot): Date {
  const target = parseSnapshotLocalMinute(inputSnapshot);
  const targetKey = localMinuteKey(target);
  const initialGuessMs = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute
  );
  const candidates: number[] = [];

  for (
    let candidateMs = initialGuessMs - dayMs;
    candidateMs <= initialGuessMs + dayMs;
    candidateMs += minuteMs
  ) {
    if (
      localMinuteKey(getLocalMinuteParts(new Date(candidateMs), inputSnapshot.timezone)) ===
      targetKey
    ) {
      candidates.push(candidateMs);
    }
  }

  if (candidates.length === 0) {
    throw new Error("Chart input snapshot local time cannot be resolved in timezone");
  }

  const firstCandidate = candidates[0];
  if (firstCandidate === undefined) {
    throw new Error("Chart input snapshot local time cannot be resolved in timezone");
  }
  const lastCandidate = candidates.at(-1) ?? firstCandidate;
  const selectedMs =
    inputSnapshot.dstOccurrence === "second" ? lastCandidate : firstCandidate;
  return new Date(selectedMs);
}

function parseSnapshotLocalMinute(inputSnapshot: ChartInputSnapshot): LocalMinuteParts {
  const [year, month, day] = inputSnapshot.birthDate.split("-").map(Number);
  const [hour, minute] = inputSnapshot.birthTime.split(":").map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    throw new Error("Chart input snapshot contains invalid local date or time");
  }
  return {
    year,
    month,
    day,
    hour,
    minute
  };
}

type LocalMinuteParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
};

function getLocalMinuteParts(instant: Date, timeZone: string): LocalMinuteParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(instant);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: requiredLocalNumber(byType, "year"),
    month: requiredLocalNumber(byType, "month"),
    day: requiredLocalNumber(byType, "day"),
    hour: requiredLocalNumber(byType, "hour"),
    minute: requiredLocalNumber(byType, "minute")
  };
}

function requiredLocalNumber(parts: ReadonlyMap<string, string>, type: string): number {
  const value = parts.get(type);
  if (!value) throw new Error(`Intl timezone formatter did not return ${type}`);
  return Number(value);
}

function localMinuteKey(parts: LocalMinuteParts): string {
  return [
    parts.year.toString().padStart(4, "0"),
    parts.month.toString().padStart(2, "0"),
    parts.day.toString().padStart(2, "0"),
    parts.hour.toString().padStart(2, "0"),
    parts.minute.toString().padStart(2, "0")
  ].join("-");
}
