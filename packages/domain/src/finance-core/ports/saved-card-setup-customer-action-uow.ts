import type { FinanceProviderAccountIdentity, RawProviderArtifactRef } from "./finance-port-types";

/**
 * Persists a browser handoff as a non-terminal provider fact. The opaque action fields remain
 * exclusively in a sealed provider response artifact; database state records only the authority
 * and safe action classification needed to resume the workflow.
 */
export type RecordSavedCardSetupCustomerActionCommand = Readonly<{
  setupSessionId: string;
  expectedSetupSessionVersion: number;
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  providerOperationIntentId: string;
  expectedProviderOperationIntentVersion: number;
  providerAccount: FinanceProviderAccountIdentity;
  providerSetupId: string;
  actionType: "three_ds_method" | "three_ds_challenge";
  phase: "method" | "challenge";
  responseArtifact: RawProviderArtifactRef;
  observedAt: string;
}>;

export type SavedCardSetupCustomerActionReceipt = Readonly<{
  kind: "saved_card_setup_customer_action_receipt";
  setupSessionId: string;
  setupSessionVersion: number;
  providerOperationIntentId: string;
  providerOperationIntentVersion: number;
  state: "requires_customer_action";
}>;

export type SavedCardSetupCustomerActionUnitOfWork = Readonly<{
  recordCustomerAction(
    command: RecordSavedCardSetupCustomerActionCommand
  ): Promise<SavedCardSetupCustomerActionReceipt>;
}>;
