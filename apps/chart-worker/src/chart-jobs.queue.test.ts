import { describe, expect, it } from "vitest";
import {
  astroCalendarGenerationJobName,
  buildAstroCalendarGenerationBullMqJobId,
  buildChartCalculationBullMqJobId,
  chartCalculationJobName,
  chartCalculationQueueName,
  toAstroCalendarGenerationJobOptions,
  toChartCalculationJobOptions
} from "./chart-jobs.queue";

describe("chart jobs queue contract", () => {
  it("uses identifiers only", () => {
    const jobId = "00000000-0000-4000-8000-000000000001";

    expect(chartCalculationQueueName).toBe("chart.calculation");
    expect(chartCalculationJobName).toBe("calculate-natal-chart");
    expect(astroCalendarGenerationJobName).toBe("generate-astro-calendar");
    expect(buildChartCalculationBullMqJobId(jobId)).toBe(
      "chart-calculation-00000000-0000-4000-8000-000000000001"
    );
    expect(buildAstroCalendarGenerationBullMqJobId(jobId)).toBe(
      "astro-calendar-generation-00000000-0000-4000-8000-000000000001"
    );
  });

  it("keeps provider payload out of queue options", () => {
    expect(
      toChartCalculationJobOptions({
        jobId: "00000000-0000-4000-8000-000000000001",
        attempts: 3,
        backoffMs: 1000,
        jitter: 0.5
      })
    ).toMatchObject({
      jobId: "chart-calculation-00000000-0000-4000-8000-000000000001",
      attempts: 3
    });
  });

  it("uses stable options for astro calendar generation jobs", () => {
    expect(
      toAstroCalendarGenerationJobOptions({
        generationId: "00000000-0000-4000-8000-000000000002",
        attempts: 5,
        backoffMs: 2000,
        jitter: 0.25
      })
    ).toMatchObject({
      jobId: "astro-calendar-generation-00000000-0000-4000-8000-000000000002",
      attempts: 5
    });
  });
});
