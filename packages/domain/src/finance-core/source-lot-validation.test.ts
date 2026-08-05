import { describe, expect, it } from "vitest";

import { PayableSourceLotIntegrityError } from "./source-lot-types";
import { dataRecord, exactDataArray, exactDataRecord } from "./source-lot-validation";

describe("source-lot strict own-data boundaries", () => {
  it("copies plain and null-prototype records into frozen null-prototype data", () => {
    const nullPrototype = Object.assign(Object.create(null), { sourceId: "order-1" });

    for (const candidate of [{ sourceId: "order-1" }, nullPrototype]) {
      const parsed = dataRecord(candidate);
      expect(parsed).toEqual({ sourceId: "order-1" });
      expect(Object.getPrototypeOf(parsed)).toBeNull();
      expect(Object.isFrozen(parsed)).toBe(true);
    }
  });

  it("rejects record proxies and revoked proxies before executing traps", () => {
    let trapCalls = 0;
    const proxy = new Proxy(
      { sourceId: "order-1" },
      {
        ownKeys: () => {
          trapCalls += 1;
          return [];
        },
        getPrototypeOf: () => {
          trapCalls += 1;
          return Object.prototype;
        }
      }
    );

    expectSourceLotError(() => dataRecord(proxy), "invalid_shape");
    expect(trapCalls).toBe(0);

    const revoked = Proxy.revocable({ sourceId: "order-1" }, {});
    revoked.revoke();
    expectSourceLotError(() => dataRecord(revoked.proxy), "invalid_shape");
  });

  it("rejects hostile record descriptors, symbols, prototypes and containers without access", () => {
    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, "sourceId", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "order-1";
      }
    });
    const nonEnumerable = {};
    Object.defineProperty(nonEnumerable, "sourceId", {
      enumerable: false,
      value: "order-1"
    });

    for (const candidate of [
      accessor,
      nonEnumerable,
      { sourceId: "order-1", [Symbol("secret")]: true },
      Object.assign(Object.create({ inherited: true }), { sourceId: "order-1" }),
      [],
      () => null
    ]) {
      expectSourceLotError(() => dataRecord(candidate), "invalid_shape");
    }
    expect(getterCalls).toBe(0);
  });

  it("keeps an own __proto__ field inert on the null-prototype projection", () => {
    const candidate = Object.create(null) as Record<string, unknown>;
    candidate.sourceId = "order-1";
    Object.defineProperty(candidate, "__proto__", {
      enumerable: true,
      value: { elevated: true }
    });

    const parsed = dataRecord(candidate);
    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(parsed.__proto__).toEqual({ elevated: true });
    expect(Object.prototype).not.toHaveProperty("elevated");
  });

  it("rejects missing and unknown exact record keys", () => {
    expectSourceLotError(() => exactDataRecord({}, ["sourceId"]), "invalid_shape");
    expectSourceLotError(
      () => exactDataRecord({ sourceId: "order-1", extra: true }, ["sourceId"]),
      "invalid_shape"
    );
  });

  it("returns a frozen exact ordinary array", () => {
    const parsed = exactDataArray(["lot-1", "lot-2"]);
    expect(parsed).toEqual(["lot-1", "lot-2"]);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("rejects array proxies and revoked proxies before executing traps", () => {
    let trapCalls = 0;
    const proxy = new Proxy(["lot-1"], {
      ownKeys: () => {
        trapCalls += 1;
        return ["0", "length"];
      },
      getPrototypeOf: () => {
        trapCalls += 1;
        return Array.prototype;
      }
    });

    expectSourceLotError(() => exactDataArray(proxy), "invalid_shape");
    expect(trapCalls).toBe(0);

    const revoked = Proxy.revocable(["lot-1"], {});
    revoked.revoke();
    expectSourceLotError(() => exactDataArray(revoked.proxy), "invalid_shape");
  });

  it("rejects hostile array descriptors, symbols, sparseness, prototypes and containers", () => {
    let getterCalls = 0;
    const accessor = ["lot-1"];
    Object.defineProperty(accessor, "0", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "lot-1";
      }
    });
    const nonEnumerable = ["lot-1"];
    Object.defineProperty(nonEnumerable, "0", {
      enumerable: false,
      value: "lot-1"
    });
    const withSymbol = ["lot-1"];
    Object.defineProperty(withSymbol, Symbol("secret"), { value: true });
    const withExtra = ["lot-1"] as unknown[] & { extra?: boolean };
    withExtra.extra = true;
    const sparse = new Array(1);
    const customPrototype = ["lot-1"];
    Object.setPrototypeOf(customPrototype, Object.create(Array.prototype));

    for (const candidate of [
      accessor,
      nonEnumerable,
      withSymbol,
      withExtra,
      sparse,
      customPrototype,
      {},
      () => null
    ]) {
      expectSourceLotError(() => exactDataArray(candidate), "invalid_shape");
    }
    expect(getterCalls).toBe(0);
  });
});

function expectSourceLotError(operation: () => unknown, reason: string): void {
  try {
    operation();
    throw new Error("Expected source-lot validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(PayableSourceLotIntegrityError);
    expect((error as PayableSourceLotIntegrityError).reason).toBe(reason);
  }
}
