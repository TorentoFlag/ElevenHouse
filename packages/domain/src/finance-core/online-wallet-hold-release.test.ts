import { describe, expect, it } from "vitest";

import {
  OnlineWalletHoldReleaseIntegrityError,
  createOnlineWalletHoldReleaseJournal,
  createOnlineWalletHoldReleasePlan
} from "./online-wallet-hold-release";

describe("online wallet hold release plan", () => {
  it("splits a captured payable into available and reserve positions with bps-half-up rounding", () => {
    expect(
      createOnlineWalletHoldReleasePlan({ payableAmountMinor: 9_600, reserveBps: 1_000 })
    ).toEqual({
      pendingMinor: 0,
      availableMinor: 8_640,
      reservedMinor: 960
    });
  });

  it("keeps zero-reserve releases entirely available", () => {
    expect(
      createOnlineWalletHoldReleasePlan({ payableAmountMinor: 9_601, reserveBps: 0 })
    ).toEqual({
      pendingMinor: 0,
      availableMinor: 9_601,
      reservedMinor: 0
    });
  });

  it("builds one balanced v2 journal from the immutable pending source", () => {
    expect(
      createOnlineWalletHoldReleaseJournal({
        rootLotId: "online-root-1",
        orderId: "order-1",
        astrologerUserId: "astrologer-1",
        payableAmountMinor: 9_600,
        reserveBps: 1_000,
        occurredAt: "2026-08-05T10:00:00.000Z",
        postedAt: "2026-08-05T10:00:00.000Z"
      })
    ).toMatchObject({
      id: "online-wallet-hold-release:online-root-1",
      sourceKey: {
        kind: "reserve",
        sourceId: "online-root-1",
        operation: "hold_released"
      },
      totalDebitMinor: "9600",
      totalCreditMinor: "9600",
      entries: [
        {
          account: { code: "astrologer_pending", astrologerUserId: "astrologer-1", currency: "RUB" },
          side: "debit",
          amount: { amountMinor: 9_600, currency: "RUB" },
          links: { originalSaleId: "order-1", componentId: "online-root-1", payableLotId: "online-root-1", payoutAllocationId: null }
        },
        {
          account: { code: "astrologer_available", astrologerUserId: "astrologer-1", currency: "RUB" },
          side: "credit",
          amount: { amountMinor: 8_640, currency: "RUB" },
          links: { originalSaleId: "order-1", componentId: "online-root-1", payableLotId: "online-root-1", payoutAllocationId: null }
        },
        {
          account: { code: "astrologer_reserved", astrologerUserId: "astrologer-1", currency: "RUB" },
          side: "credit",
          amount: { amountMinor: 960, currency: "RUB" },
          links: { originalSaleId: "order-1", componentId: "online-root-1", payableLotId: "online-root-1", payoutAllocationId: null }
        }
      ]
    });
  });

  it("rejects malformed money and reserve policies before persistence", () => {
    expect(() =>
      createOnlineWalletHoldReleasePlan({ payableAmountMinor: 0, reserveBps: 1_000 })
    ).toThrow(OnlineWalletHoldReleaseIntegrityError);
    expect(() =>
      createOnlineWalletHoldReleasePlan({ payableAmountMinor: 10_000, reserveBps: 10_001 })
    ).toThrow(OnlineWalletHoldReleaseIntegrityError);
  });
});
