import {
  astroDiaryWorkingWeekdaysMaskBounds,
  isoWeekdayValues,
  type IsoWeekdayValue
} from "@elevenhouse/validation/products";
import type { ProductAstroDiaryConfig } from "@elevenhouse/domain";

export type AstroDiaryProductConfigColumns = {
  readonly astroDiaryReflectionCyclesPerPeriod: number | null;
  readonly astroDiaryResponseSlaWorkingDays: number | null;
  readonly astroDiaryClientResponseWindowCalendarDays: number | null;
  readonly astroDiaryWorkingWeekdaysMask: number | null;
  readonly astroDiaryServiceTimezone: string | null;
};

export function encodeAstroDiaryWorkingWeekdays(weekdays: readonly IsoWeekdayValue[]): number {
  return weekdays.reduce((mask, weekday) => mask | (1 << (weekday - 1)), 0);
}

export function decodeAstroDiaryWorkingWeekdays(mask: number): IsoWeekdayValue[] {
  if (
    !Number.isInteger(mask) ||
    mask < astroDiaryWorkingWeekdaysMaskBounds.min ||
    mask > astroDiaryWorkingWeekdaysMaskBounds.max
  ) {
    throw new Error("Invalid persisted AstroDiary working weekdays mask");
  }

  return isoWeekdayValues.filter((weekday) => (mask & (1 << (weekday - 1))) !== 0);
}

export function toAstroDiaryProductConfigColumns(
  config: ProductAstroDiaryConfig | null
): AstroDiaryProductConfigColumns {
  if (!config) {
    return {
      astroDiaryReflectionCyclesPerPeriod: null,
      astroDiaryResponseSlaWorkingDays: null,
      astroDiaryClientResponseWindowCalendarDays: null,
      astroDiaryWorkingWeekdaysMask: null,
      astroDiaryServiceTimezone: null
    };
  }

  return {
    astroDiaryReflectionCyclesPerPeriod: config.reflectionCyclesPerPeriod,
    astroDiaryResponseSlaWorkingDays: config.responseSlaWorkingDays,
    astroDiaryClientResponseWindowCalendarDays: config.clientResponseWindowCalendarDays,
    astroDiaryWorkingWeekdaysMask: encodeAstroDiaryWorkingWeekdays(config.workingWeekdays),
    astroDiaryServiceTimezone: config.serviceTimezone
  };
}

export function fromAstroDiaryProductConfigColumns(
  columns: AstroDiaryProductConfigColumns
): ProductAstroDiaryConfig | null {
  const values = [
    columns.astroDiaryReflectionCyclesPerPeriod,
    columns.astroDiaryResponseSlaWorkingDays,
    columns.astroDiaryClientResponseWindowCalendarDays,
    columns.astroDiaryWorkingWeekdaysMask,
    columns.astroDiaryServiceTimezone
  ];
  const populatedCount = values.filter((value) => value !== null).length;
  if (populatedCount === 0) return null;
  if (populatedCount !== values.length) {
    throw new Error("Incomplete persisted AstroDiary product configuration");
  }

  return {
    reflectionCyclesPerPeriod: requireNumber(
      columns.astroDiaryReflectionCyclesPerPeriod,
      "reflection cycles"
    ),
    responseSlaWorkingDays: requireNumber(
      columns.astroDiaryResponseSlaWorkingDays,
      "response SLA working days"
    ),
    clientResponseWindowCalendarDays: requireNumber(
      columns.astroDiaryClientResponseWindowCalendarDays,
      "client response window"
    ),
    workingWeekdays: decodeAstroDiaryWorkingWeekdays(
      requireNumber(columns.astroDiaryWorkingWeekdaysMask, "working weekdays mask")
    ),
    serviceTimezone: requireString(columns.astroDiaryServiceTimezone, "service timezone")
  };
}

function requireNumber(value: number | null, field: string): number {
  if (value === null) {
    throw new Error(`Missing persisted AstroDiary ${field}`);
  }
  return value;
}

function requireString(value: string | null, field: string): string {
  if (value === null) {
    throw new Error(`Missing persisted AstroDiary ${field}`);
  }
  return value;
}
