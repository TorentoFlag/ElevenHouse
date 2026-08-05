import { describe, expect, it } from "vitest";
import {
  FinancePostingIntegrityError,
  readExactDataArray,
  readFinancePostingUnsignedDecimal
} from "./posting-codec";

describe("finance posting codec", () => {
  it("reads canonical unsigned decimals and exact dense arrays", () => {
    expect(readFinancePostingUnsignedDecimal("9007199254740993", 32)).toBe("9007199254740993");
    expect(readExactDataArray(["first", "second"], 0, 2)).toEqual(["first", "second"]);
  });

  it("preserves typed failures for non-canonical decimals", () => {
    expect(() => readFinancePostingUnsignedDecimal("01", 32)).toThrowError(
      expect.objectContaining<Partial<FinancePostingIntegrityError>>({
        code: "finance_posting_integrity_error",
        reason: "invalid_version"
      })
    );
  });
});
