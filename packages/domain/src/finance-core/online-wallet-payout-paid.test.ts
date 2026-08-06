import { describe, expect, it } from "vitest";

import {
  createOnlineWalletPayoutPaidJournal,
  OnlineWalletPayoutPaidIntegrityError
} from "./online-wallet-payout-paid";

describe("createOnlineWalletPayoutPaidJournal", () => {
  it("settles exact payout-pending sources into the selected bank outbound clearing pool", () => {
    const journal = createOnlineWalletPayoutPaidJournal({
      payoutRequestId: "payout-1",
      astrologerUserId: "11111111-1111-4111-8111-111111111111",
      bankCashPoolId: "elevenhouse-rub-main",
      occurredAt: "2026-08-05T12:00:00.000Z",
      postedAt: "2026-08-05T12:00:00.000Z",
      pendingSources: [
        {
          payoutPendingAllocationId: "online-wallet-payout:one",
          rootLotId: "root-1",
          orderId: "order-1",
          amountMinor: 4_000
        },
        {
          payoutPendingAllocationId: "online-wallet-payout:two",
          rootLotId: "root-2",
          orderId: "order-2",
          amountMinor: 1_000
        }
      ]
    });

    expect(journal.sourceKey).toEqual({ kind: "payout", sourceId: "payout-1", operation: "paid" });
    expect(journal.totalDebitMinor).toBe("5000");
    expect(journal.totalCreditMinor).toBe("5000");
    expect(journal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          side: "debit",
          account: expect.objectContaining({
            code: "astrologer_payout_pending",
            astrologerUserId: "11111111-1111-4111-8111-111111111111"
          })
        }),
        expect.objectContaining({
          side: "credit",
          account: expect.objectContaining({
            code: "bank_outbound_clearing",
            bankCashPoolId: "elevenhouse-rub-main"
          })
        })
      ])
    );
  });

  it("rejects duplicate payout-pending sources before a journal can be constructed", () => {
    expect(() =>
      createOnlineWalletPayoutPaidJournal({
        payoutRequestId: "payout-1",
        astrologerUserId: "11111111-1111-4111-8111-111111111111",
        bankCashPoolId: "elevenhouse-rub-main",
        occurredAt: "2026-08-05T12:00:00.000Z",
        postedAt: "2026-08-05T12:00:00.000Z",
        pendingSources: [
          {
            payoutPendingAllocationId: "online-wallet-payout:one",
            rootLotId: "root-1",
            orderId: "order-1",
            amountMinor: 4_000
          },
          {
            payoutPendingAllocationId: "online-wallet-payout:one",
            rootLotId: "root-2",
            orderId: "order-2",
            amountMinor: 1_000
          }
        ]
      })
    ).toThrow(OnlineWalletPayoutPaidIntegrityError);
  });
});
