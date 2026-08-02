import { Temporal } from "@js-temporal/polyfill";
import { ChartBirthDataReadinessError } from "./chart-errors";

export type ChartCivilTimeResolution =
  | { readonly kind: "resolved"; readonly instant: string; readonly occurrence: null }
  | { readonly kind: "ambiguous"; readonly firstInstant: string; readonly secondInstant: string }
  | { readonly kind: "nonexistent" };

type ChartCivilTimeInput = {
  readonly date: string;
  readonly time: string;
  readonly timeZone: string;
};

export function inspectChartCivilTime(input: ChartCivilTimeInput): ChartCivilTimeResolution {
  const fields = parseCivilFields(input);
  const requested = Temporal.PlainDateTime.from(`${input.date}T${input.time}`);
  const candidates = [
    Temporal.ZonedDateTime.from(fields, { disambiguation: "earlier" }),
    Temporal.ZonedDateTime.from(fields, { disambiguation: "later" })
  ];
  const instants = [...new Set(
    candidates
      .filter((candidate) => Temporal.PlainDateTime.compare(candidate.toPlainDateTime(), requested) === 0)
      .map((candidate) => candidate.toInstant().toString())
  )].sort();

  if (instants.length === 0) return { kind: "nonexistent" };
  if (instants.length === 1) {
    return { kind: "resolved", instant: instants[0]!, occurrence: null };
  }
  return {
    kind: "ambiguous",
    firstInstant: instants[0]!,
    secondInstant: instants[1]!
  };
}

export function resolveChartCivilTime(
  input: ChartCivilTimeInput & { readonly dstOccurrence: "first" | "second" | null }
): { readonly instant: string; readonly dstOccurrence: "first" | "second" | null } {
  const resolution = inspectChartCivilTime(input);
  if (resolution.kind === "nonexistent") {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_TIME_NONEXISTENT");
  }
  if (resolution.kind === "resolved") {
    return { instant: resolution.instant, dstOccurrence: null };
  }
  if (input.dstOccurrence === null) {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_TIME_DST_OCCURRENCE_REQUIRED");
  }
  return {
    instant: input.dstOccurrence === "first" ? resolution.firstInstant : resolution.secondInstant,
    dstOccurrence: input.dstOccurrence
  };
}

function parseCivilFields(input: ChartCivilTimeInput): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly timeZone: string;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_DATE_INVALID");
  }
  if (!/^\d{2}:\d{2}$/.test(input.time)) {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_TIME_INVALID");
  }
  const [year, month, day] = input.date.split("-").map(Number);
  const [hour, minute] = input.time.split(":").map(Number);
  try {
    if (Temporal.PlainDate.from(input.date).toString() !== input.date) {
      throw new RangeError("Calendar date does not round trip");
    }
  } catch {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_DATE_INVALID");
  }
  if (hour! > 23 || minute! > 59) {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_TIME_INVALID");
  }
  try {
    Temporal.ZonedDateTime.from({
      year: year!,
      month: month!,
      day: day!,
      hour: 0,
      minute: 0,
      timeZone: input.timeZone
    });
  } catch {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_TIMEZONE_INVALID");
  }
  return { year: year!, month: month!, day: day!, hour: hour!, minute: minute!, timeZone: input.timeZone };
}
