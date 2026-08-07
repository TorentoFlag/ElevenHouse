import { describe, expect, it } from "vitest";
import {
  ArcProviderAccountIntegrityError,
  createArcProviderAccountIdentity,
  replaceArcProviderAccountIdentity,
  sameArcProviderAccountIdentity
} from "./provider-account";

const accountInput = () => ({
  providerAccountId: "arc-account-primary",
  identityVersion: 1,
  provider: "arc_pay" as const,
  merchantTenantId: "merchant-elevenhouse",
  terminalScope: "hosted-checkout",
  settlementScope: "merchant-settlement"
});

describe("ArcPay provider-account identity", () => {
  it("does not make the API-key environment part of the stored merchant identity", () => {
    const account = createArcProviderAccountIdentity({
      providerAccountId: "arc-account-primary",
      identityVersion: 1,
      provider: "arc_pay",
      merchantTenantId: "merchant-elevenhouse",
      terminalScope: "hosted-checkout",
      settlementScope: "merchant-settlement"
    });

    expect(account).toEqual({
      providerAccountId: "arc-account-primary",
      identityVersion: 1,
      provider: "arc_pay",
      merchantTenantId: "merchant-elevenhouse",
      terminalScope: "hosted-checkout",
      settlementScope: "merchant-settlement"
    });
    expect(account).not.toHaveProperty("environment");
  });

  it("creates a frozen identity from provider, tenant, terminal and settlement scope", () => {
    const account = createArcProviderAccountIdentity(accountInput());

    expect(account).toEqual(accountInput());
    expect(Object.isFrozen(account)).toBe(true);
    expect(account).not.toHaveProperty("currency");
    expect(() => {
      (account as unknown as { terminalScope: string }).terminalScope = "saved-card";
    }).toThrow(TypeError);
  });

  it("does not treat two provider accounts as the same identity because balances use one currency", () => {
    const primary = createArcProviderAccountIdentity(accountInput());
    const secondary = createArcProviderAccountIdentity({
      ...accountInput(),
      providerAccountId: "arc-account-secondary",
      terminalScope: "saved-card"
    });

    expect(sameArcProviderAccountIdentity(primary, secondary)).toBe(false);
    expect(sameArcProviderAccountIdentity(primary, primary)).toBe(true);
  });

  it("does not trust a forged provider-account snapshot", () => {
    const account = createArcProviderAccountIdentity(accountInput());
    const forged = { ...account, currency: "RUB" };

    expectProviderAccountError(
      () => sameArcProviderAccountIdentity(account, forged),
      "unknown_field"
    );
  });

  it("rejects accessor identities without invoking the accessor", () => {
    let getterCalls = 0;
    const candidate = { ...accountInput() };
    Object.defineProperty(candidate, "merchantTenantId", {
      configurable: true,
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "merchant-elevenhouse";
      }
    });

    expectProviderAccountError(() => createArcProviderAccountIdentity(candidate), "invalid_shape");
    expect(getterCalls).toBe(0);
  });

  it("rejects proxies and revoked proxies without executing traps", () => {
    let trapCalls = 0;
    const proxy = new Proxy(accountInput(), {
      ownKeys: () => {
        trapCalls += 1;
        return [];
      },
      getPrototypeOf: () => {
        trapCalls += 1;
        return Object.prototype;
      }
    });

    expectProviderAccountError(() => createArcProviderAccountIdentity(proxy), "invalid_shape");
    expect(trapCalls).toBe(0);

    const revoked = Proxy.revocable(accountInput(), {});
    revoked.revoke();
    expectProviderAccountError(
      () => createArcProviderAccountIdentity(revoked.proxy),
      "invalid_shape"
    );
  });

  it("rejects symbol, non-enumerable and custom-prototype identity fields", () => {
    const symbolCandidate = { ...accountInput(), [Symbol("secret")]: "hidden" };
    const nonEnumerableCandidate = { ...accountInput() };
    Object.defineProperty(nonEnumerableCandidate, "secret", {
      enumerable: false,
      value: "hidden"
    });
    const customPrototypeCandidate = Object.assign(Object.create({ marker: true }), accountInput());

    expectProviderAccountError(
      () => createArcProviderAccountIdentity(symbolCandidate),
      "unknown_field"
    );
    expectProviderAccountError(
      () => createArcProviderAccountIdentity(nonEnumerableCandidate),
      "unknown_field"
    );
    expectProviderAccountError(
      () => createArcProviderAccountIdentity(customPrototypeCandidate),
      "invalid_shape"
    );
  });

  it("rejects missing, function, array and prototype-pollution shapes with stable reasons", () => {
    const missingField = { ...accountInput() };
    Reflect.deleteProperty(missingField, "settlementScope");
    const polluted = { ...accountInput() };
    Object.defineProperty(polluted, "__proto__", {
      enumerable: true,
      value: { elevated: true }
    });

    expectProviderAccountError(
      () => createArcProviderAccountIdentity(missingField),
      "invalid_shape"
    );
    expectProviderAccountError(() => createArcProviderAccountIdentity([]), "invalid_shape");
    expectProviderAccountError(() => createArcProviderAccountIdentity(() => null), "invalid_shape");
    expectProviderAccountError(() => createArcProviderAccountIdentity(polluted), "unknown_field");
    expect(Object.prototype).not.toHaveProperty("elevated");
  });

  it.each([
    [{ ...accountInput(), provider: "another_provider" }, "invalid_field"],
    [{ ...accountInput(), environment: "sandbox" }, "unknown_field"],
    [{ ...accountInput(), identityVersion: 0 }, "invalid_field"],
    [{ ...accountInput(), merchantTenantId: " " }, "invalid_field"],
    [{ ...accountInput(), currency: "RUB" }, "unknown_field"]
  ])("rejects an invalid or non-identity field", (candidate, reason) => {
    expectProviderAccountError(() => createArcProviderAccountIdentity(candidate), reason);
  });

  it("replaces an account only with a new identity id and the next identity version", () => {
    const current = createArcProviderAccountIdentity(accountInput());

    const replacement = replaceArcProviderAccountIdentity({
      current,
      expectedIdentityVersion: 1,
      replacement: {
        ...accountInput(),
        providerAccountId: "arc-account-live",
        identityVersion: 2
      }
    });

    expect(replacement).toEqual({
      ...accountInput(),
      providerAccountId: "arc-account-live",
      identityVersion: 2
    });
    expect(current).toEqual(accountInput());
    expect(Object.isFrozen(replacement)).toBe(true);
  });

  it("rejects stale replacement, reused identity id and in-place identity changes", () => {
    const current = createArcProviderAccountIdentity(accountInput());

    expectProviderAccountError(
      () =>
        replaceArcProviderAccountIdentity({
          current,
          expectedIdentityVersion: 0,
          replacement: {
            ...accountInput(),
            providerAccountId: "arc-account-live",
            identityVersion: 2
          }
        }),
      "stale_identity_version"
    );
    expectProviderAccountError(
      () =>
        replaceArcProviderAccountIdentity({
          current,
          expectedIdentityVersion: 1,
          replacement: { ...accountInput(), identityVersion: 2 }
        }),
      "identity_id_reused"
    );
    expectProviderAccountError(
      () =>
        replaceArcProviderAccountIdentity({
          current,
          expectedIdentityVersion: 1,
          replacement: {
            ...accountInput(),
            providerAccountId: "arc-account-live",
            identityVersion: 1
          }
        }),
      "replacement_version_invalid"
    );
  });
});

function expectProviderAccountError(operation: () => unknown, reason: string): void {
  try {
    operation();
    throw new Error("Expected provider-account validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ArcProviderAccountIntegrityError);
    expect((error as ArcProviderAccountIntegrityError).reason).toBe(reason);
  }
}
