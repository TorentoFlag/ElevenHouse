/**
 * Worker-only v2 release port. The adapter derives the candidate and all release authority from
 * persisted immutable records; callers can choose only the bounded batch and evaluation time.
 */
export type ReleaseDueOnlineWalletHoldsCommand = Readonly<{
  now: string;
  limit: number;
}>;

export type OnlineWalletHoldReleaseCommitReceipt = Readonly<{
  kind: "online_wallet_hold_release_commit_receipt";
  effect: "applied_once" | "replayed" | "ineligible";
  rootLotId: string;
  walletId: string;
  walletRevision: string | null;
  mutationId: string | null;
  journalTransactionId: string | null;
}>;

export type ReleaseDueOnlineWalletHoldsResult = Readonly<{
  scanned: number;
  released: number;
  replayed: number;
  ineligible: number;
  receipts: readonly OnlineWalletHoldReleaseCommitReceipt[];
}>;

export type OnlineWalletHoldReleaseUnitOfWork = Readonly<{
  releaseDueOnlineWalletHolds(
    command: ReleaseDueOnlineWalletHoldsCommand
  ): Promise<ReleaseDueOnlineWalletHoldsResult>;
}>;
