import { describe, expect, it } from "vitest";
import { moneySchema, nonZeroMoneySchema, rubCurrencySchema } from "./money";

describe("money contracts", () => {
  it("accepts integer RUB minor-unit money", () => {
    expect(moneySchema.parse({ amountMinor: 500_00, currency: "RUB" })).toEqual({
      amountMinor: 500_00,
      currency: "RUB"
    });
  });

  it("rejects fractional, negative, unsafe and unknown-currency money", () => {
    expect(() => moneySchema.parse({ amountMinor: 10.5, currency: "RUB" })).toThrow();
    expect(() => moneySchema.parse({ amountMinor: -1, currency: "RUB" })).toThrow();
    expect(() =>
      moneySchema.parse({ amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "RUB" })
    ).toThrow();
    expect(() => moneySchema.parse({ amountMinor: 100, currency: "USD" })).toThrow();
    expect(() => rubCurrencySchema.parse("EUR")).toThrow();
  });

  it("can require a non-zero positive amount where zero is invalid", () => {
    expect(nonZeroMoneySchema.parse({ amountMinor: 1, currency: "RUB" })).toEqual({
      amountMinor: 1,
      currency: "RUB"
    });
    expect(() => nonZeroMoneySchema.parse({ amountMinor: 0, currency: "RUB" })).toThrow();
  });
});
