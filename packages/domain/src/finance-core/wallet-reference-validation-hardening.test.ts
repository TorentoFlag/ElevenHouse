import { describe, expect, it } from "vitest";
import { WalletProjectionIntegrityError } from "./wallet-reference-errors";
import { exactDataRecord } from "./wallet-reference-validation";

describe("wallet reference strict own-data boundary", () => {
  it("rejects non-enumerable fields in exact records", () => {
    const input = { walletId: "wallet-1", currency: "RUB" };
    Object.defineProperty(input, "currency", {
      enumerable: false,
      value: "RUB"
    });

    expect(() => exactDataRecord(input, ["walletId", "currency"] as const)).toThrow(
      WalletProjectionIntegrityError
    );
  });

  it("rejects a Proxy-backed exact record without invoking traps", () => {
    let trapCalls = 0;
    const input = new Proxy(
      { walletId: "wallet-1", currency: "RUB" },
      {
        get() {
          trapCalls += 1;
          throw new Error("must not execute");
        }
      }
    );

    expect(() => exactDataRecord(input, ["walletId", "currency"] as const)).toThrow(
      WalletProjectionIntegrityError
    );
    expect(trapCalls).toBe(0);
  });
});
