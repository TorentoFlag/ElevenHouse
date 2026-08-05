import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import {
  createRefundBridgePayoutFailedAuthority,
  createRefundBridgePayoutPaidAuthority,
  type RefundBridgePayoutFailedAuthority,
  type RefundBridgePayoutPaidAuthority
} from "../source-lots";
import {
  FinancePostingIntegrityError,
  readExactDataRecord,
  readFinancePostingDigest,
  readFinancePostingMoney,
  readFinancePostingSourceKey,
  readFinancePostingVersion,
  sameCanonicalFinancePostingValue
} from "./posting-codec";
import type { FinancePostingDecoderEnvelope } from "./posting-decoder-envelope";
import { projectRefundCumulativeTerminalPosition } from "./refund-cumulative-position";
import { readRefundPostingAllocationContext } from "./refund-posting-allocation-context";
import {
  assertRefundTerminalEvidenceMatchesAllocation,
  readUnverifiedRefundTerminalEvidenceBinding
} from "./refund-posting-evidence";
import { readRefundTerminalAuthority } from "./refund-posting-evidence-codec";
import type {
  RefundInFlightPayoutComponent,
  RefundPostingAllocationAuthorityV1,
  UnverifiedRefundTerminalEvidenceBindingV1
} from "./refund-posting-types";

export function readConfirmedBridgeContext(
  input: {
    readonly allocation: unknown;
    readonly resolvedPriorAllocation: unknown;
    readonly resolvedCumulativePosition: unknown;
    readonly fundingTransitionBinding: unknown;
    readonly confirmedTerminalAuthority: unknown;
    readonly confirmedEvidenceBinding: unknown;
  },
  envelope: FinancePostingDecoderEnvelope
) {
  const { allocation, resolvedCumulativePosition, fundingTransitionBinding } =
    readRefundPostingAllocationContext(input, envelope);
  assertRefundTerminalEvidenceMatchesAllocation(
    {
      allocation,
      binding: input.confirmedEvidenceBinding,
      terminalAuthority: input.confirmedTerminalAuthority
    },
    envelope
  );
  const terminal = readRefundTerminalAuthority(input.confirmedTerminalAuthority);
  const binding = readUnverifiedRefundTerminalEvidenceBinding(
    input.confirmedEvidenceBinding,
    envelope
  );
  if (terminal.kind !== "refund_confirmed" || binding.outcome.kind !== "succeeded") {
    throw new FinancePostingIntegrityError("evidence_mismatch");
  }
  if (fundingTransitionBinding.operation !== "confirmed") {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
  const cumulativePositionDecision = projectRefundCumulativeTerminalPosition(
    allocation,
    resolvedCumulativePosition,
    terminal
  );
  return Object.freeze({
    allocation,
    terminal,
    binding,
    fundingTransitionBinding,
    cumulativePositionDecision
  });
}

export function readBridgeFailedAuthority(input: unknown): RefundBridgePayoutFailedAuthority {
  const fields = readExactDataRecord(input, [
    "kind",
    "authorityId",
    "version",
    "refundId",
    "refundedOrderId",
    "payoutRequestId",
    "payoutAllocationId",
    "amount",
    "bridgeAllocationId",
    "bridgeAllocationVersion",
    "bridgeStatus",
    "accountingAllocationId",
    "accountingAllocationVersion",
    "confirmedRefundAuthorityId",
    "confirmedRefundAuthorityVersion",
    "confirmedRefundEvidenceId",
    "payoutOutcomeAuthority"
  ]);
  const amount = readFinancePostingMoney(fields.amount);
  try {
    return createRefundBridgePayoutFailedAuthority({
      ...fields,
      amount
    });
  } catch {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
}

export function readBridgePaidModelDecision(input: unknown) {
  try {
    const fields = readExactDataRecord(input, [
      "kind",
      "stateVersion",
      "stateDigest",
      "sourceKey",
      "authority"
    ]);
    if (fields.kind !== "no_lot_transition") throw mismatch();
    const authority = readBridgePaidAuthority(fields.authority);
    const sourceKey = readFinancePostingSourceKey(fields.sourceKey);
    if (
      sourceKey.kind !== "refund" ||
      sourceKey.operation !== "bridge_payout_paid" ||
      sourceKey.sourceId !== authority.bridgeAllocationId
    ) {
      throw mismatch();
    }
    return Object.freeze({
      kind: "no_lot_transition" as const,
      stateVersion: readFinancePostingVersion(fields.stateVersion),
      stateDigest: readFinancePostingDigest(fields.stateDigest),
      sourceKey,
      authority
    });
  } catch (error) {
    if (error instanceof FinancePostingIntegrityError) throw error;
    throw mismatch();
  }
}

function readBridgePaidAuthority(input: unknown): RefundBridgePayoutPaidAuthority {
  const fields = readExactDataRecord(input, [
    "kind",
    "authorityId",
    "version",
    "refundId",
    "refundedOrderId",
    "payoutRequestId",
    "payoutAllocationId",
    "amount",
    "bridgeAllocationId",
    "bridgeAllocationVersion",
    "bridgeStatus",
    "accountingAllocationId",
    "accountingAllocationVersion",
    "confirmedRefundAuthorityId",
    "confirmedRefundAuthorityVersion",
    "confirmedRefundEvidenceId",
    "payoutPaidAuthorityId",
    "payoutPaidAuthorityVersion",
    "bankReference",
    "canonicalEvidenceId",
    "decidedAt"
  ]);
  const amount = readFinancePostingMoney(fields.amount);
  try {
    return createRefundBridgePayoutPaidAuthority({
      ...fields,
      amount
    });
  } catch {
    throw new FinancePostingIntegrityError("authority_mismatch");
  }
}

export function matchBridgeAuthority(
  authority: RefundBridgePayoutFailedAuthority | RefundBridgePayoutPaidAuthority,
  context: Readonly<{
    allocation: RefundPostingAllocationAuthorityV1;
    terminal: ReturnType<typeof readRefundTerminalAuthority>;
    binding: UnverifiedRefundTerminalEvidenceBindingV1;
  }>
): RefundInFlightPayoutComponent {
  const { allocation, terminal, binding } = context;
  if (
    terminal.kind !== "refund_confirmed" ||
    authority.refundId !== allocation.refundId ||
    authority.refundedOrderId !== allocation.orderId ||
    authority.accountingAllocationId !== allocation.authorityId ||
    authority.accountingAllocationVersion !== allocation.version ||
    authority.confirmedRefundAuthorityId !== terminal.authorityId ||
    authority.confirmedRefundAuthorityVersion !== terminal.version ||
    authority.confirmedRefundEvidenceId !== terminal.canonicalEvidenceId ||
    binding.terminalAuthorityRef.authorityId !== terminal.authorityId
  ) {
    throw mismatch();
  }
  const component = allocation.inFlightPayoutComponents.find(
    (row) => row.bridgeAllocationRef.authorityId === authority.bridgeAllocationId
  );
  if (
    !component ||
    component.bridgeAllocationRef.version !== authority.bridgeAllocationVersion ||
    component.payoutRequestId !== authority.payoutRequestId ||
    component.payoutAllocationId !== authority.payoutAllocationId ||
    !sameCanonicalFinancePostingValue(component.amount, authority.amount)
  ) {
    throw mismatch();
  }
  return component;
}

export function buildBridgePaidCompositeEvidence(
  context: ReturnType<typeof readConfirmedBridgeContext>,
  decision: ReturnType<typeof readBridgePaidModelDecision>
) {
  const authority = decision.authority;
  const core = Object.freeze({
    kind: "refund_bridge_paid_composite_evidence" as const,
    schemaVersion: 1 as const,
    evidenceId: authority.canonicalEvidenceId,
    authorizationStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    allocationAuthorityRef: Object.freeze({
      kind: context.allocation.kind,
      authorityId: context.allocation.authorityId,
      version: context.allocation.version,
      canonicalDigest: context.allocation.allocationDigest
    }),
    confirmedTerminalAuthorityRef: context.binding.terminalAuthorityRef,
    confirmedOperationReceiptRef: context.binding.operationReceiptRef,
    bridgePaidAuthorityRef: Object.freeze({
      kind: authority.kind,
      authorityId: authority.authorityId,
      version: authority.version,
      canonicalDigest: hashFinanceCommandPayload(authority)
    }),
    modelDecisionRef: Object.freeze({
      stateVersion: decision.stateVersion,
      stateDigest: decision.stateDigest,
      sourceKey: decision.sourceKey
    })
  });
  return Object.freeze({ ...core, canonicalDigest: hashFinanceCommandPayload(core) });
}

function mismatch(): FinancePostingIntegrityError {
  return new FinancePostingIntegrityError("authority_mismatch");
}
