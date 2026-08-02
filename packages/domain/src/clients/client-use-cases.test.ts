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

  it("drops a DST occurrence when no civil time exists", () => {
    expect(
      normalizeClientBirthDataInput({
        birthDate: "2026-02-28",
        birthTime: null,
        birthTimePrecision: "unknown",
        birthTimeDstOccurrence: "first",
        source: "client_profile"
      })
    ).toMatchObject({ birthTimeDstOccurrence: null });
  });
});
