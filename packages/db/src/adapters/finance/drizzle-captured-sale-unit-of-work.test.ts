import { describe, expect, it, vi } from "vitest";
import { outboxEvents } from "../../schema";
import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzleCapturedSaleUnitOfWork } from "./drizzle-captured-sale-unit-of-work";

describe("createDrizzleCapturedSaleUnitOfWork", () => {
  it("runs captured-sale operations through one Drizzle transaction executor", async () => {
    const transaction = {};
    const database = {
      transaction: vi.fn(async (operation) => operation(transaction))
    } as unknown as ElevenHouseDatabase;

    const result = await createDrizzleCapturedSaleUnitOfWork(database).transact(async (store) => {
      expect(store.findAttemptById).toBeTypeOf("function");
      expect(store.linkAttemptToProviderPayment).toBeTypeOf("function");
      expect(store.recordProviderEvent).toBeTypeOf("function");
      expect(store.markOrderPaid).toBeTypeOf("function");
      expect(store.createTransaction).toBeTypeOf("function");
      expect(store.recordCapturedSaleOutboxEvents).toBeTypeOf("function");
      return "committed";
    });

    expect(result).toBe("committed");
    expect(database.transaction).toHaveBeenCalledTimes(1);
  });

  it("writes captured-sale outbox rows with conflict-safe event/aggregate idempotency", async () => {
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const returning = vi.fn(async () => []);
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const transaction = { insert };
    const database = {
      transaction: vi.fn(async (operation) => operation(transaction))
    } as unknown as ElevenHouseDatabase;

    await createDrizzleCapturedSaleUnitOfWork(database).transact(async (store) => {
      await store.recordCapturedSaleOutboxEvents([
        {
          eventType: "finance.payment_captured",
          aggregateId: "11111111-1111-4111-8111-111111111111",
          payload: {
            orderId: "22222222-2222-4222-8222-222222222222",
            paymentAttemptId: "11111111-1111-4111-8111-111111111111",
            providerEventId: "33333333-3333-4333-8333-333333333333"
          },
          occurredAt: "2026-07-24T12:00:00.000Z"
        }
      ]);
    });

    expect(insert).toHaveBeenCalledWith(outboxEvents);
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: [outboxEvents.eventType, outboxEvents.aggregateId]
    });
  });
});
