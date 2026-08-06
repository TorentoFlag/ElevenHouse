import type { FinanceDigest } from "./finance-port-types";
import type { OnlineWalletPayoutApprovalReceiptRef } from "./online-wallet-payout-execution-uow";

/**
 * Privileged, server-only snapshot used to derive a sensitive payout command. It is intentionally
 * separate from the owner/admin queue projection: neither the authorization aggregate UUID nor
 * the evidence binding can leak into a browser response by accident.
 */
export type OnlineWalletPayoutExecutionPreparation = Readonly<{
  payoutRequestId: string;
  authorizationAggregateId: string;
  payoutVersion: string;
  payoutStatus: "approved" | "processing_manual";
  walletId: string;
  walletRevision: string;
  astrologerUserId: string;
  amountMinor: string;
  currency: "RUB";
  approval: OnlineWalletPayoutApprovalReceiptRef;
  bankExposureId: string;
  bankExposureVersion: string;
  bankCashPoolId: string;
}>;

/** A sealed, active bank-transfer document that is bound to the exact ElevenHouse cash pool. */
export type OnlineWalletPayoutBankTransferEvidence = Readonly<{
  artifactId: string;
  sha256Digest: FinanceDigest;
}>;

export type OnlineWalletPayoutExecutionPreparationReader = Readonly<{
  findPayoutExecutionPreparation(input: Readonly<{
    payoutRequestId: string;
  }>): Promise<OnlineWalletPayoutExecutionPreparation | null>;
  findBankTransferEvidence(input: Readonly<{
    artifactId: string;
    bankCashPoolId: string;
    currency: "RUB";
  }>): Promise<OnlineWalletPayoutBankTransferEvidence | null>;
}>;
