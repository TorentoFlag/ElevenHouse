import { describe, expect, it } from "vitest";
import {
  readFinanceJournalPostingContext,
  readFinancePostingOperationSnapshotRef
} from "./posting-event-identity";
import { postingDecoderEnvelope } from "./posting-test-primitives";

describe("finance posting event identity", () => {
  it("normalizes event time and binds a single wallet revision advance", () => {
    const context = readFinanceJournalPostingContext(
      {
        journalTransactionId: "journal-event-1",
        linkProofId: "proof-event-1",
        operationId: "operation-event-1",
        sourceKey: {
          kind: "bank",
          sourceId: "statement-event-1",
          operation: "unknown_credit_recorded"
        },
        occurredAt: "2026-08-03T10:00:00.000Z",
        postedAt: "2026-08-03T10:01:00.000Z"
      },
      postingDecoderEnvelope
    );
    const snapshot = readFinancePostingOperationSnapshotRef(
      {
        snapshotId: "snapshot-event-1",
        operationId: context.operationId,
        sourceKey: context.sourceKey,
        previousWalletRevision: "9007199254740993",
        nextWalletRevision: "9007199254740994",
        previousLotStateDigest: `sha256:${"3".repeat(64)}`,
        nextLotStateDigest: `sha256:${"4".repeat(64)}`,
        historyRecordDigest: `sha256:${"1".repeat(64)}`,
        snapshotDigest: `sha256:${"2".repeat(64)}`
      },
      context.operationId,
      context.sourceKey,
      postingDecoderEnvelope
    );

    expect(context.occurredAt).toBe("2026-08-03T10:00:00Z");
    expect(snapshot?.nextWalletRevision).toBe("9007199254740994");
  });
});
