import {
  approveRefundWithoutPayableLots,
  confirmRefundPayableLots,
  createRefundApprovalAuthority,
  createRefundConfirmedAuthority,
  createRefundFailedAuthority,
  failRefundPayableLots
} from "../source-lots";
import { payoutPendingState } from "../source-lot-reference-test-fixtures";

const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });

export function zeroPayableTransitions() {
  const base = payoutPendingState();
  const approvalAuthority = bridgeApprovalAuthority();
  const approved = approveRefundWithoutPayableLots({
    state: base.moved.state,
    expectedVersion: base.moved.nextVersion,
    authority: approvalAuthority,
    operationId: "refund-bridge-approved",
    sourceKey: { kind: "refund", sourceId: "refund-bridge-1", operation: "approved" },
    occurredAt: "2026-08-03T12:00:00Z"
  });
  const confirmedAuthority = createRefundConfirmedAuthority({
    kind: "refund_confirmed",
    authorityId: "refund-bridge-confirmed-authority",
    version: 1,
    refundId: "refund-bridge-1",
    providerAccountId: "arc-account-live",
    providerPaymentId: "provider-payment-order-bridge",
    providerRefundId: "provider-refund-bridge-context",
    providerAmountBasis: "incremental",
    providerRefundAmount: money(1_000),
    priorProviderTotalRefunded: money(0),
    nextProviderTotalRefunded: money(1_000),
    payableAmount: money(0),
    accountingAllocationId: "refund-accounting-allocation-bridge",
    accountingAllocationVersion: 1,
    canonicalEvidenceId: "refund-bridge-confirmed-evidence",
    confirmedAt: "2026-08-03T13:00:00Z"
  });
  const confirmed = confirmRefundPayableLots({
    state: approved.state,
    expectedVersion: approved.nextVersion,
    refundId: "refund-bridge-1",
    authority: confirmedAuthority,
    operationId: "refund-bridge-confirmed",
    sourceKey: { kind: "refund", sourceId: "refund-bridge-1", operation: "confirmed" },
    occurredAt: confirmedAuthority.confirmedAt
  });
  const failedAuthority = createRefundFailedAuthority({
    kind: "refund_failed",
    authorityId: "refund-bridge-failed-authority",
    version: 1,
    refundId: "refund-bridge-1",
    providerAccountId: "arc-account-live",
    providerPaymentId: "provider-payment-order-bridge",
    providerRefundId: "provider-refund-bridge-context",
    providerRefundAmount: money(1_000),
    payableAmount: money(0),
    accountingAllocationId: "refund-accounting-allocation-bridge",
    accountingAllocationVersion: 1,
    failureCode: "provider_declined",
    canonicalEvidenceId: "refund-bridge-failed-evidence",
    failedAt: "2026-08-03T13:00:00Z"
  });
  const failed = failRefundPayableLots({
    state: approved.state,
    expectedVersion: approved.nextVersion,
    refundId: "refund-bridge-1",
    authority: failedAuthority,
    operationId: "refund-bridge-failed",
    sourceKey: { kind: "refund", sourceId: "refund-bridge-1", operation: "failed" },
    occurredAt: failedAuthority.failedAt,
    outputLotIds: []
  });
  return { approved, confirmed, failed, confirmedAuthority, failedAuthority };
}

export function bridgeApprovalAuthority() {
  return createRefundApprovalAuthority({
    kind: "refund_approval",
    authorityId: "refund-bridge-approval-authority",
    version: 1,
    refundId: "refund-bridge-1",
    orderId: "order-bridge",
    astrologerUserId: "astrologer-1",
    payableAmount: money(0),
    accountingAllocationId: "refund-accounting-allocation-bridge",
    accountingAllocationVersion: 1,
    fundingStatus: "fully_funded"
  });
}
