import { describe, expect, it } from "vitest";

import {
  WalletLotStateSnapshotReaderPersistenceError,
  mapVerifiedWalletLotStateSnapshot
} from "./drizzle-wallet-lot-state-snapshot-reader";

describe("wallet lot-state snapshot reader", () => {
  it("returns an audit checkpoint only when the head, history, receipt and binding name one digest", () => {
    const snapshot = mapVerifiedWalletLotStateSnapshot(snapshotGraph());

    expect(snapshot).toEqual({
      walletId: "0df9e6b8-0a33-4ca5-8d88-fd3bb7e1baf0",
      astrologerUserId: "d1f37df8-a44e-4e11-a8d4-6eaf8b596ae9",
      currency: "RUB",
      walletRevision: "7",
      lotStateVersion: "8",
      lotStateDigest: sha("a"),
      operationReceiptId: "lot-receipt-7",
      commitBindingId: "wallet-binding-7",
      commitReceiptId: "c1f1ef9d-f0f4-448a-b33e-b61dd31d4fac"
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("fails closed when a snapshot digest no longer equals the current wallet head", () => {
    const graph = snapshotGraph();
    graph.head.lotStateDigest = sha("b");

    expect(() => mapVerifiedWalletLotStateSnapshot(graph)).toThrow(
      expect.objectContaining<Partial<WalletLotStateSnapshotReaderPersistenceError>>({
        reason: "snapshot_graph_integrity_conflict"
      })
    );
  });
});

function snapshotGraph() {
  const digest = sha("a");
  return {
    head: {
      id: "0df9e6b8-0a33-4ca5-8d88-fd3bb7e1baf0",
      astrologerUserId: "d1f37df8-a44e-4e11-a8d4-6eaf8b596ae9",
      currency: "RUB",
      revision: "7",
      lotStateVersion: "8",
      lotStateDigest: digest,
      lastCommitBindingId: "wallet-binding-7"
    },
    snapshot: {
      walletId: "0df9e6b8-0a33-4ca5-8d88-fd3bb7e1baf0",
      astrologerUserId: "d1f37df8-a44e-4e11-a8d4-6eaf8b596ae9",
      currency: "RUB",
      walletRevision: "7",
      lotStateVersion: "8",
      lotStateDigest: digest,
      walletHistoryId: "0168a91e-635c-4aa8-a478-30423710f4b0",
      operationReceiptId: "lot-receipt-7",
      commitBindingId: "wallet-binding-7",
      commitReceiptId: "c1f1ef9d-f0f4-448a-b33e-b61dd31d4fac"
    },
    history: {
      id: "0168a91e-635c-4aa8-a478-30423710f4b0",
      walletId: "0df9e6b8-0a33-4ca5-8d88-fd3bb7e1baf0",
      astrologerUserId: "d1f37df8-a44e-4e11-a8d4-6eaf8b596ae9",
      currency: "RUB",
      nextRevision: "7",
      nextLotStateVersion: "8",
      nextLotStateDigest: digest,
      operationReceiptId: "lot-receipt-7"
    },
    receipt: {
      walletId: "0df9e6b8-0a33-4ca5-8d88-fd3bb7e1baf0",
      astrologerUserId: "d1f37df8-a44e-4e11-a8d4-6eaf8b596ae9",
      currency: "RUB",
      nextLotStateVersion: "8",
      nextLotStateDigest: digest
    },
    binding: {
      bindingId: "wallet-binding-7",
      commitReceiptId: "c1f1ef9d-f0f4-448a-b33e-b61dd31d4fac",
      walletHistoryId: "0168a91e-635c-4aa8-a478-30423710f4b0",
      operationReceiptId: "lot-receipt-7",
      nextWalletId: "0df9e6b8-0a33-4ca5-8d88-fd3bb7e1baf0",
      astrologerUserId: "d1f37df8-a44e-4e11-a8d4-6eaf8b596ae9",
      currency: "RUB",
      nextWalletRevision: "7",
      nextLotStateDigest: digest
    }
  };
}

function sha(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}
