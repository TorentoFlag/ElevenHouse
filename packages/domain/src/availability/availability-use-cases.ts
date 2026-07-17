import { Temporal } from "@js-temporal/polyfill";
import { normalizeRequiredString } from "../shared";
import {
  AvailabilityProductNotBookableError,
  AvailabilityScheduleNotFoundError,
  AvailabilityValidationError,
  AvailabilityVersionConflictError
} from "./availability-errors";
import type {
  AvailabilityProductReader,
  AvailabilityStore,
  AvailabilityStoreReplaceInput
} from "./availability-store";
import type {
  AvailabilityDateOverride,
  AvailabilityLocalPeriod,
  AvailabilitySchedule,
  AvailabilityWeeklyPeriod
} from "./availability-types";

export type ReplaceAvailabilityScheduleInput = Omit<
  AvailabilityStoreReplaceInput,
  "ownerUserId" | "scheduleId" | "now"
>;

export async function getDefaultAvailabilitySchedule(input: {
  readonly store: AvailabilityStore;
  readonly ownerUserId: string;
}): Promise<AvailabilitySchedule> {
  const schedule = await input.store.findDefaultByOwner({
    ownerUserId: normalizeRequiredString(
      input.ownerUserId,
      "Availability owner user id is required"
    )
  });
  if (!schedule) throw new AvailabilityScheduleNotFoundError();
  return schedule;
}

export async function replaceAvailabilitySchedule(input: {
  readonly store: AvailabilityStore;
  readonly productReader: AvailabilityProductReader;
  readonly ownerUserId: string;
  readonly scheduleId: string;
  readonly input: ReplaceAvailabilityScheduleInput;
  readonly now: Date;
}): Promise<AvailabilitySchedule> {
  const ownerUserId = normalizeRequiredString(
    input.ownerUserId,
    "Availability owner user id is required"
  );
  const scheduleId = normalizeRequiredString(
    input.scheduleId,
    "Availability schedule id is required"
  );
  validateReplacement(input.input);

  const bookableProductIds = new Set(
    await input.productReader.findBookableProductIds({
      ownerUserId,
      productIds: input.input.productIds
    })
  );
  const invalidProductId = input.input.productIds.find(
    (productId) => !bookableProductIds.has(productId)
  );
  if (invalidProductId) throw new AvailabilityProductNotBookableError(invalidProductId);

  const result = await input.store.replace({
    ownerUserId,
    scheduleId,
    ...input.input,
    now: input.now.toISOString()
  });

  if (result.kind === "not_found") throw new AvailabilityScheduleNotFoundError();
  if (result.kind === "version_conflict") {
    throw new AvailabilityVersionConflictError(result.currentVersion);
  }
  return result.schedule;
}

function validateReplacement(input: ReplaceAvailabilityScheduleInput): void {
  requireIntegerInRange(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER, "Expected version");
  validateTimeZone(input.timeZone);
  requireIntegerInRange(input.startIntervalMinutes, 1, 1_440, "Start interval");
  requireIntegerInRange(input.bufferBeforeMinutes, 0, 10_080, "Buffer before");
  requireIntegerInRange(input.bufferAfterMinutes, 0, 10_080, "Buffer after");
  requireIntegerInRange(input.minimumNoticeMinutes, 0, 525_600, "Minimum notice");
  requireIntegerInRange(input.bookingHorizonDays, 1, 730, "Booking horizon");
  if (input.maximumBookingsPerDay !== null) {
    requireIntegerInRange(input.maximumBookingsPerDay, 1, 100, "Maximum bookings per day");
  }

  validateWeeklyPeriods(input.weeklyPeriods);
  validateDateOverrides(input.dateOverrides);
  requireUnique(input.productIds, "Product assignments must be unique");
}

function validateTimeZone(timeZone: string): void {
  try {
    Temporal.ZonedDateTime.from({
      timeZone,
      year: 2026,
      month: 1,
      day: 1,
      hour: 0
    });
  } catch {
    throw new AvailabilityValidationError("Availability timezone is invalid");
  }
}

function validateWeeklyPeriods(periods: readonly AvailabilityWeeklyPeriod[]): void {
  if (periods.length > 84) {
    throw new AvailabilityValidationError("Too many weekly availability periods");
  }
  for (const period of periods) {
    requireIntegerInRange(period.weekday, 1, 7, "Availability weekday");
    validatePeriod(period);
  }
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    validateNoOverlap(periods.filter((period) => period.weekday === weekday));
  }
}

function validateDateOverrides(overrides: readonly AvailabilityDateOverride[]): void {
  if (overrides.length > 730) {
    throw new AvailabilityValidationError("Too many availability date overrides");
  }
  requireUnique(
    overrides.map((override) => override.date),
    "Date overrides must be unique"
  );

  for (const override of overrides) {
    validateCalendarDate(override.date);
    if (override.mode === "available" && override.periods.length === 0) {
      throw new AvailabilityValidationError("Available override requires a period");
    }
    if (override.mode === "unavailable" && override.periods.length > 0) {
      throw new AvailabilityValidationError("Unavailable override cannot contain periods");
    }
    override.periods.forEach(validatePeriod);
    validateNoOverlap(override.periods);
  }
}

function validateCalendarDate(date: string): void {
  try {
    if (Temporal.PlainDate.from(date).toString() !== date) throw new Error("Non-canonical date");
  } catch {
    throw new AvailabilityValidationError("Availability override date is invalid");
  }
}

function validatePeriod(period: AvailabilityLocalPeriod): void {
  requireIntegerInRange(period.startMinute, 0, 1_440, "Availability period start");
  requireIntegerInRange(period.endMinute, 0, 1_440, "Availability period end");
  if (period.startMinute >= period.endMinute) {
    throw new AvailabilityValidationError("Availability period start must be before end");
  }
}

function validateNoOverlap(periods: readonly AvailabilityLocalPeriod[]): void {
  const sorted = [...periods].sort(
    (left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute
  );
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous && current && current.startMinute < previous.endMinute) {
      throw new AvailabilityValidationError("Availability periods cannot overlap");
    }
  }
}

function requireIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new AvailabilityValidationError(`${label} is invalid`);
  }
}

function requireUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new AvailabilityValidationError(message);
}
