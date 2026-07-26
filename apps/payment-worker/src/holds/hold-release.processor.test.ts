import { describe, expect, it } from "vitest";
import type { HoldReleaseStore } from "@elevenhouse/domain";
import { createHoldReleaseProcessor } from "./hold-release.processor";

const now = "2026-07-27T12:00:00.000Z";

describe("hold release processor", () => {
  it("releases due captured sale holds in one observable tick", async () => {
    const calls: Array<{ readonly now: string; readonly limit: number }> = [];
    const releaseCalls: Array<{ readonly orderId: string; readonly commandExpiresAt: string }> = [];
    const store: HoldReleaseStore = {
      listReleasableCapturedSaleHolds: async (input) => {
        calls.push(input);
        return [
          {
            orderId: "22222222-2222-4222-8222-222222222222",
            astrologerUserId: "44444444-4444-4444-8444-444444444444",
            amount: { amountMinor: 43_000, currency: "RUB" },
            capturedAt: "2026-07-24T12:00:00.000Z",
            holdReleaseAt: "2026-07-26T12:00:00.000Z",
            paymentAttemptId: "11111111-1111-4111-8111-111111111111",
            providerEventId: "provider-event-1"
          }
        ];
      },
      releaseCapturedSaleHold: async (input) => {
        releaseCalls.push({
          orderId: input.hold.orderId,
          commandExpiresAt: input.commandExpiresAt
        });
        return { kind: "released", transactionId: "ledger-1" };
      }
    };

    const processor = createHoldReleaseProcessor({
      store,
      now: () => new Date(now),
      limit: 25,
      commandTtlMs: 60_000
    });

    await expect(processor.tick()).resolves.toEqual({
      scanned: 1,
      released: 1,
      replayed: 0,
      orderIds: ["22222222-2222-4222-8222-222222222222"]
    });
    expect(calls).toEqual([{ now, limit: 25 }]);
    expect(releaseCalls).toEqual([
      {
        orderId: "22222222-2222-4222-8222-222222222222",
        commandExpiresAt: "2026-07-27T12:01:00.000Z"
      }
    ]);
  });
});
