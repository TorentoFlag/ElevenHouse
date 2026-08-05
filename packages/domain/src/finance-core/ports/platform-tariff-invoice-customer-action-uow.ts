import type {
  FinanceProviderAccountIdentity,
  RawProviderArtifactRef
} from "./finance-port-types";

export type PlatformTariffInvoiceCustomerActionType = "three_ds_method" | "three_ds_challenge";

export type PlatformTariffInvoiceCustomerActionCommitReceipt = Readonly<{
  kind: "platform_tariff_invoice_customer_action_commit_receipt";
  customerActionId: string;
  invoiceId: string;
  invoiceVersion: number;
  providerOperationIntentId: string;
  providerOperationIntentVersion: number;
  actionType: PlatformTariffInvoiceCustomerActionType;
}>;

/**
 * Persists a provider-requested browser action without treating it as a successful charge.
 * The raw 3DS form is retained only as a sealed provider artifact.
 */
export type PlatformTariffInvoiceCustomerActionUnitOfWork = Readonly<{
  recordCustomerAction(input: Readonly<{
    invoiceId: string;
    expectedInvoiceVersion: number;
    economicPaymentIntentId: string;
    expectedEconomicPaymentVersion: number;
    economicPaymentSessionId: string;
    providerOperationIntentId: string;
    expectedProviderOperationIntentVersion: number;
    providerPaymentId: string;
    providerAccount: FinanceProviderAccountIdentity;
    providerResponseArtifact: RawProviderArtifactRef;
    actionType: PlatformTariffInvoiceCustomerActionType;
    phase: "method" | "challenge";
  }>): Promise<PlatformTariffInvoiceCustomerActionCommitReceipt>;
}>;
