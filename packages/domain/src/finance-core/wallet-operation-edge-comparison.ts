import type { FinanceJournalEntryLinks, FinanceJournalTransaction } from "./journal";
import {
  createFinanceLedgerAccountRef,
  serializeFinanceLedgerAccountRef,
  type FinanceLedgerAccountRef,
  type FinanceLedgerSide
} from "./ledger-chart";
import type { WalletOperationProjectionDiscrepancy } from "./wallet-operation-comparison-types";
import { walletOperationFail } from "./wallet-operation-codec-boundary";
import { addWalletOperationDiscrepancy } from "./wallet-operation-discrepancy";
import type {
  UnverifiedWalletOperationComparisonSnapshot,
  WalletLotEconomicEdge
} from "./wallet-operation-snapshot-types";
import {
  findWalletBalanceDefinitionByAccountCode,
  findWalletBalanceDefinitionByBucket
} from "./wallet-operation-wallet-model";

export function addEconomicEdgeDiscrepancies(
  operation: UnverifiedWalletOperationComparisonSnapshot,
  journal: FinanceJournalTransaction,
  discrepancies: WalletOperationProjectionDiscrepancy[]
): void {
  const snapshotEdgesByKey = new Map<string, WalletLotEconomicEdge[]>();
  const firstSnapshotEdgeById = new Map<string, WalletLotEconomicEdge>();
  for (const edge of operation.economicEdges) {
    if (firstSnapshotEdgeById.has(edge.edgeId)) {
      addWalletOperationDiscrepancy(discrepancies, {
        kind: "duplicate_snapshot_edge_id",
        edgeId: edge.edgeId
      });
    } else {
      firstSnapshotEdgeById.set(edge.edgeId, edge);
    }
    const key = snapshotEconomicEdgeKey(operation, edge);
    const edges = snapshotEdgesByKey.get(key);
    if (edges) {
      addWalletOperationDiscrepancy(discrepancies, {
        kind: "duplicate_snapshot_economic_edge",
        edgeKey: key,
        firstEdgeId: edges[0]!.edgeId,
        duplicateEdgeId: edge.edgeId
      });
      edges.push(edge);
    } else {
      snapshotEdgesByKey.set(key, [edge]);
    }
  }

  const journalEntriesByKey = new Map<string, number[]>();
  journal.entries.forEach((entry, entryIndex) => {
    const definition = findWalletBalanceDefinitionByAccountCode(entry.account.code);
    if (!definition) return;
    const actualAstrologerUserId = astrologerUserIdFromAccount(entry.account);
    if (actualAstrologerUserId !== operation.astrologerUserId) {
      addWalletOperationDiscrepancy(discrepancies, {
        kind: "journal_wallet_scope_mismatch",
        transactionId: journal.id,
        entryIndex,
        expectedAstrologerUserId: operation.astrologerUserId,
        actualAstrologerUserId
      });
    }
    const key = journalEconomicEdgeKey(
      entry.account,
      entry.side,
      entry.amount.amountMinor,
      entry.links
    );
    const entryIndexes = journalEntriesByKey.get(key);
    if (entryIndexes) {
      addWalletOperationDiscrepancy(discrepancies, {
        kind: "duplicate_journal_wallet_edge",
        edgeKey: key,
        firstEntryIndex: entryIndexes[0]!,
        duplicateEntryIndex: entryIndex
      });
      entryIndexes.push(entryIndex);
    } else {
      journalEntriesByKey.set(key, [entryIndex]);
    }
  });

  for (const [edgeKey, edges] of snapshotEdgesByKey) {
    const journalIndexes = journalEntriesByKey.get(edgeKey) ?? [];
    for (let index = journalIndexes.length; index < edges.length; index += 1) {
      addWalletOperationDiscrepancy(discrepancies, {
        kind: "missing_journal_wallet_edge",
        edgeId: edges[index]!.edgeId,
        edgeKey
      });
    }
  }
  for (const [edgeKey, entryIndexes] of journalEntriesByKey) {
    const snapshotEdges = snapshotEdgesByKey.get(edgeKey) ?? [];
    for (let index = snapshotEdges.length; index < entryIndexes.length; index += 1) {
      addWalletOperationDiscrepancy(discrepancies, {
        kind: "extra_journal_wallet_edge",
        transactionId: journal.id,
        entryIndex: entryIndexes[index]!,
        edgeKey
      });
    }
  }
}

function snapshotEconomicEdgeKey(
  operation: UnverifiedWalletOperationComparisonSnapshot,
  edge: WalletLotEconomicEdge
): string {
  const definition = findWalletBalanceDefinitionByBucket(edge.bucket);
  if (!definition) walletOperationFail("invalid_field");
  const account = createFinanceLedgerAccountRef({
    code: definition.accountCode,
    astrologerUserId: operation.astrologerUserId,
    currency: "RUB"
  });
  return journalEconomicEdgeKey(account, edge.side, edge.amount.amountMinor, edge.links);
}

function journalEconomicEdgeKey(
  account: FinanceLedgerAccountRef,
  side: FinanceLedgerSide,
  amountMinor: string | number,
  links: FinanceJournalEntryLinks
): string {
  return JSON.stringify([
    serializeFinanceLedgerAccountRef(account),
    side,
    amountMinor.toString(),
    links.originalSaleId,
    links.componentId,
    links.payableLotId,
    links.payoutAllocationId
  ]);
}

function astrologerUserIdFromAccount(account: FinanceLedgerAccountRef): string {
  if (!("astrologerUserId" in account)) walletOperationFail("invalid_field");
  return account.astrologerUserId;
}
