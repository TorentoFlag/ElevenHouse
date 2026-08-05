import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { RefundConfirmedAuthority, RefundFailedAuthority } from "../source-lot-types";
import { expectedRefundFundingSources } from "./refund-funding-allocation-map";
import {
  buildRefundFundingApprovalTransition,
  buildRefundFundingTerminalTransition
} from "./refund-funding-position-transition";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";
import { refundPostingDecoderEnvelope } from "./refund-posting-test-fixtures";

export function buildRefundCumulativePositionInput(input: {
  providerAccount: RefundPostingAllocationAuthorityV1["providerAccount"];
  providerPaymentId: string;
  updatedAt: string;
}) {
  const identity = {
    providerAccount: input.providerAccount,
    providerPaymentId: input.providerPaymentId,
    currency: "RUB" as const
  };
  const core = {
    kind: "refund_cumulative_position" as const,
    schemaVersion: 1 as const,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    positionId: `refund-cumulative-position:${hashFinanceCommandPayload(identity)}`,
    ...identity,
    version: 0,
    confirmedCumulativeRefunded: money(0),
    confirmedCumulativePayableReversed: money(0),
    confirmedCumulativePlatformReversed: money(0),
    lastConfirmedAllocationRef: null,
    lastConfirmedTerminalAuthorityRef: null,
    updatedAt: input.updatedAt
  };
  return Object.freeze({ ...core, positionDigest: hashFinanceCommandPayload(core) });
}

export function cumulativePositionRef(
  position: ReturnType<typeof buildRefundCumulativePositionInput>
) {
  return Object.freeze({
    kind: position.kind,
    positionId: position.positionId,
    version: position.version,
    confirmedCumulativeRefunded: position.confirmedCumulativeRefunded,
    confirmedCumulativePayableReversed: position.confirmedCumulativePayableReversed,
    confirmedCumulativePlatformReversed: position.confirmedCumulativePlatformReversed,
    canonicalDigest: position.positionDigest
  });
}

export function buildRefundFundingApprovalFixture(allocation: RefundPostingAllocationAuthorityV1) {
  const rows = expectedRefundFundingSources(allocation);
  const positions = rows.map((row) => fundingPosition(row, allocation));
  const reservationAuthorities = rows.flatMap((row, rowIndex) => {
    const position = positions[rowIndex];
    if (!position) throw new Error("missing funding position fixture");
    return row.components.map((component) =>
      Object.freeze({
        componentId: component.componentId,
        sourcePositionId: position.positionId,
        reference:
          component.requiredReservationRef ??
          Object.freeze({
            kind: "payable_lot_operation_receipt" as const,
            evidenceId: `funding-receipt-${component.componentId}`,
            canonicalDigest: hashFinanceCommandPayload({
              componentId: component.componentId,
              allocationId: allocation.authorityId
            })
          })
      })
    );
  });
  const binding = buildRefundFundingApprovalTransition(
    {
      allocation,
      resolvedPositions: positions,
      reservationAuthorities,
      occurredAt: allocation.approvedAt
    },
    refundPostingDecoderEnvelope
  );
  return Object.freeze({ positions: Object.freeze(positions), reservationAuthorities, binding });
}

export function buildRefundFundingTerminalFixture(
  allocation: RefundPostingAllocationAuthorityV1,
  approvalBinding: ReturnType<typeof buildRefundFundingApprovalTransition>,
  terminalAuthority: RefundConfirmedAuthority | RefundFailedAuthority
) {
  return buildRefundFundingTerminalTransition(
    {
      allocation,
      approvalTransitionBinding: approvalBinding,
      resolvedPositions: approvalBinding.transitions.map((row) => row.nextPosition),
      terminalAuthority
    },
    refundPostingDecoderEnvelope
  );
}

function fundingPosition(
  expected: ReturnType<typeof expectedRefundFundingSources>[number],
  allocation: RefundPostingAllocationAuthorityV1
) {
  const source = expected.source;
  const capacity = expected.exactCapacity?.amountMinor ?? expected.amount.amountMinor;
  const consumed = expected.expectedConsumed?.amountMinor ?? 0;
  const core = {
    kind: "unverified_refund_funding_position" as const,
    schemaVersion: 1 as const,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    positionId: `refund-funding-position:${hashFinanceCommandPayload(source)}`,
    source,
    providerAccount: allocation.providerAccount,
    providerPaymentId: allocation.providerPaymentId,
    currency: "RUB" as const,
    version: 0,
    capacity: money(capacity),
    freeAmount: money(capacity - consumed),
    reservedAmount: money(0),
    consumedAmount: money(consumed),
    activeReservation: null,
    updatedAt: allocation.approvedAt
  };
  return Object.freeze({ ...core, positionDigest: hashFinanceCommandPayload(core) });
}

function money(amountMinor: number) {
  return Object.freeze({ amountMinor, currency: "RUB" as const });
}
