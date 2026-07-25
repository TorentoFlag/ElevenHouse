import { describe, expect, it } from "vitest";
import { allocateBps, type Money } from "./money";

describe("domain money helpers", () => {
  it("keeps money typed as integer RUB minor units", () => {
    const amount: Money = { amountMinor: 500_00, currency: "RUB" };

    expect(amount).toEqual({ amountMinor: 500_00, currency: "RUB" });
  });

  it("allocates basis points with integer half-up rounding and no fractional output", () => {
    expect(allocateBps({ amountMinor: 999, bps: 333 })).toEqual({
      feeMinor: 33,
      remainderMinor: 966
    });
    expect(Number.isInteger(allocateBps({ amountMinor: 999, bps: 333 }).feeMinor)).toBe(true);
  });

  it("allocates the full range of bps", () => {
    expect(allocateBps({ amountMinor: 10_00, bps: 0 })).toEqual({
      feeMinor: 0,
      remainderMinor: 10_00
    });
    expect(allocateBps({ amountMinor: 10_00, bps: 10_000 })).toEqual({
      feeMinor: 10_00,
      remainderMinor: 0
    });
  });

  it("rejects invalid amounts and bps", () => {
    expect(() => allocateBps({ amountMinor: 10.5, bps: 100 })).toThrow();
    expect(() => allocateBps({ amountMinor: -1, bps: 100 })).toThrow();
    expect(() => allocateBps({ amountMinor: Number.MAX_SAFE_INTEGER + 1, bps: 100 })).toThrow();
    expect(() => allocateBps({ amountMinor: 100, bps: 100.5 })).toThrow();
    expect(() => allocateBps({ amountMinor: 100, bps: 10_001 })).toThrow();
  });
});
