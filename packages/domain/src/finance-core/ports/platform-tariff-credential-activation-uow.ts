/**
 * The only persistence boundary permitted to convert a verified saved-card credential into a
 * paid tariff's first invoice. Provider setup I/O and credential activation have already
 * completed before this UOW is invoked; the implementation must lock and re-check both the
 * credential and its exact recurring-charge consent in the same database transaction.
 */
export type CreatePlatformTariffInitialInvoiceAfterVerifiedCredentialActivationCommand = Readonly<{
  subscriptionId: string;
  expectedSubscriptionVersion: number;
  savedCardCredentialId: string;
  savedCardCredentialVersion: string;
  now: string;
}>;

export type PlatformTariffCredentialActivationReceipt = Readonly<{
  kind: "platform_tariff_initial_invoice_activation_receipt";
  subscriptionId: string;
  subscriptionVersion: number;
  invoiceId: string;
  invoiceState: "open" | "payment_pending" | "requires_customer_action" | "provider_unknown";
}>;

export type PlatformTariffCredentialActivationUnitOfWork = Readonly<{
  createInitialInvoiceAfterVerifiedCredentialActivation(
    command: CreatePlatformTariffInitialInvoiceAfterVerifiedCredentialActivationCommand
  ): Promise<PlatformTariffCredentialActivationReceipt>;
}>;
