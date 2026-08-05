import type { FinanceLedgerSide } from "./ledger-chart";
import type { PayableLotBucketProjection } from "./source-lots";

export type PayableBalanceName =
  | "pending"
  | "available"
  | "reserved"
  | "payoutPending"
  | "refundPending";

export type WalletBalanceName = PayableBalanceName | "recoveryReceivable";

export type WalletBalanceProjection = Readonly<
  PayableLotBucketProjection & {
    recoveryReceivableMinor: string;
  }
>;

export type StoredWalletSnapshot = Readonly<{
  walletId: string;
  version: string;
  astrologerUserId: string;
  currency: "RUB";
  balances: WalletBalanceProjection;
}>;

export type WalletProjectionDiscrepancy =
  | Readonly<{
      kind: "journal_duplicate_transaction_id";
      transactionId: string;
    }>
  | Readonly<{
      kind: "journal_duplicate_source_key";
      sourceKey: string;
    }>
  | Readonly<{
      kind: "journal_foreign_astrologer_account";
      transactionId: string;
      entryIndex: number;
      astrologerUserId: string;
    }>
  | Readonly<{
      kind: "journal_recovery_authority_mismatch";
      transactionId: string;
      entryIndex: number;
      reason:
        | "source_not_approved"
        | "original_sale_link_required"
        | "component_link_required"
        | "payable_lot_link_required"
        | "payout_allocation_link_required"
        | "side_mismatch";
    }>
  | Readonly<{
      kind: "journal_orphan_reversal";
      transactionId: string;
      reversesTransactionId: string;
    }>
  | Readonly<{
      kind: "journal_reversal_mismatch";
      transactionId: string;
      reversesTransactionId: string;
    }>
  | Readonly<{
      kind: "journal_duplicate_reversal";
      transactionId: string;
      reversesTransactionId: string;
      firstReversalTransactionId: string;
    }>
  | Readonly<{
      kind: "journal_abnormal_balance";
      balance: WalletBalanceName;
      signedNormalBalanceMinor: string;
      expectedNormalSide: FinanceLedgerSide;
    }>
  | Readonly<{
      kind: "source_lot_balance_mismatch";
      bucket: PayableBalanceName;
      journalMinor: string;
      lotMinor: string;
    }>
  | Readonly<{
      kind: "source_lot_journal_edge_mismatch";
      reason:
        | "missing_journal_entry"
        | "extra_journal_entry"
        | "duplicate_journal_entry"
        | "payable_lot_link_required"
        | "payable_lot_link_mismatch"
        | "source_key_mismatch"
        | "account_bucket_mismatch"
        | "side_mismatch"
        | "amount_mismatch"
        | "original_sale_link_mismatch"
        | "payout_allocation_link_mismatch";
      transactionId: string | null;
      entryIndex: number | null;
      payableLotId: string | null;
    }>
  | Readonly<{
      kind: "source_lot_receipt_mismatch";
      reason:
        | "missing_receipt"
        | "extra_receipt"
        | "duplicate_receipt"
        | "order_mismatch"
        | "operation_kind_mismatch"
        | "source_key_mismatch"
        | "occurred_at_mismatch"
        | "history_digest_mismatch"
        | "receipt_semantics_mismatch"
        | "version_chain_mismatch"
        | "state_digest_mismatch"
        | "owner_currency_mismatch";
      operationId: string | null;
    }>
  | Readonly<{
      kind: "stored_wallet_balance_mismatch";
      balance: WalletBalanceName;
      journalMinor: string;
      storedMinor: string;
    }>;

export type AstrologerWalletProjection = Readonly<{
  status: "consistent" | "discrepant";
  integrityStatus: "unverified";
  sourceReceiptCoverage: "payable_lot_history_only";
  astrologerUserId: string;
  currency: "RUB";
  journalBalances: WalletBalanceProjection;
  lotBalances: PayableLotBucketProjection;
  storedBalances: WalletBalanceProjection;
  discrepancies: readonly WalletProjectionDiscrepancy[];
}>;
