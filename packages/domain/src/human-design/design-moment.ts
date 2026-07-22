import { normalizeHumanDesignLongitude } from "./gate-wheel";

const defaultSolarArcDegrees = 88;
const defaultSearchWindowDays = 95;
const defaultToleranceMs = 5 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export type HumanDesignSunLongitudeProvider = (instant: Date) => Promise<number>;

export type ResolveHumanDesignDesignMomentInput = {
  readonly birthInstant: Date;
  readonly birthSunLongitude: number;
  readonly getSunLongitudeAt: HumanDesignSunLongitudeProvider;
  readonly solarArcDegrees?: number;
  readonly searchWindowDays?: number;
  readonly toleranceMs?: number;
};

export type HumanDesignDesignMomentResolution = {
  readonly birthInstant: Date;
  readonly designInstant: Date;
  readonly birthSunLongitude: number;
  readonly targetSunLongitude: number;
  readonly designSunLongitude: number;
  readonly solarArcDegrees: number;
  readonly searchWindowDays: number;
  readonly toleranceMs: number;
  readonly iterations: number;
};

export async function resolveHumanDesignDesignMoment(
  input: ResolveHumanDesignDesignMomentInput
): Promise<HumanDesignDesignMomentResolution> {
  const solarArcDegrees = input.solarArcDegrees ?? defaultSolarArcDegrees;
  const searchWindowDays = input.searchWindowDays ?? defaultSearchWindowDays;
  const toleranceMs = input.toleranceMs ?? defaultToleranceMs;
  const birthSunLongitude = normalizeHumanDesignLongitude(input.birthSunLongitude);
  const targetSunLongitude = normalizeHumanDesignLongitude(birthSunLongitude - solarArcDegrees);
  let earlyMs = input.birthInstant.getTime() - searchWindowDays * dayMs;
  let lateMs = input.birthInstant.getTime();
  const earlyBehind = await degreesBehindBirth({
    instantMs: earlyMs,
    birthSunLongitude,
    getSunLongitudeAt: input.getSunLongitudeAt
  });
  const lateBehind = await degreesBehindBirth({
    instantMs: lateMs,
    birthSunLongitude,
    getSunLongitudeAt: input.getSunLongitudeAt
  });

  if (earlyBehind < solarArcDegrees || lateBehind > solarArcDegrees) {
    throw new Error("Human Design Design moment search window does not bracket the target");
  }

  let iterations = 0;
  while (lateMs - earlyMs > toleranceMs) {
    iterations += 1;
    const midMs = Math.floor((earlyMs + lateMs) / 2);
    const midBehind = await degreesBehindBirth({
      instantMs: midMs,
      birthSunLongitude,
      getSunLongitudeAt: input.getSunLongitudeAt
    });
    if (midBehind > solarArcDegrees) {
      earlyMs = midMs;
    } else {
      lateMs = midMs;
    }
  }

  const designInstant = new Date(Math.floor((earlyMs + lateMs) / 2));
  const designSunLongitude = normalizeHumanDesignLongitude(
    await input.getSunLongitudeAt(designInstant)
  );

  return {
    birthInstant: new Date(input.birthInstant.getTime()),
    designInstant,
    birthSunLongitude,
    targetSunLongitude,
    designSunLongitude,
    solarArcDegrees,
    searchWindowDays,
    toleranceMs,
    iterations
  };
}

async function degreesBehindBirth(input: {
  readonly instantMs: number;
  readonly birthSunLongitude: number;
  readonly getSunLongitudeAt: HumanDesignSunLongitudeProvider;
}): Promise<number> {
  const candidateLongitude = normalizeHumanDesignLongitude(
    await input.getSunLongitudeAt(new Date(input.instantMs))
  );
  return normalizeHumanDesignLongitude(input.birthSunLongitude - candidateLongitude);
}
