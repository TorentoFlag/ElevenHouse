import type { FinanceAuthorizationPayloadHash } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { ArcProviderAccountIdentity } from "../provider-account";
import type { RefundPostingAuthorityRef } from "./refund-posting-authority-ref";

export type RefundCumulativePositionRef = Readonly<{
  kind: "refund_cumulative_position";
  positionId: string;
  version: number;
  confirmedCumulativeRefunded: Money;
  confirmedCumulativePayableReversed: Money;
  confirmedCumulativePlatformReversed: Money;
  canonicalDigest: FinanceAuthorizationPayloadHash;
}>;

export type UnverifiedRefundCumulativePosition = Readonly<{
  kind: "refund_cumulative_position";
  schemaVersion: 1;
  authorizationStatus: "unverified";
  atomicityStatus: "unverified";
  digestPurpose: "drift_detection_only";
  positionId: string;
  providerAccount: ArcProviderAccountIdentity;
  providerPaymentId: string;
  currency: "RUB";
  version: number;
  confirmedCumulativeRefunded: Money;
  confirmedCumulativePayableReversed: Money;
  confirmedCumulativePlatformReversed: Money;
  lastConfirmedAllocationRef: RefundPostingAuthorityRef<"refund_posting_allocation_authority"> | null;
  lastConfirmedTerminalAuthorityRef: RefundPostingAuthorityRef<"refund_confirmed"> | null;
  updatedAt: string;
  positionDigest: FinanceAuthorizationPayloadHash;
}>;

export type RefundCumulativePositionDecision =
  | Readonly<{
      kind: "refund_cumulative_position_decision";
      operation: "approved" | "failed";
      authorizationStatus: "unverified";
      atomicityStatus: "unverified";
      transition: "unchanged";
      expectedPositionRef: RefundCumulativePositionRef;
    }>
  | Readonly<{
      kind: "refund_cumulative_position_decision";
      operation: "confirmed";
      authorizationStatus: "unverified";
      atomicityStatus: "unverified";
      transition: "advance";
      expectedPositionRef: RefundCumulativePositionRef;
      providerOutcomeAuthorityRef: RefundPostingAuthorityRef<"refund_confirmed">;
      nextPosition: UnverifiedRefundCumulativePosition;
    }>;
