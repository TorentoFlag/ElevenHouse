import type { FinanceDigest, FinanceProviderAccountIdentity, RawProviderArtifactRef } from "./finance-port-types";

/** Owner-scoped metadata needed to authorize a one-time 3DS action artifact delivery. */
export type SavedCardSetupCustomerActionForOwner = Readonly<{
  customerActionId: string;
  setupSessionId: string;
  setupSessionVersion: number;
  ownerUserId: string;
  providerSetupId: string;
  providerAccount: FinanceProviderAccountIdentity;
  actionType: "three_ds_method" | "three_ds_challenge";
  phase: "method" | "challenge";
  providerResponseArtifact: RawProviderArtifactRef;
  providerResponseArtifactDigest: FinanceDigest;
  /** Server-only opaque vault reference; never serialize this into an owner-facing response. */
  threeDsMethodContextSecretRef: string | null;
  threeDsMethodContextProviderExpiresAt: string | null;
}>;

export type SavedCardSetupCustomerActionReaderPort = Readonly<{
  findPendingForOwner(input: Readonly<{
    setupSessionId: string;
    ownerUserId: string;
    expectedSetupSessionVersion: number;
  }>): Promise<SavedCardSetupCustomerActionForOwner | null>;
}>;
