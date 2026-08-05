import {
  rehydratePayableLotOperationReceipt,
  type PayableLotReceiptDecoderEnvelope
} from "../source-lot-operation-receipt";
import { digestValue } from "../source-lot-operation-receipt-core";
import type { RefundBridgePayoutFailedAuthority } from "../source-lot-types";
import { FinancePostingIntegrityError } from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { projectUnverifiedReceiptLinkedPostingRows } from "./receipt-linked-posting-projection";
import { type RefundReceiptPostingProjection } from "./refund-posting-receipt-mapping";
import {
  buildRefundReceiptComponentBindings,
  buildRefundReceiptSnapshotRef
} from "./refund-posting-receipt-support";
import { assertRefundReceiptStructuralPreflight } from "./refund-posting-receipt-preflight";
import type {
  RefundInFlightPayoutComponent,
  RefundPostingAllocationAuthorityV1
} from "./refund-posting-types";

export function projectRefundBridgeFailedReceipt(input: {
  readonly operationReceipt: unknown;
  readonly allocation: RefundPostingAllocationAuthorityV1;
  readonly component: RefundInFlightPayoutComponent;
  readonly authority: RefundBridgePayoutFailedAuthority;
  readonly postingEnvelope: FinancePostingDecoderEnvelope;
  readonly receiptEnvelope: PayableLotReceiptDecoderEnvelope;
}): RefundReceiptPostingProjection {
  try {
    assertRefundReceiptStructuralPreflight(input.operationReceipt, input.receiptEnvelope);
    const receipt = rehydratePayableLotOperationReceipt(
      input.operationReceipt,
      input.receiptEnvelope
    );
    const ref = receipt.authorityRefs[0];
    const effect = receipt.effects[0];
    const lineage = effect
      ? receipt.lineage.find(
          (entry) =>
            entry.relation === "consumed" &&
            entry.lotId === effect.knownLinks.payableLotId &&
            entry.economicEffectId === effect.effectId
        )
      : undefined;
    if (
      receipt.operationKind !== "refund_bridge_payout_failed" ||
      receipt.sourceKey.kind !== "refund" ||
      receipt.sourceKey.operation !== "bridge_payout_failed" ||
      receipt.sourceKey.sourceId !== input.authority.bridgeAllocationId ||
      receipt.astrologerUserId !== input.allocation.astrologerUserId ||
      receipt.occurredAt !== input.authority.payoutOutcomeAuthority.decidedAt ||
      receipt.authorityRefs.length !== 1 ||
      !ref ||
      ref.kind !== "refund_bridge_payout_failed" ||
      ref.authorityId !== input.authority.authorityId ||
      ref.authorityVersion !== String(input.authority.version) ||
      ref.evidenceId !== input.authority.payoutOutcomeAuthority.evidenceId ||
      ref.canonicalDigest !== digestValue(input.authority) ||
      receipt.effects.length !== 1 ||
      !effect ||
      !lineage ||
      effect.side !== "debit" ||
      effect.bucket !== "payout_pending" ||
      effect.knownLinks.originalSaleId !== input.allocation.orderId ||
      effect.knownLinks.rootLotId !== input.component.rootLotId ||
      effect.knownLinks.payableLotId !== input.component.payableLotId ||
      effect.knownLinks.payoutAllocationId !== input.component.payoutAllocationId ||
      effect.amount.amountMinor !== input.component.amount.amountMinor
    ) {
      throw mismatch();
    }
    const componentBindings = buildRefundReceiptComponentBindings(receipt, [
      input.component.componentId
    ]);
    const projection = projectUnverifiedReceiptLinkedPostingRows(
      { operationReceipt: receipt, componentBindings },
      input.postingEnvelope,
      input.receiptEnvelope
    );
    return Object.freeze({
      receipt: projection.receipt,
      sourceEvidenceRef: projection.sourceEvidenceRef,
      operationSnapshotRef: buildRefundReceiptSnapshotRef(projection.receipt),
      rows: projection.rows,
      componentBindings
    });
  } catch {
    throw mismatch();
  }
}

function mismatch(): FinancePostingIntegrityError {
  return new FinancePostingIntegrityError("proof_operation_receipt_mismatch");
}
