import type { FinanceDigest } from "./finance-port-types";

/**
 * Verified compact checkpoint for one wallet revision. It proves the normalized receipt/history/
 * commit-binding graph agrees with the current wallet head; it is not a mutable lot aggregate.
 */
export type VerifiedWalletLotStateSnapshot = Readonly<{
  walletId: string;
  astrologerUserId: string;
  currency: "RUB";
  walletRevision: string;
  lotStateVersion: string;
  lotStateDigest: FinanceDigest;
  operationReceiptId: string;
  commitBindingId: string;
  commitReceiptId: string;
}>;

/** Reconciliation/audit reader only. It must not authorize an online wallet mutation by itself. */
export type WalletLotStateSnapshotReader = Readonly<{
  findCurrentForWallet(
    input: Readonly<{ astrologerUserId: string; currency: "RUB" }>
  ): Promise<VerifiedWalletLotStateSnapshot | null>;
}>;
