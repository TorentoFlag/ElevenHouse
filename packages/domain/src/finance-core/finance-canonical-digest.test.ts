import { describe, expect, it } from "vitest";
import {
  FINANCE_CANONICAL_DIGEST_ALGORITHM,
  FINANCE_CANONICAL_DIGEST_SCHEMA_VERSION,
  digestFinanceCanonicalValueV1,
  sameFinanceCanonicalValueV1
} from "./finance-canonical-digest";

describe("finance canonical digest v1", () => {
  it("is stable across object insertion order and declares its algorithm version", () => {
    const left = { amountMinor: "10000", currency: "RUB", nested: { b: 2, a: 1 } };
    const right = { nested: { a: 1, b: 2 }, currency: "RUB", amountMinor: "10000" };

    expect(digestFinanceCanonicalValueV1(left)).toBe(digestFinanceCanonicalValueV1(right));
    expect(sameFinanceCanonicalValueV1(left, right)).toBe(true);
    expect(FINANCE_CANONICAL_DIGEST_ALGORITHM).toBe("sha256");
    expect(FINANCE_CANONICAL_DIGEST_SCHEMA_VERSION).toBe(1);
  });

  it("fails closed for accessor-backed, cyclic, and unsupported values", () => {
    let getterInvoked = false;
    const accessorBacked = {};
    Object.defineProperty(accessorBacked, "amountMinor", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "10000";
      }
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => digestFinanceCanonicalValueV1(accessorBacked)).toThrow();
    expect(getterInvoked).toBe(false);
    expect(() => digestFinanceCanonicalValueV1(cyclic)).toThrow();
    expect(() => digestFinanceCanonicalValueV1({ amount: 1.5 })).toThrow();
  });
});
