import { describe, expect, it } from "vitest";
import {
  createProviderAccountIdentityBinding,
  ProviderAccountIdentityBindingIntegrityError
} from "./provider-account-binding";

const binding = () => ({
  seriesId: "arc-series-primary",
  providerAccountId: "arc-account-primary",
  identityVersion: 3
});

describe("provider-account identity binding parser boundary", () => {
  it("returns one frozen exact binding", () => {
    const parsed = createProviderAccountIdentityBinding(binding());
    expect(parsed).toEqual(binding());
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("rejects proxies and revoked proxies before executing traps", () => {
    let trapCalls = 0;
    const proxy = new Proxy(binding(), {
      ownKeys: () => {
        trapCalls += 1;
        return [];
      },
      getPrototypeOf: () => {
        trapCalls += 1;
        return Object.prototype;
      }
    });
    expectBindingError(() => createProviderAccountIdentityBinding(proxy));
    expect(trapCalls).toBe(0);

    const revoked = Proxy.revocable(binding(), {});
    revoked.revoke();
    expectBindingError(() => createProviderAccountIdentityBinding(revoked.proxy));
  });

  it("rejects accessor, descriptor, symbol, key, prototype and container drift", () => {
    let getterCalls = 0;
    const accessor = binding();
    Object.defineProperty(accessor, "seriesId", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "arc-series-primary";
      }
    });
    const nonEnumerable = binding();
    Object.defineProperty(nonEnumerable, "seriesId", {
      enumerable: false,
      value: "arc-series-primary"
    });
    const polluted = binding();
    Object.defineProperty(polluted, "__proto__", {
      enumerable: true,
      value: { elevated: true }
    });
    const nullPrototype = Object.assign(Object.create(null), binding());

    for (const candidate of [
      accessor,
      nonEnumerable,
      { ...binding(), [Symbol("secret")]: true },
      { seriesId: "arc-series-primary", providerAccountId: "arc-account-primary" },
      { ...binding(), extra: true },
      Object.assign(Object.create({ inherited: true }), binding()),
      nullPrototype,
      polluted,
      [],
      () => null
    ]) {
      expectBindingError(() => createProviderAccountIdentityBinding(candidate));
    }
    expect(getterCalls).toBe(0);
    expect(Object.prototype).not.toHaveProperty("elevated");
  });
});

function expectBindingError(operation: () => unknown): void {
  expect(operation).toThrow(ProviderAccountIdentityBindingIntegrityError);
}
