import type { FinanceDigest } from "./finance-port-types";

/** Privileged V2 approval facts; this projection is never returned to an admin browser. */
export type OnlineWalletPayoutApprovalPreparation = Readonly<{
  payoutRequestId: string;
  authorizationAggregateId: string;
  payoutVersion: string;
  payoutStatus: "under_review";
  astrologerUserId: string;
  amountMinor: string;
  currency: "RUB";
  beneficiaryFingerprint: FinanceDigest;
}>;

export type OnlineWalletPayoutApprovalPreparationReader = Readonly<{
  findPayoutApprovalPreparation(input: Readonly<{
    payoutRequestId: string;
  }>): Promise<OnlineWalletPayoutApprovalPreparation | null>;
}>;
