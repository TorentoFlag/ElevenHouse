import type { VerifiedWalletOperationCommitReceipt } from "../wallet-operation-commit-binding-types";
import type { ResolvedFinanceOperationEnvelope } from "./finance-port-types";
import type { VerifiedChargebackResolutionAuthority } from "./trusted-finance-evidence";

declare const chargebackResolutionCommitReceiptBrand: unique symbol;

export type ResolveChargebackCommand = Readonly<{
  chargebackCaseId: string;
  expectedChargebackVersion: number;
  walletId: string;
  expectedWalletRevision: string;
  expectedPrincipalPositionVersion: string;
  expectedRecoveryPositionVersion: string;
  resolutionAuthority: VerifiedChargebackResolutionAuthority;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type ChargebackResolutionCommitReceipt = Readonly<{
  kind: "chargeback_resolution_commit_receipt";
  chargebackCaseId: string;
  chargebackVersion: number;
  resolution: "won_reversed" | "lost_final";
  principalPositionVersion: string;
  recoveryPositionVersion: string;
  walletJournalCommitReceipt: VerifiedWalletOperationCommitReceipt;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [chargebackResolutionCommitReceiptBrand]: true;
}>;

export type ChargebackResolutionUnitOfWork = Readonly<{
  resolveChargeback(command: ResolveChargebackCommand): Promise<ChargebackResolutionCommitReceipt>;
}>;
