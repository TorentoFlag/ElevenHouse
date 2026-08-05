import type { ProviderOperationResultCommitReceipt } from "./provider-operation-result-application-uow";
import type { FinanceProviderAccountIdentity, ResolvedFinanceOperationEnvelope } from "./finance-port-types";

export type SavedCardSetupTerminalProviderOperation = Readonly<{
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  providerOperationIntentId: string;
  expectedProviderOperationIntentVersion: number;
  operationKind: "card_setup_execute" | "card_setup_3ds_method_complete";
  providerAccount: FinanceProviderAccountIdentity;
  economicPaymentSessionId: string;
  sourceId: string;
  purpose: "platform_card_setup";
  canonicalRequestDigest: `sha256:${string}`;
  idempotencyKey: string;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type SavedCardSetupTerminalReconciliationCandidate =
  | Readonly<{
      state: "awaiting_provider_terminal";
      setupSessionId: string;
      setupSessionVersion: number;
      subscriptionId: string;
      expectedSubscriptionVersion: number;
      providerSetupId: string;
      providerCustomerId: string;
      providerOperation: SavedCardSetupTerminalProviderOperation;
    }>
  | Readonly<{
      state: "awaiting_credential_activation";
      setupSessionId: string;
      setupSessionVersion: number;
      subscriptionId: string;
      expectedSubscriptionVersion: number;
      providerSetupId: string;
      providerCustomerId: string;
      providerResult: ProviderOperationResultCommitReceipt;
    }>
  | Readonly<{
      state: "credential_active";
      setupSessionId: string;
      subscriptionId: string;
      expectedSubscriptionVersion: number;
      savedCardCredentialId: string;
      savedCardCredentialVersion: string;
    }>;

/**
 * Durable recovery view for setup terminalization. A worker never trusts a browser redirect or
 * webhook payload; it receives only database-correlated candidates and re-reads ArcPay itself.
 */
export type SavedCardSetupTerminalReconciliationReaderPort = Readonly<{
  listSavedCardSetupTerminalCandidates(input: Readonly<{ limit: number }>): Promise<
    readonly SavedCardSetupTerminalReconciliationCandidate[]
  >;
}>;
