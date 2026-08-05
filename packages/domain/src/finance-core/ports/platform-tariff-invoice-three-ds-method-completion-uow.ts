import type { FinancePrivateObjectWriteReceipt } from "../finance-private-object-storage";
import type { SealedOneTimeProviderSecret } from "../finance-transient-secret-vault";
import type { RawProviderArtifactRef, ResolvedFinanceOperationEnvelope } from "./finance-port-types";
import type { PersistedProviderDispatchReceipt } from "./provider-operation-intent-creation-uow";

/**
 * Consumes one pending tariff-invoice 3DS Method action and commits its exact provider completion
 * operation before I/O. The browser controls only the completion indicator; all action evidence
 * and browser context are sealed server-side.
 */
export type CompletePlatformTariffInvoiceThreeDsMethodCommand = Readonly<{
  invoiceId: string;
  expectedInvoiceVersion: number;
  customerActionId: string;
  completionIndicator: "Y" | "N" | "U";
  threeDsMethodContextSecretRefId: string;
  sealedThreeDsMethodContext: SealedOneTimeProviderSecret;
  providerOperationIntentId: string;
  idempotencyKey: string;
  idempotencyRetentionDeadline: string;
  dispatchArtifact: RawProviderArtifactRef;
  dispatchPrivateObject: FinancePrivateObjectWriteReceipt;
  retentionPolicyId: string;
  retentionPolicyVersion: string;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type PlatformTariffInvoiceThreeDsMethodCompletionUnitOfWork = Readonly<{
  completeThreeDsMethod(
    command: CompletePlatformTariffInvoiceThreeDsMethodCommand
  ): Promise<PersistedProviderDispatchReceipt>;
}>;
