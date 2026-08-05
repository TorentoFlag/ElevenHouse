import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";

export type RefundSourceConsumptionIdentity =
  | Readonly<{ kind: "payable_lot"; rootLotId: string; sourceLotId: string }>
  | Readonly<{
      kind: "paid_payout_allocation" | "in_flight_payout_allocation";
      rootLotId: string;
      payableLotId: string;
      payoutRequestId: string;
      payoutAllocationId: string;
    }>
  | Readonly<{
      kind: "platform_journal_entry";
      transactionId: string;
      entryIndex: number;
      accountCode: "platform_commission_deferred" | "platform_commission_revenue";
    }>;

export type UnverifiedRefundSourceConsumptionTransition = Readonly<{
  positionId: string;
  expectedPositionVersion: number;
  nextPositionVersion: number;
  componentId: string;
  source: RefundSourceConsumptionIdentity;
  capacity: Money;
  consumedBefore: Money;
  allocationDelta: Money;
  consumedAfter: Money;
  remainingAfter: Money;
}>;

export type UnverifiedRefundSourceConsumptionBinding = Readonly<{
  kind: "unverified_refund_source_consumption_binding";
  schemaVersion: 1;
  bindingId: string;
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  allocationAuthorityRef: Readonly<{
    kind: "refund_posting_allocation_authority";
    authorityId: string;
    version: number;
    canonicalDigest: FinanceAuthorizationPayloadHash;
  }>;
  sourceTransitions: readonly UnverifiedRefundSourceConsumptionTransition[];
  observedAt: string;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;
