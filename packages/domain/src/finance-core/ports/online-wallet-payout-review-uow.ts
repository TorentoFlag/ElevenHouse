import type { OnlineWalletPayoutStatus } from "../online-wallet-payout-lifecycle";
import type { FinanceDigest } from "./finance-port-types";

export type OnlineWalletPayoutTransitionAuthority = Readonly<{
  authorityId: string;
  authorityVersion: string;
  authorityDigest: FinanceDigest;
}>;

export type TransitionOnlineWalletPayoutCommand = Readonly<{
  payoutRequestId: string;
  expectedPayoutVersion: string;
  /**
   * These transitions deliberately only change the reviewed payout aggregate. Terminal
   * no-transfer and paid transitions own their corresponding wallet/bank journal moves in
   * dedicated units of work and must never be sent through this state-only port.
   */
  nextStatus: "under_review" | "approved" | "processing_manual";
  actorUserId: string;
  adminNote: string | null;
  authority: OnlineWalletPayoutTransitionAuthority;
  occurredAt: string;
}>;

export type OnlineWalletPayoutReviewCommitReceipt = Readonly<{
  kind: "online_wallet_payout_review_commit_receipt";
  effect: "applied_once" | "replayed";
  payoutRequestId: string;
  previousStatus: OnlineWalletPayoutStatus;
  status: "under_review" | "approved" | "processing_manual";
  payoutVersion: string;
}>;

export type OnlineWalletPayoutReviewUnitOfWork = Readonly<{
  transitionOnlineWalletPayout(
    command: TransitionOnlineWalletPayoutCommand
  ): Promise<OnlineWalletPayoutReviewCommitReceipt>;
}>;
