import { describe, expect, it, vi } from "vitest";

import { createSettlementBalanceObservationProcessor } from "./settlement-balance-observation.processor";

const providerAccount = Object.freeze({
  seriesId: "arc-pay-company-merchant",
  providerAccountId: "merchant-1",
  identityVersion: 1
});

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
      rawBody: new Uint8Array(176),
      rawDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
      rawByteLength: 176
    }));
    const findActiveProviderAccount = vi.fn(async () => providerAccount);
    const seal = vi.fn(async () => ({
      artifactId: "arc-settlement-balance:merchant-1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sha256Digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
      byteLength: 176
    }));
    const processor = createSettlementBalanceObservationProcessor({
      client: { readSettlementBalance },
      providerAccounts: { findActiveProviderAccount },
      evidence: { seal },
      now: () => new Date("2026-08-07T12:37:00.000Z")
    });

    await expect(processor.tick()).resolves.toEqual({
      kind: "observed",
      observedAt: "2026-08-07T12:37:00.000Z",
      providerAccount,
      rawArtifact: {
        artifactId: "arc-settlement-balance:merchant-1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sha256Digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        byteLength: 176
      },
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
    expect(findActiveProviderAccount).toHaveBeenCalledWith({ provider: "arc_pay" });
    expect(seal).toHaveBeenCalledWith(
      expect.objectContaining({
        providerAccount,
        rawByteLength: 176
      })
    );
    expect(readSettlementBalance).toHaveBeenCalledOnce();
  });

  it("does not call ArcPay when no active merchant identity is configured", async () => {
    const readSettlementBalance = vi.fn();
    const seal = vi.fn();
    const processor = createSettlementBalanceObservationProcessor({
      client: { readSettlementBalance } as never,
      providerAccounts: { findActiveProviderAccount: vi.fn(async () => null) },
      evidence: { seal } as never
    });

    await expect(processor.tick()).resolves.toEqual({ kind: "not_configured" });
    expect(readSettlementBalance).not.toHaveBeenCalled();
    expect(seal).not.toHaveBeenCalled();
  });
});
