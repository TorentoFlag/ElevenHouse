import type { ResolvedFinanceOperationEnvelope } from "./finance-port-types";
import type { VerifiedChargebackResolutionAuthority } from "./trusted-finance-evidence";

declare const chargebackResolutionCommitReceiptBrand: unique symbol;

export type ResolveChargebackCommand = Readonly<{
  chargebackCaseId: string;
  expectedChargebackVersion: number;
  walletId: string;
  expectedWalletRevision: string;
  /** Legacy lot-position revisions are deliberately not used by the V2 online-wallet boundary. */
  expectedPrincipalPositionVersion: string;
  expectedRecoveryPositionVersion: string;
  resolutionAuthority: VerifiedChargebackResolutionAuthority;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type ChargebackResolutionCommitReceipt = Readonly<{
  kind: "chargeback_resolution_commit_receipt";
  chargebackCaseId: string;
  chargebackVersion: number;
  resolution: "won_reversed" | "lost_after_paid_platform_loss";
  walletRevision: string;
  journalTransactionId: string;
  journalCanonicalDigest: string;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [chargebackResolutionCommitReceiptBrand]: true;
}>;

export type ChargebackResolutionUnitOfWork = Readonly<{
  resolveChargeback(command: ResolveChargebackCommand): Promise<ChargebackResolutionCommitReceipt>;
}>;
