import { describe, expect, it, vi } from "vitest";
import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzlePaymentReversalUnitOfWork } from "./drizzle-payment-reversal-unit-of-work";

describe("createDrizzlePaymentReversalUnitOfWork", () => {
  it("runs refund and chargeback reversal operations through one Drizzle transaction executor", async () => {
    const transaction = {};
    const database = {
      transaction: vi.fn(async (operation) => operation(transaction))
    } as unknown as ElevenHouseDatabase;

    const result = await createDrizzlePaymentReversalUnitOfWork(database).transact(
      async (store) => {
        expect(store.findAttemptById).toBeTypeOf("function");
        expect(store.findProviderEventByWebhookId).toBeTypeOf("function");
        expect(store.linkAttemptToProviderPayment).toBeTypeOf("function");
        expect(store.recordProviderEvent).toBeTypeOf("function");
        expect(store.createRefund).toBeTypeOf("function");
        expect(store.findById).toBeTypeOf("function");
        expect(store.updateStatus).toBeTypeOf("function");
        expect(store.findWalletBalance).toBeTypeOf("function");
        expect(store.createTransaction).toBeTypeOf("function");
        return "committed";
      }
    );

    expect(result).toBe("committed");
    expect(database.transaction).toHaveBeenCalledTimes(1);
  });
});
