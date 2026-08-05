import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";

export function buildRefundSourceConsumptionBindingFixture(
  allocation: RefundPostingAllocationAuthorityV1
) {
  const transitions = [
    ...allocation.payableComponents.map((component) =>
      transition(
        component.componentId,
        {
          kind: "payable_lot" as const,
          rootLotId: component.rootLotId,
          sourceLotId: component.sourceLotId
        },
        component.amount.amountMinor,
        0,
        component.amount.amountMinor
      )
    ),
    ...allocation.alreadyPaidComponents.map((component) =>
      transition(
        component.componentId,
        {
          kind: "paid_payout_allocation" as const,
          rootLotId: component.rootLotId,
          payableLotId: component.payableLotId,
          payoutRequestId: component.payoutRequestId,
          payoutAllocationId: component.payoutAllocationId
        },
        component.sourceAllocation.sourceAmount.amountMinor,
        component.sourceAllocation.priorAllocatedAmount.amountMinor,
        component.amount.amountMinor
      )
    ),
    ...allocation.inFlightPayoutComponents.map((component) =>
      transition(
        component.componentId,
        {
          kind: "in_flight_payout_allocation" as const,
          rootLotId: component.rootLotId,
          payableLotId: component.payableLotId,
          payoutRequestId: component.payoutRequestId,
          payoutAllocationId: component.payoutAllocationId
        },
        component.sourceAllocation.sourceAmount.amountMinor,
        component.sourceAllocation.priorAllocatedAmount.amountMinor,
        component.amount.amountMinor
      )
    ),
    ...allocation.platformCommissionComponents.map((component) =>
      transition(
        component.componentId,
        {
          kind: "platform_journal_entry" as const,
          transactionId: component.sourceJournalTransactionId,
          entryIndex: component.sourceJournalEntryIndex,
          accountCode: component.sourceAccountCode
        },
        component.sourceAllocation.sourceAmount.amountMinor,
        component.sourceAllocation.priorAllocatedAmount.amountMinor,
        component.amount.amountMinor
      )
    )
  ].sort((left, right) => (left.positionId < right.positionId ? -1 : 1));
  const core = {
    kind: "unverified_refund_source_consumption_binding" as const,
    schemaVersion: 1 as const,
    bindingId: `${allocation.authorityId}:source-consumption`,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    allocationAuthorityRef: {
      kind: allocation.kind,
      authorityId: allocation.authorityId,
      version: allocation.version,
      canonicalDigest: allocation.allocationDigest
    },
    sourceTransitions: transitions,
    observedAt: allocation.approvedAt
  };
  return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
}

function transition(
  componentId: string,
  source: Readonly<Record<string, unknown>>,
  capacity: number,
  consumedBefore: number,
  delta: number
) {
  const consumedAfter = consumedBefore + delta;
  return Object.freeze({
    positionId: `refund-source-position:${hashFinanceCommandPayload(source)}`,
    expectedPositionVersion: consumedBefore === 0 ? 0 : 1,
    nextPositionVersion: consumedBefore === 0 ? 1 : 2,
    componentId,
    source,
    capacity: money(capacity),
    consumedBefore: money(consumedBefore),
    allocationDelta: money(delta),
    consumedAfter: money(consumedAfter),
    remainingAfter: money(capacity - consumedAfter)
  });
}

function money(amountMinor: number) {
  return Object.freeze({ amountMinor, currency: "RUB" as const });
}
