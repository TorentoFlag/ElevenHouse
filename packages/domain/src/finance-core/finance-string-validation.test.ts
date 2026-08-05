import { describe, expect, it } from "vitest";
import { hasAsciiControlCharacter } from "./finance-string-validation";

describe("hasAsciiControlCharacter", () => {
  it("rejects C0 controls and DEL while preserving ordinary Unicode text", () => {
    expect(hasAsciiControlCharacter("invoice-42")).toBe(false);
    expect(hasAsciiControlCharacter("Оплата №42")).toBe(false);
    expect(hasAsciiControlCharacter("invoice\u0000-42")).toBe(true);
    expect(hasAsciiControlCharacter("invoice\u001f-42")).toBe(true);
    expect(hasAsciiControlCharacter("invoice\u007f-42")).toBe(true);
  });
});
