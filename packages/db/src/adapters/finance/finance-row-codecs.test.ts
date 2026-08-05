import { describe, expect, it } from "vitest";

import {
  FinanceRowCodecError,
  decodeFinanceNumeric38,
  decodeFinancePositiveRevision,
  decodeFinanceSignedInt64,
  decodeFinanceUnsignedRevision,
  encodeFinanceNumeric38,
  encodeFinanceSignedInt64
} from "./finance-row-codecs";

describe("finance exact decimal row codecs", () => {
  it.each(["-9223372036854775808", "-1", "0", "1", "9223372036854775807"])(
    "round-trips canonical signed ArcPay int64 %s without a JavaScript number",
    (value) => {
      expect(encodeFinanceSignedInt64(decodeFinanceSignedInt64(value))).toBe(value);
    }
  );

  it.each([
    "-99999999999999999999999999999999999999",
    "-1",
    "0",
    "1",
    "99999999999999999999999999999999999999"
  ])("round-trips canonical numeric(38,0) %s", (value) => {
    expect(encodeFinanceNumeric38(decodeFinanceNumeric38(value))).toBe(value);
  });

  it("encodes a domain bigint without weakening strict database-row decoding", () => {
    expect(encodeFinanceNumeric38(10_000n)).toBe("10000");
    expect(encodeFinanceSignedInt64(-10_000n)).toBe("-10000");
    expect(() => decodeFinanceNumeric38(10_000n)).toThrow(FinanceRowCodecError);
  });

  it.each([
    "-9223372036854775809",
    "9223372036854775808",
    "1.0",
    "1e3",
    "+1",
    "00",
    "01",
    "-0",
    " 1",
    "1 ",
    1,
    9_007_199_254_740_991,
    1n,
    null
  ])("rejects unsafe or non-canonical provider int64 input %s", (value) => {
    expect(() => decodeFinanceSignedInt64(value)).toThrow(FinanceRowCodecError);
  });

  it.each([
    "-100000000000000000000000000000000000000",
    "100000000000000000000000000000000000000",
    "0.1",
    "1e2",
    "+0",
    "-0",
    "01",
    0,
    Number.MAX_SAFE_INTEGER,
    0n,
    undefined
  ])("rejects unsafe or out-of-envelope numeric(38,0) input %s", (value) => {
    expect(() => decodeFinanceNumeric38(value)).toThrow(FinanceRowCodecError);
  });

  it("keeps revision and fencing namespaces canonical and unsigned", () => {
    expect(decodeFinanceUnsignedRevision("0")).toBe("0");
    expect(decodeFinanceUnsignedRevision("99999999999999999999999999999999999999")).toBe(
      "99999999999999999999999999999999999999"
    );
    expect(decodeFinancePositiveRevision("1")).toBe("1");

    for (const invalid of ["-1", "-0", "+1", "01", "1.0", "1e3", 1]) {
      expect(() => decodeFinanceUnsignedRevision(invalid)).toThrow(FinanceRowCodecError);
    }
    for (const invalid of ["0", "-1", "01", 1]) {
      expect(() => decodeFinancePositiveRevision(invalid)).toThrow(FinanceRowCodecError);
    }
  });
});
