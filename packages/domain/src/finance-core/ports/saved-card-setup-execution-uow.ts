import type { ArcPayBrowserInfo, SealedOneTimeProviderSecret } from "../finance-transient-secret-vault";
import type { FinanceProviderAccountIdentity, RawProviderArtifactRef, ResolvedFinanceOperationEnvelope } from "./finance-port-types";

/** Commits a browser-tokenized saved-card setup execution before ArcPay execute I/O. */
export type ExecuteSavedCardSetupCommand = Readonly<{
  setupSessionId: string;
  expectedSetupSessionVersion: number;
  providerOperationIntentId: string;
  transientSecretRefId: string;
  threeDsMethodContextSecretRefId: string;
  providerAccount: FinanceProviderAccountIdentity;
  providerSetupId: string;
  providerCustomerId: string;
  sealedTokenizationSecret: SealedOneTimeProviderSecret;
  /** Token-free browser fingerprint retained for a possible later 3DS Method call. */
  sealedThreeDsMethodContext: SealedOneTimeProviderSecret;
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
  operationEnvelope: ResolvedFinanceOperationEnvelope;
  idempotencyKey: string;
  idempotencyRetentionDeadline: string;
}>;

export type SavedCardSetupExecutionReceipt = Readonly<{
  kind: "saved_card_setup_execution_receipt";
  setupSessionId: string;
  setupSessionVersion: number;
  providerOperationIntentId: string;
  state: "execution_pending";
}>;

export type SavedCardSetupExecutionUnitOfWork = Readonly<{
  executeSavedCardSetup(
    command: ExecuteSavedCardSetupCommand
  ): Promise<SavedCardSetupExecutionReceipt>;
}>;

/** Captured only at the API boundary and passed directly to the private one-time vault. */
export type SavedCardSetupBrowserTokenizationInput = Readonly<{
  cardTokenId: string;
  browserInfo: ArcPayBrowserInfo;
}>;
