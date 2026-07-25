import type {
  CapturedSaleOutboxEvent,
  CapturedSaleUnitOfWork,
  CapturedSaleTransactionStore
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { outboxEvents } from "../../schema";
import { createDrizzleLedgerTransactionStore } from "./drizzle-ledger-store";
import { createDrizzleOrderTransactionStore, markFinanceOrderPaid } from "./drizzle-order-store";
import { createDrizzlePaymentWebhookStore } from "./drizzle-payment-store";

export function createDrizzleCapturedSaleUnitOfWork(
  database: ElevenHouseDatabase
): CapturedSaleUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((transaction) =>
        operation({
          ...createDrizzlePaymentWebhookStore(transaction),
          ...createDrizzleOrderTransactionStore(transaction),
          ...createDrizzleLedgerTransactionStore(transaction),
          markOrderPaid: (input) => markFinanceOrderPaid(transaction, input),
          recordCapturedSaleOutboxEvents: (input) =>
            recordCapturedSaleOutboxEvents(transaction, input)
        } satisfies CapturedSaleTransactionStore)
      )
  };
}

async function recordCapturedSaleOutboxEvents(
  database: Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0],
  events: readonly CapturedSaleOutboxEvent[]
): Promise<void> {
  for (const event of events) {
    const [row] = await database
      .insert(outboxEvents)
      .values({
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        payload: event.payload,
        availableAt: new Date(event.occurredAt)
      })
      .onConflictDoNothing({
        target: [outboxEvents.eventType, outboxEvents.aggregateId]
      })
      .returning({ id: outboxEvents.id });
    void row;
  }
}
