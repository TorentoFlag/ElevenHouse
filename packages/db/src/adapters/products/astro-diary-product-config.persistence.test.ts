import { describe, expect, it } from "vitest";
import {
  decodeAstroDiaryWorkingWeekdays,
  encodeAstroDiaryWorkingWeekdays,
  fromAstroDiaryProductConfigColumns,
  toAstroDiaryProductConfigColumns
} from "./astro-diary-product-config.persistence";

describe("AstroDiary product working weekday persistence", () => {
  it("round-trips unique ISO weekdays through a queryable bitmask", () => {
    const mask = encodeAstroDiaryWorkingWeekdays([1, 2, 3, 4, 5]);

    expect(mask).toBe(31);
    expect(decodeAstroDiaryWorkingWeekdays(mask)).toEqual([1, 2, 3, 4, 5]);
  });

  it("maps a complete configuration to typed columns and back", () => {
    const config = {
      reflectionCyclesPerPeriod: 24,
      responseSlaWorkingDays: 3,
      clientResponseWindowCalendarDays: 10,
      workingWeekdays: [1, 3, 5] as const,
      serviceTimezone: "Europe/Moscow"
    };

    const columns = toAstroDiaryProductConfigColumns(config);

    expect(columns).toEqual({
      astroDiaryReflectionCyclesPerPeriod: 24,
      astroDiaryResponseSlaWorkingDays: 3,
      astroDiaryClientResponseWindowCalendarDays: 10,
      astroDiaryWorkingWeekdaysMask: 21,
      astroDiaryServiceTimezone: "Europe/Moscow"
    });
    expect(fromAstroDiaryProductConfigColumns(columns)).toEqual(config);
  });

  it("maps absence to all-null columns and rejects partial persisted configuration", () => {
    expect(toAstroDiaryProductConfigColumns(null)).toEqual({
      astroDiaryReflectionCyclesPerPeriod: null,
      astroDiaryResponseSlaWorkingDays: null,
      astroDiaryClientResponseWindowCalendarDays: null,
      astroDiaryWorkingWeekdaysMask: null,
      astroDiaryServiceTimezone: null
    });
    expect(fromAstroDiaryProductConfigColumns(toAstroDiaryProductConfigColumns(null))).toBeNull();

    expect(() =>
      fromAstroDiaryProductConfigColumns({
        ...toAstroDiaryProductConfigColumns(null),
        astroDiaryReflectionCyclesPerPeriod: 12
      })
    ).toThrow("Incomplete persisted AstroDiary product configuration");
  });

  it("ignores unrelated selected row columns when hydrating absent configuration", () => {
    const productRow = {
      id: "00000000-0000-4000-8000-000000000001",
      ...toAstroDiaryProductConfigColumns(null)
    };

    expect(fromAstroDiaryProductConfigColumns(productRow)).toBeNull();
  });

  it("rejects impossible persisted masks instead of hydrating fallback data", () => {
    expect(() => decodeAstroDiaryWorkingWeekdays(0)).toThrow(
      "Invalid persisted AstroDiary working weekdays mask"
    );
    expect(() => decodeAstroDiaryWorkingWeekdays(128)).toThrow(
      "Invalid persisted AstroDiary working weekdays mask"
    );
  });
});
