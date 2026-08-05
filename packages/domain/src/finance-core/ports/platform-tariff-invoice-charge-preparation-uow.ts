import type { ProviderDispatchEnvelope, RestrictedSavedCardCredentialRef } from "../provider-dispatch-envelope";
import type {
  FinanceProviderAccountIdentity,
  RawProviderArtifactRef,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";

/**
 * Atomically turns an IDs-only initial-invoice preparation request into one persisted provider
 * operation. The private request object has already been sealed outside the database
 * transaction; no provider call is permitted from this UoW.
 */
export type PreparePlatformTariffInvoiceChargeCommand = Readonly<{
  preparationRequestId: string;
  expectedPreparationRequestVersion: number;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  providerOperationIntentId: string;
  providerAccount: FinanceProviderAccountIdentity;
  savedCardCredential: RestrictedSavedCardCredentialRef;
  recurringConsentId: string;
  recurringConsentVersion: number;
  dispatchArtifact: RawProviderArtifactRef;
  dispatchPrivateObject: Readonly<{
    privateObjectKey: string;
    privateObjectVersion: string;
    envelopeKeyVersion: string;
    sha256Digest: `sha256:${string}`;
    byteLength: number;
    contentType: string;
  }>;
  retentionPolicyId: string;
  retentionPolicyVersion: string;
  dispatchEnvelope: Extract<ProviderDispatchEnvelope, { kind: "saved_card_charge" }>;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
  idempotencyKey: string;
  idempotencyRetentionDeadline: string;
}>;

export type PlatformTariffInvoiceChargePreparationReceipt = Readonly<{
  kind: "platform_tariff_invoice_charge_preparation_receipt";
  preparationRequestId: string;
  preparationRequestVersion: number;
  invoiceId: string;
  invoiceVersion: number;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  providerOperationIntentId: string;
}>;

export type PlatformTariffInvoiceChargePreparationUnitOfWork = Readonly<{
  preparePlatformTariffInvoiceCharge(
    command: PreparePlatformTariffInvoiceChargeCommand
  ): Promise<PlatformTariffInvoiceChargePreparationReceipt>;
}>;
