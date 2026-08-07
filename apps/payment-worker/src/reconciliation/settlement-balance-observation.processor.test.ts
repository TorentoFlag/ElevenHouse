import { describe, expect, it, vi } from "vitest";

import { createSettlementBalanceObservationProcessor } from "./settlement-balance-observation.processor";

describe("createSettlementBalanceObservationProcessor", () => {
  it("records the precise provider balance response as an observation without changing money state", async () => {
    const readSettlementBalance = vi.fn(async () => ({
      balances: [
        {
          currency: "RUB" as const,
          availableMinor: "0",
          pendingMinor: "250000",
          reservedMinor: "0",
          updatedAt: "2026-08-07T12:36:42.14332Z"
        }
      ],
      rawDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
      rawByteLength: 176
    }));
    const processor = createSettlementBalanceObservationProcessor({
      client: { readSettlementBalance },
      now: () => new Date("2026-08-07T12:37:00.000Z")
    });

    await expect(processor.tick()).resolves.toEqual({
      observedAt: "2026-08-07T12:37:00.000Z",
      balances: [
        {
          currency: "RUB",
          availableMinor: "0",
          pendingMinor: "250000",
          reservedMinor: "0",
          updatedAt: "2026-08-07T12:36:42.14332Z"
        }
      ],
      rawDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      rawByteLength: 176
    });
    expect(readSettlementBalance).toHaveBeenCalledOnce();
  });
});
