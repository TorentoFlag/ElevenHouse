import { describe, expect, it } from "vitest";
import {
  buildChartEngineSearch,
  readChartEngineUrlState,
  transitionChartEngineUrlState,
  type ChartEngineMode,
  type ChartEngineUrlState
} from "./chartEngineUrlState";

const clientId = "22222222-2222-4222-8222-222222222222";
const partnerClientId = "55555555-5555-4555-8555-555555555555";
const jobId = "33333333-3333-4333-8333-333333333333";
const calculationId = "44444444-4444-4444-8444-444444444444";

describe("chartEngineUrlState", () => {
  it.each([
    "natal",
    "child_chart",
    "transit",
    "progression",
    "synastry",
    "composite",
    "solar_return",
    "astrocartography",
    "horary"
  ] satisfies readonly ChartEngineMode[])("round-trips an active %s job", (mode) => {
    const state = stateForMode(mode, { jobId });
    const search = buildChartEngineSearch("?panel=aspects", state);

    expect(readChartEngineUrlState(search)).toEqual(state);
    expect(new URLSearchParams(search).get("panel")).toBe("aspects");
  });

  it("round-trips terminal calculation identity and safe mode-specific recovery fields", () => {
    const states: ChartEngineUrlState[] = [
      stateForMode("transit", {
        calculationId,
        transitDate: "2026-08-03",
        transitTime: "23:59"
      }),
      stateForMode("solar_return", { calculationId, solarReturnYear: 2028 }),
      stateForMode("progression", {
        calculationId,
        progressionTargetDate: "2032-02-29"
      }),
      stateForMode("horary", {
        calculationId,
        horaryPlaceProvider: "geoapify",
        horaryPlaceId: "51f2f9d2c6d5f001"
      })
    ];

    for (const state of states) {
      expect(readChartEngineUrlState(buildChartEngineSearch("", state))).toEqual(state);
    }
  });

  it("drops malformed, non-canonical and mode-incompatible values", () => {
    expect(
      readChartEngineUrlState(
        "?mode=transit&clientId=AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" +
          `&partnerClientId=${partnerClientId}` +
          `&jobId=not-a-uuid&calculationId=${calculationId}&transitDate=2026-02-30` +
          "&transitTime=24:00&solarReturnYear=2200&progressionTargetDate=bad" +
          "&horaryPlaceProvider=other&horaryPlaceId=https://example.com"
      )
    ).toEqual({
      mode: "transit",
      clientId: null,
      partnerClientId: null,
      jobId: null,
      calculationId,
      transitDate: null,
      transitTime: null,
      solarReturnYear: null,
      progressionTargetDate: null,
      horaryPlaceProvider: null,
      horaryPlaceId: null
    });
  });

  it("rejects UUID versions outside the canonical chart API range", () => {
    expect(
      readChartEngineUrlState(
        "?clientId=22222222-2222-7222-8222-222222222222" +
          "&jobId=33333333-3333-8333-8333-333333333333"
      )
    ).toMatchObject({ clientId: null, jobId: null });
  });

  it("never serializes birth data, coordinates, timezone or horary question", () => {
    const search = buildChartEngineSearch(
      "?birthDate=1990-07-15&birthTime=10%3A30&timezone=Europe%2FRome" +
        "&latitude=41.9&longitude=12.4&question=secret&birthTimeDstOccurrence=first" +
        "&birthPlaceText=Rome&partnerBirthDate=1992-08-11&inputSnapshot=private" +
        "&unknown=also-private&panel=wheel",
      stateForMode("horary", {
        horaryPlaceProvider: "geoapify",
        horaryPlaceId: "41485"
      })
    );
    const params = new URLSearchParams(search);

    expect(params.get("panel")).toBe("wheel");
    for (const forbidden of [
      "birthDate",
      "birthTime",
      "timezone",
      "latitude",
      "longitude",
      "question",
      "birthTimeDstOccurrence",
      "birthPlaceText",
      "partnerBirthDate",
      "inputSnapshot",
      "unknown"
    ]) {
      expect(params.has(forbidden)).toBe(false);
    }
  });

  it("keeps only an explicitly allowed panel value from the prior query", () => {
    expect(buildChartEngineSearch("?panel=interpretations&debug=1", stateForMode("natal"))).toBe(
      `?panel=interpretations&clientId=${clientId}`
    );
    expect(buildChartEngineSearch("?panel=private-note", stateForMode("natal"))).toBe(
      `?clientId=${clientId}`
    );
  });

  it("requires canonical year and provider-place lexical forms", () => {
    expect(
      readChartEngineUrlState("?mode=solar_return&solarReturnYear=2.026e3").solarReturnYear
    ).toBeNull();
    expect(
      readChartEngineUrlState(
        `?mode=horary&horaryPlaceProvider=geoapify&horaryPlaceId=${"a".repeat(201)}`
      )
    ).toMatchObject({ horaryPlaceProvider: null, horaryPlaceId: null });
  });

  it("clears incompatible identity when subject, partner or mode changes", () => {
    const pair = stateForMode("synastry", { jobId, partnerClientId });

    expect(transitionChartEngineUrlState(pair, { clientId: calculationId })).toMatchObject({
      mode: "synastry",
      clientId: calculationId,
      partnerClientId: null,
      jobId: null,
      calculationId: null
    });
    expect(transitionChartEngineUrlState(pair, { partnerClientId: calculationId })).toMatchObject({
      clientId,
      partnerClientId: calculationId,
      jobId: null,
      calculationId: null
    });
    expect(transitionChartEngineUrlState(pair, { mode: "solar_return" })).toEqual(
      stateForMode("solar_return")
    );
  });
});

function stateForMode(
  mode: ChartEngineMode,
  overrides: Partial<ChartEngineUrlState> = {}
): ChartEngineUrlState {
  return {
    mode,
    clientId,
    partnerClientId: mode === "synastry" || mode === "composite" ? partnerClientId : null,
    jobId: null,
    calculationId: null,
    transitDate: null,
    transitTime: null,
    solarReturnYear: null,
    progressionTargetDate: null,
    horaryPlaceProvider: null,
    horaryPlaceId: null,
    ...overrides
  };
}
