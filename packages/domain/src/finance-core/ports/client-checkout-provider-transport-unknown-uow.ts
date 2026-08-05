import type { ClientCheckoutPreparation } from "../client-checkout-preparation";

/**
 * The request reached the transport boundary but ArcPay did not return a trustworthy response.
 * This is an operator/reconciliation state, never a payment or capture result.
 */
export type MarkClientCheckoutProviderTransportUnknownCommand = Readonly<{
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  providerOperationIntentId: string;
  expectedProviderOperationIntentVersion: number;
}>;

export type ClientCheckoutProviderTransportUnknownCommitReceipt = Readonly<{
  kind: "client_checkout_provider_transport_unknown_commit_receipt";
  providerOperationIntentId: string;
  providerOperationIntentVersion: number;
  checkoutPreparation: ClientCheckoutPreparation;
}>;

/**
 * Atomically fences a client HPP operation after transport indeterminacy. A later canonical
 * provider read may resolve the provider-operation head, but this boundary never retries I/O.
 */
export type ClientCheckoutProviderTransportUnknownUnitOfWork = Readonly<{
  markClientCheckoutProviderTransportUnknown(
    command: MarkClientCheckoutProviderTransportUnknownCommand
  ): Promise<ClientCheckoutProviderTransportUnknownCommitReceipt>;
}>;
