import type { TerminalPaymentTransactionStore, TerminalPaymentUnitOfWork } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { releasePaidBookingPaymentHold } from "../scheduling";
import { createDrizzleOrderTransactionStore } from "./drizzle-order-store";
import { createDrizzlePaymentWebhookStore } from "./drizzle-payment-store";

export function createDrizzleTerminalPaymentUnitOfWork(
  database: ElevenHouseDatabase
): TerminalPaymentUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((transaction) =>
        operation({
          ...createDrizzlePaymentWebhookStore(transaction),
          ...createDrizzleOrderTransactionStore(transaction),
          releasePaidBookingPaymentHold: (input) =>
            releasePaidBookingPaymentHold(transaction, input)
        } satisfies TerminalPaymentTransactionStore)
      )
  };
}
