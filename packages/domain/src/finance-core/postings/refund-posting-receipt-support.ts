import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { FinanceSourceKey } from "../finance-source-key";
import type { PayableLotOperationReceipt } from "../source-lot-operation-receipt";
import { FinancePostingIntegrityError, readFinancePostingDigest } from "./posting-codec";
import type {
  FinancePostingOperationSnapshotRef,
  UnverifiedFinanceComponentSlotResolutionBinding
} from "./posting-types";

export function buildRefundReceiptComponentBindings(
  receipt: PayableLotOperationReceipt,
  componentIds: readonly string[]
): readonly UnverifiedFinanceComponentSlotResolutionBinding[] {
  return Object.freeze(
    receipt.requiredExternalLinkSlots.map((slot, index) => {
      const componentId = componentIds[index];
      if (!componentId) throw mismatch();
      const core = Object.freeze({
        kind: "finance_component_slot_resolution_binding" as const,
        bindingId: `refund-binding-${hashFinanceCommandPayload({
          receiptId: receipt.receiptId,
          slotId: slot.slotId
        }).slice(7)}`,
        version: "1",
        authorizationStatus: "unverified" as const,
        digestPurpose: "drift_detection_only" as const,
        operationReceiptId: receipt.receiptId,
        operationReceiptDigest: readFinancePostingDigest(receipt.canonicalDigest),
        slotId: slot.slotId,
        effectId: slot.effectId,
        componentId,
        requiredAuthorityDigest: hashFinanceCommandPayload(slot.requiredAuthority)
      });
      return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
    })
  );
}

export function buildRefundReceiptSnapshotRef(
  receipt: PayableLotOperationReceipt
): FinancePostingOperationSnapshotRef {
  const core = Object.freeze({
    snapshotId: `refund-snapshot-${receipt.canonicalDigest.slice(7)}`,
    operationId: receipt.operationId,
    sourceKey: receipt.sourceKey as FinanceSourceKey,
    previousWalletRevision: receipt.previousLotState.version,
    nextWalletRevision: receipt.nextLotState.version,
    previousLotStateDigest: readFinancePostingDigest(receipt.previousLotState.digest),
    nextLotStateDigest: readFinancePostingDigest(receipt.nextLotState.digest),
    historyRecordDigest: readFinancePostingDigest(receipt.historyRecord.canonicalDigest)
  });
  return Object.freeze({ ...core, snapshotDigest: hashFinanceCommandPayload(core) });
}

function mismatch(): FinancePostingIntegrityError {
  return new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
}
