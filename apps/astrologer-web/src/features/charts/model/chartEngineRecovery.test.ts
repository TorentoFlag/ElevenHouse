import { describe, expect, it } from "vitest";
import type { ChartJobResponse } from "@elevenhouse/contracts";
import { chartEngineCopyByLocale } from "./chartEngineCopy";
import {
  buildSubmissionUrlState,
  getChartJobRecalculationTarget,
  getExactChartCalculationRefreshKeys,
  resolveChartRecalculationTarget
} from "./chartEngineRecovery";
import type { ChartEngineSubmission } from "./chartEngineSubmission";
import type { ChartEngineUrlState } from "./chartEngineUrlState";

const calculationId = "44444444-4444-4444-8444-444444444444";
const jobId = "33333333-3333-4333-8333-333333333333";
const checksum = `sha256:${"a".repeat(64)}`;

describe("chartEngineRecovery", () => {
  it("preserves the exact opaque horary place id selected by autocomplete", () => {
    const submission = {
      mode: "horary",
      clientId: "22222222-2222-4222-8222-222222222222",
      calculationId: null,
      expectedResultChecksum: null,
      settings,
      question: {
        question: "Should I sign?",
        category: "career",
        date: "2026-08-03",
        time: "12:00",
        timezone: "Europe/Moscow",
        latitude: 55.7558,
        longitude: 37.6173
      }
    } satisfies ChartEngineSubmission;

    expect(
      buildSubmissionUrlState({
        current: {
          ...emptyUrlState,
          mode: "horary",
          horaryPlaceProvider: "geoapify",
          horaryPlaceId: "opaque.autocomplete~id"
        },
        submission,
        response: { status: "calculating", jobId }
      })
    ).toMatchObject({
      horaryPlaceProvider: "geoapify",
      horaryPlaceId: "opaque.autocomplete~id"
    });
  });

  it("fails closed when pending and owner-scoped recalculation targets disagree", () => {
    expect(
      resolveChartRecalculationTarget(
        { calculationId, expectedResultChecksum: checksum },
        {
          calculationId: "55555555-5555-4555-8555-555555555555",
          expectedResultChecksum: checksum
        },
        chartEngineCopyByLocale.en.controller
      )
    ).toEqual({
      target: null,
      errorMessage: "The job status does not match the original calculation"
    });
  });

  it("accepts only the exact owner-scoped job target and publishes exact refresh keys", () => {
    const job = {
      id: jobId,
      status: "calculating",
      calculationId: null,
      interpretationMode: "adult_natal",
      targetCalculationId: calculationId,
      expectedSourceChecksum: checksum,
      failureCode: null,
      failureMessage: null
    } satisfies ChartJobResponse;

    expect(getChartJobRecalculationTarget(job, "another-job")).toBeNull();
    expect(getChartJobRecalculationTarget(job, jobId)).toEqual({
      calculationId,
      expectedResultChecksum: checksum
    });
    expect(getExactChartCalculationRefreshKeys(calculationId)).toEqual([
      ["charts", "calculations", calculationId],
      ["calculations", calculationId]
    ]);
  });
});

const settings = {
  zodiac: "tropical",
  houseSystem: "placidus",
  nodeType: "true",
  aspectPreset: "major",
  orbMultiplier: 1
} as const;

const emptyUrlState: ChartEngineUrlState = {
  mode: "natal",
  clientId: null,
  partnerClientId: null,
  jobId: null,
  calculationId: null,
  transitDate: null,
  transitTime: null,
  solarReturnYear: null,
  progressionTargetDate: null,
  horaryPlaceProvider: null,
  horaryPlaceId: null
};
