import { describe, expect, it } from "vitest";
import { calculateAstroDiaryResponseDue } from "./astro-diary-sla";

describe("calculateAstroDiaryResponseDue", () => {
  it.each([
    ["Monday", "2026-08-10T07:00:00Z", "2026-08-12T07:00:00Z", "2026-08-12T10:00:00"],
    ["Friday", "2026-08-14T17:30:00Z", "2026-08-18T17:30:00Z", "2026-08-18T20:30:00"],
    ["Saturday", "2026-08-15T08:00:00Z", "2026-08-18T08:00:00Z", "2026-08-18T11:00:00"]
  ])(
    "counts two working days from %s without public-holiday inference",
    (_label, openedAt, dueAt, local) => {
      expect(
        calculateAstroDiaryResponseDue({
          openedAt,
          responseSlaWorkingDays: 2,
          workingWeekdays: [1, 2, 3, 4, 5],
          serviceTimezone: "Europe/Moscow"
        })
      ).toMatchObject({ dueAt, resolvedDueLocal: local, resolvedDueOffset: "+03:00" });
    }
  );

  it("chooses the first later valid instant for a DST gap", () => {
    expect(
      calculateAstroDiaryResponseDue({
        openedAt: "2026-03-28T01:30:00Z",
        responseSlaWorkingDays: 1,
        workingWeekdays: [7],
        serviceTimezone: "Europe/Berlin"
      })
    ).toMatchObject({
      dueAt: "2026-03-29T01:30:00Z",
      resolvedDueLocal: "2026-03-29T03:30:00",
      resolvedDueOffset: "+02:00"
    });
  });

  it("chooses the later instant for an ambiguous DST fold", () => {
    expect(
      calculateAstroDiaryResponseDue({
        openedAt: "2026-10-24T00:30:00Z",
        responseSlaWorkingDays: 1,
        workingWeekdays: [7],
        serviceTimezone: "Europe/Berlin"
      })
    ).toMatchObject({
      dueAt: "2026-10-25T01:30:00Z",
      resolvedDueLocal: "2026-10-25T02:30:00",
      resolvedDueOffset: "+01:00"
    });
  });
});
