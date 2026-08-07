import { describe, expect, it } from "vitest";

import { createArcProviderAccountIdentity } from "./provider-account";
import {
  ArcProviderAccountSeriesIntegrityError,
  createArcProviderAccountSeries,
  replaceArcProviderAccountSeries
} from "./provider-account-series";

const identity = (overrides: Record<string, unknown> = {}) =>
  createArcProviderAccountIdentity({
    providerAccountId: "arc-account-sandbox",
    identityVersion: 1,
    provider: "arc_pay",
    merchantTenantId: "merchant-elevenhouse",
    terminalScope: "primary-terminal",
    settlementScope: "merchant-settlement",
    ...overrides
  });

describe("ArcPay provider-account series", () => {
  it("registers one version-one identity as the exact current series head", () => {
    const state = createArcProviderAccountSeries({
      seriesId: "arc-series-primary",
      identity: identity()
    });

    expect(state).toEqual({
      seriesId: "arc-series-primary",
      version: 1,
      current: identity(),
      predecessorProviderAccountId: null
    });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("replaces the exact current head and emits an adjacent predecessor link", () => {
    const current = createArcProviderAccountSeries({
      seriesId: "arc-series-primary",
      identity: identity()
    });

    const result = replaceArcProviderAccountSeries({
      current,
      expectedSeriesVersion: 1,
      expectedCurrentProviderAccountId: "arc-account-sandbox",
      replacement: identity({
        providerAccountId: "arc-account-live",
        identityVersion: 2
      })
    });

    expect(result.state).toEqual({
      seriesId: "arc-series-primary",
      version: 2,
      current: identity({
        providerAccountId: "arc-account-live",
        identityVersion: 2
      }),
      predecessorProviderAccountId: "arc-account-sandbox"
    });
    expect(result.link).toEqual({
      seriesId: "arc-series-primary",
      predecessorProviderAccountId: "arc-account-sandbox",
      predecessorIdentityVersion: 1,
      replacementProviderAccountId: "arc-account-live",
      replacementIdentityVersion: 2,
      previousSeriesVersion: 1,
      nextSeriesVersion: 2
    });
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.link)).toBe(true);
  });

  it.each([
    {
      expectedSeriesVersion: 0,
      expectedCurrentProviderAccountId: "arc-account-sandbox"
    },
    {
      expectedSeriesVersion: 1,
      expectedCurrentProviderAccountId: "arc-account-foreign"
    }
  ])("rejects stale or foreign series replacement authority: %o", (authority) => {
    const current = createArcProviderAccountSeries({
      seriesId: "arc-series-primary",
      identity: identity()
    });

    expect(() =>
      replaceArcProviderAccountSeries({
        current,
        ...authority,
        replacement: identity({
          providerAccountId: "arc-account-live",
          identityVersion: 2
        })
      })
    ).toThrow(ArcProviderAccountSeriesIntegrityError);
  });

  it("rejects registration from an already versioned identity and replacement gaps", () => {
    expect(() =>
      createArcProviderAccountSeries({
        seriesId: "arc-series-primary",
        identity: identity({ providerAccountId: "arc-account-v2", identityVersion: 2 })
      })
    ).toThrow(ArcProviderAccountSeriesIntegrityError);

    const current = createArcProviderAccountSeries({
      seriesId: "arc-series-primary",
      identity: identity()
    });
    expect(() =>
      replaceArcProviderAccountSeries({
        current,
        expectedSeriesVersion: 1,
        expectedCurrentProviderAccountId: "arc-account-sandbox",
        replacement: identity({ providerAccountId: "arc-account-v3", identityVersion: 3 })
      })
    ).toThrow(ArcProviderAccountSeriesIntegrityError);
  });

  it("rejects proxies and revoked proxies without executing traps", () => {
    const input = { seriesId: "arc-series-primary", identity: identity() };
    let trapCalls = 0;
    const proxy = new Proxy(input, {
      ownKeys: () => {
        trapCalls += 1;
        return [];
      },
      getPrototypeOf: () => {
        trapCalls += 1;
        return Object.prototype;
      }
    });

    expectSeriesError(() => createArcProviderAccountSeries(proxy), "invalid_shape");
    expect(trapCalls).toBe(0);

    const revoked = Proxy.revocable(input, {});
    revoked.revoke();
    expectSeriesError(() => createArcProviderAccountSeries(revoked.proxy), "invalid_shape");
  });

  it("rejects accessor, descriptor, symbol, key and prototype-pollution shapes", () => {
    let getterCalls = 0;
    const accessor = { seriesId: "arc-series-primary", identity: identity() };
    Object.defineProperty(accessor, "identity", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return identity();
      }
    });
    const nonEnumerable = { seriesId: "arc-series-primary", identity: identity() };
    Object.defineProperty(nonEnumerable, "identity", {
      enumerable: false,
      value: identity()
    });
    const polluted = { seriesId: "arc-series-primary", identity: identity() };
    Object.defineProperty(polluted, "__proto__", {
      enumerable: true,
      value: { elevated: true }
    });

    for (const candidate of [
      accessor,
      nonEnumerable,
      { seriesId: "arc-series-primary", identity: identity(), [Symbol("secret")]: true },
      { seriesId: "arc-series-primary" },
      { seriesId: "arc-series-primary", identity: identity(), extra: true },
      Object.assign(Object.create({ inherited: true }), {
        seriesId: "arc-series-primary",
        identity: identity()
      }),
      polluted,
      [],
      () => null
    ]) {
      expectSeriesError(() => createArcProviderAccountSeries(candidate), "invalid_shape");
    }
    expect(getterCalls).toBe(0);
    expect(Object.prototype).not.toHaveProperty("elevated");
  });
});

function expectSeriesError(operation: () => unknown, reason: string): void {
  try {
    operation();
    throw new Error("Expected provider-account series validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ArcProviderAccountSeriesIntegrityError);
    expect((error as ArcProviderAccountSeriesIntegrityError).reason).toBe(reason);
  }
}
