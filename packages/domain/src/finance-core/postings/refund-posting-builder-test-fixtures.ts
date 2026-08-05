import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import {
  createPayableLotOperationReceipt,
  type PayableLotOperationReceipt
} from "../source-lot-operation-receipt";
import { buildReceiptTransitionCases } from "../source-lot-operation-receipt-test-fixtures";
import {
  confirmedRefundAuthority as buildConfirmedAuthority,
  failedRefundAuthority as buildFailedAuthority
} from "../source-lot-reference-test-fixtures";
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
import { buildTerminalEvidenceBinding } from "./refund-posting-terminal-evidence-test-fixture";

const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });

export function buildStandardRefundAllocation() {
  const base = buildRefundPostingAllocationInput();
  const receipt = receiptFor("refund_approved");
  const approvalAuthority = Object.freeze({
    kind: "refund_approval" as const,
    authorityId: "refund-approval-authority-1",
    version: 1,
    refundId: "refund-1",
    orderId: "order-refund",
    astrologerUserId: "astrologer-1",
    payableAmount: money(2_000),
    accountingAllocationId: "refund-accounting-allocation-1",
    accountingAllocationVersion: 1,
    fundingStatus: "fully_funded" as const
  });
  const orderEconomics = Object.freeze({
    ...base.orderEconomics,
    orderId: "order-refund"
  });
  const alreadyPaid = base.alreadyPaidComponents[0];
  const inFlight = base.inFlightPayoutComponents[0];
  if (!alreadyPaid || !inFlight) throw new Error("missing standard refund allocation rows");
  const platform = buildRefundPlatformCommissionFixture(
    approvalAuthority.orderId,
    "arc-account-live"
  );
  const providerAccount = Object.freeze({
    ...base.providerAccount,
    providerAccountId: "arc-account-live"
  });
  const providerPaymentId = "provider-payment-order-refund";
  const resolvedCumulativePosition = buildRefundCumulativePositionInput({
    providerAccount,
    providerPaymentId,
    updatedAt: receipt.occurredAt
  });
  const core = {
    ...base,
    authorityId: approvalAuthority.accountingAllocationId,
    version: approvalAuthority.accountingAllocationVersion,
    orderId: approvalAuthority.orderId,
    providerAccount,
    providerPaymentId,
    approvedAt: receipt.occurredAt,
    confirmedCumulativePositionRef: cumulativePositionRef(resolvedCumulativePosition),
    refundApprovalAuthorityRef: authorityRef(
      approvalAuthority.kind,
      approvalAuthority.authorityId,
      approvalAuthority.version,
      hashFinanceCommandPayload(approvalAuthority)
    ),
    orderEconomics,
    orderEconomicsDigest: hashFinanceCommandPayload(orderEconomics),
    payableLotAmount: money(2_000),
    alreadyPaidAmount: money(200),
    inFlightPayoutAmount: money(200),
    payableComponents: payableComponents(receipt),
    alreadyPaidComponents: [resizeFundedComponent(alreadyPaid, 200)],
    inFlightPayoutComponents: [resizeFundedComponent(inFlight, 200)],
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

export function buildStandardRefundOperationFixture(
  kind: "refund_approved" | "refund_confirmed" | "refund_failed"
) {
  const {
    allocation,
    approvalAuthority,
    resolvedPriorAllocation,
    resolvedCumulativePosition,
    fundingApprovalTransitionBinding,
    originalPlatformJournals
  } = buildStandardRefundAllocation();
  const operationReceipt = receiptFor(kind);
  const terminalAuthority =
    kind === "refund_confirmed"
      ? buildConfirmedAuthority()
      : kind === "refund_failed"
        ? buildFailedAuthority()
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
    postingIdentity: Object.freeze({
      journalTransactionId: `${operationReceipt.operationId}:journal`,
      linkProofId: `${operationReceipt.operationId}:proof`,
      postedAt: operationReceipt.occurredAt
    })
  });
}

export function receiptFor(
  kind: "refund_approved" | "refund_confirmed" | "refund_failed" | "refund_bridge_payout_failed"
): PayableLotOperationReceipt {
  const fixture = buildReceiptTransitionCases().find((candidate) => candidate.kind === kind);
  if (!fixture) throw new Error(`missing ${kind} receipt fixture`);
  return createPayableLotOperationReceipt(fixture.transition);
}

function payableComponents(receipt: PayableLotOperationReceipt) {
  return receipt.effects
    .filter((effect) => effect.side === "debit")
    .map((debit, index) => {
      const created = receipt.lineage.find(
        (entry) =>
          entry.relation === "created" &&
          entry.parentLotId === debit.knownLinks.payableLotId &&
          entry.bucket === "refund_pending"
      );
      const credit = receipt.effects.find(
        (effect) => effect.effectId === created?.economicEffectId && effect.side === "credit"
      );
      if (!created || !credit) throw new Error("missing refund-pending fixture lineage");
      if (
        debit.bucket !== "pending" &&
        debit.bucket !== "available" &&
        debit.bucket !== "reserved"
      ) {
        throw new Error("unexpected refund source bucket");
      }
      return Object.freeze({
        kind: "payable_lot" as const,
        componentId: `component-a-${index + 1}`,
        rootLotId: debit.knownLinks.rootLotId,
        sourceLotId: debit.knownLinks.payableLotId,
        refundPendingLotId: credit.knownLinks.payableLotId,
        originalBucket: debit.bucket,
        payoutAllocationId: debit.knownLinks.payoutAllocationId,
        amount: debit.amount
      });
    });
}

function resizeFundedComponent<T extends { readonly sourceAllocation: object }>(
  component: T,
  amountMinor: number
) {
  return Object.freeze({
    ...component,
    sourceAllocation: Object.freeze({
      sourceAmount: money(1_000),
      priorAllocatedAmount: money(0),
      nextAllocatedAmount: money(amountMinor)
    }),
    amount: money(amountMinor)
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
