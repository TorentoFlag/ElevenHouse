import type { FinanceProviderAccountIdentity } from "./finance-port-types";

/**
 * Read-only server-derived input for an admin's V2 refund decision. No browser field may supply
 * any of these identities or versions; the sole monetary decision is validated against `gross`.
 */
export type OnlineWalletRefundApprovalPreparation = Readonly<{
  refundCandidateId: string;
  refundCandidateVersion: number;
  refundCandidateReviewId: string;
  orderId: string;
  captureApplicationId: string;
  walletId: string;
  walletRevision: string;
  economicPaymentIntentId: string;
  economicPaymentVersion: number;
  providerAccount: FinanceProviderAccountIdentity;
  providerPaymentId: string;
  grossAmountMinor: string;
  previousCumulativeRefundedMinor: string;
  providerOperationSourceVersion: number;
}>;

export type OnlineWalletRefundApprovalPreparationReader = Readonly<{
  findForApproval(input: Readonly<{
    refundCandidateId: string;
  }>): Promise<OnlineWalletRefundApprovalPreparation | null>;
}>;
