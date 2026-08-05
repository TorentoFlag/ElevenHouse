import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { RefundConfirmedAuthority, RefundFailedAuthority } from "../source-lot-types";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import {
  assertRefundCumulativePositionMatchesAllocation,
  refundCumulativePositionRef
} from "./refund-cumulative-position-codec";
import type {
  RefundCumulativePositionDecision,
  UnverifiedRefundCumulativePosition
} from "./refund-cumulative-position-types";
import { readRefundTerminalAuthority } from "./refund-posting-evidence-codec";
import type { RefundPostingAllocationAuthorityV1 } from "./refund-posting-types";

export function projectRefundCumulativeApprovalPosition(
  allocation: RefundPostingAllocationAuthorityV1,
  position: UnverifiedRefundCumulativePosition
): RefundCumulativePositionDecision {
  assertRefundCumulativePositionMatchesAllocation(position, allocation);
  return unchangedDecision("approved", position);
}

export function projectRefundCumulativeTerminalPosition(
  allocation: RefundPostingAllocationAuthorityV1,
  position: UnverifiedRefundCumulativePosition,
  terminalInput: unknown
): RefundCumulativePositionDecision {
  assertRefundCumulativePositionMatchesAllocation(position, allocation);
  const terminal = readRefundTerminalAuthority(terminalInput);
  assertTerminalScope(terminal, allocation);
  if (terminal.kind === "refund_failed") return unchangedDecision("failed", position);
  assertConfirmedTotals(terminal, allocation, position);
  const { positionDigest: priorDigest, ...priorCore } = position;
  void priorDigest;
  const core = Object.freeze({
    ...priorCore,
    version: position.version + 1,
    confirmedCumulativeRefunded: allocation.nextCumulativeRefunded,
    confirmedCumulativePayableReversed: allocation.nextCumulativePayableReversed,
    confirmedCumulativePlatformReversed: allocation.nextCumulativePlatformReversed,
    lastConfirmedAllocationRef: Object.freeze({
      kind: allocation.kind,
      authorityId: allocation.authorityId,
      version: allocation.version,
      canonicalDigest: allocation.allocationDigest
    }),
    lastConfirmedTerminalAuthorityRef: terminalRef(terminal),
    updatedAt: terminal.confirmedAt
  });
  const nextPosition = Object.freeze({
    ...core,
    positionDigest: hashFinanceCommandPayload(core)
  });
  return Object.freeze({
    kind: "refund_cumulative_position_decision" as const,
    operation: "confirmed" as const,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    transition: "advance" as const,
    expectedPositionRef: refundCumulativePositionRef(position),
    providerOutcomeAuthorityRef: terminalRef(terminal),
    nextPosition
  });
}

function assertTerminalScope(
  terminal: RefundConfirmedAuthority | RefundFailedAuthority,
  allocation: RefundPostingAllocationAuthorityV1
): void {
  const occurredAt =
    terminal.kind === "refund_confirmed" ? terminal.confirmedAt : terminal.failedAt;
  if (
    terminal.refundId !== allocation.refundId ||
    terminal.providerAccountId !== allocation.providerAccount.providerAccountId ||
    terminal.providerPaymentId !== allocation.providerPaymentId ||
    terminal.accountingAllocationId !== allocation.authorityId ||
    terminal.accountingAllocationVersion !== allocation.version ||
    !sameCanonicalFinancePostingValue(terminal.providerRefundAmount, allocation.refundAmount) ||
    !sameCanonicalFinancePostingValue(terminal.payableAmount, allocation.payableLotAmount)
  ) {
    mismatch();
  }
  if (compareFinancePostingInstants(occurredAt, allocation.approvedAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
}

function assertConfirmedTotals(
  terminal: RefundConfirmedAuthority,
  allocation: RefundPostingAllocationAuthorityV1,
  position: UnverifiedRefundCumulativePosition
): void {
  if (
    !sameCanonicalFinancePostingValue(
      terminal.priorProviderTotalRefunded,
      position.confirmedCumulativeRefunded
    ) ||
    !sameCanonicalFinancePostingValue(
      terminal.priorProviderTotalRefunded,
      allocation.priorCumulativeRefunded
    ) ||
    !sameCanonicalFinancePostingValue(
      terminal.nextProviderTotalRefunded,
      allocation.nextCumulativeRefunded
    )
  ) {
    throw new FinancePostingIntegrityError("amount_mismatch");
  }
}

function unchangedDecision(
  operation: "approved" | "failed",
  position: UnverifiedRefundCumulativePosition
): RefundCumulativePositionDecision {
  return Object.freeze({
    kind: "refund_cumulative_position_decision" as const,
    operation,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    transition: "unchanged" as const,
    expectedPositionRef: refundCumulativePositionRef(position)
  });
}

function terminalRef(terminal: RefundConfirmedAuthority) {
  return Object.freeze({
    kind: terminal.kind,
    authorityId: terminal.authorityId,
    version: terminal.version,
    canonicalDigest: hashFinanceCommandPayload(terminal)
  });
}

function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
