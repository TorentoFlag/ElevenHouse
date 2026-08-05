import type {
  FinanceEconomicPaymentHead,
  FinanceProviderAccountIdentity
} from "./finance-port-types";

declare const economicPaymentSessionOpenReceiptBrand: unique symbol;

/**
 * Opens the internal payment attempt before any provider I/O is allowed.
 *
 * `checkout_opened` is deliberately an ElevenHouse economic concurrency state. It is not an
 * assertion that an HPP page was returned, that a card was authorized, or that money was
 * captured. Those facts are recorded by their own provider-result/capture boundaries.
 */
export type OpenEconomicPaymentSessionCommand = Readonly<{
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  expectedEconomicPaymentVersion: number;
  providerAccount: FinanceProviderAccountIdentity;
}>;

/**
 * A nominal receipt returned only by the persistence boundary. Consumers may use it to create
 * the provider-operation intent, but cannot fabricate the fact that the economic session exists.
 */
export type EconomicPaymentSessionOpenReceipt = Readonly<{
  kind: "economic_payment_session_open_receipt";
  economicPaymentHead: FinanceEconomicPaymentHead;
  economicPaymentSessionVersion: number;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [economicPaymentSessionOpenReceiptBrand]: true;
}>;

export type EconomicPaymentSessionOpenUnitOfWork = Readonly<{
  openEconomicPaymentSession(
    command: OpenEconomicPaymentSessionCommand
  ): Promise<EconomicPaymentSessionOpenReceipt>;
}>;
