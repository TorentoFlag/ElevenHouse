import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  createPayableLotOperationReceipt,
  type PayableLotOperationReceipt
} from "../source-lot-operation-receipt";
import { buildReceiptTransitionCases } from "../source-lot-operation-receipt-test-fixtures";
import { receiptDecoderEnvelope } from "./payable-lot-posting-link-test-fixtures";
import { postingDecoderEnvelope } from "./posting-test-primitives";

export { postingDecoderEnvelope, receiptDecoderEnvelope };

export function holdPayoutReceipt(kind: string): PayableLotOperationReceipt {
  const receiptCase = holdPayoutTransitionCase(kind);
  return createPayableLotOperationReceipt(receiptCase.transition);
}

export function holdPayoutTransitionCase(kind: string) {
  const receiptCase = buildReceiptTransitionCases().find((candidate) => candidate.kind === kind);
  if (!receiptCase) throw new Error(`missing ${kind} receipt fixture`);
  return receiptCase;
}

export function componentBindingsFor(receipt: PayableLotOperationReceipt) {
  return receipt.requiredExternalLinkSlots.map((slot, index) => {
    const core = {
      kind: "finance_component_slot_resolution_binding" as const,
      bindingId: `binding-${slot.slotId}`,
      version: "1",
      authorizationStatus: "unverified" as const,
      digestPurpose: "drift_detection_only" as const,
      operationReceiptId: receipt.receiptId,
      operationReceiptDigest: receipt.canonicalDigest,
      slotId: slot.slotId,
      effectId: slot.effectId,
      componentId: `component-${index + 1}`,
      requiredAuthorityDigest: hashFinanceCommandPayload(slot.requiredAuthority)
    };
    return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
  });
}

export function receiptAuthorityBindingFor(receipt: PayableLotOperationReceipt) {
  const core = {
    kind: "unverified_payable_lot_posting_authority_binding" as const,
    schemaVersion: 1 as const,
    bindingId: `receipt-authority-binding-${receipt.operationId}`,
    version: 1,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    operationReceiptId: receipt.receiptId,
    operationReceiptDigest: receipt.canonicalDigest,
    operationKind: receipt.operationKind,
    sourceKey: receipt.sourceKey,
    authorityRefsDigest: hashFinanceCommandPayload(receipt.authorityRefs),
    issuedAt: receipt.occurredAt
  };
  return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
}

export function receiptPostingInput(receipt: PayableLotOperationReceipt) {
  return Object.freeze({
    context: Object.freeze({
      journalTransactionId: `journal-${receipt.operationId}`,
      linkProofId: `proof-${receipt.operationId}`,
      operationId: receipt.operationId,
      sourceKey: receipt.sourceKey,
      occurredAt: receipt.occurredAt,
      postedAt: receipt.occurredAt
    }),
    receiptBinding: receiptAuthorityBindingFor(receipt),
    operationReceipt: receipt,
    componentBindings: componentBindingsFor(receipt),
    operationSnapshotRef: Object.freeze({
      snapshotId: `snapshot-${receipt.operationId}`,
      operationId: receipt.operationId,
      sourceKey: receipt.sourceKey,
      previousWalletRevision: "40",
      nextWalletRevision: "41",
      previousLotStateDigest: receipt.previousLotState.digest,
      nextLotStateDigest: receipt.nextLotState.digest,
      historyRecordDigest: receipt.historyRecord.canonicalDigest,
      snapshotDigest: `sha256:${"9".repeat(64)}`
    })
  });
}

export function rehash<T extends Readonly<Record<string, unknown>>>(
  value: T,
  digestKey: string
): T {
  const core = Object.fromEntries(Object.entries(value).filter(([key]) => key !== digestKey));
  return Object.freeze({ ...value, [digestKey]: hashFinanceCommandPayload(core) });
}
