import type { SealedPayoutDestinationSnapshot } from "../finance-payout-destination-vault";
import type { FinanceCurrency, FinanceDigest } from "./finance-port-types";

export type OnlineWalletPayoutRequestAuthority = Readonly<{
  authorityId: string;
  authorityVersion: string;
  authorityDigest: FinanceDigest;
}>;

export type CreateOnlineWalletPayoutRequestCommand = Readonly<{
  payoutRequestId: string;
  walletId: string;
  astrologerUserId: string;
  amountMinor: string;
  currency: FinanceCurrency;
  destination: SealedPayoutDestinationSnapshot;
  requestAuthority: OnlineWalletPayoutRequestAuthority;
  occurredAt: string;
}>;

export type OnlineWalletPayoutRequestCommitReceipt = Readonly<{
  kind: "online_wallet_payout_request_commit_receipt";
  effect: "applied_once" | "replayed";
  payoutRequestId: string;
  walletId: string;
  walletRevision: string;
  payoutVersion: string;
  mutationId: string;
  journalTransactionId: string;
}>;

export type OnlineWalletPayoutRequestUnitOfWork = Readonly<{
  createOnlineWalletPayoutRequest(
    command: CreateOnlineWalletPayoutRequestCommand
  ): Promise<OnlineWalletPayoutRequestCommitReceipt>;
}>;
