import type { VerifiedWalletOperationCommitReceipt } from "../wallet-operation-commit-binding-types";
import type {
  FinanceCurrency,
  FinanceDigest,
  ResolvedFinanceOperationEnvelope
} from "./finance-port-types";
import type { VerifiedPayoutNoTransferEvidence } from "./trusted-finance-evidence";

declare const completeActivePayoutBridgeInventoryReceiptBrand: unique symbol;
declare const payoutDefinitiveNoTransferCommitReceiptBrand: unique symbol;

export type PayoutNoTransferCanonicalLockOrder = readonly [
  "aggregate_roots_by_type_and_id",
  "astrologer_wallet",
  "source_lots_by_source_and_lot_id",
  "active_refund_bridge_reservations_by_payout_and_id",
  "payout_requests_by_id",
  "bank_liquidity_by_pool_and_currency",
  "bank_exposures_by_id"
];

/**
 * The caller supplies only the expected inventory revision, never a selected bridge subset.
 * The adapter discovers the complete active set while holding the payout-wide locks.
 */
export type PayoutDefinitiveNoTransferCommand = Readonly<{
  payoutRequestId: string;
  expectedPayoutVersion: number;
  walletId: string;
  expectedWalletRevision: string;
  expectedActiveBridgeInventoryRevision: string;
  bankCashPoolId: string;
  currency: FinanceCurrency;
  expectedBankLiquidityRevision: string;
  bankExposureId: string;
  expectedBankExposureVersion: number;
  outcome: VerifiedPayoutNoTransferEvidence;
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type CompleteActivePayoutBridgeInventoryReceipt = Readonly<{
  kind: "complete_active_payout_bridge_inventory_receipt";
  payoutRequestId: string;
  previousInventoryRevision: string;
  nextInventoryRevision: string;
  completeActiveSetDigest: FinanceDigest;
  activeBridgeCount: number;
  activeBridgeAmountMinor: string;
  closedBridgeCount: number;
  closedBridgeAmountMinor: string;
  lockOrder: PayoutNoTransferCanonicalLockOrder;
  persistenceTransactionBoundaryRef: string;
  [completeActivePayoutBridgeInventoryReceiptBrand]: true;
}>;

export type PayoutDefinitiveNoTransferCommitReceipt = Readonly<{
  kind: "payout_definitive_no_transfer_commit_receipt";
  payoutRequestId: string;
  payoutVersion: number;
  completeActiveBridgeInventory: CompleteActivePayoutBridgeInventoryReceipt;
  walletJournalCommitReceipt: VerifiedWalletOperationCommitReceipt;
  trueUnbridgedRemainderMinor: string;
  bankExposureId: string;
  bankExposureVersion: number;
  bankExposureState: "released" | "returned_without_debit";
  bankLiquidityRevision: string;
  persistenceTransactionBoundaryRef: string;
  committedAt: string;
  [payoutDefinitiveNoTransferCommitReceiptBrand]: true;
}>;

/**
 * Resolves the whole payout under the canonical lock order. The adapter must prove and close
 * every active bridge, release only the true remainder and close bank exposure atomically.
 */
export type PayoutDefinitiveNoTransferUnitOfWork = Readonly<{
  resolveDefinitiveNoTransfer(
    command: PayoutDefinitiveNoTransferCommand
  ): Promise<PayoutDefinitiveNoTransferCommitReceipt>;
}>;
