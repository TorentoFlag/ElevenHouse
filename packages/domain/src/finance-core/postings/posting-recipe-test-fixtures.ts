import { createUnverifiedFinanceJournalPostingRecipe as createRecipe } from "./posting-recipe";
import { withPostingDecoderEnvelope } from "./posting-test-primitives";

const createUnverifiedFinanceJournalPostingRecipe = withPostingDecoderEnvelope(createRecipe);

export function snapshotRef(previousWalletRevision: unknown, nextWalletRevision: unknown) {
  return {
    snapshotId: "wallet-operation-snapshot-validation",
    operationId: "snapshot-operation-validation",
    sourceKey: {
      kind: "bank",
      sourceId: "snapshot-operation-validation",
      operation: "unknown_credit_recorded"
    },
    previousWalletRevision,
    nextWalletRevision,
    previousLotStateDigest: `sha256:${"1".repeat(64)}`,
    nextLotStateDigest: `sha256:${"2".repeat(64)}`,
    historyRecordDigest: `sha256:${"3".repeat(64)}`,
    snapshotDigest: `sha256:${"4".repeat(64)}`
  };
}

export function createSnapshotPosting(
  revisionsOrRef:
    | { previousWalletRevision: unknown; nextWalletRevision: unknown }
    | ReturnType<typeof snapshotRef>
) {
  const ref =
    "snapshotId" in revisionsOrRef
      ? revisionsOrRef
      : snapshotRef(revisionsOrRef.previousWalletRevision, revisionsOrRef.nextWalletRevision);
  return createUnverifiedFinanceJournalPostingRecipe({
    context: {
      journalTransactionId: "journal-snapshot-validation",
      linkProofId: "proof-snapshot-validation",
      operationId: "snapshot-operation-validation",
      sourceKey: {
        kind: "bank",
        sourceId: "snapshot-operation-validation",
        operation: "unknown_credit_recorded"
      },
      occurredAt: "2026-08-03T10:00:00Z",
      postedAt: "2026-08-03T10:01:00Z"
    },
    authorityRef: {
      kind: "snapshot-test",
      authorityId: "snapshot-authority-validation",
      version: 1,
      canonicalDigest: `sha256:${"5".repeat(64)}`
    },
    sourceEvidenceRef: {
      kind: "snapshot-test-evidence",
      evidenceId: "snapshot-evidence-validation",
      canonicalDigest: `sha256:${"6".repeat(64)}`
    },
    operationSnapshotRef: ref as never,
    entrySourceLinks: [null, null],
    entries: [
      {
        account: { code: "bank_cash", bankCashPoolId: "bank-pool-rub-1", currency: "RUB" },
        side: "debit",
        amount: { amountMinor: 100, currency: "RUB" },
        links: {
          originalSaleId: null,
          componentId: null,
          payableLotId: null,
          payoutAllocationId: null
        }
      },
      {
        account: {
          code: "bank_unmatched_credit_suspense",
          bankCashPoolId: "bank-pool-rub-1",
          currency: "RUB"
        },
        side: "credit",
        amount: { amountMinor: 100, currency: "RUB" },
        links: {
          originalSaleId: null,
          componentId: null,
          payableLotId: null,
          payoutAllocationId: null
        }
      }
    ]
  });
}
