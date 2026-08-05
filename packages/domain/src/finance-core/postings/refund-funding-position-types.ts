import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { ArcProviderAccountIdentity } from "../provider-account";
import type {
  RefundFundingReservationRef,
  RefundPostingAuthorityRef,
  RefundPostingEvidenceRef
} from "./refund-posting-types";

export type RefundFundingSourceIdentity =
  | Readonly<{ kind: "payable_root_lot"; orderId: string; rootLotId: string }>
  | Readonly<{
      kind: "paid_payout_allocation" | "in_flight_payout_allocation";
      orderId: string;
      rootLotId: string;
      payableLotId: string;
      payoutRequestId: string;
      payoutAllocationId: string;
    }>
  | Readonly<{
      kind: "platform_journal_entry";
      orderId: string;
      transactionId: string;
      entryIndex: number;
      accountCode: "platform_commission_deferred" | "platform_commission_revenue";
    }>;

export type RefundFundingReservationAuthorityRef =
  | RefundPostingEvidenceRef<"payable_lot_operation_receipt">
  | RefundFundingReservationRef;

export type RefundFundingPositionRef = Readonly<{
  kind: "unverified_refund_funding_position";
  positionId: string;
  version: number;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type RefundFundingComponentReservation = Readonly<{
  componentId: string;
  reservationAuthorityRef: RefundFundingReservationAuthorityRef;
  amount: Money;
}>;

export type RefundFundingActiveReservation = Readonly<{
  allocationAuthorityRef: RefundPostingAuthorityRef<"refund_posting_allocation_authority">;
  components: readonly RefundFundingComponentReservation[];
  totalAmount: Money;
  reservedAt: string;
}>;

export type UnverifiedRefundFundingPosition = Readonly<{
  kind: "unverified_refund_funding_position";
  schemaVersion: 1;
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  positionId: string;
  source: RefundFundingSourceIdentity;
  providerAccount: ArcProviderAccountIdentity;
  providerPaymentId: string;
  currency: "RUB";
  version: number;
  capacity: Money;
  freeAmount: Money;
  reservedAmount: Money;
  consumedAmount: Money;
  activeReservation: RefundFundingActiveReservation | null;
  updatedAt: string;
  positionDigest: FinanceAuthorizationPayloadHash;
}>;

export type RefundFundingPositionTransition = Readonly<{
  source: RefundFundingSourceIdentity;
  components: readonly RefundFundingComponentReservation[];
  amount: Money;
  transition: "free_to_reserved" | "reserved_to_consumed" | "reserved_to_free";
  expectedPositionRef: RefundFundingPositionRef;
  nextPosition: UnverifiedRefundFundingPosition;
}>;

export type RefundFundingTransitionBindingRef = Readonly<{
  kind: "unverified_refund_funding_transition_binding";
  bindingId: string;
  operation: "approved" | "confirmed" | "failed";
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type UnverifiedRefundFundingTransitionBinding = Readonly<{
  kind: "unverified_refund_funding_transition_binding";
  schemaVersion: 1;
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  bindingId: string;
  operation: "approved" | "confirmed" | "failed";
  positionMutationMode: "patch_existing_only";
  allocationAuthorityRef: RefundPostingAuthorityRef<"refund_posting_allocation_authority">;
  priorTransitionBindingRef: RefundFundingTransitionBindingRef | null;
  terminalAuthorityRef: RefundPostingAuthorityRef<"refund_confirmed" | "refund_failed"> | null;
  transitions: readonly RefundFundingPositionTransition[];
  occurredAt: string;
  bindingDigest: FinanceAuthorizationPayloadHash;
}>;

export type RefundFundingReservationAuthorityBinding = Readonly<{
  componentId: string;
  sourcePositionId: string;
  reference: RefundFundingReservationAuthorityRef;
}>;
