import type { FinanceProviderAccountIdentity, RawProviderArtifactRef } from "./finance-port-types";

/** Owner-scoped delivery metadata for a pending tariff-invoice 3DS browser action. */
export type PlatformTariffInvoiceCustomerActionForOwner = Readonly<{
  invoiceId: string;
  invoiceVersion: number;
  subscriptionId: string;
  ownerUserId: string;
  customerActionId: string;
  providerPaymentId: string;
  providerAccount: FinanceProviderAccountIdentity;
  actionType: "three_ds_method" | "three_ds_challenge";
  phase: "method" | "challenge";
  providerResponseArtifact: RawProviderArtifactRef;
}>;

export type PlatformTariffInvoicePaymentForOwner = Readonly<{
  invoiceId: string;
  subscriptionId: string;
  ownerUserId: string;
  invoiceVersion: number;
  state:
    | "open"
    | "payment_pending"
    | "requires_customer_action"
    | "captured"
    | "declined"
    | "failed"
    | "provider_unknown"
    | "void"
    | "uncollectible";
}>;

export type PlatformTariffInvoiceCustomerActionReaderPort = Readonly<{
  findInvoiceForOwner(input: Readonly<{
    invoiceId: string;
    ownerUserId: string;
  }>): Promise<PlatformTariffInvoicePaymentForOwner | null>;
  /**
   * Returns the single non-terminal invoice which can still require browser action for a
   * subscription. This makes refresh/resume safe without exposing an invoice identifier
   * through browser-local state.
   */
  findCurrentActionableInvoiceForSubscriptionOwner(input: Readonly<{
    subscriptionId: string;
    ownerUserId: string;
  }>): Promise<PlatformTariffInvoicePaymentForOwner | null>;
  findPendingForOwner(input: Readonly<{
    invoiceId: string;
    ownerUserId: string;
  }>): Promise<PlatformTariffInvoiceCustomerActionForOwner | null>;
}>;
