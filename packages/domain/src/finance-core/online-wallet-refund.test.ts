import { describe, expect, it } from "vitest";

import {
  OnlineWalletRefundIntegrityError,
  createOnlineWalletRefundConfirmedJournal
} from "./online-wallet-refund";

describe("createOnlineWalletRefundConfirmedJournal", () => {
  it("reverses the exact payable positions and frozen commission into provider clearing", () => {
    const journal = createOnlineWalletRefundConfirmedJournal({
      refundId: "refund-1",
      orderId: "order-1",
      providerAccountId: "arc-account-1",
      astrologerUserId: "astrologer-1",
      occurredAt: "2026-08-05T12:00:00.000Z",
      postedAt: "2026-08-05T12:01:00.000Z",
      commissionReversalMinor: 200,
      grossAmountMinor: 5_000,
      consumptions: [
        {
          sourceId: "available-1",
          rootLotId: "root-1",
          bucket: "available",
          consumedMinor: 2_400
        },
        {
          sourceId: "reserved-1",
          rootLotId: "root-1",
          bucket: "reserved",
          consumedMinor: 2_400
        }
      ],
      blockedPayoutOutcomeMinor: 0
    });

    expect(journal.sourceKey).toEqual({
      kind: "refund",
      sourceId: "refund-1",
      operation: "confirmed"
    });
    expect(journal.totalDebitMinor).toBe("5000");
    expect(journal.totalCreditMinor).toBe("5000");
    expect(journal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: { code: "platform_commission_revenue", currency: "RUB" },
          side: "debit",
          amount: { amountMinor: 200, currency: "RUB" }
        }),
        expect.objectContaining({
          account: {
            code: "astrologer_available",
            astrologerUserId: "astrologer-1",
            currency: "RUB"
          },
          side: "debit",
          amount: { amountMinor: 2_400, currency: "RUB" }
        }),
        expect.objectContaining({
          account: {
            code: "astrologer_reserved",
            astrologerUserId: "astrologer-1",
            currency: "RUB"
          },
          side: "debit",
          amount: { amountMinor: 2_400, currency: "RUB" }
        }),
        expect.objectContaining({
          account: {
            code: "arc_provider_clearing",
            arcProviderAccountId: "arc-account-1",
            currency: "RUB"
          },
          side: "credit",
          amount: { amountMinor: 5_000, currency: "RUB" }
        })
      ])
    );
  });

  it("refuses to post an unapproved paid-payout shortfall", () => {
    expect(() =>
      createOnlineWalletRefundConfirmedJournal({
        refundId: "refund-1",
        orderId: "order-1",
        providerAccountId: "arc-account-1",
        astrologerUserId: "astrologer-1",
        occurredAt: "2026-08-05T12:00:00.000Z",
        postedAt: "2026-08-05T12:01:00.000Z",
        commissionReversalMinor: 200,
        grossAmountMinor: 5_000,
        consumptions: [
          {
            sourceId: "available-1",
            rootLotId: "root-1",
            bucket: "available",
            consumedMinor: 2_400
          }
        ],
        blockedPayoutOutcomeMinor: 2_400
      })
    ).toThrow(OnlineWalletRefundIntegrityError);
  });
});
