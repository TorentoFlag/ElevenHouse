import type { RefundReversalTransactionStore, RefundReversalUnitOfWork } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzleLedgerTransactionStore } from "./drizzle-ledger-store";
import { createDrizzleOrderTransactionStore } from "./drizzle-order-store";
import { createDrizzlePaymentWebhookStore } from "./drizzle-payment-store";

export function createDrizzlePaymentReversalUnitOfWork(
  database: ElevenHouseDatabase
): RefundReversalUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((transaction) =>
        operation({
          ...createDrizzlePaymentWebhookStore(transaction),
          ...createDrizzleOrderTransactionStore(transaction),
          ...createDrizzleLedgerTransactionStore(transaction)
        } satisfies RefundReversalTransactionStore)
      )
  };
}
