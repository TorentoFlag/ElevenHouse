import { describe, expect, it } from "vitest";

import { createOnlineSaleCapturePersistenceCommand } from "./online-sale-capture-command";
import { createOnlineSaleCaptureReceipt } from "./online-sale-capture-receipt";
import { buildReceiptTransitionCases } from "./source-lot-operation-receipt-test-fixtures";

describe("online sale-capture persistence command", () => {
  it("rejects a command owner that differs from the immutable root lot and economics owner", () => {
    const sale = buildReceiptTransitionCases()[0]?.transition;
    expect(sale).toBeDefined();
    if (!sale) return;
    const receipt = createOnlineSaleCaptureReceipt({
      walletId: "de604165-f8d3-4cb0-9400-5a8e7dc82d18",
      expectedWalletRevision: "0",
      previousCommitmentDigest: null,
      transition: {
        operationId: sale.operationId,
        consumedLots: sale.consumedLots,
        createdLots: sale.createdLots
      }
    });
    expect(() =>
      createOnlineSaleCapturePersistenceCommand({
        kind: "online_sale_capture_persistence_command",
        receipt,
        astrologerUserId: "de604165-f8d3-4cb0-9400-5a8e7dc82d18",
        journal: journalFor(receipt)
      })
    ).toThrow();
  });
});

function journalFor(receipt: ReturnType<typeof createOnlineSaleCaptureReceipt>) {
  return {
    id: `journal:${receipt.operationId}`,
    sourceKey: receipt.sourceKey,
    occurredAt: receipt.occurredAt,
    postedAt: receipt.occurredAt,
    reversesTransactionId: null,
    entries: [
      {
        account: {
          code: "arc_provider_clearing",
          arcProviderAccountId: receipt.captureAuthority.providerAccountId,
          currency: "RUB"
        },
        side: "debit",
        amount: receipt.orderEconomics.gross,
        links: {
          originalSaleId: receipt.orderEconomics.orderId,
          componentId: "capture",
          payableLotId: receipt.rootLot.lotId,
          payoutAllocationId: null
        }
      },
      {
        account: { code: "platform_commission_deferred", currency: "RUB" },
        side: "credit",
        amount: receipt.orderEconomics.gross,
        links: {
          originalSaleId: receipt.orderEconomics.orderId,
          componentId: "capture",
          payableLotId: receipt.rootLot.lotId,
          payoutAllocationId: null
        }
      }
    ]
  };
}
