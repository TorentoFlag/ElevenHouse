import type { FinanceJournalTransaction } from "./journal";
import type { PayableLotOperationReceipt } from "./source-lot-operation-receipt";
import { invalidWalletProjection } from "./wallet-reference-errors";
import {
  actualSourceLotJournalEdges,
  expectedSourceLotJournalEdges,
  freezeSourceLotJournalEdgeDiscrepancy,
  indexExpectedSourceLotEdges,
  sourceLotJournalEdgeMismatchCount,
  sourceLotJournalEdgeMismatchReason,
  sourceLotJournalEdgeSemanticIdentity
} from "./wallet-reference-journal-edge-model";
import type { WalletProjectionDiscrepancy } from "./wallet-reference-types";

export function addSourceLotJournalEdgeDiscrepancies(
  transactions: readonly FinanceJournalTransaction[],
  receipts: readonly PayableLotOperationReceipt[],
  astrologerUserId: string,
  discrepancies: WalletProjectionDiscrepancy[]
): void {
  const expected = expectedSourceLotJournalEdges(receipts);
  const expectedByPayableLotId = indexExpectedSourceLotEdges(expected, (edge) => edge.payableLotId);
  const expectedBySemanticIdentity = indexExpectedSourceLotEdges(
    expected,
    sourceLotJournalEdgeSemanticIdentity
  );
  const recoverySourceKeys = new Set(
    expected
      .filter((edge) => edge.account === "astrologer_recovery_receivable")
      .map((edge) => edge.sourceKey)
  );
  const matchedExpectedIndexes = new Set<number>();

  for (const actual of actualSourceLotJournalEdges(
    transactions,
    astrologerUserId,
    recoverySourceKeys
  )) {
    const payableLotId = actual.entry.links.payableLotId;
    if (payableLotId === null) {
      discrepancies.push(
        freezeSourceLotJournalEdgeDiscrepancy(
          "payable_lot_link_required",
          actual.transactionId,
          actual.entryIndex,
          null
        )
      );
      continue;
    }

    const payableLotCandidates = expectedByPayableLotId.get(payableLotId);
    if (!payableLotCandidates) {
      discrepancies.push(
        freezeSourceLotJournalEdgeDiscrepancy(
          "extra_journal_entry",
          actual.transactionId,
          actual.entryIndex,
          payableLotId
        )
      );
      continue;
    }

    const candidateIndexes = [
      ...new Set([
        ...payableLotCandidates,
        ...(expectedBySemanticIdentity.get(sourceLotJournalEdgeSemanticIdentity(actual)) ?? [])
      ])
    ]
      .map((index) => {
        const edge = expected[index];
        if (!edge) invalidWalletProjection();
        return { edge, index };
      })
      .sort((left, right) => {
        const byMismatchCount =
          sourceLotJournalEdgeMismatchCount(actual, left.edge) -
          sourceLotJournalEdgeMismatchCount(actual, right.edge);
        return byMismatchCount || left.index - right.index;
      });
    const candidate = candidateIndexes[0];
    if (!candidate) invalidWalletProjection();
    if (matchedExpectedIndexes.has(candidate.index)) {
      discrepancies.push(
        freezeSourceLotJournalEdgeDiscrepancy(
          "duplicate_journal_entry",
          actual.transactionId,
          actual.entryIndex,
          payableLotId
        )
      );
      continue;
    }

    matchedExpectedIndexes.add(candidate.index);
    const reason = sourceLotJournalEdgeMismatchReason(actual, candidate.edge);
    if (reason !== null) {
      discrepancies.push(
        freezeSourceLotJournalEdgeDiscrepancy(
          reason,
          actual.transactionId,
          actual.entryIndex,
          payableLotId
        )
      );
    }
  }

  expected.forEach((edge, index) => {
    if (matchedExpectedIndexes.has(index)) return;
    discrepancies.push(
      freezeSourceLotJournalEdgeDiscrepancy("missing_journal_entry", null, null, edge.payableLotId)
    );
  });
}
