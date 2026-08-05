import { describe, expect, it } from "vitest";

import {
  createOnlineWalletPayoutReleaseJournal,
  OnlineWalletPayoutReleaseIntegrityError
} from "./online-wallet-payout-release";

describe("createOnlineWalletPayoutReleaseJournal", () => {
  it("returns every exact pending source to available without asserting a bank movement", () => {
    const journal = createOnlineWalletPayoutReleaseJournal({
      payoutRequestId: "payout-1",
      astrologerUserId: "11111111-1111-4111-8111-111111111111",
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

    expect(journal.sourceKey).toEqual({ kind: "payout", sourceId: "payout-1", operation: "released" });
    expect(journal.totalDebitMinor).toBe("5000");
    expect(journal.totalCreditMinor).toBe("5000");
    expect(journal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          side: "debit",
          account: expect.objectContaining({ code: "astrologer_payout_pending" })
        }),
        expect.objectContaining({
          side: "credit",
          account: expect.objectContaining({ code: "astrologer_available" })
        })
      ])
    );
  });

  it("rejects duplicate or non-positive pending sources", () => {
    const input = {
      payoutRequestId: "payout-1",
      astrologerUserId: "11111111-1111-4111-8111-111111111111",
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
          rootLotId: "root-1",
          orderId: "order-1",
          amountMinor: 1
        }
      ]
    } as const;
    expect(() => createOnlineWalletPayoutReleaseJournal(input)).toThrow(
      OnlineWalletPayoutReleaseIntegrityError
    );
  });
});
