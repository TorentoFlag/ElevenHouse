import { describe, expect, it } from "vitest";
import {
  readStrictOwnDataArray,
  readStrictOwnDataRecord,
  type StrictOwnDataFailureReason
} from "./strict-own-data";

class TestBoundaryError extends Error {
  constructor(readonly reason: StrictOwnDataFailureReason) {
    super(reason);
  }
}

const fail = (reason: StrictOwnDataFailureReason): never => {
  throw new TestBoundaryError(reason);
};

describe("strict own-data boundary", () => {
  it("copies exact plain and null-prototype records without prototype pollution", () => {
    const nullPrototype = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(nullPrototype, "__proto__", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "opaque-value"
    });
    nullPrototype.amountMinor = "100";

    const parsed = readStrictOwnDataRecord(
      nullPrototype,
      ["__proto__", "amountMinor"] as const,
      fail
    );

    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(parsed.__proto__).toBe("opaque-value");
    expect(parsed.amountMinor).toBe("100");
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(readStrictOwnDataRecord({ currency: "RUB" }, ["currency"] as const, fail)).toEqual({
      currency: "RUB"
    });
  });

  it("rejects proxies and accessors before invoking hostile traps or getters", () => {
    let trapInvoked = false;
    const hostileProxy = new Proxy(
      { value: "x" },
      {
        ownKeys() {
          trapInvoked = true;
          throw new Error("hostile ownKeys trap");
        },
        getPrototypeOf() {
          trapInvoked = true;
          throw new Error("hostile prototype trap");
        }
      }
    );
    let getterInvoked = false;
    const accessor = {};
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "x";
      }
    });

    expectFailure(() => readStrictOwnDataRecord(hostileProxy, ["value"] as const, fail), "proxy");
    expect(trapInvoked).toBe(false);
    expectFailure(() => readStrictOwnDataRecord(accessor, ["value"] as const, fail), "accessor");
    expect(getterInvoked).toBe(false);

    const revoked = Proxy.revocable({ value: "x" }, {});
    revoked.revoke();
    expectFailure(() => readStrictOwnDataRecord(revoked.proxy, ["value"] as const, fail), "proxy");
  });

  it("enforces exact record keys and symbol-free bounded dense arrays", () => {
    expectFailure(
      () => readStrictOwnDataRecord({ expected: 1, extra: 2 }, ["expected"] as const, fail),
      "unexpected_key"
    );

    const sparse = Array<unknown>(2);
    sparse[1] = "present";
    expectFailure(() => readStrictOwnDataArray(sparse, 2, fail), "sparse_array");
    expectFailure(() => readStrictOwnDataArray([1, 2, 3], 2, fail), "array_limit");

    const custom = ["value"] as unknown[] & { extra?: string };
    custom.extra = "forbidden";
    expectFailure(() => readStrictOwnDataArray(custom, 2, fail), "unexpected_key");

    class ArraySubclass extends Array<unknown> {}
    expectFailure(
      () => readStrictOwnDataArray(new ArraySubclass("value"), 2, fail),
      "invalid_container"
    );

    const parsed = readStrictOwnDataArray(["a", "b"], 2, fail);
    expect(parsed).toEqual(["a", "b"]);
    expect(Object.isFrozen(parsed)).toBe(true);
  });
});

function expectFailure(action: () => unknown, reason: StrictOwnDataFailureReason): void {
  try {
    action();
    throw new Error("Expected strict own-data failure");
  } catch (error) {
    expect(error).toBeInstanceOf(TestBoundaryError);
    expect((error as TestBoundaryError).reason).toBe(reason);
  }
}
