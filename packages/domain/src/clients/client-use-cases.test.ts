import { describe, expect, it } from "vitest";
import { BirthDataValidationError, normalizeClientBirthDataInput } from "./index";

describe("client birth-data normalization", () => {
  it("rejects impossible dates and times before chart readiness", () => {
    expect(() =>
      normalizeClientBirthDataInput({
        birthDate: "2026-02-31",
        birthTime: "10:30",
        birthTimePrecision: "exact",
        source: "client_profile"
      })
    ).toThrow(BirthDataValidationError);
    expect(() =>
      normalizeClientBirthDataInput({
        birthDate: "2026-02-28",
        birthTime: "24:00",
        birthTimePrecision: "exact",
        source: "client_profile"
      })
    ).toThrow(BirthDataValidationError);
  });

  it("preserves DST occurrence only for a genuine fold", () => {
    expect(
      normalizeClientBirthDataInput({
        birthDate: "2026-02-28",
        birthTime: null,
        birthTimePrecision: "unknown",
        birthTimeDstOccurrence: "first",
        source: "client_profile"
      })
    ).toMatchObject({ birthTimeDstOccurrence: null });
    expect(
      normalizeClientBirthDataInput({
        birthDate: "2024-10-27",
        birthTime: "02:30",
        birthTimePrecision: "exact",
        birthTimezone: "Europe/Berlin",
        birthTimeDstOccurrence: "first",
        source: "client_profile"
      })
    ).toMatchObject({ birthTimeDstOccurrence: "first" });
    expect(
      normalizeClientBirthDataInput({
        birthDate: "2024-10-27",
        birthTime: "02:30",
        birthTimePrecision: "exact",
        birthTimezone: "Europe/Berlin",
        birthTimeDstOccurrence: "second",
        source: "client_profile"
      })
    ).toMatchObject({ birthTimeDstOccurrence: "second" });
    expect(
      normalizeClientBirthDataInput({
        birthDate: "2026-02-28",
        birthTime: "10:30",
        birthTimePrecision: "exact",
        birthTimezone: "Europe/Rome",
        birthTimeDstOccurrence: "first",
        source: "client_profile"
      })
    ).toMatchObject({ birthTimeDstOccurrence: null });
  });
});
