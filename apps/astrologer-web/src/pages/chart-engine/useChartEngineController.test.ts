import { describe, expect, it, vi } from "vitest";
import type { ChartNatalJobCreateResponse, ChartSettings } from "@elevenhouse/contracts";
import {
  buildChartEngineSearch,
  readChartEngineUrlState,
  submitChartCalculation
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
});

describe("chart engine URL state", () => {
  it("reads persisted client and calculation ids from the route query", () => {
    expect(
      readChartEngineUrlState(
        `?clientId=${clientId}&calculationId=${calculationId}&ignored=value`
      )
    ).toEqual({ clientId, calculationId });
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
