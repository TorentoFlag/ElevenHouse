import { describe, expect, it } from "vitest";

import type {
  ApplyVerifiedOnlineWalletChargebackNoticeCommand,
  OnlineWalletChargebackCaseCommitReceipt
} from "./online-wallet-chargeback-case-uow";

describe("online wallet chargeback case port", () => {
  it("keeps the provider notice and its provisional-loss result separate from allocation", () => {
    const command = {
      semanticFact: { inboxItemId: "inbox-chargeback-1" },
      chargeback: {
        providerPaymentId: "payment-1",
        providerSource: { kind: "webhook_event_id", webhookEventId: "webhook-chargeback-1" },
        disputedPrincipalMinor: "10000",
        occurredAt: "2026-08-05T12:00:00.000Z"
      }
    } as ApplyVerifiedOnlineWalletChargebackNoticeCommand;
    const receipt = {
      kind: "online_wallet_chargeback_case_commit_receipt",
      effect: "applied_once",
      chargebackCaseId: "case-1",
      walletId: "11111111-1111-4111-8111-111111111111",
      rootLotId: "root-1",
      journalTransactionId: "online-wallet-chargeback:case-1"
    } as OnlineWalletChargebackCaseCommitReceipt;

    expect(command.chargeback.providerSource.kind).toBe("webhook_event_id");
    expect(receipt.effect).toBe("applied_once");
  });
});
