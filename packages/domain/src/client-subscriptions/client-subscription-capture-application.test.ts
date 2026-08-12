import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createFinanceClientOrderCaptureDispatchReceipt,
  createFinanceClientSubscriptionCaptureAppliedEvent,
  sealFinanceClientOrderSubscriptionCaptureAuthority,
  type FinanceClientOrderCaptureDispatchReceipt
} from "../finance-core/client-order-capture-purpose-dispatch";
import {
  createPendingClientSubscription,
  requestRenewalCharge
} from "./client-subscription-lifecycle";
import { activeSubscription, runtimeId } from "./client-subscription-test-fixtures";
import type { ClientSubscription } from "./client-subscription-types";
import {
  applyClientSubscriptionCaptureDispatch,
  type ClientSubscriptionCaptureDispatchExecution
} from "./client-subscription-capture-application";
import type {
  ClientSubscriptionSourceEventApplicationExecution,
  ClientSubscriptionSourceEventApplicationUnitOfWork
} from "./ports/client-subscription-source-event-application-unit-of-work";

describe("client subscription purpose-bound capture application", () => {
  it("applies an initial IDs-only capture once without re-emitting the input event", async () => {
    const pending = createPendingClientSubscription({
      subscriptionId: runtimeId(1),
      journalEpochId: runtimeId(2),
      contract: activeSubscription().contract
    });
    const port = new AtomicSourceEventMemoryUnitOfWork(pending);
    const dispatchReceipt = initialDispatchReceipt();
    const sourceEvent = createFinanceClientSubscriptionCaptureAppliedEvent(dispatchReceipt);

    const first = await applyClientSubscriptionCaptureDispatch(port, {
      sourceEvent,
      dispatchReceipt
    });

    expect(first).toMatchObject({
      outcome: "applied",
      subscription: {
        id: runtimeId(1),
        state: "active",
        version: 2,
        appliedFinanceEvidenceIds: [runtimeId(70)],
        paidPeriods: [{ id: runtimeId(73), sequence: 1 }]
      },
      applicationReceipt: {
        sourceEventId: runtimeId(72),
        evidenceId: runtimeId(70),
        sourceEventDigest: dispatchReceipt.sourceEventDigest,
        result: { outcome: "applied", subscriptionVersion: 2 }
      }
    });
    if (first.outcome !== "applied") throw new Error("initial capture must apply");
    expect(first.events.map((event) => event.eventType)).toEqual([
      "client_subscription.activated.v1",
      "client_subscription.entitlement_changed.v1"
    ]);
    expect(first.events).not.toContainEqual(
      expect.objectContaining({ eventType: "client_subscription.capture_applied.v1" })
    );

    expect(
      await applyClientSubscriptionCaptureDispatch(port, { sourceEvent, dispatchReceipt })
    ).toEqual({ outcome: "replayed", result: first });
  });

  it("applies a renewal only against its stored request and output IDs", async () => {
    const requested = requestRenewalCharge(activeSubscription(), {
      renewalRequestId: runtimeId(80),
      sourcePeriodId: runtimeId(10),
      intendedPeriodId: runtimeId(81),
      requestedAt: "2026-02-20T08:00:00.000Z",
      eventId: runtimeId(82)
    });
    if (requested.outcome !== "applied") throw new Error("renewal request must apply");
    const dispatchReceipt = renewalDispatchReceipt();
    const result = await applyClientSubscriptionCaptureDispatch(
      new AtomicSourceEventMemoryUnitOfWork(requested.subscription),
      {
        sourceEvent: createFinanceClientSubscriptionCaptureAppliedEvent(dispatchReceipt),
        dispatchReceipt
      }
    );

    expect(result).toMatchObject({
      outcome: "applied",
      subscription: {
        version: 4,
        renewalRequest: null,
        paidPeriods: [{ id: runtimeId(10) }, { id: runtimeId(81), sequence: 2 }]
      }
    });
    if (result.outcome !== "applied") throw new Error("renewal capture must apply");
    expect(result.events.map((event) => event.eventType)).toEqual([
      "client_subscription.period_renewed.v1",
      "client_subscription.entitlement_changed.v1"
    ]);
  });

  it("returns typed source and evidence conflicts for non-identical deliveries", async () => {
    const pending = createPendingClientSubscription({
      subscriptionId: runtimeId(1),
      journalEpochId: runtimeId(2),
      contract: activeSubscription().contract
    });
    const port = new AtomicSourceEventMemoryUnitOfWork(pending);
    const firstReceipt = initialDispatchReceipt();
    const firstEvent = createFinanceClientSubscriptionCaptureAppliedEvent(firstReceipt);
    expect(
      await applyClientSubscriptionCaptureDispatch(port, {
        sourceEvent: firstEvent,
        dispatchReceipt: firstReceipt
      })
    ).toMatchObject({ outcome: "applied" });

    const sameEvidenceDifferentSource = initialDispatchReceipt({
      dispatchReceiptId: runtimeId(90),
      sourceEventId: runtimeId(91),
      periodId: runtimeId(92),
      activatedEventId: runtimeId(93),
      entitlementChangedEventId: runtimeId(94)
    });
    expect(
      await applyClientSubscriptionCaptureDispatch(port, {
        sourceEvent: createFinanceClientSubscriptionCaptureAppliedEvent(
          sameEvidenceDifferentSource
        ),
        dispatchReceipt: sameEvidenceDifferentSource
      })
    ).toEqual({ outcome: "evidence_conflict" });

    const sameSourceDifferentEvidence = initialDispatchReceipt({
      captureApplicationReceiptId: runtimeId(95),
      dispatchReceiptId: runtimeId(96),
      sourceEventId: runtimeId(72),
      periodId: runtimeId(97),
      activatedEventId: runtimeId(98),
      entitlementChangedEventId: runtimeId(99)
    });
    expect(
      await applyClientSubscriptionCaptureDispatch(port, {
        sourceEvent: createFinanceClientSubscriptionCaptureAppliedEvent(
          sameSourceDifferentEvidence
        ),
        dispatchReceipt: sameSourceDifferentEvidence
      })
    ).toEqual({ outcome: "source_event_conflict" });
  });

  it("fails closed on an expanded/generic source or mismatched immutable contract authority", async () => {
    const pending = createPendingClientSubscription({
      subscriptionId: runtimeId(1),
      journalEpochId: runtimeId(2),
      contract: activeSubscription().contract
    });
    const port = new AtomicSourceEventMemoryUnitOfWork(pending);
    const receipt = initialDispatchReceipt();
    const event = createFinanceClientSubscriptionCaptureAppliedEvent(receipt);

    expect(
      await applyClientSubscriptionCaptureDispatch(port, {
        sourceEvent: { ...event, eventType: "finance.economic_payment.capture_applied" } as never,
        dispatchReceipt: receipt
      })
    ).toEqual({ outcome: "source_event_conflict" });
    expect(
      await applyClientSubscriptionCaptureDispatch(port, {
        sourceEvent: {
          ...event,
          data: { ...event.data, contractId: runtimeId(100) }
        },
        dispatchReceipt: receipt
      })
    ).toEqual({ outcome: "source_event_conflict" });

    const mismatchedContract = {
      ...pending,
      contract: {
        ...pending.contract,
        canonicalDigest: `sha256:${"f".repeat(64)}` as const
      }
    };
    expect(
      await applyClientSubscriptionCaptureDispatch(
        new AtomicSourceEventMemoryUnitOfWork(mismatchedContract),
        { sourceEvent: event, dispatchReceipt: receipt }
      )
    ).toEqual({ outcome: "authority_conflict" });
  });
});

function initialDispatchReceipt(
  overrides: {
    captureApplicationReceiptId?: string;
    dispatchReceiptId?: string;
    sourceEventId?: string;
    periodId?: string;
    activatedEventId?: string;
    entitlementChangedEventId?: string;
  } = {}
): FinanceClientOrderCaptureDispatchReceipt {
  const captureApplicationReceiptId = overrides.captureApplicationReceiptId ?? runtimeId(70);
  return createFinanceClientOrderCaptureDispatchReceipt({
    authority: sealFinanceClientOrderSubscriptionCaptureAuthority({
      captureKind: "initial",
      captureApplicationReceiptId,
      captureApplicationDigest: `sha256:${"b".repeat(64)}`,
      orderId: runtimeId(5),
      contractId: runtimeId(4),
      contractCanonicalDigest: `sha256:${"a".repeat(64)}`,
      subscriptionId: runtimeId(1),
      subscriptionExpectedVersion: 1,
      capturedAt: "2026-01-31T07:30:00.000Z"
    }),
    dispatchReceiptId: overrides.dispatchReceiptId ?? runtimeId(71),
    sourceEventId: overrides.sourceEventId ?? runtimeId(72),
    target: {
      kind: "initial",
      periodId: overrides.periodId ?? runtimeId(73),
      activatedEventId: overrides.activatedEventId ?? runtimeId(74),
      entitlementChangedEventId: overrides.entitlementChangedEventId ?? runtimeId(75)
    },
    dispatchedAt: "2026-01-31T07:30:01.000Z"
  });
}

function renewalDispatchReceipt(): FinanceClientOrderCaptureDispatchReceipt {
  return createFinanceClientOrderCaptureDispatchReceipt({
    authority: sealFinanceClientOrderSubscriptionCaptureAuthority({
      captureKind: "renewal",
      captureApplicationReceiptId: runtimeId(83),
      captureApplicationDigest: `sha256:${"c".repeat(64)}`,
      orderId: runtimeId(5),
      contractId: runtimeId(4),
      contractCanonicalDigest: `sha256:${"a".repeat(64)}`,
      subscriptionId: runtimeId(1),
      subscriptionExpectedVersion: 3,
      capturedAt: "2026-02-20T08:00:01.000Z",
      renewalRequestId: runtimeId(80),
      intendedPeriodId: runtimeId(81)
    }),
    dispatchReceiptId: runtimeId(84),
    sourceEventId: runtimeId(85),
    target: {
      kind: "renewal",
      renewalRequestId: runtimeId(80),
      intendedPeriodId: runtimeId(81),
      periodId: runtimeId(81),
      periodRenewedEventId: runtimeId(86),
      entitlementChangedEventId: runtimeId(87)
    },
    dispatchedAt: "2026-02-20T08:00:02.000Z"
  });
}

class AtomicSourceEventMemoryUnitOfWork implements ClientSubscriptionSourceEventApplicationUnitOfWork {
  private serial: Promise<void> = Promise.resolve();
  private readonly evidenceSources = new Map<string, string>();
  private readonly receipts = new Map<
    string,
    {
      digest: `sha256:${string}`;
      evidenceId: string;
      result: Extract<
        ClientSubscriptionSourceEventApplicationExecution,
        { outcome: "applied" | "idempotent" | "rejected" }
      >;
    }
  >();

  constructor(private state: ClientSubscription) {}

  apply(
    input: Parameters<ClientSubscriptionSourceEventApplicationUnitOfWork["apply"]>[0]
  ): Promise<ClientSubscriptionSourceEventApplicationExecution> {
    const run = this.serial.then(() => {
      const prior = this.receipts.get(input.sourceEventId);
      if (prior) {
        return prior.digest === input.sourceEventDigest && prior.evidenceId === input.evidenceId
          ? { outcome: "replayed" as const, result: prior.result }
          : { outcome: "source_event_conflict" as const };
      }
      const evidenceSource = this.evidenceSources.get(input.evidenceId);
      if (evidenceSource && evidenceSource !== input.sourceEventId) {
        return { outcome: "evidence_conflict" as const };
      }
      if (input.subscriptionId !== this.state.id) return { outcome: "not_found" as const };
      if (input.expectedVersion !== this.state.version) {
        return {
          outcome: "version_conflict" as const,
          expectedVersion: input.expectedVersion,
          currentVersion: this.state.version
        };
      }
      const decision = input.decide(this.state);
      const applicationReceipt = {
        subscriptionId: input.subscriptionId,
        sourceEventId: input.sourceEventId,
        sourceEventDigest: input.sourceEventDigest,
        evidenceId: input.evidenceId,
        result:
          decision.outcome === "applied"
            ? {
                outcome: "applied" as const,
                subscriptionVersion: decision.subscription.version,
                transitionId: decision.receipt.transitionId,
                slotEffect: decision.receipt.slotEffect
              }
            : decision.outcome === "idempotent"
              ? {
                  outcome: "idempotent" as const,
                  subscriptionVersion: decision.subscription.version
                }
              : { outcome: "rejected" as const, code: decision.code }
      };
      const result: Extract<
        ClientSubscriptionSourceEventApplicationExecution,
        { outcome: "applied" | "idempotent" | "rejected" }
      > =
        decision.outcome === "applied"
          ? {
              outcome: "applied",
              subscription: decision.subscription,
              events: decision.events,
              receipt: decision.receipt,
              applicationReceipt
            }
          : decision.outcome === "idempotent"
            ? {
                outcome: "idempotent",
                subscription: decision.subscription,
                events: [],
                applicationReceipt
              }
            : { outcome: "rejected", decision, applicationReceipt };
      if (decision.outcome === "applied") this.state = decision.subscription;
      this.receipts.set(input.sourceEventId, {
        digest: input.sourceEventDigest,
        evidenceId: input.evidenceId,
        result
      });
      this.evidenceSources.set(input.evidenceId, input.sourceEventId);
      return result;
    });
    this.serial = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

expectTypeOf<ClientSubscriptionCaptureDispatchExecution>().toMatchTypeOf<
  ClientSubscriptionSourceEventApplicationExecution | { readonly outcome: "authority_conflict" }
>();
