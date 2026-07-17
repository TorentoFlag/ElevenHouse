import { Temporal } from "@js-temporal/polyfill";
import type {
  AvailabilityLocalPeriod,
  AvailabilitySchedule,
  EvaluateProjectedStartInput,
  ProjectAvailableSlotsInput,
  ProjectedAvailabilitySlot,
  ProjectedStartEvaluation
} from "./availability-types";

const maximumProjectionMilliseconds = 93 * 24 * 60 * 60 * 1_000;

export function projectAvailableSlots(
  input: ProjectAvailableSlotsInput
): ProjectedAvailabilitySlot[] {
  validateProjectionInput(input);

  const { schedule } = input.context;
  const rangeStart = Temporal.Instant.from(input.rangeStartAt);
  const rangeEnd = Temporal.Instant.from(input.rangeEndAt);
  const now = Temporal.Instant.from(input.now);
  const noticeBoundary = now.add({ minutes: schedule.minimumNoticeMinutes });
  const horizonBoundary = now
    .toZonedDateTimeISO(schedule.timeZone)
    .add({ days: schedule.bookingHorizonDays })
    .toInstant();
  const firstDate = rangeStart.toZonedDateTimeISO(schedule.timeZone).toPlainDate();
  const lastDate = rangeEnd
    .subtract({ nanoseconds: 1 })
    .toZonedDateTimeISO(schedule.timeZone)
    .toPlainDate();
  const reservations = input.context.activeReservations.map((reservation) => ({
    start: Temporal.Instant.from(reservation.occupiedStartAt),
    end: Temporal.Instant.from(reservation.occupiedEndAt)
  }));
  const slots: ProjectedAvailabilitySlot[] = [];

  for (
    let date = firstDate;
    Temporal.PlainDate.compare(date, lastDate) <= 0;
    date = date.add({ days: 1 })
  ) {
    const localDate = date.toString();
    if (reachedDailyLimit(schedule, input.context.confirmedBookingCountByLocalDate, localDate)) {
      continue;
    }

    const periods = resolveEffectivePeriods(schedule, localDate, date.dayOfWeek);
    for (const period of periods) {
      for (
        let startMinute = period.startMinute;
        startMinute + input.productDurationMinutes <= period.endMinute;
        startMinute += schedule.startIntervalMinutes
      ) {
        const exactStarts = resolveExactStarts(date, startMinute, schedule.timeZone);
        for (const serviceStart of exactStarts) {
          const serviceEnd = serviceStart.add({ minutes: input.productDurationMinutes });
          const occupiedStart = serviceStart.subtract({ minutes: schedule.bufferBeforeMinutes });
          const occupiedEnd = serviceEnd.add({ minutes: schedule.bufferAfterMinutes });

          if (
            Temporal.Instant.compare(serviceStart, rangeStart) < 0 ||
            Temporal.Instant.compare(serviceStart, rangeEnd) >= 0 ||
            Temporal.Instant.compare(serviceStart, noticeBoundary) < 0 ||
            Temporal.Instant.compare(serviceStart, horizonBoundary) > 0 ||
            reservations.some((reservation) =>
              rangesOverlap(occupiedStart, occupiedEnd, reservation.start, reservation.end)
            )
          ) {
            continue;
          }

          slots.push({
            localDate,
            localStartMinute: startMinute,
            serviceStartAt: serviceStart.toString(),
            serviceEndAt: serviceEnd.toString(),
            occupiedStartAt: occupiedStart.toString(),
            occupiedEndAt: occupiedEnd.toString()
          });
        }
      }
    }
  }

  return slots.sort(
    (left, right) =>
      Temporal.Instant.compare(
        Temporal.Instant.from(left.serviceStartAt),
        Temporal.Instant.from(right.serviceStartAt)
      ) || left.localStartMinute - right.localStartMinute
  );
}

export function evaluateProjectedStart(
  input: EvaluateProjectedStartInput
): ProjectedStartEvaluation {
  if (!Number.isInteger(input.productDurationMinutes) || input.productDurationMinutes <= 0) {
    throw new Error("Product duration must be positive");
  }
  validateSchedulePolicy(input.context.schedule);

  const { schedule } = input.context;
  const serviceStart = Temporal.Instant.from(input.projectedStartAt);
  const zonedStart = serviceStart.toZonedDateTimeISO(schedule.timeZone);
  const localDateValue = zonedStart.toPlainDate();
  const localDate = localDateValue.toString();
  const localStartMinute = zonedStart.hour * 60 + zonedStart.minute;
  const periods = resolveEffectivePeriods(schedule, localDate, localDateValue.dayOfWeek);
  const matchingPeriod = periods.find(
    (period) =>
      localStartMinute >= period.startMinute &&
      localStartMinute + input.productDurationMinutes <= period.endMinute &&
      (localStartMinute - period.startMinute) % schedule.startIntervalMinutes === 0
  );
  const isExactMinute =
    zonedStart.second === 0 &&
    zonedStart.millisecond === 0 &&
    zonedStart.microsecond === 0 &&
    zonedStart.nanosecond === 0;
  const isProjectedExactStart = resolveExactStarts(
    localDateValue,
    localStartMinute,
    schedule.timeZone
  ).some((candidate) => Temporal.Instant.compare(candidate, serviceStart) === 0);

  if (!matchingPeriod || !isExactMinute || !isProjectedExactStart) {
    return { kind: "outside_availability" };
  }

  const now = Temporal.Instant.from(input.now);
  if (
    Temporal.Instant.compare(
      serviceStart,
      now.add({ minutes: schedule.minimumNoticeMinutes })
    ) < 0
  ) {
    return { kind: "notice_violation" };
  }

  const horizon = now
    .toZonedDateTimeISO(schedule.timeZone)
    .add({ days: schedule.bookingHorizonDays })
    .toInstant();
  if (Temporal.Instant.compare(serviceStart, horizon) > 0) {
    return { kind: "horizon_violation" };
  }

  if (reachedDailyLimit(schedule, input.context.confirmedBookingCountByLocalDate, localDate)) {
    return { kind: "daily_limit_reached" };
  }

  const serviceEnd = serviceStart.add({ minutes: input.productDurationMinutes });
  const occupiedStart = serviceStart.subtract({ minutes: schedule.bufferBeforeMinutes });
  const occupiedEnd = serviceEnd.add({ minutes: schedule.bufferAfterMinutes });
  const occupied = input.context.activeReservations.some((reservation) =>
    rangesOverlap(
      occupiedStart,
      occupiedEnd,
      Temporal.Instant.from(reservation.occupiedStartAt),
      Temporal.Instant.from(reservation.occupiedEndAt)
    )
  );
  if (occupied) return { kind: "occupied" };

  return {
    kind: "available",
    slot: {
      localDate,
      localStartMinute,
      serviceStartAt: serviceStart.toString(),
      serviceEndAt: serviceEnd.toString(),
      occupiedStartAt: occupiedStart.toString(),
      occupiedEndAt: occupiedEnd.toString()
    }
  };
}

function validateProjectionInput(input: ProjectAvailableSlotsInput): void {
  if (!Number.isInteger(input.productDurationMinutes) || input.productDurationMinutes <= 0) {
    throw new Error("Product duration must be positive");
  }

  const rangeStart = Temporal.Instant.from(input.rangeStartAt);
  const rangeEnd = Temporal.Instant.from(input.rangeEndAt);
  if (Temporal.Instant.compare(rangeStart, rangeEnd) >= 0) {
    throw new Error("Projection range end must be after start");
  }

  const rangeMilliseconds = Number(rangeEnd.epochMilliseconds - rangeStart.epochMilliseconds);
  if (rangeMilliseconds > maximumProjectionMilliseconds) {
    throw new Error("Projection range cannot exceed 93 days");
  }

  validateSchedulePolicy(input.context.schedule);
}

function validateSchedulePolicy(schedule: AvailabilitySchedule): void {
  if (!Number.isInteger(schedule.startIntervalMinutes) || schedule.startIntervalMinutes <= 0) {
    throw new Error("Start interval must be positive");
  }
  if (!Number.isInteger(schedule.bookingHorizonDays) || schedule.bookingHorizonDays <= 0) {
    throw new Error("Booking horizon must be positive");
  }
  Temporal.Now.zonedDateTimeISO(schedule.timeZone);
}

function resolveEffectivePeriods(
  schedule: AvailabilitySchedule,
  localDate: string,
  weekday: number
): readonly AvailabilityLocalPeriod[] {
  const override = schedule.dateOverrides.find((candidate) => candidate.date === localDate);
  if (override) return override.mode === "available" ? override.periods : [];

  return schedule.weeklyPeriods.filter((period) => period.weekday === weekday);
}

function reachedDailyLimit(
  schedule: AvailabilitySchedule,
  countByDate: Readonly<Record<string, number>>,
  localDate: string
): boolean {
  return (
    schedule.maximumBookingsPerDay !== null &&
    (countByDate[localDate] ?? 0) >= schedule.maximumBookingsPerDay
  );
}

function resolveExactStarts(
  date: Temporal.PlainDate,
  minuteOfDay: number,
  timeZone: string
): Temporal.Instant[] {
  const plainDateTime = date.toPlainDateTime({
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60
  });
  const fields = {
    timeZone,
    year: plainDateTime.year,
    month: plainDateTime.month,
    day: plainDateTime.day,
    hour: plainDateTime.hour,
    minute: plainDateTime.minute
  };
  const candidates = [
    Temporal.ZonedDateTime.from(fields, { disambiguation: "earlier" }),
    Temporal.ZonedDateTime.from(fields, { disambiguation: "later" })
  ];
  const uniqueInstants = new Map<string, Temporal.Instant>();

  for (const candidate of candidates) {
    if (Temporal.PlainDateTime.compare(candidate.toPlainDateTime(), plainDateTime) !== 0) continue;
    const instant = candidate.toInstant();
    uniqueInstants.set(instant.toString(), instant);
  }

  return [...uniqueInstants.values()].sort(Temporal.Instant.compare);
}

function rangesOverlap(
  leftStart: Temporal.Instant,
  leftEnd: Temporal.Instant,
  rightStart: Temporal.Instant,
  rightEnd: Temporal.Instant
): boolean {
  return (
    Temporal.Instant.compare(leftStart, rightEnd) < 0 &&
    Temporal.Instant.compare(rightStart, leftEnd) < 0
  );
}
