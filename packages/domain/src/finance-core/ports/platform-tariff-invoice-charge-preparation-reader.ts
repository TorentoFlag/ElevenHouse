import type {
  PlatformTariffInvoiceRecord,
  PlatformTariffSubscriptionRecord
} from "../../platform-billing/platform-tariff-authority-store";
import type { FiscalBuyerContact } from "../fiscal-profile";
import type { RestrictedSavedCardCredentialRef } from "../provider-dispatch-envelope";

/**
 * Worker-facing, token-free read model for an IDs-only initial tariff invoice preparation event.
 * The caller must still revalidate every mutable condition inside its write transaction.
 */
export type PlatformTariffInvoiceChargePreparationCandidate = Readonly<{
  preparationRequestId: string;
  /** Immutable invoice-scoped attempt number; never inferred from an outbox delivery. */
  attemptNumber: number;
  preparationRequestVersion: number;
  invoice: PlatformTariffInvoiceRecord;
  subscription: PlatformTariffSubscriptionRecord;
  savedCardCredential: RestrictedSavedCardCredentialRef;
  recurringConsentId: string;
  recurringConsentVersion: number;
  buyerContact: FiscalBuyerContact;
  environment: "sandbox" | "live";
}>;

export type PlatformTariffInvoiceChargePreparationReaderPort = Readonly<{
  findForPreparation(input: Readonly<{
    preparationRequestId: string;
  }>): Promise<PlatformTariffInvoiceChargePreparationCandidate | null>;
}>;
