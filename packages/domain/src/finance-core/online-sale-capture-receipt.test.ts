import { describe, expect, it } from "vitest";

import { createOnlineSaleCaptureReceipt } from "./online-sale-capture-receipt";
import { buildReceiptTransitionCases } from "./source-lot-operation-receipt-test-fixtures";
import { PayableSourceLotIntegrityError } from "./source-lot-types";

describe("online sale-capture receipt v2", () => {
  it("derives bounded sale evidence from one root lot and a chain predecessor without a reference state", () => {
    const sale = buildReceiptTransitionCases()[0]?.transition;
    expect(sale?.kind).toBe("sale_capture");
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

    expect(receipt).toMatchObject({
      kind: "online_sale_capture_receipt",
      schemaVersion: 2,
      walletId: "de604165-f8d3-4cb0-9400-5a8e7dc82d18",
      expectedWalletRevision: "0",
      nextWalletRevision: "1",
      previousCommitmentDigest: null,
      operationId: sale.operationId,
      sourceKey: { kind: "order", operation: "sale_captured" },
      rootLot: sale.createdLots[0],
      captureAuthority: expect.objectContaining({
        canonicalEvidenceId: sale.operationId
      })
    });
    expect(receipt).not.toHaveProperty("previousLotStateDigest");
    expect(receipt).not.toHaveProperty("nextLotStateDigest");
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it("requires a predecessor commitment for every non-genesis wallet revision", () => {
    const sale = buildReceiptTransitionCases()[0]?.transition;
    expect(sale).toBeDefined();
    if (!sale) return;

    expectLotError(() =>
      createOnlineSaleCaptureReceipt({
        walletId: "de604165-f8d3-4cb0-9400-5a8e7dc82d18",
        expectedWalletRevision: "4",
        previousCommitmentDigest: null,
        transition: {
          operationId: sale.operationId,
          consumedLots: sale.consumedLots,
          createdLots: sale.createdLots
        }
      })
    );
  });
});

function expectLotError(action: () => unknown): void {
  try {
    action();
    throw new Error("expected bounded online receipt validation error");
  } catch (error) {
    expect(error).toBeInstanceOf(PayableSourceLotIntegrityError);
  }
}
