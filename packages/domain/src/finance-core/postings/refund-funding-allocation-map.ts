import type { Money } from "../../money";
import type {
  RefundFundingReservationAuthorityRef,
  RefundFundingSourceIdentity
} from "./refund-funding-position-types";
import type {
  RefundAlreadyPaidComponent,
  RefundInFlightPayoutComponent,
  RefundPostingAllocationAuthorityV1,
  RefundPostingAuthorityRef
} from "./refund-posting-types";

export type ExpectedRefundFundingComponent = Readonly<{
  componentId: string;
  amount: Money;
  requiredReservationRef: RefundFundingReservationAuthorityRef | null;
}>;

export type ExpectedRefundFundingSource = Readonly<{
  source: RefundFundingSourceIdentity;
  components: readonly ExpectedRefundFundingComponent[];
  amount: Money;
  exactCapacity: Money | null;
  expectedConsumed: Money | null;
}>;

export function expectedRefundFundingSources(
  allocation: RefundPostingAllocationAuthorityV1
): readonly ExpectedRefundFundingSource[] {
  const rows: MutableExpected[] = [];
  for (const component of allocation.payableComponents) {
    add(rows, {
      source: {
        kind: "payable_root_lot",
        orderId: allocation.orderId,
        rootLotId: component.rootLotId
      },
      component: item(component.componentId, component.amount, null),
      exactCapacity: null,
      expectedConsumed: null
    });
  }
  for (const component of allocation.alreadyPaidComponents) {
    add(rows, payoutExpected(allocation.orderId, component, "paid_payout_allocation"));
  }
  for (const component of allocation.inFlightPayoutComponents) {
    add(rows, payoutExpected(allocation.orderId, component, "in_flight_payout_allocation"));
  }
  for (const component of allocation.platformCommissionComponents) {
    add(rows, {
      source: {
        kind: "platform_journal_entry",
        orderId: allocation.orderId,
        transactionId: component.sourceJournalTransactionId,
        entryIndex: component.sourceJournalEntryIndex,
        accountCode: component.sourceAccountCode
      },
      component: item(component.componentId, component.amount, component.fundingReservationRef),
      exactCapacity: component.sourceAllocation.sourceAmount,
      expectedConsumed: component.sourceAllocation.priorAllocatedAmount
    });
  }
  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        source: row.source,
        components: Object.freeze(
          row.components.sort((left, right) => left.componentId.localeCompare(right.componentId))
        ),
        amount: money(row.amountMinor),
        exactCapacity: row.exactCapacity,
        expectedConsumed: row.expectedConsumed
      })
    )
  );
}

export function refundFundingAllocationRef(
  allocation: RefundPostingAllocationAuthorityV1
): RefundPostingAuthorityRef<"refund_posting_allocation_authority"> {
  return Object.freeze({
    kind: allocation.kind,
    authorityId: allocation.authorityId,
    version: allocation.version,
    canonicalDigest: allocation.allocationDigest
  });
}

type MutableExpected = {
  source: RefundFundingSourceIdentity;
  components: ExpectedRefundFundingComponent[];
  amountMinor: number;
  exactCapacity: Money | null;
  expectedConsumed: Money | null;
};

function add(
  rows: MutableExpected[],
  input: Readonly<{
    source: RefundFundingSourceIdentity;
    component: ExpectedRefundFundingComponent;
    exactCapacity: Money | null;
    expectedConsumed: Money | null;
  }>
): void {
  const key = JSON.stringify(input.source);
  const existing = rows.find((row) => JSON.stringify(row.source) === key);
  if (existing) {
    existing.components.push(input.component);
    existing.amountMinor += input.component.amount.amountMinor;
    return;
  }
  rows.push({
    source: input.source,
    components: [input.component],
    amountMinor: input.component.amount.amountMinor,
    exactCapacity: input.exactCapacity,
    expectedConsumed: input.expectedConsumed
  });
}

function payoutExpected(
  orderId: string,
  component: RefundAlreadyPaidComponent | RefundInFlightPayoutComponent,
  kind: "paid_payout_allocation" | "in_flight_payout_allocation"
) {
  return {
    source: {
      kind,
      orderId,
      rootLotId: component.rootLotId,
      payableLotId: component.payableLotId,
      payoutRequestId: component.payoutRequestId,
      payoutAllocationId: component.payoutAllocationId
    } as const,
    component: item(component.componentId, component.amount, component.fundingReservationRef),
    exactCapacity: component.sourceAllocation.sourceAmount,
    expectedConsumed: component.sourceAllocation.priorAllocatedAmount
  };
}

function item(
  componentId: string,
  amount: Money,
  requiredReservationRef: RefundFundingReservationAuthorityRef | null
): ExpectedRefundFundingComponent {
  return Object.freeze({ componentId, amount, requiredReservationRef });
}
function money(amountMinor: number): Money {
  return Object.freeze({ amountMinor, currency: "RUB" });
}
