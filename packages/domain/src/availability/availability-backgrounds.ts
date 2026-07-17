import { Temporal } from "@js-temporal/polyfill";
import type { AvailabilityLocalPeriod, AvailabilitySchedule } from "./availability-types";

const maximumRangeNanoseconds = 93n * 24n * 60n * 60n * 1_000_000_000n;

export type AvailabilityBackground = {
  readonly startAt: string;
  readonly endAt: string;
};

export function projectAvailabilityBackgrounds(input: {
  readonly schedule: AvailabilitySchedule;
  readonly rangeStartAt: string;
  readonly rangeEndAt: string;
}): AvailabilityBackground[] {
  const rangeStart = parseInstant(input.rangeStartAt);
  const rangeEnd = parseInstant(input.rangeEndAt);
  const duration = rangeEnd.epochNanoseconds - rangeStart.epochNanoseconds;
  if (duration <= 0n || duration > maximumRangeNanoseconds) {
    throw new Error("Availability background range is invalid");
  }

  const firstDate = rangeStart.toZonedDateTimeISO(input.schedule.timeZone).toPlainDate();
  const lastDate = rangeEnd
    .subtract({ nanoseconds: 1 })
    .toZonedDateTimeISO(input.schedule.timeZone)
    .toPlainDate();
  const backgrounds: AvailabilityBackground[] = [];

  for (
    let date = firstDate;
    Temporal.PlainDate.compare(date, lastDate) <= 0;
    date = date.add({ days: 1 })
  ) {
    for (const period of resolvePeriods(input.schedule, date)) {
      const periodStart = instantAtMinute(date, period.startMinute, input.schedule.timeZone);
      const periodEnd = instantAtMinute(date, period.endMinute, input.schedule.timeZone);
      const clippedStart = laterInstant(periodStart, rangeStart);
      const clippedEnd = earlierInstant(periodEnd, rangeEnd);
      if (Temporal.Instant.compare(clippedStart, clippedEnd) < 0) {
        backgrounds.push({ startAt: clippedStart.toString(), endAt: clippedEnd.toString() });
      }
    }
  }

  return backgrounds;
}

function resolvePeriods(
  schedule: AvailabilitySchedule,
  date: Temporal.PlainDate
): readonly AvailabilityLocalPeriod[] {
  const override = schedule.dateOverrides.find((candidate) => candidate.date === date.toString());
  if (override) return override.mode === "available" ? override.periods : [];
  return schedule.weeklyPeriods.filter((period) => period.weekday === date.dayOfWeek);
}

function instantAtMinute(
  date: Temporal.PlainDate,
  minuteOfDay: number,
  timeZone: string
): Temporal.Instant {
  const targetDate = minuteOfDay === 1_440 ? date.add({ days: 1 }) : date;
  const normalizedMinute = minuteOfDay === 1_440 ? 0 : minuteOfDay;
  return targetDate
    .toPlainDateTime({
      hour: Math.floor(normalizedMinute / 60),
      minute: normalizedMinute % 60
    })
    .toZonedDateTime(timeZone, { disambiguation: "compatible" })
    .toInstant();
}

function parseInstant(value: string): Temporal.Instant {
  try {
    return Temporal.Instant.from(value);
  } catch {
    throw new Error("Availability background range is invalid");
  }
}

function laterInstant(left: Temporal.Instant, right: Temporal.Instant): Temporal.Instant {
  return Temporal.Instant.compare(left, right) >= 0 ? left : right;
}

function earlierInstant(left: Temporal.Instant, right: Temporal.Instant): Temporal.Instant {
  return Temporal.Instant.compare(left, right) <= 0 ? left : right;
}
