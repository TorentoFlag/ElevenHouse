import type {
  FinanceDigest,
  VerifiedWalletLotStateSnapshot,
  WalletLotStateSnapshotReader
} from "@elevenhouse/domain/finance-core";
import { hasAsciiControlCharacter } from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financePayableLotOperationReceipts,
  financeWalletCommitBindings,
  financeWalletHeads,
  financeWalletHistory,
  financeWalletLotStateSnapshots
} from "../../schema/finance/wallet.schema";

export class WalletLotStateSnapshotReaderPersistenceError extends Error {
  readonly code = "wallet_lot_state_snapshot_reader_persistence_error" as const;

  constructor(
    readonly reason: "invalid_query" | "snapshot_graph_integrity_conflict" | "persistence_failure"
  ) {
    super("Wallet lot-state snapshot could not be read safely");
    this.name = "WalletLotStateSnapshotReaderPersistenceError";
  }
}

/**
 * Reads one current checkpoint in a single relational graph. A compact checkpoint is audit and
 * reconciliation evidence only: it deliberately does not hydrate or authorize a source-lot write.
 */
export function createDrizzleWalletLotStateSnapshotReader(
  database: ElevenHouseDatabase
): WalletLotStateSnapshotReader {
  return Object.freeze({
    async findCurrentForWallet(input) {
      const astrologerUserId = uuid(input.astrologerUserId, "invalid_query");
      if (input.currency !== "RUB") fail("invalid_query");
      try {
        const [row] = await database
          .select({
            head: financeWalletHeads,
            snapshot: financeWalletLotStateSnapshots,
            history: financeWalletHistory,
            receipt: financePayableLotOperationReceipts,
            binding: financeWalletCommitBindings
          })
          .from(financeWalletHeads)
          .leftJoin(
            financeWalletLotStateSnapshots,
            and(
              eq(financeWalletLotStateSnapshots.walletId, financeWalletHeads.id),
              eq(financeWalletLotStateSnapshots.walletRevision, financeWalletHeads.revision),
              eq(
                financeWalletLotStateSnapshots.lotStateVersion,
                financeWalletHeads.lotStateVersion
              ),
              eq(financeWalletLotStateSnapshots.lotStateDigest, financeWalletHeads.lotStateDigest),
              eq(
                financeWalletLotStateSnapshots.commitBindingId,
                financeWalletHeads.lastCommitBindingId
              )
            )
          )
          .leftJoin(
            financeWalletHistory,
            eq(financeWalletHistory.id, financeWalletLotStateSnapshots.walletHistoryId)
          )
          .leftJoin(
            financePayableLotOperationReceipts,
            eq(
              financePayableLotOperationReceipts.receiptId,
              financeWalletLotStateSnapshots.operationReceiptId
            )
          )
          .leftJoin(
            financeWalletCommitBindings,
            eq(
              financeWalletCommitBindings.bindingId,
              financeWalletLotStateSnapshots.commitBindingId
            )
          )
          .where(
            and(
              eq(financeWalletHeads.astrologerUserId, astrologerUserId),
              eq(financeWalletHeads.currency, "RUB")
            )
          )
          .limit(2);
        if (!row) return null;
        const { snapshot, history, receipt, binding } = row;
        if (!snapshot || !history || !receipt || !binding) {
          fail("snapshot_graph_integrity_conflict");
        }
        return mapVerifiedWalletLotStateSnapshot({
          head: row.head,
          snapshot,
          history,
          receipt,
          binding
        });
      } catch (error) {
        if (error instanceof WalletLotStateSnapshotReaderPersistenceError) throw error;
        throw new WalletLotStateSnapshotReaderPersistenceError("persistence_failure");
      }
    }
  } satisfies WalletLotStateSnapshotReader);
}

type SnapshotGraph = Readonly<{
  head: Readonly<{
    id: string;
    astrologerUserId: string;
    currency: string;
    revision: string;
    lotStateVersion: string;
    lotStateDigest: string;
    lastCommitBindingId: string;
  }>;
  snapshot: Readonly<{
    walletId: string;
    astrologerUserId: string;
    currency: string;
    walletRevision: string;
    lotStateVersion: string;
    lotStateDigest: string;
    walletHistoryId: string;
    operationReceiptId: string;
    commitBindingId: string;
    commitReceiptId: string;
  }>;
  history: Readonly<{
    id: string;
    walletId: string;
    astrologerUserId: string;
    currency: string;
    nextRevision: string;
    nextLotStateVersion: string;
    nextLotStateDigest: string;
    operationReceiptId: string;
  }>;
  receipt: Readonly<{
    walletId: string;
    astrologerUserId: string;
    currency: string;
    nextLotStateVersion: string;
    nextLotStateDigest: string;
  }>;
  binding: Readonly<{
    bindingId: string;
    commitReceiptId: string;
    walletHistoryId: string;
    operationReceiptId: string;
    nextWalletId: string;
    astrologerUserId: string;
    currency: string;
    nextWalletRevision: string;
    nextLotStateDigest: string;
  }>;
}>;

export function mapVerifiedWalletLotStateSnapshot(
  input: SnapshotGraph
): VerifiedWalletLotStateSnapshot {
  try {
    const { head, snapshot, history, receipt, binding } = input;
    const digest = financeDigest(snapshot.lotStateDigest);
    if (
      head.id !== snapshot.walletId ||
      head.astrologerUserId !== snapshot.astrologerUserId ||
      head.currency !== "RUB" ||
      snapshot.currency !== "RUB" ||
      head.revision !== snapshot.walletRevision ||
      head.lotStateVersion !== snapshot.lotStateVersion ||
      head.lotStateDigest !== digest ||
      head.lastCommitBindingId !== snapshot.commitBindingId ||
      history.id !== snapshot.walletHistoryId ||
      history.walletId !== snapshot.walletId ||
      history.astrologerUserId !== snapshot.astrologerUserId ||
      history.currency !== snapshot.currency ||
      history.nextRevision !== snapshot.walletRevision ||
      history.nextLotStateVersion !== snapshot.lotStateVersion ||
      history.nextLotStateDigest !== digest ||
      history.operationReceiptId !== snapshot.operationReceiptId ||
      receipt.walletId !== snapshot.walletId ||
      receipt.astrologerUserId !== snapshot.astrologerUserId ||
      receipt.currency !== snapshot.currency ||
      receipt.nextLotStateVersion !== snapshot.lotStateVersion ||
      receipt.nextLotStateDigest !== digest ||
      binding.bindingId !== snapshot.commitBindingId ||
      binding.commitReceiptId !== snapshot.commitReceiptId ||
      binding.walletHistoryId !== snapshot.walletHistoryId ||
      binding.operationReceiptId !== snapshot.operationReceiptId ||
      binding.nextWalletId !== snapshot.walletId ||
      binding.astrologerUserId !== snapshot.astrologerUserId ||
      binding.currency !== snapshot.currency ||
      binding.nextWalletRevision !== snapshot.walletRevision ||
      binding.nextLotStateDigest !== digest
    ) {
      fail("snapshot_graph_integrity_conflict");
    }
    return Object.freeze({
      walletId: uuid(snapshot.walletId, "snapshot_graph_integrity_conflict"),
      astrologerUserId: uuid(snapshot.astrologerUserId, "snapshot_graph_integrity_conflict"),
      currency: "RUB",
      walletRevision: revision(snapshot.walletRevision),
      lotStateVersion: revision(snapshot.lotStateVersion),
      lotStateDigest: digest,
      operationReceiptId: identifier(snapshot.operationReceiptId),
      commitBindingId: identifier(snapshot.commitBindingId),
      commitReceiptId: uuid(snapshot.commitReceiptId, "snapshot_graph_integrity_conflict")
    });
  } catch (error) {
    if (error instanceof WalletLotStateSnapshotReaderPersistenceError) throw error;
    fail("snapshot_graph_integrity_conflict");
  }
}

function uuid(
  value: unknown,
  reason: WalletLotStateSnapshotReaderPersistenceError["reason"]
): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function revision(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    fail("snapshot_graph_integrity_conflict");
  }
  return value;
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value.trim() !== value ||
    hasAsciiControlCharacter(value)
  ) {
    fail("snapshot_graph_integrity_conflict");
  }
  return value;
}

function financeDigest(value: unknown): FinanceDigest {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail("snapshot_graph_integrity_conflict");
  }
  return value as FinanceDigest;
}

function fail(reason: WalletLotStateSnapshotReaderPersistenceError["reason"]): never {
  throw new WalletLotStateSnapshotReaderPersistenceError(reason);
}
