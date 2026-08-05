import type { FiscalBuyerContact } from "../fiscal-profile";

/**
 * Starts the non-monetary saved-card setup saga. The implementation must bind the exact
 * incomplete tariff subscription, published legal disclosure, active ArcPay identity and
 * recurring-charge consent in one transaction. It must not create a tariff invoice or charge.
 */
export type InitiateSavedCardSetupCommand = Readonly<{
  setupSessionId: string;
  consentId: string;
  subscriptionId: string;
  ownerUserId: string;
  expectedSubscriptionVersion: number;
  disclosureSeriesId: string;
  disclosureVersion: number;
  disclosureDigest: `sha256:${string}`;
  noticeLocale: "ru" | "en";
  /** Explicit contact for fiscal receipts, verified against the authenticated owner in the UoW. */
  buyerContact: FiscalBuyerContact;
  providerEnvironment: "sandbox" | "live";
  now: string;
}>;

export type SavedCardSetupInitiationReceipt = Readonly<{
  kind: "saved_card_setup_initiation_receipt";
  setupSessionId: string;
  setupSessionVersion: number;
  consentId: string;
  consentVersion: string;
  state: "setup_requested";
}>;

export type SavedCardSetupInitiationUnitOfWork = Readonly<{
  initiateSavedCardSetup(
    command: InitiateSavedCardSetupCommand
  ): Promise<SavedCardSetupInitiationReceipt>;
}>;
