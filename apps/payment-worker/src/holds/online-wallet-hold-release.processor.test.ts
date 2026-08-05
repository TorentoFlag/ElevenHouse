import { describe, expect, it } from "vitest";
import type { OnlineWalletHoldReleaseUnitOfWork } from "@elevenhouse/domain/finance-core";

import {
  createOnlineWalletHoldReleaseProcessor,
  startOnlineWalletHoldReleaseInterval
} from "./online-wallet-hold-release.processor";

describe("online wallet hold release processor", () => {
  it("asks the v2 authority to release a bounded batch at the trusted worker time", async () => {
    const calls: Array<{ readonly now: string; readonly limit: number }> = [];
    const releases: OnlineWalletHoldReleaseUnitOfWork = {
      releaseDueOnlineWalletHolds: async (command) => {
        calls.push(command);
        return {
          scanned: 1,
          released: 1,
          replayed: 0,
          ineligible: 0,
          receipts: [
            {
              kind: "online_wallet_hold_release_commit_receipt",
              effect: "applied_once",
              rootLotId: "lot-1",
              walletId: "wallet-1",
              walletRevision: "2",
              mutationId: "mutation-1",
              journalTransactionId: "online-wallet-hold-release:lot-1"
            }
          ]
        };
      }
    };

    const processor = createOnlineWalletHoldReleaseProcessor({
      releases,
      now: () => new Date("2026-08-05T12:00:00.000Z"),
      limit: 25
    });

    await expect(processor.tick()).resolves.toMatchObject({ scanned: 1, released: 1 });
    expect(calls).toEqual([{ now: "2026-08-05T12:00:00.000Z", limit: 25 }]);
  });

  it("does not overlap a slow local tick", async () => {
    let calls = 0;
    let finishFirst: (() => void) | undefined;
    const processor = {
      tick: () => {
        calls += 1;
        if (calls > 1) {
          return Promise.resolve({ scanned: 0, released: 0, replayed: 0, ineligible: 0, receipts: [] });
        }
        return new Promise<{
          scanned: number;
          released: number;
          replayed: number;
          ineligible: number;
          receipts: readonly [];
        }>((resolve) => {
          finishFirst = () => resolve({ scanned: 0, released: 0, replayed: 0, ineligible: 0, receipts: [] });
        });
      }
    };

    const stop = startOnlineWalletHoldReleaseInterval({
      processor,
      intervalMs: 1,
      onError: () => undefined
    });
    await wait(20);
    expect(calls).toBe(1);

    finishFirst?.();
    await wait(20);
    expect(calls).toBeGreaterThanOrEqual(2);
    stop();
  });
});

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
