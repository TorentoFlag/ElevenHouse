import { describe, expect, it } from "vitest";
import {
  createLatestPreviewGuard,
  parseNumerologyYearDraft,
  toNumerologyPreviewPeriodRequest
} from "./numerologyPeriodModel";

describe("numerologyPeriodModel", () => {
  it.each(["", "999", "10000", "2026.5", "abcd"])("rejects invalid year draft %s", (draft) => {
    expect(parseNumerologyYearDraft(draft).value).toBeNull();
  });

  it("accepts the full supported four-digit year range", () => {
    expect(parseNumerologyYearDraft("1000")).toEqual({ value: 1000, error: null });
    expect(parseNumerologyYearDraft("9999")).toEqual({ value: 9999, error: null });
  });

  it("requests a selected personal year and its months without a personal day", () => {
    expect(
      toNumerologyPreviewPeriodRequest("individual", {
        selectedYear: 2027,
        isVisible: true
      })
    ).toEqual({
      kind: "explicit",
      personalYear: { year: 2027 },
      personalMonths: { year: 2027 }
    });
  });

  it("uses the neutral contract period for compatibility and a hidden period", () => {
    expect(
      toNumerologyPreviewPeriodRequest("compatibility", {
        selectedYear: 2027,
        isVisible: true
      })
    ).toEqual({ kind: "current_year" });
    expect(
      toNumerologyPreviewPeriodRequest("individual", {
        selectedYear: 2027,
        isVisible: false
      })
    ).toEqual({ kind: "current_year" });
  });

  it("invalidates older preview identities", () => {
    const guard = createLatestPreviewGuard();
    const first = guard.begin();
    const second = guard.begin();

    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
    guard.invalidate();
    expect(guard.isCurrent(second)).toBe(false);
  });
});
