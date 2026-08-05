import type { FinanceLedgerAccountCode, FinanceLedgerSide } from "./ledger-chart";
import type {
  WalletBalanceSnapshot,
  WalletLotBalanceBucket
} from "./wallet-operation-snapshot-types";

export type WalletBalanceDefinition = Readonly<{
  bucket: WalletLotBalanceBucket;
  balance: keyof WalletBalanceSnapshot;
  accountCode: FinanceLedgerAccountCode;
  normalSide: FinanceLedgerSide;
}>;

const walletBalanceDefinitions = Object.freeze([
  Object.freeze({
    bucket: "pending" as const,
    balance: "pendingMinor" as const,
    accountCode: "astrologer_pending" as const,
    normalSide: "credit" as const
  }),
  Object.freeze({
    bucket: "available" as const,
    balance: "availableMinor" as const,
    accountCode: "astrologer_available" as const,
    normalSide: "credit" as const
  }),
  Object.freeze({
    bucket: "reserved" as const,
    balance: "reservedMinor" as const,
    accountCode: "astrologer_reserved" as const,
    normalSide: "credit" as const
  }),
  Object.freeze({
    bucket: "payout_pending" as const,
    balance: "payoutPendingMinor" as const,
    accountCode: "astrologer_payout_pending" as const,
    normalSide: "credit" as const
  }),
  Object.freeze({
    bucket: "refund_pending" as const,
    balance: "refundPendingMinor" as const,
    accountCode: "astrologer_refund_pending" as const,
    normalSide: "credit" as const
  }),
  Object.freeze({
    bucket: "recovery_receivable" as const,
    balance: "recoveryReceivableMinor" as const,
    accountCode: "astrologer_recovery_receivable" as const,
    normalSide: "debit" as const
  })
] satisfies readonly WalletBalanceDefinition[]);

const walletBalanceDefinitionByBucket = new Map(
  walletBalanceDefinitions.map((definition) => [definition.bucket, definition])
);
const walletBalanceDefinitionByAccountCode = new Map<
  FinanceLedgerAccountCode,
  WalletBalanceDefinition
>(walletBalanceDefinitions.map((definition) => [definition.accountCode, definition]));
export const walletBalanceKeys = Object.freeze(
  walletBalanceDefinitions.map((definition) => definition.balance)
);

export function findWalletBalanceDefinitionByBucket(
  bucket: WalletLotBalanceBucket
): WalletBalanceDefinition | undefined {
  return walletBalanceDefinitionByBucket.get(bucket);
}

export function findWalletBalanceDefinitionByAccountCode(
  accountCode: FinanceLedgerAccountCode
): WalletBalanceDefinition | undefined {
  return walletBalanceDefinitionByAccountCode.get(accountCode);
}
