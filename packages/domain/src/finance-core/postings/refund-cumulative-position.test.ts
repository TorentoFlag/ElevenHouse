import { describe, expect, it } from "vitest";
import { hashFinanceCommandPayload } from "../../finance-authorization/canonical-command-payload";
import { FinancePostingIntegrityError } from "./posting-codec";
import { readRefundPostingAllocationAuthority } from "./refund-posting-allocation-codec";
import {
  projectRefundCumulativeApprovalPosition,
  projectRefundCumulativeTerminalPosition,
  readAndAssertRefundCumulativePosition
} from "./refund-cumulative-position";
import {
  buildRefundPostingAllocationInput,
  refundPostingDecoderEnvelope,
  withAllocationDigest
} from "./refund-posting-test-fixtures";

describe("refund cumulative position", () => {
  it("binds approval to the exact zero confirmed position without advancing it", () => {
    const fixture = cumulativeFixture();
    const decision = projectRefundCumulativeApprovalPosition(fixture.allocation, fixture.position);

    expect(decision).toEqual({
      kind: "refund_cumulative_position_decision",
      operation: "approved",
      authorizationStatus: "unverified",
      atomicityStatus: "unverified",
      transition: "unchanged",
      expectedPositionRef: positionRef(fixture.position)
    });
  });

  it("advances v1 and v2 only from exact provider prior and next totals", () => {
    const first = cumulativeFixture();
    const firstDecision = projectRefundCumulativeTerminalPosition(
      first.allocation,
      first.position,
      confirmedAuthority(first.allocation, "confirmed-1", "2026-08-03T11:00:00Z")
    );
    expect(firstDecision.transition).toBe("advance");
    if (firstDecision.transition !== "advance") throw new Error("expected advance");
    expect(firstDecision.nextPosition).toMatchObject({
      version: 1,
      confirmedCumulativeRefunded: { amountMinor: 2_500, currency: "RUB" },
      confirmedCumulativePayableReversed: { amountMinor: 2_400, currency: "RUB" },
      confirmedCumulativePlatformReversed: { amountMinor: 100, currency: "RUB" }
    });

    const secondRaw = structuredClone(buildRefundPostingAllocationInput()) as Record<
      string,
      unknown
    >;
    secondRaw.authorityId = "refund-allocation-2";
    secondRaw.version = 2;
    secondRaw.refundId = "refund-2";
    secondRaw.providerIntentId = "refund-intent-2";
    secondRaw.approvedAt = "2026-08-03T12:00:00Z";
    secondRaw.priorAllocationAuthorityRef = allocationRef(first.allocation);
    secondRaw.confirmedCumulativePositionRef = positionRef(firstDecision.nextPosition);
    secondRaw.priorCumulativeRefunded = money(2_500);
    secondRaw.nextCumulativeRefunded = money(5_000);
    secondRaw.priorCumulativePayableReversed = money(2_400);
    secondRaw.nextCumulativePayableReversed = money(4_800);
    secondRaw.priorCumulativePlatformReversed = money(100);
    secondRaw.nextCumulativePlatformReversed = money(200);
    const second = readRefundPostingAllocationAuthority(
      withAllocationDigest(secondRaw),
      refundPostingDecoderEnvelope
    );
    const resolved = readAndAssertRefundCumulativePosition(
      firstDecision.nextPosition,
      second,
      refundPostingDecoderEnvelope
    );
    const secondDecision = projectRefundCumulativeTerminalPosition(
      second,
      resolved,
      confirmedAuthority(second, "confirmed-2", "2026-08-03T13:00:00Z")
    );
    expect(secondDecision.transition).toBe("advance");
    if (secondDecision.transition !== "advance") throw new Error("expected advance");
    expect(secondDecision.nextPosition.version).toBe(2);
    expect(secondDecision.nextPosition.confirmedCumulativeRefunded.amountMinor).toBe(5_000);
  });

  it("keeps the position unchanged after failure so a later allocation can retry", () => {
    const first = cumulativeFixture();
    const failure = projectRefundCumulativeTerminalPosition(
      first.allocation,
      first.position,
      failedAuthority(first.allocation)
    );
    expect(failure).toMatchObject({
      operation: "failed",
      transition: "unchanged",
      expectedPositionRef: positionRef(first.position)
    });

    const retryRaw = structuredClone(buildRefundPostingAllocationInput()) as Record<
      string,
      unknown
    >;
    retryRaw.authorityId = "refund-allocation-retry";
    retryRaw.version = 2;
    retryRaw.refundId = "refund-retry";
    retryRaw.providerIntentId = "refund-intent-retry";
    retryRaw.approvedAt = "2026-08-03T12:00:00Z";
    retryRaw.priorAllocationAuthorityRef = allocationRef(first.allocation);
    retryRaw.confirmedCumulativePositionRef = positionRef(first.position);
    const retry = readRefundPostingAllocationAuthority(
      withAllocationDigest(retryRaw),
      refundPostingDecoderEnvelope
    );

    expect(() =>
      readAndAssertRefundCumulativePosition(first.position, retry, refundPostingDecoderEnvelope)
    ).not.toThrow();
  });

  it("rejects a re-signed position or provider outcome that skips the allocation target", () => {
    const fixture = cumulativeFixture();
    const forgedPosition = {
      ...fixture.position,
      version: 1,
      positionDigest: fixture.position.positionDigest
    };
    expectReason(
      () =>
        readAndAssertRefundCumulativePosition(
          forgedPosition,
          fixture.allocation,
          refundPostingDecoderEnvelope
        ),
      "evidence_mismatch"
    );

    const authority = {
      ...confirmedAuthority(fixture.allocation, "confirmed-forged", "2026-08-03T11:00:00Z"),
      priorProviderTotalRefunded: money(1)
    };
    expectReason(
      () =>
        projectRefundCumulativeTerminalPosition(fixture.allocation, fixture.position, authority),
      "amount_mismatch"
    );
  });
});

function cumulativeFixture() {
  const raw = structuredClone(buildRefundPostingAllocationInput()) as Record<string, unknown>;
  const position = initialPosition(raw.providerAccount, raw.providerPaymentId as string);
  raw.confirmedCumulativePositionRef = positionRef(position);
  const allocation = readRefundPostingAllocationAuthority(
    withAllocationDigest(raw),
    refundPostingDecoderEnvelope
  );
  return {
    allocation,
    position: readAndAssertRefundCumulativePosition(
      position,
      allocation,
      refundPostingDecoderEnvelope
    )
  };
}

function initialPosition(providerAccount: unknown, providerPaymentId: string) {
  const identity = { providerAccount, providerPaymentId, currency: "RUB" as const };
  const core = {
    kind: "refund_cumulative_position" as const,
    schemaVersion: 1 as const,
    authorizationStatus: "unverified" as const,
    atomicityStatus: "unverified" as const,
    digestPurpose: "drift_detection_only" as const,
    positionId: `refund-cumulative-position:${hashFinanceCommandPayload(identity)}`,
    providerAccount,
    providerPaymentId,
    currency: "RUB" as const,
    version: 0,
    confirmedCumulativeRefunded: money(0),
    confirmedCumulativePayableReversed: money(0),
    confirmedCumulativePlatformReversed: money(0),
    lastConfirmedAllocationRef: null,
    lastConfirmedTerminalAuthorityRef: null,
    updatedAt: "2026-08-03T09:00:00Z"
  };
  return Object.freeze({ ...core, positionDigest: hashFinanceCommandPayload(core) });
}

function confirmedAuthority(
  allocation: ReturnType<typeof readRefundPostingAllocationAuthority>,
  authorityId: string,
  confirmedAt: string
) {
  return Object.freeze({
    kind: "refund_confirmed" as const,
    authorityId,
    version: 1,
    refundId: allocation.refundId,
    providerAccountId: allocation.providerAccount.providerAccountId,
    providerPaymentId: allocation.providerPaymentId,
    providerRefundId: `${allocation.refundId}:provider-refund`,
    providerAmountBasis: "incremental" as const,
    providerRefundAmount: allocation.refundAmount,
    priorProviderTotalRefunded: allocation.priorCumulativeRefunded,
    nextProviderTotalRefunded: allocation.nextCumulativeRefunded,
    payableAmount: allocation.payableLotAmount,
    accountingAllocationId: allocation.authorityId,
    accountingAllocationVersion: allocation.version,
    canonicalEvidenceId: `${authorityId}:evidence`,
    confirmedAt
  });
}

function failedAuthority(allocation: ReturnType<typeof readRefundPostingAllocationAuthority>) {
  return Object.freeze({
    kind: "refund_failed" as const,
    authorityId: "failed-1",
    version: 1,
    refundId: allocation.refundId,
    providerAccountId: allocation.providerAccount.providerAccountId,
    providerPaymentId: allocation.providerPaymentId,
    providerRefundId: `${allocation.refundId}:provider-refund`,
    providerRefundAmount: allocation.refundAmount,
    payableAmount: allocation.payableLotAmount,
    accountingAllocationId: allocation.authorityId,
    accountingAllocationVersion: allocation.version,
    failureCode: "provider_declined",
    canonicalEvidenceId: "failed-1:evidence",
    failedAt: "2026-08-03T11:00:00Z"
  });
}

function positionRef(position: {
  positionId: string;
  version: number;
  confirmedCumulativeRefunded: { amountMinor: number; currency: string };
  confirmedCumulativePayableReversed: { amountMinor: number; currency: string };
  confirmedCumulativePlatformReversed: { amountMinor: number; currency: string };
  positionDigest: string;
}) {
  return Object.freeze({
    kind: "refund_cumulative_position" as const,
    positionId: position.positionId,
    version: position.version,
    confirmedCumulativeRefunded: position.confirmedCumulativeRefunded,
    confirmedCumulativePayableReversed: position.confirmedCumulativePayableReversed,
    confirmedCumulativePlatformReversed: position.confirmedCumulativePlatformReversed,
    canonicalDigest: position.positionDigest
  });
}

function allocationRef(allocation: ReturnType<typeof readRefundPostingAllocationAuthority>) {
  return {
    kind: allocation.kind,
    authorityId: allocation.authorityId,
    version: allocation.version,
    nextCumulativeRefunded: allocation.nextCumulativeRefunded,
    nextCumulativePayableReversed: allocation.nextCumulativePayableReversed,
    nextCumulativePlatformReversed: allocation.nextCumulativePlatformReversed,
    canonicalDigest: allocation.allocationDigest
  };
}

function money(amountMinor: number) {
  return Object.freeze({ amountMinor, currency: "RUB" as const });
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
