import type {
  FinanceCurrency,
  FinanceEconomicPaymentHead,
  FinanceProviderAccountIdentity
} from "./finance-port-types";

declare const economicPaymentIntentCreationReceiptBrand: unique symbol;

export type CreateEconomicPaymentIntentCommand = Readonly<{
  economicPaymentIntentId: string;
  sourceId: string;
  purpose: "client_order" | "platform_invoice" | "platform_card_setup";
  providerAccount: FinanceProviderAccountIdentity;
  amountMinor: string;
  currency: FinanceCurrency;
  expectedSourceUniquenessVersion: number;
}>;

export type EconomicPaymentIntentCreationReceipt = Readonly<{
  kind: "economic_payment_intent_creation_receipt";
  economicPaymentHead: FinanceEconomicPaymentHead;
  sourceUniquenessVersion: number;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [economicPaymentIntentCreationReceiptBrand]: true;
}>;

export type EconomicPaymentIntentCreationUnitOfWork = Readonly<{
  createEconomicPaymentIntent(
    command: CreateEconomicPaymentIntentCommand
  ): Promise<EconomicPaymentIntentCreationReceipt>;
}>;
