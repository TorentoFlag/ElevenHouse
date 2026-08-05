import type { FinanceJournalLinkProof } from "./postings/posting-types";
import type { PayableLotOperationReceipt } from "./source-lot-operation-receipt-types";
import type {
  FinanceJournalLinkProofRef,
  PayableLotOperationReceiptRef
} from "./wallet-operation-commit-binding-types";

export function toFinanceJournalLinkProofRef(
  proof: FinanceJournalLinkProof
): FinanceJournalLinkProofRef {
  return Object.freeze({
    kind: proof.kind,
    proofId: proof.proofId,
    version: proof.version,
    proofDigest: proof.proofDigest
  });
}

export function toPayableLotOperationReceiptRef(
  receipt: PayableLotOperationReceipt
): PayableLotOperationReceiptRef {
  return Object.freeze({
    kind: receipt.kind,
    receiptId: receipt.receiptId,
    schemaVersion: receipt.schemaVersion,
    canonicalDigest: receipt.canonicalDigest
  });
}
