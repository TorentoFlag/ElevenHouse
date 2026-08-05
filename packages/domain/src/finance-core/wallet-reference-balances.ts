import { projectFinanceAccountBalance, type FinanceJournalTransaction } from "./journal";
import {
  createFinanceLedgerAccountRef,
  serializeFinanceLedgerAccountRef,
  type FinanceLedgerAccountCode,
  type FinanceLedgerAccountRef
} from "./ledger-chart";
import type { PayableLotBucketProjection } from "./source-lots";
import type {
  StoredWalletSnapshot,
  WalletBalanceProjection,
  WalletProjectionDiscrepancy
} from "./wallet-reference-types";

const payableBalanceDefinitions = Object.freeze([
  Object.freeze({
    name: "pending" as const,
    property: "pendingMinor" as const,
    account: "astrologer_pending" as const
  }),
  Object.freeze({
    name: "available" as const,
    property: "availableMinor" as const,
    account: "astrologer_available" as const
  }),
  Object.freeze({
    name: "reserved" as const,
    property: "reservedMinor" as const,
    account: "astrologer_reserved" as const
  }),
  Object.freeze({
    name: "payoutPending" as const,
    property: "payoutPendingMinor" as const,
    account: "astrologer_payout_pending" as const
  }),
  Object.freeze({
    name: "refundPending" as const,
    property: "refundPendingMinor" as const,
    account: "astrologer_refund_pending" as const
  })
]);
const walletBalanceDefinitions = Object.freeze([
  ...payableBalanceDefinitions,
  Object.freeze({
    name: "recoveryReceivable" as const,
    property: "recoveryReceivableMinor" as const,
    account: "astrologer_recovery_receivable" as const
  })
]);

export function projectWalletJournalBalances(
  astrologerUserId: string,
  transactions: readonly FinanceJournalTransaction[],
  discrepancies: WalletProjectionDiscrepancy[]
): WalletBalanceProjection {
  const entries = Object.freeze(transactions.flatMap((transaction) => transaction.entries));
  const projected = Object.create(null) as Record<keyof WalletBalanceProjection, string>;
  for (const definition of walletBalanceDefinitions) {
    const account = astrologerAccount(definition.account, astrologerUserId);
    const accountKey = serializeFinanceLedgerAccountRef(account);
    const accountEntries = entries.filter(
      (entry) => serializeFinanceLedgerAccountRef(entry.account) === accountKey
    );
    const balance = projectFinanceAccountBalance({ account, entries: accountEntries });
    if (balance.status === "normal") {
      projected[definition.property] = balance.balanceMinor;
    } else {
      projected[definition.property] = balance.signedNormalBalanceMinor;
      discrepancies.push(
        Object.freeze({
          kind: "journal_abnormal_balance",
          balance: definition.name,
          signedNormalBalanceMinor: balance.signedNormalBalanceMinor,
          expectedNormalSide: balance.discrepancy.expectedNormalSide
        })
      );
    }
  }
  return Object.freeze({
    pendingMinor: projected.pendingMinor,
    availableMinor: projected.availableMinor,
    reservedMinor: projected.reservedMinor,
    payoutPendingMinor: projected.payoutPendingMinor,
    refundPendingMinor: projected.refundPendingMinor,
    recoveryReceivableMinor: projected.recoveryReceivableMinor
  });
}

export function addWalletBalanceDiscrepancies(
  journalBalances: WalletBalanceProjection,
  lotBalances: PayableLotBucketProjection,
  storedWallet: StoredWalletSnapshot,
  discrepancies: WalletProjectionDiscrepancy[]
): void {
  for (const definition of payableBalanceDefinitions) {
    const journalMinor = journalBalances[definition.property];
    const lotMinor = lotBalances[definition.property];
    if (journalMinor !== lotMinor) {
      discrepancies.push(
        Object.freeze({
          kind: "source_lot_balance_mismatch",
          bucket: definition.name,
          journalMinor,
          lotMinor
        })
      );
    }
  }
  for (const definition of walletBalanceDefinitions) {
    const journalMinor = journalBalances[definition.property];
    const storedMinor = storedWallet.balances[definition.property];
    if (journalMinor !== storedMinor) {
      discrepancies.push(
        Object.freeze({
          kind: "stored_wallet_balance_mismatch",
          balance: definition.name,
          journalMinor,
          storedMinor
        })
      );
    }
  }
}

function astrologerAccount(
  code: FinanceLedgerAccountCode,
  astrologerUserId: string
): FinanceLedgerAccountRef {
  return createFinanceLedgerAccountRef({ code, astrologerUserId, currency: "RUB" });
}
