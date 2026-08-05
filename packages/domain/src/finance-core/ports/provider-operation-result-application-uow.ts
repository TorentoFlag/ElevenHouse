import type {
  FinanceCurrency,
  FinanceDigest,
  FinanceProviderAccountIdentity,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type { VerifiedProviderOperationEvidence } from "./trusted-finance-evidence";

declare const providerOperationResultCommitReceiptBrand: unique symbol;

export type ApplyVerifiedProviderResultCommand = Readonly<{
  economicPaymentIntentId: string;
  expectedEconomicPaymentVersion: number;
  providerOperationIntentId: string;
  expectedProviderOperationIntentVersion: number;
  evidence: VerifiedProviderOperationEvidence;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type ProviderOperationResultCommitReceipt = Readonly<{
  kind: "provider_operation_result_commit_receipt";
  providerOperationResultId: string;
  providerOperationIntentId: string;
  providerOperationIntentVersion: number;
  providerOperationId: string;
  operationKind: "checkout_session_create" | "card_setup" | "card_setup_execute" | "card_setup_3ds_method_complete" | "saved_card_charge" | "saved_card_charge_3ds_method_complete" | "refund" | "void";
  economicPaymentIntentId: string;
  correlatedEconomicPaymentVersion: number;
  economicPaymentSessionId: string | null;
  sourceId: string;
  purpose: "client_order" | "platform_invoice" | "platform_card_setup";
  providerAccount: FinanceProviderAccountIdentity;
  outcome: "succeeded" | "failed" | "ambiguous";
  providerPaymentId: string | null;
  amountMinor: string | null;
  currency: FinanceCurrency | null;
  evidenceArtifactId: string;
  evidenceArtifactDigest: FinanceDigest;
  canonicalRequestDigest: FinanceDigest;
  observedAt: string;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [providerOperationResultCommitReceiptBrand]: true;
}>;

export type ProviderOperationResultApplicationUnitOfWork = Readonly<{
  applyVerifiedProviderResult(
    command: ApplyVerifiedProviderResultCommand
  ): Promise<ProviderOperationResultCommitReceipt>;
}>;
