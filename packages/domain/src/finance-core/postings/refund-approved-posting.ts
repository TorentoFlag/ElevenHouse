import type { PayableLotReceiptDecoderEnvelope } from "../source-lot-operation-receipt";
import { digestValue } from "../source-lot-operation-receipt-core";
import { createRefundApprovalAuthority } from "../source-lots";
import { FinancePostingIntegrityError, readExactDataRecord } from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import {
  allocationAuthorityRef,
  assertRefundPostingIdentityChronology,
  createReceiptBoundRefundRecipe,
  readRefundPostingIdentity
} from "./refund-posting-builder-common";
import { projectRefundCumulativeApprovalPosition } from "./refund-cumulative-position";
import { assertRefundPostingAllocationMatchesApprovalAuthority } from "./refund-posting-allocation-codec";
import { readRefundPostingAllocationContext } from "./refund-posting-allocation-context";
import { projectStandardRefundReceipt } from "./refund-posting-receipt-mapping";
import { readRefundPostingMoney } from "./refund-posting-value-codec";

export function buildRefundApprovedPosting(
  input: unknown,
  postingEnvelope: FinancePostingDecoderEnvelope,
  receiptEnvelope: PayableLotReceiptDecoderEnvelope
) {
  const fields = readExactDataRecord(input, [
    "allocation",
    "resolvedPriorAllocation",
    "resolvedCumulativePosition",
    "fundingTransitionBinding",
    "approvalAuthority",
    "operationReceipt",
    "postingIdentity"
  ]);
  const { allocation, resolvedCumulativePosition, fundingTransitionBinding } =
    readRefundPostingAllocationContext(
      {
        allocation: fields.allocation,
        resolvedPriorAllocation: fields.resolvedPriorAllocation,
        resolvedCumulativePosition: fields.resolvedCumulativePosition,
        fundingTransitionBinding: fields.fundingTransitionBinding
      },
      postingEnvelope
    );
  if (fundingTransitionBinding.operation !== "approved") {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const cumulativePositionDecision = projectRefundCumulativeApprovalPosition(
    allocation,
    resolvedCumulativePosition
  );
  const approvalFields = readExactDataRecord(fields.approvalAuthority, [
    "kind",
    "authorityId",
    "version",
    "refundId",
    "orderId",
    "astrologerUserId",
    "payableAmount",
    "accountingAllocationId",
    "accountingAllocationVersion",
    "fundingStatus"
  ]);
  const payableAmount = readRefundPostingMoney(approvalFields.payableAmount, false);
  let canonicalApproval;
  try {
    canonicalApproval = createRefundApprovalAuthority({
      ...approvalFields,
      payableAmount
    });
  } catch {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  assertRefundPostingAllocationMatchesApprovalAuthority(
    { allocation, approvalAuthority: canonicalApproval },
    postingEnvelope
  );
  const projection = projectStandardRefundReceipt({
    operationReceipt: fields.operationReceipt,
    allocation,
    operation: "approved",
    expectedAuthority: {
      kind: "refund_approval",
      authorityId: allocation.refundApprovalAuthorityRef.authorityId,
      version: allocation.refundApprovalAuthorityRef.version,
      evidenceId: null,
      canonicalDigest: digestValue(canonicalApproval)
    },
    expectedOccurredAt: allocation.approvedAt,
    postingEnvelope,
    receiptEnvelope
  });
  const identity = readRefundPostingIdentity(fields.postingIdentity);
  assertRefundPostingIdentityChronology(identity, projection.receipt.occurredAt);
  if (projection.rows.length === 0) {
    return Object.freeze({
      kind: "refund_state_only" as const,
      operation: "approved" as const,
      authorizationStatus: "unverified" as const,
      atomicityStatus: "unverified" as const,
      reason: "no_payable_lot_reclassification" as const,
      fundingDisposition: "locked" as const,
      fundingTransitionBinding,
      cumulativePositionDecision,
      allocationAuthorityRef: allocationAuthorityRef(allocation),
      operationReceiptRef: projection.sourceEvidenceRef,
      operationSnapshotRef: projection.operationSnapshotRef,
      componentBindings: projection.componentBindings
    });
  }
  const recipe = createReceiptBoundRefundRecipe({
    projection,
    allocation,
    identity,
    postingEnvelope,
    receiptEnvelope
  });
  return Object.freeze({
    kind: "refund_journal" as const,
    operation: "approved" as const,
    fundingDisposition: "locked" as const,
    fundingTransitionBinding,
    cumulativePositionDecision,
    recipe,
    operationReceiptRef: projection.sourceEvidenceRef,
    componentBindings: projection.componentBindings
  });
}
