import type { FinanceProviderAccountIdentity, RawProviderArtifactRef, ResolvedFinanceOperationEnvelope } from "./finance-port-types";

/** Commits the complete pre-I/O state for one zero-amount ArcPay card setup. */
export type PrepareSavedCardSetupCommand = Readonly<{
  setupSessionId: string;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  providerOperationIntentId: string;
  providerAccount: FinanceProviderAccountIdentity;
  dispatchArtifact: RawProviderArtifactRef;
  dispatchPrivateObject: Readonly<{ privateObjectKey: string; privateObjectVersion: string; envelopeKeyVersion: string; sha256Digest: `sha256:${string}`; byteLength: number; contentType: string }>;
  retentionPolicyId: string;
  retentionPolicyVersion: string;
  dispatchEnvelope: Readonly<{ kind: "card_setup"; step: "create"; customerId: string; setupExternalId: string; successUrl: string; failureUrl: string }>;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
  idempotencyKey: string;
  idempotencyRetentionDeadline: string;
}>;

export type SavedCardSetupPreparationReceipt = Readonly<{
  kind: "saved_card_setup_preparation_receipt";
  setupSessionId: string;
  setupSessionVersion: number;
  economicPaymentIntentId: string;
  providerOperationIntentId: string;
}>;

export type SavedCardSetupPreparationUnitOfWork = Readonly<{
  prepareSavedCardSetup(command: PrepareSavedCardSetupCommand): Promise<SavedCardSetupPreparationReceipt>;
}>;
