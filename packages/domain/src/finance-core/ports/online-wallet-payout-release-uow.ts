import type { FinanceDigest } from "./finance-port-types";
import type { OnlineWalletPayoutStatus } from "../online-wallet-payout-lifecycle";

export type ReleaseOnlineWalletPayoutCommand = Readonly<{
  payoutRequestId: string;
  expectedPayoutVersion: string;
  nextStatus: "rejected" | "cancelled" | "failed";
  failureReason: string | null;
  adminNote: string | null;
  /** `system` is reserved for an immutable provider-evidence rule, never human impersonation. */
  actorKind?: "user" | "system";
  actorUserId: string | null;
  authority: Readonly<{
    authorityId: string;
    authorityVersion: string;
    authorityDigest: FinanceDigest;
  }>;
  occurredAt: string;
}>;

export type OnlineWalletPayoutReleaseCommitReceipt = Readonly<{
  kind: "online_wallet_payout_release_commit_receipt";
  effect: "applied_once" | "replayed";
  payoutRequestId: string;
  previousStatus: OnlineWalletPayoutStatus;
  status: "rejected" | "cancelled" | "failed";
  payoutVersion: string;
  walletId: string;
  walletRevision: string;
  mutationId: string;
  journalTransactionId: string;
}>;

export type OnlineWalletPayoutReleaseUnitOfWork = Readonly<{
  releaseOnlineWalletPayout(
    command: ReleaseOnlineWalletPayoutCommand
  ): Promise<OnlineWalletPayoutReleaseCommitReceipt>;
}>;
