import { canonicalBoundedTransition } from "./source-lot-operation-receipt-evidence";
import { createReceiptFromEvidence } from "./source-lot-operation-receipt-projection";
import type { PayableLotOperationReceipt } from "./source-lot-operation-receipt-types";

export type {
  PayableLotOperationAuthorityRef,
  PayableLotOperationComponentSlot,
  PayableLotOperationEffect,
  PayableLotOperationLineageEntry,
  PayableLotOperationReceipt,
  PayableLotReceiptDecoderEnvelope,
  PayableLotReceiptEffectBucket
} from "./source-lot-operation-receipt-types";
export {
  normalizePayableLotReceiptDecoderEnvelope,
  rehydratePayableLotOperationReceipt
} from "./source-lot-operation-receipt-rehydrate";
export { rebuildPayableLotOperationReceipt } from "./source-lot-operation-receipt-reference";

/**
 * O(k) receipt projection for a transition just emitted by the canonical
 * source-lot operation, where k is the number of touched lots. It accepts no
 * caller-authored journal edges, component ids, authority refs, or receipt id.
 * Persisted/untrusted evidence must use rebuildPayableLotOperationReceipt.
 */
export function createPayableLotOperationReceipt(transition: unknown): PayableLotOperationReceipt {
  return createReceiptFromEvidence(canonicalBoundedTransition(transition));
}
