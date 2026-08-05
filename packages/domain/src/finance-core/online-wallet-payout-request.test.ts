import { describe, expect, it } from "vitest";

import {
  OnlineWalletPayoutRequestIntegrityError,
  createOnlineWalletPayoutRequestJournal,
  createOnlineWalletPayoutRequestPlan
} from "./online-wallet-payout-request";

describe("online wallet payout request plan", () => {
  it("moves the exact requested amount from available positions and returns source remainders", () => {
    expect(
      createOnlineWalletPayoutRequestPlan({
        payoutRequestId: "payout-1",
        amountMinor: 5_000,
        availableSources: [
          { allocationId: "available-a", rootLotId: "root-a", amountMinor: 8_640 },
          { allocationId: "available-b", rootLotId: "root-b", amountMinor: 2_000 }
        ]
      })
    ).toEqual({
      payoutPendingMinor: 5_000,
      availableMinor: 3_640,
      consumptions: [
        {
          allocationId: "available-a",
          rootLotId: "root-a",
          sourceAmountMinor: 8_640,
          payoutPendingMinor: 5_000,
          availableRemainderMinor: 3_640,
          payoutAllocationId: expect.stringMatching(/^online-wallet-payout:sha256:[a-f0-9]{64}$/)
        }
      ]
    });
  });

  it("uses positions in canonical allocation order when a request spans sources", () => {
    expect(
      createOnlineWalletPayoutRequestPlan({
        payoutRequestId: "payout-2",
        amountMinor: 7_000,
        availableSources: [
          { allocationId: "available-z", rootLotId: "root-z", amountMinor: 4_000 },
          { allocationId: "available-a", rootLotId: "root-a", amountMinor: 4_000 }
        ]
      }).consumptions
    ).toEqual([
      expect.objectContaining({ allocationId: "available-a", payoutPendingMinor: 4_000 }),
      expect.objectContaining({
        allocationId: "available-z",
        payoutPendingMinor: 3_000,
        availableRemainderMinor: 1_000
      })
    ]);
  });

  it("rejects an insufficient or ambiguous available source set", () => {
    expect(() =>
      createOnlineWalletPayoutRequestPlan({
        payoutRequestId: "payout-3",
        amountMinor: 5_000,
        availableSources: [{ allocationId: "available-a", rootLotId: "root-a", amountMinor: 4_000 }]
      })
    ).toThrow(OnlineWalletPayoutRequestIntegrityError);
    expect(() =>
      createOnlineWalletPayoutRequestPlan({
        payoutRequestId: "payout-3",
        amountMinor: 1,
        availableSources: [
          { allocationId: "available-a", rootLotId: "root-a", amountMinor: 1 },
          { allocationId: "available-a", rootLotId: "root-b", amountMinor: 1 }
        ]
      })
    ).toThrow(OnlineWalletPayoutRequestIntegrityError);
  });

  it("keeps payout child identifiers within the persisted allocation limit", () => {
    const payoutRequestId = "p".repeat(160);
    const allocationId = "a".repeat(160);
    expect(
      createOnlineWalletPayoutRequestPlan({
        payoutRequestId,
        amountMinor: 1,
        availableSources: [{ allocationId, rootLotId: "root-a", amountMinor: 1 }]
      }).consumptions[0]?.payoutAllocationId
    ).toMatch(/^online-wallet-payout:sha256:[a-f0-9]{64}$/);
  });

  it("creates one balanced v2 journal that preserves each source lineage", () => {
    const journal = createOnlineWalletPayoutRequestJournal({
        payoutRequestId: "payout-4",
        astrologerUserId: "astrologer-1",
        occurredAt: "2026-08-05T10:00:00.000Z",
        postedAt: "2026-08-05T10:00:00.000Z",
        consumptions: [
          {
            allocationId: "available-a",
            rootLotId: "root-a",
            orderId: "order-a",
            sourceAmountMinor: 4_000,
            payoutPendingMinor: 4_000,
            availableRemainderMinor: 0,
            payoutAllocationId: "pending-a"
          },
          {
            allocationId: "available-b",
            rootLotId: "root-b",
            orderId: "order-b",
            sourceAmountMinor: 4_640,
            payoutPendingMinor: 1_000,
            availableRemainderMinor: 3_640,
            payoutAllocationId: "pending-b"
          }
        ]
      });
    expect(journal).toMatchObject({
      id: "online-wallet-payout-request:payout-4",
      sourceKey: { kind: "payout", sourceId: "payout-4", operation: "requested" },
      totalDebitMinor: "8640",
      totalCreditMinor: "8640"
    });
    expect(
      journal.entries.map((entry) => [
        entry.account.code,
        entry.side,
        entry.amount.amountMinor,
        entry.links.originalSaleId,
        entry.links.componentId,
        entry.links.payableLotId,
        entry.links.payoutAllocationId
      ])
    ).toEqual([
      ["astrologer_available", "debit", 4_000, "order-a", "root-a", "available-a", null],
      [
        "astrologer_payout_pending",
        "credit",
        4_000,
        "order-a",
        "root-a",
        "available-a",
        "pending-a"
      ],
      ["astrologer_available", "debit", 4_640, "order-b", "root-b", "available-b", null],
      [
        "astrologer_payout_pending",
        "credit",
        1_000,
        "order-b",
        "root-b",
        "available-b",
        "pending-b"
      ],
      ["astrologer_available", "credit", 3_640, "order-b", "root-b", "available-b", null]
    ]);
  });
});
