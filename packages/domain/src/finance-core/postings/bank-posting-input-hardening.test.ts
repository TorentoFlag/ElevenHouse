import { describe, expect, it } from "vitest";
import { buildUnknownBankCreditPosting as buildUnknownBankCreditPostingWithEnvelope } from "./bank-statement-posting";
import { buildUnverifiedBankCreditSuspenseReclassificationRecipe as buildUnverifiedBankCreditSuspenseReclassificationRecipeWithEnvelope } from "./bank-suspense-reclassification";
import { expectPostingError } from "./bank-posting-test-assertions";
import { validCreditMerchantReclassificationInput } from "./bank-suspense-reclassification-test-fixtures";
import { validUnknownCreditInput } from "./bank-statement-posting-test-fixtures";
import { withPostingDecoderEnvelope } from "./posting-test-primitives";

const buildUnknownBankCreditPosting = withPostingDecoderEnvelope(
  buildUnknownBankCreditPostingWithEnvelope
);
const buildUnverifiedBankCreditSuspenseReclassificationRecipe = withPostingDecoderEnvelope(
  buildUnverifiedBankCreditSuspenseReclassificationRecipeWithEnvelope
);

describe("bank posting input hardening", () => {
  it("rejects extra fields and symbol keys at nested boundaries", () => {
    const extra = validUnknownCreditInput();
    expectPostingError(
      () =>
        buildUnknownBankCreditPosting({
          ...extra,
          authority: { ...extra.authority, silentFallback: true }
        } as never),
      "invalid_shape"
    );

    const symbol = validUnknownCreditInput() as Record<PropertyKey, unknown>;
    symbol[Symbol("hidden")] = "not allowed";
    expectPostingError(() => buildUnknownBankCreditPosting(symbol as never), "invalid_shape");
  });

  it("rejects accessors without invoking them", () => {
    let getterCalls = 0;
    const input = validUnknownCreditInput() as Record<string, unknown>;
    Object.defineProperty(input, "authority", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      }
    });
    expectPostingError(() => buildUnknownBankCreditPosting(input as never), "invalid_shape");
    expect(getterCalls).toBe(0);
  });

  it("rejects top-level and nested proxies without executing traps", () => {
    let trapCalls = 0;
    const trap = {
      get() {
        trapCalls += 1;
        throw new Error("must not execute");
      },
      getOwnPropertyDescriptor(target: object, key: PropertyKey) {
        trapCalls += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      }
    };
    expectPostingError(
      () => buildUnknownBankCreditPosting(new Proxy(validUnknownCreditInput(), trap) as never),
      "invalid_shape"
    );

    const nested = validCreditMerchantReclassificationInput();
    expectPostingError(
      () =>
        buildUnverifiedBankCreditSuspenseReclassificationRecipe({
          ...nested,
          authority: { ...nested.authority, target: new Proxy(nested.authority.target, trap) }
        } as never),
      "invalid_shape"
    );
    expect(trapCalls).toBe(0);
  });
});
