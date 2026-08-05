import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { allocateBps } from "../../money";
import type { RefundApprovalAuthority } from "../source-lot-types";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingIdentifier,
  readFinancePostingVersion
} from "./posting-codec";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";
import { assertRefundPostingPriorAllocationRef } from "./refund-posting-prior-allocation";

export function assertRefundPostingAllocationIntegrity(
  allocation: RefundPostingAllocationAuthorityV1
): void {
  assertRefundPostingPriorAllocationRef(allocation);
  const e = allocation.orderEconomics;
  if (
    e.orderId !== allocation.orderId ||
    e.astrologerUserId !== allocation.astrologerUserId ||
    allocation.orderEconomicsDigest !== hashFinanceCommandPayload(e) ||
    !same(allocation.capturedGross, e.gross) ||
    !same(allocation.capturedPayable, e.payable) ||
    !same(allocation.capturedPlatformCommission, e.commission) ||
    BigInt(e.gross.amountMinor) !== BigInt(e.payable.amountMinor) + BigInt(e.commission.amountMinor)
  )
    fail("authority_mismatch");
  const prior = allocation.priorCumulativeRefunded.amountMinor;
  const next = allocation.nextCumulativeRefunded.amountMinor;
  if (
    prior < 0 ||
    prior >= next ||
    next > e.gross.amountMinor ||
    next - prior !== allocation.refundAmount.amountMinor
  ) {
    fail("authority_mismatch");
  }
  const priorTargets = allocateBps({ amountMinor: prior, bps: e.commissionBps });
  const nextTargets = allocateBps({ amountMinor: next, bps: e.commissionBps });
  if (
    allocation.priorCumulativePlatformReversed.amountMinor !== priorTargets.feeMinor ||
    allocation.nextCumulativePlatformReversed.amountMinor !== nextTargets.feeMinor ||
    allocation.priorCumulativePayableReversed.amountMinor !== priorTargets.remainderMinor ||
    allocation.nextCumulativePayableReversed.amountMinor !== nextTargets.remainderMinor
  )
    fail("authority_mismatch");
  const payableDelta = nextTargets.remainderMinor - priorTargets.remainderMinor;
  const platformDelta = nextTargets.feeMinor - priorTargets.feeMinor;
  if (
    platformDelta !== allocation.platformCommissionAmount.amountMinor ||
    BigInt(payableDelta) !==
      BigInt(allocation.payableLotAmount.amountMinor) +
        BigInt(allocation.alreadyPaidAmount.amountMinor) +
        BigInt(allocation.inFlightPayoutAmount.amountMinor) ||
    BigInt(allocation.refundAmount.amountMinor) !== BigInt(payableDelta) + BigInt(platformDelta)
  )
    fail("authority_mismatch");
  assertComponentCollection(allocation);
}

export function assertRefundPostingAllocationMatchesApproval(
  allocation: RefundPostingAllocationAuthorityV1,
  input: unknown
): void {
  const approval = readApproval(input);
  const ref = allocation.refundApprovalAuthorityRef;
  if (
    ref.authorityId !== approval.authorityId ||
    ref.version !== approval.version ||
    ref.canonicalDigest !== hashFinanceCommandPayload(approval) ||
    approval.refundId !== allocation.refundId ||
    approval.orderId !== allocation.orderId ||
    approval.astrologerUserId !== allocation.astrologerUserId ||
    approval.accountingAllocationId !== allocation.authorityId ||
    approval.accountingAllocationVersion !== allocation.version
  )
    fail("authority_mismatch");
  if (!same(approval.payableAmount, allocation.payableLotAmount)) fail("amount_mismatch");
}

function assertComponentCollection(a: RefundPostingAllocationAuthorityV1): void {
  const groups = [
    a.payableComponents,
    a.alreadyPaidComponents,
    a.inFlightPayoutComponents,
    a.platformCommissionComponents
  ] as const;
  const expected = [
    a.payableLotAmount,
    a.alreadyPaidAmount,
    a.inFlightPayoutAmount,
    a.platformCommissionAmount
  ] as const;
  const componentIds = new Set<string>([a.providerClearingComponentId]);
  const sourceLots = new Set<string>();
  const payoutAllocations = new Set<string>();
  const reservations = new Set<string>();
  const bridges = new Set<string>();
  const platformSources = new Set<string>();
  groups.forEach((rows, index) => {
    if (
      (expected[index]?.amountMinor === 0) !== (rows.length === 0) ||
      sum(rows) !== BigInt(expected[index]?.amountMinor ?? -1)
    )
      fail("authority_mismatch");
    let previous = "";
    for (const row of rows) {
      if (row.componentId <= previous || componentIds.has(row.componentId))
        fail("authority_mismatch");
      previous = row.componentId;
      componentIds.add(row.componentId);
      if (row.kind === "payable_lot") {
        unique(sourceLots, row.sourceLotId);
        unique(sourceLots, row.refundPendingLotId);
        if (row.payoutAllocationId !== null) unique(payoutAllocations, row.payoutAllocationId);
      } else {
        assertSourceAllocation(row.sourceAllocation, row.amount.amountMinor);
        unique(reservations, row.fundingReservationRef.reservationId);
        if (row.kind === "platform_commission")
          unique(
            platformSources,
            `${row.sourceJournalTransactionId}:${row.sourceJournalEntryIndex}`
          );
        else {
          unique(sourceLots, row.payableLotId);
          unique(payoutAllocations, row.payoutAllocationId);
          if (row.kind === "in_flight_payout") unique(bridges, row.bridgeAllocationRef.authorityId);
        }
      }
    }
  });
}

function assertSourceAllocation(
  source: {
    sourceAmount: { amountMinor: number };
    priorAllocatedAmount: { amountMinor: number };
    nextAllocatedAmount: { amountMinor: number };
  },
  delta: number
): void {
  if (
    source.priorAllocatedAmount.amountMinor > source.nextAllocatedAmount.amountMinor ||
    source.nextAllocatedAmount.amountMinor > source.sourceAmount.amountMinor ||
    source.nextAllocatedAmount.amountMinor - source.priorAllocatedAmount.amountMinor !== delta
  )
    fail("authority_mismatch");
}

function readApproval(input: unknown): RefundApprovalAuthority {
  const f = readExactDataRecord(input, [
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
  const m = readExactDataRecord(f.payableAmount, ["amountMinor", "currency"]);
  if (
    f.kind !== "refund_approval" ||
    f.fundingStatus !== "fully_funded" ||
    m.currency !== "RUB" ||
    !Number.isSafeInteger(m.amountMinor) ||
    (m.amountMinor as number) < 0
  )
    fail("authority_mismatch");
  return Object.freeze({
    kind: "refund_approval",
    authorityId: readFinancePostingIdentifier(f.authorityId),
    version: readFinancePostingVersion(f.version),
    refundId: readFinancePostingIdentifier(f.refundId),
    orderId: readFinancePostingIdentifier(f.orderId),
    astrologerUserId: readFinancePostingIdentifier(f.astrologerUserId),
    payableAmount: Object.freeze({ amountMinor: m.amountMinor as number, currency: "RUB" }),
    accountingAllocationId: readFinancePostingIdentifier(f.accountingAllocationId),
    accountingAllocationVersion: readFinancePostingVersion(f.accountingAllocationVersion),
    fundingStatus: "fully_funded"
  });
}

function sum(rows: readonly { amount: { amountMinor: number } }[]): bigint {
  return rows.reduce((total, row) => total + BigInt(row.amount.amountMinor), 0n);
}
function same(
  left: { amountMinor: number; currency: string },
  right: { amountMinor: number; currency: string }
): boolean {
  return left.amountMinor === right.amountMinor && left.currency === right.currency;
}
function unique(values: Set<string>, value: string): void {
  if (values.has(value)) fail("authority_mismatch");
  values.add(value);
}
function fail(reason: "authority_mismatch" | "amount_mismatch"): never {
  throw new FinancePostingIntegrityError(reason);
}
