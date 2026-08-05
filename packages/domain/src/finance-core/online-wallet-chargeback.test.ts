import { describe, expect, it } from "vitest";

import {
  OnlineWalletChargebackIntegrityError,
  createOnlineWalletChargebackConfirmedJournal
} from "./online-wallet-chargeback";

describe("online wallet chargeback journal", () => {
  it("posts the provider-confirmed principal into suspense, without allocating it to an astrologer", () => {
    expect(
      createOnlineWalletChargebackConfirmedJournal({
        chargebackCaseId: "chargeback-case-1",
        orderId: "order-1",
        providerAccountId: "arc-company",
        occurredAt: "2026-08-05T12:00:00.000Z",
        postedAt: "2026-08-05T12:00:01.000Z",
        grossPrincipalMinor: 10_000
      })
    ).toMatchObject({
      sourceKey: { kind: "chargeback", sourceId: "chargeback-case-1", operation: "confirmed" },
      totalDebitMinor: "10000",
      totalCreditMinor: "10000",
      entries: [
        { account: { code: "chargeback_principal_suspense" }, side: "debit", amount: { amountMinor: 10_000 } },
        { account: { code: "arc_provider_clearing" }, side: "credit", amount: { amountMinor: 10_000 } }
      ]
    });
  });

  it("rejects a non-positive provider principal", () => {
    expect(() =>
      createOnlineWalletChargebackConfirmedJournal({
        chargebackCaseId: "chargeback-case-1",
        orderId: "order-1",
        providerAccountId: "arc-company",
        occurredAt: "2026-08-05T12:00:00.000Z",
        postedAt: "2026-08-05T12:00:01.000Z",
        grossPrincipalMinor: 0
      })
    ).toThrow(OnlineWalletChargebackIntegrityError);
  });
});
