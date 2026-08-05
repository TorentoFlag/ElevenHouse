import {
  consumePaidPayoutPayableLots,
  createPayoutPaidAuthority,
  createRefundBridgePayoutPaidAuthority,
  decideRefundBridgePayoutPaidNoLotTransition
} from "../source-lots";
import { createPayableLotOperationReceipt } from "../source-lot-operation-receipt";
import { payoutPendingState } from "../source-lot-reference-test-fixtures";
import { buildBridgeRefundAllocation } from "./refund-posting-bridge-test-fixtures";
import { buildRefundFundingTerminalFixture } from "./refund-position-test-fixtures";
import { buildTerminalEvidenceBinding } from "./refund-posting-terminal-evidence-test-fixture";
import { zeroPayableTransitions } from "./refund-posting-zero-payable-test-fixtures";

const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });

export function buildBridgePaidFixture() {
  const {
    allocation,
    resolvedPriorAllocation,
    resolvedCumulativePosition,
    fundingApprovalTransitionBinding
  } = buildBridgeRefundAllocation();
  const transitions = zeroPayableTransitions();
  const confirmedReceipt = createPayableLotOperationReceipt(transitions.confirmed);
  const base = payoutPendingState();
  const paidAuthority = createPayoutPaidAuthority({
    kind: "payout_paid",
    authorityId: "payout-bridge-paid-authority",
    version: 1,
    payoutRequestId: "payout-bridge",
    bankReference: "bank-reference-bridge",
    transferredAt: "2026-08-04T02:00:00Z",
    evidenceRef: "private://payout-bridge-proof",
    evidenceHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  });
  const paid = consumePaidPayoutPayableLots({
    state: base.state,
    expectedVersion: base.nextVersion,
    payoutRequestId: "payout-bridge",
    authority: paidAuthority,
    operationId: "payout-bridge-paid",
    sourceKey: { kind: "payout", sourceId: "payout-bridge", operation: "paid" },
    occurredAt: "2026-08-04T02:00:00Z"
  });
  const bridgeAuthority = createRefundBridgePayoutPaidAuthority({
    kind: "refund_bridge_payout_paid",
    authorityId: "refund-bridge-paid-decision-authority",
    version: 1,
    refundId: "refund-bridge-1",
    refundedOrderId: "order-bridge",
    payoutRequestId: "payout-bridge",
    payoutAllocationId: "payout-bridge-allocation",
    amount: money(400),
    bridgeAllocationId: "bridge-allocation-1",
    bridgeAllocationVersion: 1,
    bridgeStatus: "allocated",
    accountingAllocationId: "refund-accounting-allocation-bridge",
    accountingAllocationVersion: 1,
    confirmedRefundAuthorityId: "refund-bridge-confirmed-authority",
    confirmedRefundAuthorityVersion: 1,
    confirmedRefundEvidenceId: "refund-bridge-confirmed-evidence",
    payoutPaidAuthorityId: paidAuthority.authorityId,
    payoutPaidAuthorityVersion: paidAuthority.version,
    bankReference: paidAuthority.bankReference,
    canonicalEvidenceId: "refund-bridge-paid-decision-evidence",
    decidedAt: "2026-08-04T03:00:00Z"
  });
  const modelDecision = decideRefundBridgePayoutPaidNoLotTransition({
    state: paid.state,
    expectedVersion: paid.nextVersion,
    authority: bridgeAuthority,
    sourceKey: { kind: "refund", sourceId: "bridge-allocation-1", operation: "bridge_payout_paid" }
  });
  return Object.freeze({
    allocation,
    resolvedPriorAllocation,
    resolvedCumulativePosition,
    fundingTransitionBinding: buildRefundFundingTerminalFixture(
      allocation,
      fundingApprovalTransitionBinding,
      transitions.confirmedAuthority
    ),
    confirmedTerminalAuthority: transitions.confirmedAuthority,
    confirmedEvidenceBinding: buildTerminalEvidenceBinding(
      allocation,
      transitions.confirmedAuthority,
      confirmedReceipt
    ),
    modelDecision,
    payoutPaidAuthority: paidAuthority,
    postingIdentity: Object.freeze({
      journalTransactionId: "refund-bridge-paid-model-operation:journal",
      linkProofId: "refund-bridge-paid-model-operation:proof",
      postedAt: bridgeAuthority.decidedAt
    })
  });
}
