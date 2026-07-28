import type { Money } from "../money";

export type WalletBalanceBucket =
  | "pending"
  | "available"
  | "reserved"
  | "payout_pending"
  | "negative_balance";

export type LedgerAccountType =
  | "platform_clearing"
  | "platform_revenue"
  | "provider_fees"
  | "astrologer_pending"
  | "astrologer_available"
  | "astrologer_reserved"
  | "astrologer_payout_pending"
  | "astrologer_negative_balance"
  | "payout_clearing";

export type LedgerEntrySide = "debit" | "credit";

export type LedgerOperationType =
  | "sale_captured"
  | "platform_fee_recorded"
  | "provider_fee_recorded"
  | "hold_created"
  | "funds_released"
  | "reserve_created"
  | "reserve_released"
  | "payout_reserved"
  | "payout_paid"
  | "payout_failed"
  | "refund_recorded"
  | "chargeback_recorded"
  | "manual_adjustment";

export type FinanceOperationKind = "sale" | "payout" | "refund" | "adjustment";
export type FinanceOperationDirection = "inflow" | "outflow" | "neutral";

export type LedgerAccountRef = {
  readonly accountType: LedgerAccountType;
  readonly astrologerUserId: string | null;
  readonly currency: Money["currency"];
};

export type CreateLedgerEntryInput = {
  readonly account: LedgerAccountRef;
  readonly side: LedgerEntrySide;
  readonly amount: Money;
  readonly metadata: Record<string, unknown>;
};

export type CreateLedgerTransactionInput = {
  readonly id?: string;
  readonly operationType: LedgerOperationType;
  readonly orderId: string | null;
  readonly payoutRequestId: string | null;
  readonly occurredAt: string;
  readonly postedAt: string;
  readonly metadata: Record<string, unknown>;
  readonly entries: readonly CreateLedgerEntryInput[];
};

export type LedgerEntryRecord = CreateLedgerEntryInput & {
  readonly id: string;
  readonly ledgerAccountId: string;
};

export type LedgerTransactionRecord = Omit<CreateLedgerTransactionInput, "id" | "entries"> & {
  readonly id: string;
  readonly entries: readonly LedgerEntryRecord[];
};

export type WalletBalance = {
  readonly astrologerUserId: string;
  readonly pending: Money;
  readonly available: Money;
  readonly reserved: Money;
  readonly payoutPending: Money;
  readonly negativeBalance: Money;
  readonly updatedAt: string;
};

export type LedgerOperation = {
  readonly id: string;
  readonly operationType: LedgerOperationType;
  readonly kind: FinanceOperationKind;
  readonly direction: FinanceOperationDirection;
  readonly amount: Money;
  readonly signedAmountMinor: number;
  readonly balanceBucket: WalletBalanceBucket | null;
  readonly orderId: string | null;
  readonly payoutRequestId: string | null;
  readonly occurredAt: string;
  readonly postedAt: string;
  readonly metadata: Record<string, unknown>;
};

export type ListLedgerOperationsInput = {
  readonly astrologerUserId: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly operationType?: LedgerOperationType;
  readonly balanceBucket?: WalletBalanceBucket;
};

export type LedgerOperationList = {
  readonly operations: readonly LedgerOperation[];
  readonly nextCursor: string | null;
};

export class LedgerUnbalancedTransactionError extends Error {
  readonly code = "ledger_unbalanced_transaction";

  constructor(readonly currency: Money["currency"]) {
    super(`Ledger transaction is not balanced for ${currency}`);
    this.name = "LedgerUnbalancedTransactionError";
  }
}

export class LedgerAccountShapeError extends Error {
  readonly code = "ledger_account_shape_invalid";

  constructor(message: string) {
    super(message);
    this.name = "LedgerAccountShapeError";
  }
}

export type LedgerStore = {
  /**
   * Wallet read models are recomputed transactionally from persisted ledger
   * entries. Astrologer liability buckets use credit minus debit as the
   * displayed bucket amount. `negative_balance` is debt owed by the astrologer,
   * so debit minus credit is displayed for that bucket. Platform accounts are
   * not exposed in wallet balances.
   */
  readonly createTransaction: (
    input: CreateLedgerTransactionInput
  ) => Promise<LedgerTransactionRecord>;
  readonly findWalletBalance: (astrologerUserId: string) => Promise<WalletBalance | null>;
  readonly listOperations: (input: ListLedgerOperationsInput) => Promise<LedgerOperationList>;
};
