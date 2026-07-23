import { describe, expect, it, vi } from "vitest";
import type {
  ChartNatalJobCreateResponse,
  ChartSettings,
  ChartTransitMoment,
  StoredChartCalculationPayload,
  StoredChartSolarReturnCalculationPayload,
  StoredChartProgressionCalculationPayload,
  StoredChartSynastryCalculationPayload
} from "@elevenhouse/contracts";
import {
  buildChartEngineModeChangeUrlState,
  buildChartEngineSearch,
  readChartEngineUrlState,
  restoreChartEngineViewState,
  submitChartCalculation,
  submitProgressionCalculation,
  submitSolarReturnCalculation,
  submitSynastryCalculation,
  submitTransitCalculation
} from "./useChartEngineController";

const clientId = "22222222-2222-4222-8222-222222222222";
const calculationId = "44444444-4444-4444-8444-444444444444";
const calculatingResponse = {
  status: "calculating",
  jobId: "33333333-3333-4333-8333-333333333333"
} satisfies ChartNatalJobCreateResponse;

describe("chart engine controller submission", () => {
  it("recalculates an existing stale result instead of creating a separate natal job", async () => {
    const create = vi.fn(async () => calculatingResponse);
    const recalculate = vi.fn(async () => calculatingResponse);

    await expect(
      submitChartCalculation({
        clientId,
        calculationId,
        isResultStale: true,
        settings: settings(),
        create,
        recalculate
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).not.toHaveBeenCalled();
    expect(recalculate).toHaveBeenCalledWith({
      calculationId,
      clientId,
      settings: settings()
    });
  });

  it("creates a first natal job when there is no stale saved calculation", async () => {
    const create = vi.fn(async () => calculatingResponse);
    const recalculate = vi.fn(async () => calculatingResponse);

    await expect(
      submitChartCalculation({
        clientId,
        calculationId: null,
        isResultStale: false,
        settings: settings(),
        create,
        recalculate
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({ clientId, settings: settings() });
    expect(recalculate).not.toHaveBeenCalled();
  });

  it("creates a fresh job when the caller has no stale recalculation intent", async () => {
    const create = vi.fn(async () => calculatingResponse);
    const recalculate = vi.fn(async () => calculatingResponse);

    await expect(
      submitChartCalculation({
        clientId,
        calculationId,
        isResultStale: false,
        settings: settings(),
        create,
        recalculate
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({ clientId, settings: settings() });
    expect(recalculate).not.toHaveBeenCalled();
  });

  it("creates transit jobs with the selected moment without using natal recalculation", async () => {
    const create = vi.fn(async () => calculatingResponse);
    const transit = {
      date: "2026-07-22",
      time: "14:30"
    } satisfies ChartTransitMoment;

    await expect(
      submitTransitCalculation({
        clientId,
        settings: settings(),
        transit,
        create
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({
      clientId,
      settings: settings(),
      transit
    });
  });

  it("creates synastry jobs with the selected partner client", async () => {
    const create = vi.fn(async () => calculatingResponse);
    const partnerClientId = "55555555-5555-4555-8555-555555555555";

    await expect(
      submitSynastryCalculation({
        clientId,
        partnerClientId,
        settings: settings(),
        create
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({
      clientId,
      partnerClientId,
      settings: settings()
    });
  });

  it("creates solar return jobs with the selected target year", async () => {
    const create = vi.fn(async () => calculatingResponse);

    await expect(
      submitSolarReturnCalculation({
        clientId,
        year: 2026,
        settings: settings(),
        create
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({
      clientId,
      year: 2026,
      settings: settings()
    });
  });

  it("creates progression jobs with the selected target date", async () => {
    const create = vi.fn(async () => calculatingResponse);

    await expect(
      submitProgressionCalculation({
        clientId,
        targetDate: "2026-07-23",
        settings: settings(),
        create
      })
    ).resolves.toEqual(calculatingResponse);

    expect(create).toHaveBeenCalledWith({
      clientId,
      targetDate: "2026-07-23",
      settings: settings()
    });
  });
});

describe("chart engine URL state", () => {
  it("reads persisted client and calculation ids from the route query", () => {
    expect(
      readChartEngineUrlState(`?clientId=${clientId}&calculationId=${calculationId}&ignored=value`)
    ).toEqual({ clientId, partnerClientId: null, calculationId });
  });

  it("updates only chart-engine state params", () => {
    expect(
      buildChartEngineSearch("?panel=aspects&calculationId=old", {
        clientId,
        calculationId
      })
    ).toBe(`?panel=aspects&calculationId=${calculationId}&clientId=${clientId}`);

    expect(
      buildChartEngineSearch("?panel=aspects&calculationId=old", {
        clientId,
        calculationId: null
      })
    ).toBe(`?panel=aspects&clientId=${clientId}`);
  });

  it("keeps partner client id only for synastry URL state", () => {
    const partnerClientId = "55555555-5555-4555-8555-555555555555";

    expect(
      buildChartEngineSearch("?panel=aspects&partnerClientId=old", {
        mode: "synastry",
        clientId,
        partnerClientId,
        calculationId
      })
    ).toBe(
      `?panel=aspects&partnerClientId=${partnerClientId}&clientId=${clientId}&calculationId=${calculationId}`
    );

    expect(
      buildChartEngineSearch("?panel=aspects&partnerClientId=old", {
        mode: "progression",
        clientId,
        partnerClientId,
        calculationId
      })
    ).toBe(`?panel=aspects&clientId=${clientId}&calculationId=${calculationId}`);
  });

  it("clears calculation id when building URL state for a different chart mode", () => {
    const partnerClientId = "55555555-5555-4555-8555-555555555555";

    expect(
      buildChartEngineModeChangeUrlState({
        nextMode: "solar_return",
        clientId,
        partnerClientId,
        calculationId
      })
    ).toEqual({
      mode: "solar_return",
      clientId,
      partnerClientId,
      calculationId: null
    });
  });
});

describe("chart engine persisted result state", () => {
  it("restores transit mode and selected moment from a loaded calculation", () => {
    expect(restoreChartEngineViewState(transitResult())).toEqual({
      mode: "transit",
      settings: settings(),
      transitMoment: {
        date: "2026-07-22",
        time: "21:35"
      }
    });
  });

  it("restores synastry mode and partner client id from a loaded calculation", () => {
    expect(restoreChartEngineViewState(synastryResult())).toEqual({
      mode: "synastry",
      settings: settings(),
      partnerClientId: "55555555-5555-4555-8555-555555555555"
    });
  });

  it("restores solar return mode and selected year from a loaded calculation", () => {
    expect(restoreChartEngineViewState(solarReturnResult())).toEqual({
      mode: "solar_return",
      settings: settings(),
      solarReturnYear: 2026
    });
  });

  it("restores progression mode and selected target date from a loaded calculation", () => {
    expect(restoreChartEngineViewState(progressionResult())).toEqual({
      mode: "progression",
      settings: settings(),
      progressionTargetDate: "2026-07-23"
    });
  });
});

function settings(): ChartSettings {
  return {
    zodiac: "tropical",
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  };
}

function transitResult(): StoredChartCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "transit",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    transitSnapshot: {
      date: "2026-07-22",
      time: "21:35",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964
    },
    result: {
      natal: emptyRenderResult(),
      transit: emptyRenderResult(),
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function synastryResult(): StoredChartSynastryCalculationPayload {
  const natal = emptyRenderResult();

  return {
    schemaVersion: "chart-result.v1",
    method: "synastry",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    partnerInputSnapshot: {
      birthDate: "1992-08-11",
      birthTime: "08:15",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173,
      birthTimePrecision: "exact"
    },
    relationshipSnapshot: {
      primaryClientId: clientId,
      partnerClientId: "55555555-5555-4555-8555-555555555555"
    },
    result: {
      primary: natal,
      partner: natal,
      aspectsBetween: [],
      houseOverlays: [],
      warnings: []
    }
  };
}

function solarReturnResult(): StoredChartSolarReturnCalculationPayload {
  const natal = emptyRenderResult();

  return {
    schemaVersion: "chart-result.v1",
    method: "solar_return",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: transitResult().inputSnapshot,
    solarReturnSnapshot: {
      year: 2026,
      returnType: "solar",
      location: {
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964
      },
      resolvedAt: "2026-07-15T01:20:01.000Z"
    },
    result: {
      natal,
      solarReturn: natal,
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function progressionResult(): StoredChartProgressionCalculationPayload {
  const natal = emptyRenderResult();

  return {
    schemaVersion: "chart-result.v1",
    method: "progression",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot: transitResult().inputSnapshot,
    progressionSnapshot: {
      targetDate: "2026-07-23",
      progressionType: "secondary",
      calculationBasis: {
        symbolicDate: "1990-08-20",
        ageDays: 36,
        dayForYearRatio: 1
      }
    },
    result: {
      natal,
      progressed: natal,
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function emptyRenderResult(): StoredChartCalculationPayload["result"] extends infer Result
  ? Result extends { readonly natal: infer Render }
    ? Render
    : never
  : never {
  return {
    points: [],
    houses: [],
    aspects: [],
    distributions: {
      elements: { fire: 0, earth: 0, air: 0, water: 0 },
      modalities: { cardinal: 0, fixed: 0, mutable: 0 },
      polarity: { masculine: 0, feminine: 0 }
    },
    warnings: []
  };
}
