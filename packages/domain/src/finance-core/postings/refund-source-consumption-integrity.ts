import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import { assertFinancePostingInstantEqual, FinancePostingIntegrityError } from "./posting-codec";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";
import type {
  RefundSourceConsumptionIdentity,
  UnverifiedRefundSourceConsumptionBinding
} from "./refund-source-consumption-types";

export function assertRefundSourceConsumptionBindingMatchesAllocation(
  binding: UnverifiedRefundSourceConsumptionBinding,
  allocation: RefundPostingAllocationAuthorityV1
): void {
  const ref = binding.allocationAuthorityRef;
  if (
    ref.authorityId !== allocation.authorityId ||
    ref.version !== allocation.version ||
    ref.canonicalDigest !== allocation.allocationDigest
  ) {
    mismatch();
  }
  assertFinancePostingInstantEqual(binding.observedAt, allocation.approvedAt, "authority_mismatch");
  const expected = expectedTransitions(allocation);
  if (binding.sourceTransitions.length !== expected.size) mismatch();
  const positions = new Set<string>();
  const sources = new Set<string>();
  let priorPositionId = "";
  for (const transition of binding.sourceTransitions) {
    const sourceKey = JSON.stringify(transition.source);
    const component = expected.get(transition.componentId);
    if (
      transition.positionId <= priorPositionId ||
      transition.positionId !== sourcePositionId(transition.source) ||
      positions.has(transition.positionId) ||
      sources.has(sourceKey) ||
      !component ||
      sourceKey !== JSON.stringify(component.source) ||
      !sameMoney(transition.capacity, component.capacity) ||
      !sameMoney(transition.consumedBefore, component.consumedBefore) ||
      !sameMoney(transition.allocationDelta, component.allocationDelta) ||
      !sameMoney(transition.consumedAfter, component.consumedAfter)
    ) {
      mismatch();
    }
    priorPositionId = transition.positionId;
    positions.add(transition.positionId);
    sources.add(sourceKey);
    expected.delete(transition.componentId);
  }
  if (expected.size !== 0) mismatch();
}

function expectedTransitions(allocation: RefundPostingAllocationAuthorityV1) {
  const rows = new Map<string, ExpectedTransition>();
  for (const component of allocation.payableComponents) {
    rows.set(component.componentId, {
      source: {
        kind: "payable_lot",
        rootLotId: component.rootLotId,
        sourceLotId: component.sourceLotId
      },
      capacity: component.amount,
      consumedBefore: zeroMoney(),
      allocationDelta: component.amount,
      consumedAfter: component.amount
    });
  }
  for (const component of allocation.alreadyPaidComponents) {
    rows.set(component.componentId, fundedExpected(component, "paid_payout_allocation"));
  }
  for (const component of allocation.inFlightPayoutComponents) {
    rows.set(component.componentId, fundedExpected(component, "in_flight_payout_allocation"));
  }
  for (const component of allocation.platformCommissionComponents) {
    rows.set(component.componentId, {
      source: {
        kind: "platform_journal_entry",
        transactionId: component.sourceJournalTransactionId,
        entryIndex: component.sourceJournalEntryIndex,
        accountCode: component.sourceAccountCode
      },
      capacity: component.sourceAllocation.sourceAmount,
      consumedBefore: component.sourceAllocation.priorAllocatedAmount,
      allocationDelta: component.amount,
      consumedAfter: component.sourceAllocation.nextAllocatedAmount
    });
  }
  return rows;
}

type ExpectedTransition = Readonly<{
  source: RefundSourceConsumptionIdentity;
  capacity: Money;
  consumedBefore: Money;
  allocationDelta: Money;
  consumedAfter: Money;
}>;

function fundedExpected(
  component:
    | RefundPostingAllocationAuthorityV1["alreadyPaidComponents"][number]
    | RefundPostingAllocationAuthorityV1["inFlightPayoutComponents"][number],
  kind: "paid_payout_allocation" | "in_flight_payout_allocation"
): ExpectedTransition {
  return {
    source: {
      kind,
      rootLotId: component.rootLotId,
      payableLotId: component.payableLotId,
      payoutRequestId: component.payoutRequestId,
      payoutAllocationId: component.payoutAllocationId
    },
    capacity: component.sourceAllocation.sourceAmount,
    consumedBefore: component.sourceAllocation.priorAllocatedAmount,
    allocationDelta: component.amount,
    consumedAfter: component.sourceAllocation.nextAllocatedAmount
  };
}

function sourcePositionId(source: RefundSourceConsumptionIdentity): string {
  return `refund-source-position:${hashFinanceCommandPayload(source)}`;
}

function zeroMoney(): Money {
  return Object.freeze({ amountMinor: 0, currency: "RUB" });
}

function sameMoney(left: Money, right: Money): boolean {
  return left.amountMinor === right.amountMinor && left.currency === right.currency;
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
