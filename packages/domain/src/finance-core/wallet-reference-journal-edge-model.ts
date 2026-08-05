import { serializeFinanceSourceKey } from "./finance-source-key";
import type { FinanceJournalEntry, FinanceJournalTransaction } from "./journal";
import type { FinanceLedgerAccountCode, FinanceLedgerSide } from "./ledger-chart";
import type { PayableLotBucket } from "./source-lots";
import type {
  PayableLotOperationReceipt,
  PayableLotReceiptEffectBucket
} from "./source-lot-operation-receipt";
import { invalidWalletProjection } from "./wallet-reference-errors";
import type { WalletProjectionDiscrepancy } from "./wallet-reference-types";

export type ExpectedSourceLotJournalEdge = Readonly<{
  sourceKey: string;
  account: FinanceLedgerAccountCode;
  side: FinanceLedgerSide;
  amountMinor: number;
  originalSaleId: string;
  payableLotId: string;
  payoutAllocationId: string | null;
}>;

export type ActualSourceLotJournalEdge = Readonly<{
  transactionId: string;
  entryIndex: number;
  sourceKey: string;
  entry: FinanceJournalEntry;
}>;

const payableAccountByBucket = Object.freeze({
  pending: "astrologer_pending",
  available: "astrologer_available",
  reserved: "astrologer_reserved",
  payout_pending: "astrologer_payout_pending",
  refund_pending: "astrologer_refund_pending"
} satisfies Readonly<Record<PayableLotBucket, FinanceLedgerAccountCode>>);
const receiptAccountByBucket = Object.freeze({
  ...payableAccountByBucket,
  recovery_receivable: "astrologer_recovery_receivable"
} satisfies Readonly<Record<PayableLotReceiptEffectBucket, FinanceLedgerAccountCode>>);
const payableAccountCodes = new Set<FinanceLedgerAccountCode>(
  Object.values(payableAccountByBucket)
);

export function indexExpectedSourceLotEdges(
  expected: readonly ExpectedSourceLotJournalEdge[],
  key: (edge: ExpectedSourceLotJournalEdge) => string
): ReadonlyMap<string, readonly number[]> {
  const mutable = new Map<string, number[]>();
  expected.forEach((edge, index) => {
    const edgeKey = key(edge);
    const indexes = mutable.get(edgeKey);
    if (indexes) indexes.push(index);
    else mutable.set(edgeKey, [index]);
  });
  return new Map(
    [...mutable].map(([edgeKey, indexes]) => [edgeKey, Object.freeze(indexes)] as const)
  );
}

export function sourceLotJournalEdgeSemanticIdentity(
  edge: ExpectedSourceLotJournalEdge | ActualSourceLotJournalEdge
): string {
  if ("entry" in edge) {
    return semanticIdentity([
      edge.sourceKey,
      edge.entry.account.code,
      edge.entry.side,
      edge.entry.amount.amountMinor,
      edge.entry.links.originalSaleId,
      edge.entry.links.payoutAllocationId
    ]);
  }
  return semanticIdentity([
    edge.sourceKey,
    edge.account,
    edge.side,
    edge.amountMinor,
    edge.originalSaleId,
    edge.payoutAllocationId
  ]);
}

export function expectedSourceLotJournalEdges(
  receipts: readonly PayableLotOperationReceipt[]
): readonly ExpectedSourceLotJournalEdge[] {
  return Object.freeze(
    receipts.flatMap((receipt) =>
      receipt.effects.map((effect) =>
        Object.freeze({
          sourceKey: serializeFinanceSourceKey(receipt.sourceKey),
          account: receiptAccountByBucket[effect.bucket],
          side: effect.side,
          amountMinor: effect.amount.amountMinor,
          originalSaleId: effect.knownLinks.originalSaleId,
          payableLotId: effect.knownLinks.payableLotId,
          payoutAllocationId: effect.knownLinks.payoutAllocationId
        })
      )
    )
  );
}

export function actualSourceLotJournalEdges(
  transactions: readonly FinanceJournalTransaction[],
  astrologerUserId: string,
  recoverySourceKeys: ReadonlySet<string>
): readonly ActualSourceLotJournalEdge[] {
  return Object.freeze(
    transactions.flatMap((transaction) => {
      if (transaction.reversesTransactionId !== null) return [];
      const sourceKey = serializeFinanceSourceKey(transaction.sourceKey);
      return transaction.entries.flatMap((entry, entryIndex) => {
        if (
          !("astrologerUserId" in entry.account) ||
          entry.account.astrologerUserId !== astrologerUserId ||
          (!payableAccountCodes.has(entry.account.code) &&
            !(
              entry.account.code === "astrologer_recovery_receivable" &&
              recoverySourceKeys.has(sourceKey)
            ))
        ) {
          return [];
        }
        return [Object.freeze({ transactionId: transaction.id, entryIndex, sourceKey, entry })];
      });
    })
  );
}

export function sourceLotJournalEdgeMismatchCount(
  actual: ActualSourceLotJournalEdge,
  expected: ExpectedSourceLotJournalEdge
): number {
  return [
    actual.sourceKey !== expected.sourceKey,
    actual.entry.account.code !== expected.account,
    actual.entry.side !== expected.side,
    actual.entry.amount.amountMinor !== expected.amountMinor,
    actual.entry.links.originalSaleId !== expected.originalSaleId,
    actual.entry.links.payableLotId !== expected.payableLotId,
    actual.entry.links.payoutAllocationId !== expected.payoutAllocationId
  ].filter(Boolean).length;
}

export function sourceLotJournalEdgeMismatchReason(
  actual: ActualSourceLotJournalEdge,
  expected: ExpectedSourceLotJournalEdge
):
  | Extract<
      WalletProjectionDiscrepancy,
      { readonly kind: "source_lot_journal_edge_mismatch" }
    >["reason"]
  | null {
  if (actual.sourceKey !== expected.sourceKey) return "source_key_mismatch";
  if (actual.entry.account.code !== expected.account) return "account_bucket_mismatch";
  if (actual.entry.side !== expected.side) return "side_mismatch";
  if (actual.entry.amount.amountMinor !== expected.amountMinor) return "amount_mismatch";
  if (actual.entry.links.originalSaleId !== expected.originalSaleId) {
    return "original_sale_link_mismatch";
  }
  if (actual.entry.links.payableLotId !== expected.payableLotId) {
    return "payable_lot_link_mismatch";
  }
  if (actual.entry.links.payoutAllocationId !== expected.payoutAllocationId) {
    return "payout_allocation_link_mismatch";
  }
  return null;
}

export function freezeSourceLotJournalEdgeDiscrepancy(
  reason: Extract<
    WalletProjectionDiscrepancy,
    { readonly kind: "source_lot_journal_edge_mismatch" }
  >["reason"],
  transactionId: string | null,
  entryIndex: number | null,
  payableLotId: string | null
): Extract<WalletProjectionDiscrepancy, { readonly kind: "source_lot_journal_edge_mismatch" }> {
  return Object.freeze({
    kind: "source_lot_journal_edge_mismatch",
    reason,
    transactionId,
    entryIndex,
    payableLotId
  });
}

function semanticIdentity(parts: readonly (string | number | null)[]): string {
  const serialized = JSON.stringify(parts);
  return typeof serialized === "string" ? serialized : invalidWalletProjection();
}
