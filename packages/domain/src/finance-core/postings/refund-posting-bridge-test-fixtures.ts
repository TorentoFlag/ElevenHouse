import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import {
  createPayoutNoTransferOutcomeAuthority,
  createRefundBridgePayoutFailedAuthority
} from "../source-lots";
import { createPayableLotOperationReceipt } from "../source-lot-operation-receipt";
import { buildReceiptTransitionCases } from "../source-lot-operation-receipt-test-fixtures";
import { buildTerminalEvidenceBinding } from "./refund-posting-terminal-evidence-test-fixture";
import {
  buildRefundPostingAllocationInput,
  buildRefundPlatformCommissionFixture,
  refundPostingDecoderEnvelope,
  withAllocationDigest
} from "./refund-posting-test-fixtures";
import { readRefundPostingAllocationAuthority } from "./refund-posting-allocation-codec";
import {
  buildRefundCumulativePositionInput,
  buildRefundFundingApprovalFixture,
  buildRefundFundingTerminalFixture,
  cumulativePositionRef
} from "./refund-position-test-fixtures";
import {
  bridgeApprovalAuthority,
  zeroPayableTransitions
} from "./refund-posting-zero-payable-test-fixtures";

const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });

export function buildBridgeRefundAllocation(bridgeAllocationId = "bridge-allocation-1") {
  const base = buildRefundPostingAllocationInput();
  const approvalAuthority = bridgeApprovalAuthority();
  const orderEconomics = Object.freeze({ ...base.orderEconomics, orderId: "order-bridge" });
  const paid = base.alreadyPaidComponents[0];
  const inFlight = base.inFlightPayoutComponents[0];
  if (!paid || !inFlight) throw new Error("missing bridge allocation rows");
  const platform = buildRefundPlatformCommissionFixture("order-bridge", "arc-account-live", [
    {
      componentId: "component-k-bridge",
      accountCode: "platform_commission_deferred",
      transactionId: "order-bridge:sale-captured-platform",
      sourceAmountMinor: 40,
      allocationAmountMinor: 40
    }
  ]);
  const providerAccount = Object.freeze({
    ...base.providerAccount,
    providerAccountId: "arc-account-live"
  });
  const providerPaymentId = "provider-payment-order-bridge";
  const resolvedCumulativePosition = buildRefundCumulativePositionInput({
    providerAccount,
    providerPaymentId,
    updatedAt: "2026-08-03T12:00:00Z"
  });
  const core = {
    ...base,
    authorityId: "refund-accounting-allocation-bridge",
    version: 1,
    refundId: "refund-bridge-1",
    orderId: "order-bridge",
    providerAccount,
    providerPaymentId,
    providerIntentId: "refund-bridge-intent-1",
    providerRequestDigest: hashFinanceCommandPayload({ request: "refund-bridge-1" }),
    approvedAt: "2026-08-03T12:00:00Z",
    confirmedCumulativePositionRef: cumulativePositionRef(resolvedCumulativePosition),
    refundApprovalAuthorityRef: authorityRef(
      approvalAuthority.kind,
      approvalAuthority.authorityId,
      approvalAuthority.version,
      hashFinanceCommandPayload(approvalAuthority)
    ),
    orderEconomics,
    orderEconomicsDigest: hashFinanceCommandPayload(orderEconomics),
    priorCumulativeRefunded: money(0),
    nextCumulativeRefunded: money(1_000),
    priorCumulativePayableReversed: money(0),
    nextCumulativePayableReversed: money(960),
    priorCumulativePlatformReversed: money(0),
    nextCumulativePlatformReversed: money(40),
    refundAmount: money(1_000),
    payableLotAmount: money(0),
    alreadyPaidAmount: money(560),
    inFlightPayoutAmount: money(400),
    platformCommissionAmount: money(40),
    payableComponents: [],
    alreadyPaidComponents: [
      Object.freeze({
        ...paid,
        componentId: "component-d-bridge",
        rootLotId: "lot-order-bridge",
        sourceAllocation: sourceAllocation(560),
        amount: money(560)
      })
    ],
    inFlightPayoutComponents: [
      Object.freeze({
        ...inFlight,
        componentId: "component-i-bridge",
        rootLotId: "lot-order-bridge",
        payableLotId: "payout-bridge-pending",
        payoutRequestId: "payout-bridge",
        payoutAllocationId: "payout-bridge-allocation",
        bridgeAllocationRef: authorityRef(
          "refund_payout_bridge_allocation",
          bridgeAllocationId,
          1,
          hashFinanceCommandPayload({ bridgeAllocationId })
        ),
        sourceAllocation: sourceAllocation(400),
        amount: money(400)
      })
    ],
    platformCommissionComponents: platform.components
  } as const;
  const allocation = readRefundPostingAllocationAuthority(
    withAllocationDigest(core),
    refundPostingDecoderEnvelope
  );
  const fundingApproval = buildRefundFundingApprovalFixture(allocation);
  return Object.freeze({
    allocation,
    approvalAuthority,
    resolvedPriorAllocation: null,
    resolvedCumulativePosition,
    fundingApprovalTransitionBinding: fundingApproval.binding,
    originalPlatformJournals: platform.journals
  });
}

export function buildZeroPayableRefundFixture(operation: "approved" | "confirmed" | "failed") {
  const {
    allocation,
    approvalAuthority,
    resolvedPriorAllocation,
    resolvedCumulativePosition,
    fundingApprovalTransitionBinding,
    originalPlatformJournals
  } = buildBridgeRefundAllocation();
  const transitions = zeroPayableTransitions();
  const transition = transitions[operation];
  const operationReceipt = createPayableLotOperationReceipt(transition);
  const terminalAuthority =
    operation === "confirmed"
      ? transitions.confirmedAuthority
      : operation === "failed"
        ? transitions.failedAuthority
        : null;
  const fundingTransitionBinding =
    terminalAuthority === null
      ? fundingApprovalTransitionBinding
      : buildRefundFundingTerminalFixture(
          allocation,
          fundingApprovalTransitionBinding,
          terminalAuthority
        );
  return Object.freeze({
    allocation,
    approvalAuthority,
    resolvedPriorAllocation,
    resolvedCumulativePosition,
    fundingTransitionBinding,
    operationReceipt,
    terminalAuthority,
    terminalEvidenceBinding:
      terminalAuthority === null
        ? null
        : buildTerminalEvidenceBinding(allocation, terminalAuthority, operationReceipt),
    originalPlatformJournals,
    postingIdentity: identity(operationReceipt.operationId, operationReceipt.occurredAt)
  });
}

export function buildBridgeFailedFixture() {
  const {
    allocation,
    resolvedPriorAllocation,
    resolvedCumulativePosition,
    fundingApprovalTransitionBinding
  } = buildBridgeRefundAllocation("receipt-bridge-allocation");
  const confirmed = zeroPayableTransitions().confirmedAuthority;
  const confirmedReceipt = createPayableLotOperationReceipt(zeroPayableTransitions().confirmed);
  const bridgeAuthority = createRefundBridgePayoutFailedAuthority({
    kind: "refund_bridge_payout_failed",
    authorityId: "receipt-refund-bridge-failed-authority",
    version: 1,
    refundId: "refund-bridge-1",
    refundedOrderId: "order-bridge",
    payoutRequestId: "payout-bridge",
    payoutAllocationId: "payout-bridge-allocation",
    amount: money(400),
    bridgeAllocationId: "receipt-bridge-allocation",
    bridgeAllocationVersion: 1,
    bridgeStatus: "allocated",
    accountingAllocationId: "refund-accounting-allocation-bridge",
    accountingAllocationVersion: 1,
    confirmedRefundAuthorityId: "refund-bridge-confirmed-authority",
    confirmedRefundAuthorityVersion: 1,
    confirmedRefundEvidenceId: "refund-bridge-confirmed-evidence",
    payoutOutcomeAuthority: createPayoutNoTransferOutcomeAuthority({
      kind: "payout_no_transfer_outcome",
      authorityId: "receipt-payout-no-transfer-authority-bridge",
      version: 1,
      payoutRequestId: "payout-bridge",
      outcome: "failed_pre_transfer",
      bankInitiation: "not_started",
      bankDebit: "not_possible",
      evidenceId: "receipt-payout-no-transfer-evidence-bridge",
      decidedAt: "2026-08-04T01:00:00Z"
    })
  });
  const bridgeReceiptCase = buildReceiptTransitionCases().find(
    (candidate) => candidate.kind === "refund_bridge_payout_failed"
  );
  if (!bridgeReceiptCase) throw new Error("missing bridge-failed receipt fixture");
  const operationReceipt = createPayableLotOperationReceipt(bridgeReceiptCase.transition);
  return Object.freeze({
    allocation,
    resolvedPriorAllocation,
    resolvedCumulativePosition,
    fundingTransitionBinding: buildRefundFundingTerminalFixture(
      allocation,
      fundingApprovalTransitionBinding,
      confirmed
    ),
    confirmedTerminalAuthority: confirmed,
    confirmedEvidenceBinding: buildTerminalEvidenceBinding(allocation, confirmed, confirmedReceipt),
    bridgeAuthority,
    payoutOutcomeAuthority: bridgeAuthority.payoutOutcomeAuthority,
    operationReceipt,
    postingIdentity: identity(operationReceipt.operationId, operationReceipt.occurredAt)
  });
}

function sourceAllocation(amountMinor: number) {
  return Object.freeze({
    sourceAmount: money(1_000),
    priorAllocatedAmount: money(0),
    nextAllocatedAmount: money(amountMinor)
  });
}

function identity(operationId: string, postedAt: string) {
  return Object.freeze({
    journalTransactionId: `${operationId}:journal`,
    linkProofId: `${operationId}:proof`,
    postedAt
  });
}

function authorityRef<const Kind extends string>(
  kind: Kind,
  authorityId: string,
  version: number,
  canonicalDigest: FinanceAuthorizationPayloadHash
) {
  return Object.freeze({ kind, authorityId, version, canonicalDigest });
}
