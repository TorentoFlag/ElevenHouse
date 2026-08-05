import type { PersistedProviderDispatchReceipt } from "./provider-operation-intent-creation-uow";
import type { FinancePrivateObjectWriteReceipt } from "../finance-private-object-storage";
import type { RawProviderArtifactRef, ResolvedFinanceOperationEnvelope } from "./finance-port-types";

/** Atomically consumes the pending Method action and commits the next ArcPay dispatch before I/O. */
export type CompleteSavedCardSetupThreeDsMethodCommand = Readonly<{
  setupSessionId: string;
  expectedSetupSessionVersion: number;
  customerActionId: string;
  completionIndicator: "Y" | "N" | "U";
  providerOperationIntentId: string;
  idempotencyKey: string;
  idempotencyRetentionDeadline: string;
  dispatchArtifact: RawProviderArtifactRef;
  dispatchPrivateObject: FinancePrivateObjectWriteReceipt;
  retentionPolicyId: string;
  retentionPolicyVersion: string;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type SavedCardSetupThreeDsMethodCompletionUnitOfWork = Readonly<{
  completeThreeDsMethod(
    command: CompleteSavedCardSetupThreeDsMethodCommand
  ): Promise<PersistedProviderDispatchReceipt>;
}>;
