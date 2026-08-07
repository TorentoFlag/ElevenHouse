import {
  hashFinanceCommandPayload,
  type FinanceAuthorizationPayloadHash
} from "../../finance-authorization/canonical-command-payload";
import {
  buildRefundPlatformJournalSources,
  type RefundPlatformJournalSourceSpec
} from "./refund-posting-platform-journal-test-fixtures";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";

const money = (amountMinor: number) => Object.freeze({ amountMinor, currency: "RUB" as const });
const digest = (value: string) => hashFinanceCommandPayload({ value });

export const refundPostingDecoderEnvelope = Object.freeze({
  maxJournalEntries: 32,
  maxProofEdges: 32,
  maxComponentBindings: 32,
  maxAllocations: 16,
  maxDecimalDigits: 8
});

export const refundApprovalAuthority = Object.freeze({
  kind: "refund_approval" as const,
  authorityId: "refund-approval-authority-1",
  version: 3,
  refundId: "refund-1",
  orderId: "order-1",
  astrologerUserId: "astrologer-1",
  payableAmount: money(1_200),
  accountingAllocationId: "refund-allocation-1",
  accountingAllocationVersion: 1,
  fundingStatus: "fully_funded" as const
});

export function buildRefundPostingAllocationInput() {
  const orderEconomics = Object.freeze({
    orderId: "order-1",
    astrologerUserId: "astrologer-1",
    planId: "plan-pro",
    planVersionId: "plan-pro-v3",
    gross: money(10_000),
    commission: money(400),
    payable: money(9_600),
    commissionBps: 400,
    allocationRevision: "bps_half_up_v1" as const
  });
  const platform = buildRefundPlatformCommissionFixture("order-1", "arc-account-live-primary");
  const account = providerAccount();
  const cumulativePosition = buildInitialRefundCumulativePositionInput(account, "arc-payment-1");
  const core = {
    kind: "refund_posting_allocation_authority",
    schemaVersion: 1,
    authorizationStatus: "unverified",
    digestPurpose: "drift_detection_only",
    authorityId: "refund-allocation-1",
    version: 1,
    refundId: "refund-1",
    orderId: "order-1",
    astrologerUserId: "astrologer-1",
    providerAccount: account,
    providerPaymentId: "arc-payment-1",
    providerIntentId: "refund-intent-1",
    providerRequestDigest: digest("refund-request-1"),
    approvedAt: "2026-08-03T10:00:00Z",
    allocationStatus: "approved",
    fundingStatus: "fully_funded",
    priorAllocationAuthorityRef: null,
    confirmedCumulativePositionRef: refundCumulativePositionRef(cumulativePosition),
    refundApprovalAuthorityRef: authorityRef(
      "refund_approval",
      refundApprovalAuthority.authorityId,
      refundApprovalAuthority.version,
      hashFinanceCommandPayload(refundApprovalAuthority)
    ),
    orderEconomics,
    orderEconomicsDigest: hashFinanceCommandPayload(orderEconomics),
    capturedGross: money(10_000),
    capturedPayable: money(9_600),
    capturedPlatformCommission: money(400),
    priorCumulativeRefunded: money(0),
    nextCumulativeRefunded: money(2_500),
    priorCumulativePayableReversed: money(0),
    nextCumulativePayableReversed: money(2_400),
    priorCumulativePlatformReversed: money(0),
    nextCumulativePlatformReversed: money(100),
    refundAmount: money(2_500),
    payableLotAmount: money(1_200),
    alreadyPaidAmount: money(600),
    inFlightPayoutAmount: money(600),
    platformCommissionAmount: money(100),
    payableComponents: [
      {
        kind: "payable_lot",
        componentId: "component-a-1",
        rootLotId: "root-lot-1",
        sourceLotId: "available-lot-1",
        refundPendingLotId: "refund-pending-lot-1",
        originalBucket: "available",
        payoutAllocationId: null,
        amount: money(900)
      },
      {
        kind: "payable_lot",
        componentId: "component-a-2",
        rootLotId: "root-lot-2",
        sourceLotId: "reserved-lot-1",
        refundPendingLotId: "refund-pending-lot-2",
        originalBucket: "reserved",
        payoutAllocationId: null,
        amount: money(300)
      }
    ],
    alreadyPaidComponents: [alreadyPaidComponent()],
    inFlightPayoutComponents: [inFlightComponent()],
    platformCommissionComponents: platform.components,
    providerClearingComponentId: "component-provider-clearing"
  } as const;
  return withAllocationDigest(core);
}

export function buildSecondRefundPostingAllocationInput(prior: RefundPostingAllocationAuthorityV1) {
  const confirmedPosition = buildConfirmedRefundCumulativePositionInput(prior);
  const payableComponents = prior.payableComponents.map((component) => ({
    ...component,
    componentId: `${component.componentId}-v2`,
    rootLotId: `${component.rootLotId}-v2`,
    sourceLotId: `${component.sourceLotId}-v2`,
    refundPendingLotId: `${component.refundPendingLotId}-v2`,
    amount: money(900),
    payoutAllocationId: null
  }));
  const alreadyPaidComponents = prior.alreadyPaidComponents.map((component) => ({
    ...component,
    amount: money(400),
    sourceAllocation: {
      sourceAmount: component.sourceAllocation.sourceAmount,
      priorAllocatedAmount: component.sourceAllocation.nextAllocatedAmount,
      nextAllocatedAmount: money(1_000)
    }
  }));
  const inFlightPayoutComponents = prior.inFlightPayoutComponents.map((component) => ({
    ...component,
    amount: money(200),
    sourceAllocation: {
      sourceAmount: component.sourceAllocation.sourceAmount,
      priorAllocatedAmount: component.sourceAllocation.nextAllocatedAmount,
      nextAllocatedAmount: money(800)
    }
  }));
  const platformCommissionComponents = prior.platformCommissionComponents.map((component) => ({
    ...component,
    sourceAllocation: {
      sourceAmount: component.sourceAllocation.sourceAmount,
      priorAllocatedAmount: component.sourceAllocation.nextAllocatedAmount,
      nextAllocatedAmount: money(
        component.sourceAllocation.nextAllocatedAmount.amountMinor + component.amount.amountMinor
      )
    }
  }));
  return withAllocationDigest({
    ...prior,
    authorityId: "refund-allocation-2",
    version: 2,
    refundId: "refund-2",
    providerIntentId: "refund-intent-2",
    approvedAt: "2026-08-03T11:00:00Z",
    priorAllocationAuthorityRef: {
      kind: prior.kind,
      authorityId: prior.authorityId,
      version: prior.version,
      nextCumulativeRefunded: prior.nextCumulativeRefunded,
      nextCumulativePayableReversed: prior.nextCumulativePayableReversed,
      nextCumulativePlatformReversed: prior.nextCumulativePlatformReversed,
      canonicalDigest: prior.allocationDigest
    },
    confirmedCumulativePositionRef: refundCumulativePositionRef(confirmedPosition),
    priorCumulativeRefunded: prior.nextCumulativeRefunded,
    nextCumulativeRefunded: money(5_000),
    priorCumulativePayableReversed: prior.nextCumulativePayableReversed,
    nextCumulativePayableReversed: money(4_800),
    priorCumulativePlatformReversed: prior.nextCumulativePlatformReversed,
    nextCumulativePlatformReversed: money(200),
    payableLotAmount: money(1_800),
    alreadyPaidAmount: money(400),
    inFlightPayoutAmount: money(200),
    payableComponents,
    alreadyPaidComponents,
    inFlightPayoutComponents,
    platformCommissionComponents,
    providerClearingComponentId: "component-provider-clearing-v2"
  });
}

export function buildInitialRefundCumulativePositionInput(
  account: RefundPostingAllocationAuthorityV1["providerAccount"],
  providerPaymentId: string,
  updatedAt = "2026-08-03T00:00:00Z"
) {
  return cumulativePosition({
    account,
    providerPaymentId,
    version: 0,
    refunded: 0,
    payable: 0,
    platform: 0,
    lastAllocationRef: null,
    lastTerminalRef: null,
    updatedAt
  });
}

export function buildConfirmedRefundCumulativePositionInput(
  allocation: RefundPostingAllocationAuthorityV1,
  updatedAt = "2026-08-03T10:30:00Z"
) {
  return cumulativePosition({
    account: allocation.providerAccount,
    providerPaymentId: allocation.providerPaymentId,
    version: allocation.confirmedCumulativePositionRef.version + 1,
    refunded: allocation.nextCumulativeRefunded.amountMinor,
    payable: allocation.nextCumulativePayableReversed.amountMinor,
    platform: allocation.nextCumulativePlatformReversed.amountMinor,
    lastAllocationRef: authorityRef(
      allocation.kind,
      allocation.authorityId,
      allocation.version,
      allocation.allocationDigest
    ),
    lastTerminalRef: authorityRef(
      "refund_confirmed",
      `${allocation.refundId}:confirmed-authority`,
      1,
      digest(`${allocation.refundId}:confirmed-authority`)
    ),
    updatedAt
  });
}

export function refundCumulativePositionRef(
  position: ReturnType<typeof buildInitialRefundCumulativePositionInput>
) {
  return Object.freeze({
    kind: "refund_cumulative_position" as const,
    positionId: position.positionId,
    version: position.version,
    confirmedCumulativeRefunded: position.confirmedCumulativeRefunded,
    confirmedCumulativePayableReversed: position.confirmedCumulativePayableReversed,
    confirmedCumulativePlatformReversed: position.confirmedCumulativePlatformReversed,
    canonicalDigest: position.positionDigest
  });
}

export function buildRefundPlatformCommissionFixture(
  orderId: string,
  providerAccountId: string,
  specs: readonly RefundPlatformJournalSourceSpec[] = [
    {
      componentId: "component-k-1",
      accountCode: "platform_commission_deferred",
      transactionId: `${orderId}:sale-captured-platform`,
      sourceAmountMinor: 250,
      allocationAmountMinor: 70
    },
    {
      componentId: "component-k-2",
      accountCode: "platform_commission_revenue",
      transactionId: `${orderId}:commission-earned-platform`,
      sourceAmountMinor: 150,
      allocationAmountMinor: 30
    }
  ]
) {
  const sourceFixture = buildRefundPlatformJournalSources(orderId, providerAccountId, specs);
  return Object.freeze({
    components: Object.freeze(
      sourceFixture.sources.map((source) =>
        platformComponent(
          source.componentId,
          source.transactionId,
          source.accountCode,
          source.sourceJournalEntryIndex,
          source.sourceEntryDigest,
          source.allocationAmountMinor,
          source.sourceAmountMinor
        )
      )
    ),
    journals: sourceFixture.journals
  });
}

export function withAllocationDigest<T extends Record<string, unknown>>(
  core: T
): Omit<T, "allocationDigest"> & { allocationDigest: FinanceAuthorizationPayloadHash } {
  const withoutDigest: Record<string, unknown> = { ...core };
  delete withoutDigest.allocationDigest;
  return {
    ...core,
    allocationDigest: hashFinanceCommandPayload(withoutDigest)
  } as Omit<T, "allocationDigest"> & { allocationDigest: FinanceAuthorizationPayloadHash };
}

function providerAccount() {
  return Object.freeze({
    providerAccountId: "arc-account-live-primary",
    identityVersion: 3,
    provider: "arc_pay" as const,
    merchantTenantId: "elevenhouse-live",
    terminalScope: "primary-payins",
    settlementScope: "merchant-ledger-primary"
  });
}

function cumulativePosition(input: {
  account: RefundPostingAllocationAuthorityV1["providerAccount"];
  providerPaymentId: string;
  version: number;
  refunded: number;
  payable: number;
  platform: number;
  lastAllocationRef: ReturnType<typeof authorityRef> | null;
  lastTerminalRef: ReturnType<typeof authorityRef> | null;
  updatedAt: string;
}) {
  const identity = {
    providerAccount: input.account,
    providerPaymentId: input.providerPaymentId,
    currency: "RUB" as const
  };
  const core = Object.freeze({
    kind: "refund_cumulative_position" as const,
    schemaVersion: 1 as const,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    positionId: `refund-cumulative-position:${hashFinanceCommandPayload(identity)}`,
    providerAccount: input.account,
    providerPaymentId: input.providerPaymentId,
    currency: "RUB" as const,
    version: input.version,
    confirmedCumulativeRefunded: money(input.refunded),
    confirmedCumulativePayableReversed: money(input.payable),
    confirmedCumulativePlatformReversed: money(input.platform),
    lastConfirmedAllocationRef: input.lastAllocationRef,
    lastConfirmedTerminalAuthorityRef: input.lastTerminalRef,
    updatedAt: input.updatedAt
  });
  return Object.freeze({ ...core, positionDigest: hashFinanceCommandPayload(core) });
}

function authorityRef(kind: string, authorityId: string, version: number, canonicalDigest: string) {
  return Object.freeze({ kind, authorityId, version, canonicalDigest });
}

function sourceAllocation(sourceAmount: number, nextAllocatedAmount: number) {
  return Object.freeze({
    sourceAmount: money(sourceAmount),
    priorAllocatedAmount: money(0),
    nextAllocatedAmount: money(nextAllocatedAmount)
  });
}

function reservation(reservationId: string) {
  return Object.freeze({
    kind: "refund_funding_reservation",
    reservationId,
    version: 1,
    canonicalDigest: digest(reservationId)
  });
}

function treatment(accountCode: "astrologer_recovery_receivable" | "platform_refund_loss") {
  const kind =
    accountCode === "astrologer_recovery_receivable"
      ? "refund_recovery_allocation"
      : "refund_platform_loss_allocation";
  return Object.freeze({
    accountCode,
    authorityRef: authorityRef(kind, `${kind}-1`, 1, digest(kind))
  });
}

function alreadyPaidComponent() {
  return Object.freeze({
    kind: "already_paid",
    componentId: "component-d-1",
    rootLotId: "root-lot-paid-1",
    payableLotId: "paid-lot-1",
    payoutRequestId: "payout-paid-1",
    payoutAllocationId: "payout-allocation-paid-1",
    payoutPaidAuthorityRef: authorityRef(
      "payout_paid",
      "payout-paid-authority-1",
      2,
      digest("paid")
    ),
    sourceAllocation: sourceAllocation(1_000, 600),
    fundingReservationRef: reservation("reservation-d-1"),
    treatment: treatment("astrologer_recovery_receivable"),
    amount: money(600)
  });
}

function inFlightComponent() {
  return Object.freeze({
    kind: "in_flight_payout",
    componentId: "component-i-1",
    rootLotId: "root-lot-flight-1",
    payableLotId: "flight-lot-1",
    payoutRequestId: "payout-flight-1",
    payoutAllocationId: "payout-allocation-flight-1",
    payoutProcessingAuthorityRef: authorityRef(
      "payout_processing_manual",
      "payout-processing-authority-1",
      3,
      digest("processing")
    ),
    bridgeAllocationRef: authorityRef(
      "refund_payout_bridge_allocation",
      "bridge-allocation-1",
      2,
      digest("bridge-allocation")
    ),
    bridgePolicyAuthorityRef: authorityRef(
      "refund_payout_bridge_policy",
      "bridge-policy-1",
      1,
      digest("bridge-policy")
    ),
    sourceAllocation: sourceAllocation(800, 600),
    fundingReservationRef: reservation("reservation-i-1"),
    paidOutcomeTreatment: treatment("platform_refund_loss"),
    amount: money(600)
  });
}

function platformComponent(
  componentId: string,
  sourceJournalTransactionId: string,
  sourceAccountCode: "platform_commission_deferred" | "platform_commission_revenue",
  sourceJournalEntryIndex: number,
  sourceEntryDigest: FinanceAuthorizationPayloadHash,
  amount: number,
  sourceAmount: number
) {
  return Object.freeze({
    kind: "platform_commission",
    componentId,
    sourceJournalTransactionId,
    sourceJournalEntryIndex,
    sourceAccountCode,
    sourceEntryDigest,
    sourceAllocation: sourceAllocation(sourceAmount, amount),
    fundingReservationRef: reservation(`reservation-${componentId}`),
    amount: money(amount)
  });
}
