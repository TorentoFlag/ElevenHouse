import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { FinancePostingIntegrityError } from "./posting-codec";
import { expectedRefundFundingSources } from "./refund-funding-allocation-map";
import {
  buildRefundFundingApprovalTransition,
  buildRefundFundingTerminalTransition
} from "./refund-funding-position-transition";
import type { RefundFundingSourceIdentity } from "./refund-funding-position-types";
import { readRefundPostingAllocationAuthority } from "./refund-posting-allocation-codec";
import {
  buildRefundPostingAllocationInput,
  refundPostingDecoderEnvelope
} from "./refund-posting-test-fixtures";

describe("refund funding positions", () => {
  it("reserves every exact source as a patch without advancing consumption", () => {
    const fixture = fundingFixture();
    const binding = buildRefundFundingApprovalTransition(
      {
        allocation: fixture.allocation,
        resolvedPositions: fixture.positions,
        reservationAuthorities: fixture.reservations,
        occurredAt: fixture.allocation.approvedAt
      },
      refundPostingDecoderEnvelope
    );

    expect(binding).toMatchObject({
      kind: "unverified_refund_funding_transition_binding",
      operation: "approved",
      positionMutationMode: "patch_existing_only",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified"
    });
    expect(binding.transitions).toHaveLength(6);
    expect(
      binding.transitions.every(
        (row) =>
          row.transition === "free_to_reserved" &&
          row.nextPosition.version === 1 &&
          row.nextPosition.consumedAmount.amountMinor === 0 &&
          row.nextPosition.reservedAmount.amountMinor === row.amount.amountMinor
      )
    ).toBe(true);
  });

  it("consumes the exact approved reservation and rejects terminal replay", () => {
    const fixture = fundingFixture();
    const approved = approve(fixture);
    const reservedPositions = approved.transitions.map((row) => row.nextPosition);
    const confirmed = buildRefundFundingTerminalTransition(
      {
        allocation: fixture.allocation,
        approvalTransitionBinding: approved,
        resolvedPositions: reservedPositions,
        terminalAuthority: confirmedAuthority(fixture.allocation)
      },
      refundPostingDecoderEnvelope
    );

    expect(confirmed.operation).toBe("confirmed");
    expect(
      confirmed.transitions.every(
        (row) =>
          row.transition === "reserved_to_consumed" &&
          row.nextPosition.version === 2 &&
          row.nextPosition.reservedAmount.amountMinor === 0 &&
          row.nextPosition.consumedAmount.amountMinor === row.amount.amountMinor
      )
    ).toBe(true);
    expectReason(
      () =>
        buildRefundFundingTerminalTransition(
          {
            allocation: fixture.allocation,
            approvalTransitionBinding: approved,
            resolvedPositions: confirmed.transitions.map((row) => row.nextPosition),
            terminalAuthority: confirmedAuthority(fixture.allocation)
          },
          refundPostingDecoderEnvelope
        ),
      "authority_mismatch"
    );
  });

  it("releases a failed reservation and permits an exact retry beyond version two", () => {
    const fixture = fundingFixture();
    const firstApproval = approve(fixture);
    const failed = buildRefundFundingTerminalTransition(
      {
        allocation: fixture.allocation,
        approvalTransitionBinding: firstApproval,
        resolvedPositions: firstApproval.transitions.map((row) => row.nextPosition),
        terminalAuthority: failedAuthority(fixture.allocation)
      },
      refundPostingDecoderEnvelope
    );
    expect(
      failed.transitions.every(
        (row) =>
          row.transition === "reserved_to_free" &&
          row.nextPosition.version === 2 &&
          row.nextPosition.freeAmount.amountMinor === row.nextPosition.capacity.amountMinor
      )
    ).toBe(true);

    const retryApproval = buildRefundFundingApprovalTransition(
      {
        allocation: fixture.allocation,
        resolvedPositions: failed.transitions.map((row) => row.nextPosition),
        reservationAuthorities: fixture.reservations,
        occurredAt: "2026-08-03T12:00:00Z"
      },
      refundPostingDecoderEnvelope
    );
    expect(retryApproval.transitions.every((row) => row.nextPosition.version === 3)).toBe(true);
    const retried = buildRefundFundingTerminalTransition(
      {
        allocation: fixture.allocation,
        approvalTransitionBinding: retryApproval,
        resolvedPositions: retryApproval.transitions.map((row) => row.nextPosition),
        terminalAuthority: confirmedAuthority(fixture.allocation, "2026-08-03T13:00:00Z")
      },
      refundPostingDecoderEnvelope
    );
    expect(retried.transitions.every((row) => row.nextPosition.version === 4)).toBe(true);
  });

  it("rejects reset, double reserve, source disappearance and hostile rows", () => {
    const fixture = fundingFixture();
    const approved = approve(fixture);
    expectReason(
      () =>
        buildRefundFundingApprovalTransition(
          {
            allocation: fixture.allocation,
            resolvedPositions: approved.transitions.map((row) => row.nextPosition),
            reservationAuthorities: fixture.reservations,
            occurredAt: "2026-08-03T12:00:00Z"
          },
          refundPostingDecoderEnvelope
        ),
      "authority_mismatch"
    );

    const missing = structuredClone(approved) as Record<string, unknown>;
    (missing.transitions as unknown[]).pop();
    resign(missing);
    expectReason(
      () =>
        buildRefundFundingTerminalTransition(
          {
            allocation: fixture.allocation,
            approvalTransitionBinding: missing,
            resolvedPositions: approved.transitions.map((row) => row.nextPosition),
            terminalAuthority: failedAuthority(fixture.allocation)
          },
          refundPostingDecoderEnvelope
        ),
      "authority_mismatch"
    );

    let traps = 0;
    const hostile = new Proxy(fixture.positions, {
      ownKeys() {
        traps += 1;
        throw new Error("must not execute");
      },
      getPrototypeOf() {
        traps += 1;
        throw new Error("must not execute");
      }
    });
    expectReason(
      () =>
        buildRefundFundingApprovalTransition(
          {
            allocation: fixture.allocation,
            resolvedPositions: hostile,
            reservationAuthorities: fixture.reservations,
            occurredAt: fixture.allocation.approvedAt
          },
          refundPostingDecoderEnvelope
        ),
      "invalid_shape"
    );
    expect(traps).toBe(0);
  });
});

function fundingFixture() {
  const allocation = readRefundPostingAllocationAuthority(
    buildRefundPostingAllocationInput(),
    refundPostingDecoderEnvelope
  );
  const sources = expectedRefundFundingSources(allocation);
  const positions = sources.map((source) =>
    position(
      source.source,
      source.exactCapacity?.amountMinor ?? source.amount.amountMinor,
      allocation.providerAccount,
      allocation.providerPaymentId
    )
  );
  const reservations = sources.flatMap((source, sourceIndex) => {
    const sourcePosition = positions[sourceIndex];
    if (!sourcePosition) throw new Error("missing position fixture");
    return source.components.map((component) =>
      Object.freeze({
        componentId: component.componentId,
        sourcePositionId: sourcePosition.positionId,
        reference:
          component.requiredReservationRef ??
          Object.freeze({
            kind: "payable_lot_operation_receipt" as const,
            evidenceId: `approval-receipt-${component.componentId}`,
            canonicalDigest: digest(`approval-receipt-${component.componentId}`)
          })
      })
    );
  });
  return { allocation, positions, reservations };
}

function approve(fixture: ReturnType<typeof fundingFixture>) {
  return buildRefundFundingApprovalTransition(
    {
      allocation: fixture.allocation,
      resolvedPositions: fixture.positions,
      reservationAuthorities: fixture.reservations,
      occurredAt: fixture.allocation.approvedAt
    },
    refundPostingDecoderEnvelope
  );
}

function position(
  source: RefundFundingSourceIdentity,
  capacity: number,
  providerAccount: unknown,
  providerPaymentId: string
) {
  const core = {
    kind: "unverified_refund_funding_position" as const,
    schemaVersion: 1 as const,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    positionId: `refund-funding-position:${hashFinanceCommandPayload(source)}`,
    source,
    providerAccount,
    providerPaymentId,
    currency: "RUB" as const,
    version: 0,
    capacity: money(capacity),
    freeAmount: money(capacity),
    reservedAmount: money(0),
    consumedAmount: money(0),
    activeReservation: null,
    updatedAt: "2026-08-03T00:00:00Z"
  };
  return Object.freeze({ ...core, positionDigest: hashFinanceCommandPayload(core) });
}

function confirmedAuthority(
  allocation: ReturnType<typeof readRefundPostingAllocationAuthority>,
  confirmedAt = "2026-08-03T11:00:00Z"
) {
  return {
    kind: "refund_confirmed" as const,
    authorityId: "refund-confirmed-funding",
    version: 1,
    refundId: allocation.refundId,
    providerAccountId: allocation.providerAccount.providerAccountId,
    providerPaymentId: allocation.providerPaymentId,
    providerRefundId: "provider-refund-funding",
    providerAmountBasis: "incremental" as const,
    providerRefundAmount: allocation.refundAmount,
    priorProviderTotalRefunded: allocation.priorCumulativeRefunded,
    nextProviderTotalRefunded: allocation.nextCumulativeRefunded,
    payableAmount: allocation.payableLotAmount,
    accountingAllocationId: allocation.authorityId,
    accountingAllocationVersion: allocation.version,
    canonicalEvidenceId: "refund-confirmed-funding-evidence",
    confirmedAt
  };
}

function failedAuthority(allocation: ReturnType<typeof readRefundPostingAllocationAuthority>) {
  return {
    kind: "refund_failed" as const,
    authorityId: "refund-failed-funding",
    version: 1,
    refundId: allocation.refundId,
    providerAccountId: allocation.providerAccount.providerAccountId,
    providerPaymentId: allocation.providerPaymentId,
    providerRefundId: "provider-refund-funding",
    providerRefundAmount: allocation.refundAmount,
    payableAmount: allocation.payableLotAmount,
    accountingAllocationId: allocation.authorityId,
    accountingAllocationVersion: allocation.version,
    failureCode: "provider_declined",
    canonicalEvidenceId: "refund-failed-funding-evidence",
    failedAt: "2026-08-03T11:00:00Z"
  };
}

function money(amountMinor: number) {
  return Object.freeze({ amountMinor, currency: "RUB" as const });
}

function digest(value: string) {
  return hashFinanceCommandPayload({ value });
}

function resign(input: Record<string, unknown>): void {
  const core = { ...input };
  delete core.bindingDigest;
  input.bindingDigest = hashFinanceCommandPayload(core);
}

function expectReason(action: () => unknown, reason: string): void {
  try {
    action();
    throw new Error("expected finance posting error");
  } catch (error) {
    expect(error).toBeInstanceOf(FinancePostingIntegrityError);
    expect((error as FinancePostingIntegrityError).reason).toBe(reason);
  }
}
