import type { FinanceSourceKey } from "./finance-source-key";
import type { FinanceJournalEntry, FinanceJournalTransaction } from "./journal";
import type { WalletProjectionDiscrepancy } from "./wallet-reference-types";

export function addJournalScopeAndRecoveryDiscrepancies(
  transactions: readonly FinanceJournalTransaction[],
  astrologerUserId: string,
  discrepancies: WalletProjectionDiscrepancy[]
): void {
  for (const transaction of transactions) {
    transaction.entries.forEach((entry, entryIndex) => {
      if (!("astrologerUserId" in entry.account)) return;
      if (entry.account.astrologerUserId !== astrologerUserId) {
        discrepancies.push(
          Object.freeze({
            kind: "journal_foreign_astrologer_account",
            transactionId: transaction.id,
            entryIndex,
            astrologerUserId: entry.account.astrologerUserId
          })
        );
        return;
      }
      if (entry.account.code !== "astrologer_recovery_receivable") return;
      const reason = recoveryAuthorityMismatchReason(transaction.sourceKey, entry);
      if (reason !== null) {
        discrepancies.push(
          Object.freeze({
            kind: "journal_recovery_authority_mismatch",
            transactionId: transaction.id,
            entryIndex,
            reason
          })
        );
      }
    });
  }
}

function recoveryAuthorityMismatchReason(
  sourceKey: FinanceSourceKey,
  entry: FinanceJournalEntry
):
  | Extract<
      WalletProjectionDiscrepancy,
      { readonly kind: "journal_recovery_authority_mismatch" }
    >["reason"]
  | null {
  if (sourceKey.kind === "correction" && sourceKey.operation === "reversal") return null;
  const recoveryCollection =
    sourceKey.kind === "chargeback" && sourceKey.operation === "recovery_collected";
  const recoveryWin = sourceKey.kind === "chargeback" && sourceKey.operation === "won";
  const recoveryViaPayoutAllocation =
    (sourceKey.kind === "refund" &&
      (sourceKey.operation === "confirmed" || sourceKey.operation === "bridge_payout_paid")) ||
    (sourceKey.kind === "chargeback" &&
      (sourceKey.operation === "principal_allocated" || sourceKey.operation === "won"));
  if (!recoveryCollection && !recoveryViaPayoutAllocation) return "source_not_approved";
  if (entry.links.originalSaleId === null) return "original_sale_link_required";
  if (entry.links.componentId === null) return "component_link_required";
  if (recoveryCollection && entry.links.payableLotId === null) {
    return "payable_lot_link_required";
  }
  if (recoveryViaPayoutAllocation && entry.links.payoutAllocationId === null) {
    return "payout_allocation_link_required";
  }
  const expectedSide = recoveryCollection || recoveryWin ? "credit" : "debit";
  if (entry.side !== expectedSide) return "side_mismatch";
  return null;
}
