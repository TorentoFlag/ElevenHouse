import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import type { Money } from "../../money";
import type { RefundConfirmedAuthority, RefundFailedAuthority } from "../source-lot-types";
import {
  compareFinancePostingInstants,
  FinancePostingIntegrityError,
  readExactDataArray,
  readExactDataRecord,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import {
  normalizeFinancePostingDecoderEnvelope,
  type FinancePostingDecoderEnvelope
} from "./posting-decoder-envelope";
import { refundFundingAllocationRef } from "./refund-funding-allocation-map";
import {
  buildRefundFundingNextPosition,
  readUnverifiedRefundFundingPosition,
  refundFundingPositionRef
} from "./refund-funding-position-codec";
import type {
  RefundFundingPositionTransition,
  RefundFundingTransitionBindingRef,
  UnverifiedRefundFundingPosition,
  UnverifiedRefundFundingTransitionBinding
} from "./refund-funding-position-types";
import { readUnverifiedRefundFundingTransitionBinding } from "./refund-funding-transition-codec";
import { readRefundPostingAllocationAuthority } from "./refund-posting-allocation-codec";
import { readRefundTerminalAuthority } from "./refund-posting-evidence-codec";

export function buildRefundFundingTerminalTransition(
  input: unknown,
  envelopeInput: FinancePostingDecoderEnvelope
): UnverifiedRefundFundingTransitionBinding {
  const envelope = normalizeFinancePostingDecoderEnvelope(envelopeInput);
  const fields = readExactDataRecord(input, [
    "allocation",
    "approvalTransitionBinding",
    "resolvedPositions",
    "terminalAuthority"
  ]);
  const allocation = readRefundPostingAllocationAuthority(fields.allocation, envelope);
  const approval = readUnverifiedRefundFundingTransitionBinding(
    fields.approvalTransitionBinding,
    envelope
  );
  assertApprovalScope(approval, allocation);
  const terminal = readRefundTerminalAuthority(fields.terminalAuthority);
  assertTerminalScope(terminal, allocation);
  const positions = readExactDataArray(
    fields.resolvedPositions,
    approval.transitions.length,
    envelope.maxAllocations
  ).map((row) => readUnverifiedRefundFundingPosition(row, envelope));
  if (positions.length !== approval.transitions.length) mismatch();
  const positionById = uniqueMap(positions);
  const operation = terminal.kind === "refund_confirmed" ? "confirmed" : "failed";
  const occurredAt =
    terminal.kind === "refund_confirmed" ? terminal.confirmedAt : terminal.failedAt;
  const transitions = Object.freeze(
    approval.transitions.map((prior) =>
      buildTerminalTransition(
        prior,
        positionById.get(prior.nextPosition.positionId),
        operation,
        occurredAt
      )
    )
  );
  if (transitions.length !== positionById.size) mismatch();
  const terminalAuthorityRef = Object.freeze({
    kind: terminal.kind,
    authorityId: terminal.authorityId,
    version: terminal.version,
    canonicalDigest: hashFinanceCommandPayload(terminal)
  });
  const priorTransitionBindingRef: RefundFundingTransitionBindingRef = Object.freeze({
    kind: approval.kind,
    bindingId: approval.bindingId,
    operation: approval.operation,
    canonicalDigest: approval.bindingDigest
  });
  const bindingIdentity = {
    allocationAuthorityRef: approval.allocationAuthorityRef,
    operation,
    priorTransitionBindingRef,
    terminalAuthorityRef
  };
  const core = Object.freeze({
    kind: "unverified_refund_funding_transition_binding" as const,
    schemaVersion: 1 as const,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    bindingId: `refund-funding-binding:${hashFinanceCommandPayload(bindingIdentity)}`,
    operation,
    positionMutationMode: "patch_existing_only" as const,
    allocationAuthorityRef: approval.allocationAuthorityRef,
    priorTransitionBindingRef,
    terminalAuthorityRef,
    transitions,
    occurredAt
  });
  return Object.freeze({ ...core, bindingDigest: hashFinanceCommandPayload(core) });
}

function buildTerminalTransition(
  prior: UnverifiedRefundFundingTransitionBinding["transitions"][number],
  position: UnverifiedRefundFundingPosition | undefined,
  operation: "confirmed" | "failed",
  occurredAt: string
): RefundFundingPositionTransition {
  if (
    !position ||
    !sameCanonicalFinancePostingValue(position, prior.nextPosition) ||
    position.activeReservation === null ||
    !sameCanonicalFinancePostingValue(position.activeReservation.components, prior.components) ||
    !sameCanonicalFinancePostingValue(position.activeReservation.totalAmount, prior.amount) ||
    position.reservedAmount.amountMinor !== prior.amount.amountMinor
  ) {
    mismatch();
  }
  if (compareFinancePostingInstants(occurredAt, position.updatedAt) < 0) {
    throw new FinancePostingIntegrityError("invalid_chronology");
  }
  const confirmed = operation === "confirmed";
  const nextPosition = buildRefundFundingNextPosition(
    position,
    {
      free: confirmed
        ? position.freeAmount
        : money(position.freeAmount.amountMinor + prior.amount.amountMinor),
      reserved: money(0),
      consumed: confirmed
        ? money(position.consumedAmount.amountMinor + prior.amount.amountMinor)
        : position.consumedAmount
    },
    null,
    occurredAt
  );
  return Object.freeze({
    source: prior.source,
    components: prior.components,
    amount: prior.amount,
    transition: confirmed ? "reserved_to_consumed" : "reserved_to_free",
    expectedPositionRef: refundFundingPositionRef(position),
    nextPosition
  });
}

function assertApprovalScope(
  approval: UnverifiedRefundFundingTransitionBinding,
  allocation: ReturnType<typeof readRefundPostingAllocationAuthority>
): void {
  if (
    approval.operation !== "approved" ||
    !sameCanonicalFinancePostingValue(
      approval.allocationAuthorityRef,
      refundFundingAllocationRef(allocation)
    ) ||
    compareFinancePostingInstants(approval.occurredAt, allocation.approvedAt) < 0
  ) {
    mismatch();
  }
}

function assertTerminalScope(
  terminal: RefundConfirmedAuthority | RefundFailedAuthority,
  allocation: ReturnType<typeof readRefundPostingAllocationAuthority>
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

function uniqueMap(rows: readonly UnverifiedRefundFundingPosition[]) {
  const result = new Map<string, UnverifiedRefundFundingPosition>();
  for (const row of rows) {
    if (result.has(row.positionId)) mismatch();
    result.set(row.positionId, row);
  }
  return result;
}

function money(amountMinor: number): Money {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) mismatch();
  return Object.freeze({ amountMinor, currency: "RUB" });
}
function mismatch(): never {
  throw new FinancePostingIntegrityError("authority_mismatch");
}
