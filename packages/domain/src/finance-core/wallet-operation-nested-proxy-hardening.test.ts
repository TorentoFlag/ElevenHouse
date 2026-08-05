import { describe, expect, it } from "vitest";
import {
  compareUnverifiedWalletOperation,
  WalletOperationProjectionIntegrityError
} from "./wallet-operation-projection";
import {
  payoutFixture,
  walletProjectionDecoderEnvelope
} from "./wallet-operation-projection.fixture";

const hostileLocations = [
  "operation snapshot source key",
  "journal source key",
  "journal entry",
  "journal entry account",
  "journal entry amount",
  "journal entry links"
] as const;

describe("wallet-operation nested Proxy hardening", () => {
  it.each(hostileLocations)("rejects a Proxy-backed %s without invoking any traps", (location) => {
    const baseline = payoutFixture();
    const firstEntry = baseline.journalTransaction.entries[0];
    if (!firstEntry) throw new Error("Missing journal-entry fixture");

    const target =
      location === "operation snapshot source key"
        ? baseline.operationSnapshot.sourceKey
        : location === "journal source key"
          ? baseline.journalTransaction.sourceKey
          : location === "journal entry"
            ? firstEntry
            : location === "journal entry account"
              ? firstEntry.account
              : location === "journal entry amount"
                ? firstEntry.amount
                : firstEntry.links;
    let trapCalls = 0;
    const failTrap = () => {
      trapCalls += 1;
      throw new Error("Hostile nested Proxy trap must not execute");
    };
    const proxy = new Proxy(target, {
      get: failTrap,
      getPrototypeOf: failTrap,
      ownKeys: failTrap,
      getOwnPropertyDescriptor: failTrap
    });
    const input = nestedProxyInput(location, baseline, proxy);

    expectTypedIntegrityError(() =>
      compareUnverifiedWalletOperation(
        input,
        walletProjectionDecoderEnvelope,
        baseline.operationSnapshot.unverifiedLimitPolicy
      )
    );
    expect(trapCalls).toBe(0);
  });
});

function nestedProxyInput(
  location: (typeof hostileLocations)[number],
  baseline: ReturnType<typeof payoutFixture>,
  proxy: object
): Record<string, unknown> {
  if (location === "operation snapshot source key") {
    return {
      ...baseline,
      operationSnapshot: { ...baseline.operationSnapshot, sourceKey: proxy }
    };
  }

  const firstEntry = baseline.journalTransaction.entries[0];
  if (!firstEntry) throw new Error("Missing journal-entry fixture");
  const hostileEntry =
    location === "journal entry"
      ? proxy
      : {
          ...firstEntry,
          ...(location === "journal entry account" ? { account: proxy } : {}),
          ...(location === "journal entry amount" ? { amount: proxy } : {}),
          ...(location === "journal entry links" ? { links: proxy } : {})
        };
  return {
    ...baseline,
    journalTransaction: {
      ...baseline.journalTransaction,
      ...(location === "journal source key" ? { sourceKey: proxy } : {}),
      ...(location === "journal source key"
        ? {}
        : { entries: [hostileEntry, ...baseline.journalTransaction.entries.slice(1)] })
    }
  };
}

function expectTypedIntegrityError(action: () => unknown): void {
  try {
    action();
    throw new Error("Expected wallet operation integrity failure");
  } catch (error) {
    expect(error).toBeInstanceOf(WalletOperationProjectionIntegrityError);
  }
}
