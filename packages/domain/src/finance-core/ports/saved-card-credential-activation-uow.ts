import type { FinanceDigest, RawProviderArtifactRef } from "./finance-port-types";
import type { ProviderOperationResultCommitReceipt } from "./provider-operation-result-application-uow";

/**
 * The only persistence boundary that turns a canonical ArcPay saved-card observation into a
 * usable credential. The caller supplies branded provider-result evidence plus separately
 * sealed `/cards` evidence; implementation must lock and correlate both before activation.
 */
export type ActivateSavedCardCredentialCommand = Readonly<{
  setupSessionId: string;
  expectedSetupSessionVersion: number;
  providerResult: ProviderOperationResultCommitReceipt;
  credential: Readonly<{
    credentialId: string;
    restrictedTokenHandleRef: string;
    providerCredentialFingerprint: FinanceDigest;
    displayBrand: string;
    displayLast4: string;
    displayMask: string;
    expiryMonth: number;
    expiryYear: number;
  }>;
  canonicalSavedCardDirectoryArtifact: RawProviderArtifactRef;
  observedAt: string;
}>;

export type SavedCardCredentialActivationReceipt = Readonly<{
  kind: "saved_card_credential_activation_receipt";
  setupSessionId: string;
  setupSessionVersion: number;
  savedCardCredentialId: string;
  savedCardCredentialVersion: string;
  activatedAt: string;
}>;

export type SavedCardCredentialActivationUnitOfWork = Readonly<{
  activateSavedCardCredential(
    command: ActivateSavedCardCredentialCommand
  ): Promise<SavedCardCredentialActivationReceipt>;
}>;
