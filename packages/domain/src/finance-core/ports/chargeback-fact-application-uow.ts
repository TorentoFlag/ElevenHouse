import type { VerifiedWalletOperationCommitReceipt } from "../wallet-operation-commit-binding-types";
import type {
  FinanceCurrency,
  FinanceDigest,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type { VerifiedChargebackProviderEvidence } from "./trusted-finance-evidence";

declare const chargebackFactApplicationCommitReceiptBrand: unique symbol;

export type ApplyVerifiedChargebackFactCommand = Readonly<{
  chargebackCaseId: string;
  expectedChargebackVersion: number;
  orderId: string;
  economicPaymentIntentId: string;
  walletId: string;
  expectedWalletRevision: string;
  expectedPrincipalPositionVersion: string;
  expectedActivePayoutSetRevision: string;
  currency: FinanceCurrency;
  providerEvidence: VerifiedChargebackProviderEvidence;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type ChargebackFactApplicationCommitReceipt = Readonly<{
  kind: "chargeback_fact_application_commit_receipt";
  chargebackCaseId: string;
  chargebackVersion: number;
  principalPositionVersion: string;
  cumulativePrincipalMinor: string;
  frozenSourceSetDigest: FinanceDigest;
  walletJournalCommitReceipt: VerifiedWalletOperationCommitReceipt;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [chargebackFactApplicationCommitReceiptBrand]: true;
}>;

export type ChargebackFactApplicationUnitOfWork = Readonly<{
  applyVerifiedChargebackFact(
    command: ApplyVerifiedChargebackFactCommand
  ): Promise<ChargebackFactApplicationCommitReceipt>;
}>;
