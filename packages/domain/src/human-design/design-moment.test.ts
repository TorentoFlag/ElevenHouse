import { describe, expect, it } from "vitest";
import {
  resolveHumanDesignDesignMoment,
  type HumanDesignSunLongitudeProvider
} from "./design-moment";

const dayMs = 24 * 60 * 60 * 1000;

describe("Human Design Design moment solver", () => {
  it("finds the instant where the Sun is exactly 88 degrees behind birth", async () => {
    const birthInstant = new Date("2026-01-01T12:00:00.000Z");
    const provider = linearSunProvider({ birthInstant, birthSunLongitude: 100, degreesPerDay: 1 });

    const result = await resolveHumanDesignDesignMoment({
      birthInstant,
      birthSunLongitude: 100,
      getSunLongitudeAt: provider
    });

    expect(result.designInstant.getTime()).toBeCloseTo(
      new Date("2025-10-05T12:00:00.000Z").getTime(),
      -5
    );
    expect(result.targetSunLongitude).toBe(12);
    expect(result.designSunLongitude).toBeCloseTo(12, 4);
    expect(result.solarArcDegrees).toBe(88);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it("handles zodiac wrap-around when the target longitude is near the end of the circle", async () => {
    const birthInstant = new Date("2026-01-01T00:00:00.000Z");
    const provider = linearSunProvider({ birthInstant, birthSunLongitude: 20, degreesPerDay: 1 });

    const result = await resolveHumanDesignDesignMoment({
      birthInstant,
      birthSunLongitude: 20,
      getSunLongitudeAt: provider
    });

    expect(result.targetSunLongitude).toBe(292);
    expect(result.designSunLongitude).toBeCloseTo(292, 4);
  });

  it("rejects provider data that does not bracket the 88-degree target", async () => {
    const birthInstant = new Date("2026-01-01T00:00:00.000Z");
    const provider = linearSunProvider({ birthInstant, birthSunLongitude: 100, degreesPerDay: 0.1 });

    await expect(
      resolveHumanDesignDesignMoment({
        birthInstant,
        birthSunLongitude: 100,
        searchWindowDays: 10,
        getSunLongitudeAt: provider
      })
    ).rejects.toThrow("Human Design Design moment search window does not bracket the target");
  });
});

function linearSunProvider(input: {
  readonly birthInstant: Date;
  readonly birthSunLongitude: number;
  readonly degreesPerDay: number;
}): HumanDesignSunLongitudeProvider {
  return async (instant) => {
    const daysFromBirth = (instant.getTime() - input.birthInstant.getTime()) / dayMs;
    return normalize(input.birthSunLongitude + daysFromBirth * input.degreesPerDay);
  };
}

function normalize(longitude: number): number {
  const normalized = longitude % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}
