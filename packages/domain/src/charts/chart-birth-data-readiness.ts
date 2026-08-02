import { ianaTimeZoneSchema } from "@elevenhouse/validation";
import { resolveChartCivilTime } from "./chart-civil-time";
import { ChartBirthDataReadinessError } from "./chart-errors";

export type ChartBirthDataInput = {
  readonly birthDate: string | null;
  readonly birthTime: string | null;
  readonly birthTimePrecision: "exact" | "approximate" | "unknown";
  readonly birthTimezone: string | null;
  readonly birthLatitude: number | null;
  readonly birthLongitude: number | null;
  readonly birthTimeDstOccurrence: "first" | "second" | null;
};

export type ChartReadyBirthData = {
  readonly birthDate: string;
  readonly birthTime: string;
  readonly birthTimePrecision: "exact" | "approximate";
  readonly birthTimezone: string;
  readonly birthLatitude: number;
  readonly birthLongitude: number;
  readonly birthTimeDstOccurrence: "first" | "second" | null;
};

export function assertChartBirthDataReady(input: ChartBirthDataInput): ChartReadyBirthData {
  if (!input.birthDate) {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_DATE_REQUIRED");
  }
  if (!input.birthTime || input.birthTimePrecision === "unknown") {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_TIME_REQUIRED");
  }
  if (!input.birthTimezone) {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_TIMEZONE_REQUIRED");
  }

  const parsedTimezone = ianaTimeZoneSchema.safeParse(input.birthTimezone);
  if (!parsedTimezone.success) {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_TIMEZONE_INVALID");
  }
  if (input.birthLatitude === null || input.birthLongitude === null) {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_COORDINATES_REQUIRED");
  }

  const civilTime = resolveChartCivilTime({
    date: input.birthDate,
    time: input.birthTime,
    timeZone: parsedTimezone.data,
    dstOccurrence: input.birthTimeDstOccurrence
  });

  return {
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    birthTimePrecision: input.birthTimePrecision,
    birthTimezone: parsedTimezone.data,
    birthLatitude: input.birthLatitude,
    birthLongitude: input.birthLongitude,
    birthTimeDstOccurrence: civilTime.dstOccurrence
  };
}
