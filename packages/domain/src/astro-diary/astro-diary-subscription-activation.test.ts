import { describe, expect, it } from "vitest";

import {
  applyInitialCapture,
  applyRenewalCapture,
  createPendingClientSubscription,
  requestRenewalCharge
} from "../client-subscriptions";
import {
  activeSubscription,
  runtimeId
} from "../client-subscriptions/client-subscription-test-fixtures";
import {
  createFinanceClientOrderCaptureDispatchReceipt,
  createFinanceClientSubscriptionCaptureAppliedEvent,
  sealFinanceClientOrderSubscriptionCaptureAuthority,
  type ClientSubscriptionCaptureAppliedEvent,
  type FinanceClientOrderCaptureDispatchTarget
} from "../finance-core/client-order-capture-purpose-dispatch";
import { digestFinanceCanonicalValueV1 } from "../finance-core/finance-canonical-digest";
import {
  planAstroDiarySubscriptionActivation,
  type AstroDiarySubscriptionActivationInput
} from "./astro-diary-subscription-activation";

describe("AstroDiary subscription activation plan", () => {
  it("plans one active journal, immutable activation evidence, and an IDs-only event for a first applied capture", () => {
    const captured = initialCapture();
    if (captured.outcome !== "applied") throw new Error("initial capture must apply");
    const input = activationInput(captured);
    const plan = planAstroDiarySubscriptionActivation(input);

    expect(plan).toEqual({
      outcome: "activate",
      journal: {
        id: runtimeId(10),
        relationshipId: captured.subscription.contract.relationshipId,
        journalEpochId: captured.subscription.journalEpochId,
        astrologerUserId: captured.subscription.contract.astrologerUserId,
        clientUserId: captured.subscription.contract.clientUserId,
        state: "active",
        version: 1,
        createdAt: "2026-01-31T07:30:00.000Z"
      },
      activationReceipt: {
        id: runtimeId(11),
        journalId: runtimeId(10),
        journalEpochId: captured.subscription.journalEpochId,
        subscriptionId: captured.subscription.id,
        contractId: captured.subscription.contract.id,
        sourceEventId: runtimeId(1),
        sourceEventDigest: input.appliedSourceEventReceipt.sourceEventDigest,
        evidenceId: runtimeId(2),
        transitionId: captured.receipt.transitionId,
        activatedAt: "2026-01-31T07:30:00.000Z"
      },
      event: {
        eventId: runtimeId(12),
        eventType: "astro_diary.journal_activated.v1",
        schemaVersion: 1,
        occurredAt: "2026-01-31T07:30:00.000Z",
        data: {
          journalId: runtimeId(10),
          journalEpochId: captured.subscription.journalEpochId
        }
      }
    });

    const replacement = replacementEpochCapture();
    if (replacement.outcome !== "applied")
      throw new Error("replacement initial capture must apply");
    expect(
      planAstroDiarySubscriptionActivation(
        activationInput(replacement, {
          sourceEventId: runtimeId(40),
          evidenceId: runtimeId(41),
          captureKind: "initial"
        })
      )
    ).toMatchObject({
      outcome: "activate",
      journal: { journalEpochId: runtimeId(39), state: "active" }
    });
  });

  it("uses the sealed dispatch authority rather than a caller-supplied initial target", () => {
    const captured = initialCapture();
    if (captured.outcome !== "applied") throw new Error("initial capture must apply");
    const input = activationInput(captured);

    expect(
      planAstroDiarySubscriptionActivation(
        withCallerTarget(input, {
          kind: "renewal",
          periodId: captured.receipt.period!.id,
          renewalRequestId: runtimeId(88),
          intendedPeriodId: captured.receipt.period!.id,
          periodRenewedEventId: runtimeId(89),
          entitlementChangedEventId: runtimeId(90)
        })
      )
    ).toMatchObject({ outcome: "activate" });
  });

  it("uses the sealed dispatch authority rather than a caller-supplied renewal target", () => {
    const renewal = renewalCapture();
    const input = activationInput(renewal, {
      sourceEventId: runtimeId(20),
      evidenceId: runtimeId(21),
      captureKind: "renewal",
      renewalRequestId: runtimeId(22),
      intendedPeriodId: runtimeId(23)
    });

    expect(
      planAstroDiarySubscriptionActivation(
        withCallerTarget(input, {
          kind: "initial",
          periodId: renewal.receipt.period!.id,
          activatedEventId: runtimeId(88),
          entitlementChangedEventId: runtimeId(89)
        })
      )
    ).toEqual({
      outcome: "continue_existing",
      journalEpochId: renewal.subscription.journalEpochId,
      subscriptionState: "active"
    });
  });

  it("rejects a dispatch receipt whose capture kind is tampered after sealing", () => {
    const initial = initialCapture();
    if (initial.outcome !== "applied") throw new Error("initial capture must apply");
    const initialInput = activationInput(initial);
    expect(
      planAstroDiarySubscriptionActivation({
        ...initialInput,
        appliedCapture: {
          ...initialInput.appliedCapture,
          dispatchReceipt: {
            ...initialInput.appliedCapture.dispatchReceipt,
            target: {
              kind: "renewal",
              periodId: initial.receipt.period!.id,
              renewalRequestId: runtimeId(83),
              intendedPeriodId: initial.receipt.period!.id,
              periodRenewedEventId: runtimeId(84),
              entitlementChangedEventId: runtimeId(85)
            }
          }
        }
      })
    ).toEqual({ outcome: "rejected", code: "transition_receipt_mismatch" });

    const renewal = renewalCapture();
    const renewalInput = activationInput(renewal, {
      sourceEventId: runtimeId(20),
      evidenceId: runtimeId(21),
      captureKind: "renewal",
      renewalRequestId: runtimeId(22),
      intendedPeriodId: runtimeId(23)
    });
    expect(
      planAstroDiarySubscriptionActivation({
        ...renewalInput,
        appliedCapture: {
          ...renewalInput.appliedCapture,
          dispatchReceipt: {
            ...renewalInput.appliedCapture.dispatchReceipt,
            target: {
              kind: "initial",
              periodId: renewal.receipt.period!.id,
              activatedEventId: runtimeId(86),
              entitlementChangedEventId: runtimeId(87)
            }
          }
        }
      })
    ).toEqual({ outcome: "rejected", code: "transition_receipt_mismatch" });
  });

  it("continues the existing epoch on renewal and maps ended or revoked authority to read-only", () => {
    const captured = initialCapture();
    if (captured.outcome !== "applied") throw new Error("initial capture must apply");
    const renewal = renewalCapture();
    expect(
      planAstroDiarySubscriptionActivation(
        activationInput(renewal, {
          sourceEventId: runtimeId(20),
          evidenceId: runtimeId(21),
          captureKind: "renewal",
          renewalRequestId: runtimeId(22),
          intendedPeriodId: runtimeId(23)
        })
      )
    ).toEqual({
      outcome: "continue_existing",
      journalEpochId: captured.subscription.journalEpochId,
      subscriptionState: "active"
    });

    const ended = {
      ...captured,
      subscription: { ...captured.subscription, state: "ended" as const },
      receipt: { ...captured.receipt, state: "ended" as const, entitlementState: "ended" as const }
    };
    expect(planAstroDiarySubscriptionActivation(activationInput(ended))).toEqual({
      outcome: "read_only",
      journalEpochId: captured.subscription.journalEpochId,
      subscriptionState: "ended"
    });
    const revoked = {
      ...ended,
      subscription: { ...ended.subscription, state: "revoked" as const },
      receipt: { ...ended.receipt, state: "revoked" as const, entitlementState: "revoked" as const }
    };
    expect(planAstroDiarySubscriptionActivation(activationInput(revoked))).toEqual({
      outcome: "read_only",
      journalEpochId: captured.subscription.journalEpochId,
      subscriptionState: "revoked"
    });
  });

  it("fails closed when the capture event, locked period, contract, epoch, or applied source receipt does not match", () => {
    const captured = initialCapture();
    if (captured.outcome !== "applied") throw new Error("initial capture must apply");
    const input = activationInput(captured);
    const nonCaptureEvent = {
      ...input.appliedCapture.sourceEvent,
      eventType: "client_subscription.activated.v1"
    } as unknown as ClientSubscriptionCaptureAppliedEvent;

    expect(
      planAstroDiarySubscriptionActivation({
        ...input,
        appliedCapture: {
          ...input.appliedCapture,
          sourceEvent: nonCaptureEvent
        },
        appliedSourceEventReceipt: {
          ...input.appliedSourceEventReceipt,
          sourceEventDigest: digestFinanceCanonicalValueV1(nonCaptureEvent)
        }
      })
    ).toEqual({ outcome: "rejected", code: "transition_receipt_mismatch" });
    expect(
      planAstroDiarySubscriptionActivation({
        ...input,
        transitionReceipt: {
          ...input.transitionReceipt,
          period: { ...captured.receipt.period!, endsAt: "2026-03-01T07:30:00.000Z" }
        }
      })
    ).toEqual({ outcome: "rejected", code: "transition_receipt_mismatch" });
    expect(
      planAstroDiarySubscriptionActivation({
        ...input,
        immutableContract: { ...captured.subscription.contract, id: runtimeId(30) }
      })
    ).toEqual({ outcome: "rejected", code: "contract_mismatch" });
    expect(
      planAstroDiarySubscriptionActivation({
        ...input,
        identities: { ...input.identities, journalEpochId: runtimeId(31) }
      })
    ).toEqual({ outcome: "rejected", code: "journal_epoch_mismatch" });
    expect(
      planAstroDiarySubscriptionActivation({
        ...input,
        appliedSourceEventReceipt: {
          ...input.appliedSourceEventReceipt,
          result: { ...input.appliedSourceEventReceipt.result, transitionId: runtimeId(32) }
        }
      })
    ).toEqual({ outcome: "rejected", code: "source_event_receipt_mismatch" });
    expect(
      planAstroDiarySubscriptionActivation({
        ...input,
        lockedSubscription: { ...captured.subscription, state: "pending_initial_payment" },
        transitionReceipt: { ...captured.receipt, state: "pending_initial_payment" }
      })
    ).toEqual({ outcome: "rejected", code: "subscription_state_mismatch" });
  });
});

function initialCapture() {
  const pending = createPendingClientSubscription({
    subscriptionId: runtimeId(3),
    journalEpochId: runtimeId(4),
    contract: activeSubscription().contract
  });
  return applyInitialCapture(pending, {
    sourceEventId: runtimeId(1),
    evidenceId: runtimeId(2),
    capturedAt: "2026-01-31T07:30:00.000Z",
    periodId: runtimeId(13),
    eventIds: [runtimeId(6), runtimeId(7)]
  });
}

function replacementEpochCapture() {
  const pending = createPendingClientSubscription({
    subscriptionId: runtimeId(38),
    journalEpochId: runtimeId(39),
    contract: activeSubscription().contract
  });
  return applyInitialCapture(pending, {
    sourceEventId: runtimeId(40),
    evidenceId: runtimeId(41),
    capturedAt: "2026-03-31T07:30:00.000Z",
    periodId: runtimeId(42),
    eventIds: [runtimeId(43), runtimeId(44)]
  });
}

function activationInput(
  captured:
    | Extract<ReturnType<typeof initialCapture>, { outcome: "applied" }>
    | Extract<ReturnType<typeof applyRenewalCapture>, { outcome: "applied" }>,
  source: Readonly<{
    sourceEventId: string;
    evidenceId: string;
    captureKind?: "initial" | "renewal";
    renewalRequestId?: string;
    intendedPeriodId?: string;
  }> = { sourceEventId: runtimeId(1), evidenceId: runtimeId(2) }
): AstroDiarySubscriptionActivationInput {
  const target =
    source.captureKind === "renewal"
      ? renewalTarget(captured, source.renewalRequestId, source.intendedPeriodId)
      : initialTarget(captured);
  const dispatchReceipt = createFinanceClientOrderCaptureDispatchReceipt({
    authority: sealFinanceClientOrderSubscriptionCaptureAuthority({
      captureKind: target.kind,
      captureApplicationReceiptId: source.evidenceId,
      captureApplicationDigest: `sha256:${"b".repeat(64)}`,
      orderId: captured.subscription.contract.orderId,
      contractId: captured.subscription.contract.id,
      contractCanonicalDigest: captured.subscription.contract.canonicalDigest,
      subscriptionId: captured.subscription.id,
      subscriptionExpectedVersion: captured.subscription.version - 1,
      capturedAt: captured.receipt.occurredAt,
      ...(target.kind === "renewal"
        ? {
            renewalRequestId: target.renewalRequestId,
            intendedPeriodId: target.intendedPeriodId
          }
        : {})
    }),
    dispatchReceiptId: runtimeId(90),
    sourceEventId: source.sourceEventId,
    target,
    dispatchedAt: new Date(Date.parse(captured.receipt.occurredAt) + 1_000).toISOString()
  });
  const sourceEvent = createFinanceClientSubscriptionCaptureAppliedEvent(dispatchReceipt);
  return {
    lockedSubscription: captured.subscription,
    immutableContract: captured.subscription.contract,
    transitionReceipt: captured.receipt,
    appliedSourceEventReceipt: {
      subscriptionId: captured.subscription.id,
      sourceEventId: source.sourceEventId,
      sourceEventDigest: dispatchReceipt.sourceEventDigest,
      evidenceId: source.evidenceId,
      result: {
        outcome: "applied",
        subscriptionVersion: captured.subscription.version,
        transitionId: captured.receipt.transitionId,
        slotEffect: captured.receipt.slotEffect
      }
    },
    transactionClock: { now: "2026-01-31T07:30:00.000Z" },
    identities: {
      journalId: runtimeId(10),
      journalEpochId: captured.subscription.journalEpochId,
      activationReceiptId: runtimeId(11),
      eventId: runtimeId(12)
    },
    appliedCapture: {
      sourceEvent,
      dispatchReceipt
    }
  };
}

function renewalCapture(): Extract<ReturnType<typeof applyRenewalCapture>, { outcome: "applied" }> {
  const captured = initialCapture();
  if (captured.outcome !== "applied") throw new Error("initial capture must apply");
  const requested = requestRenewalCharge(captured.subscription, {
    renewalRequestId: runtimeId(22),
    sourcePeriodId: runtimeId(13),
    intendedPeriodId: runtimeId(23),
    requestedAt: "2026-02-27T07:30:00.000Z",
    eventId: runtimeId(24)
  });
  if (requested.outcome !== "applied") throw new Error("renewal request must apply");
  const renewal = applyRenewalCapture(requested.subscription, {
    sourceEventId: runtimeId(20),
    evidenceId: runtimeId(21),
    renewalRequestId: runtimeId(22),
    intendedPeriodId: runtimeId(23),
    capturedAt: "2026-02-28T07:30:00.000Z",
    periodId: runtimeId(23),
    eventIds: [runtimeId(25), runtimeId(26)]
  });
  if (renewal.outcome !== "applied") throw new Error("renewal capture must apply");
  return renewal;
}

function initialTarget(
  captured:
    | Extract<ReturnType<typeof initialCapture>, { outcome: "applied" }>
    | Extract<ReturnType<typeof applyRenewalCapture>, { outcome: "applied" }>
): Extract<FinanceClientOrderCaptureDispatchTarget, { kind: "initial" }> {
  return {
    kind: "initial",
    periodId: captured.receipt.period!.id,
    activatedEventId: emittedEventId(captured, "client_subscription.activated.v1"),
    entitlementChangedEventId: emittedEventId(
      captured,
      "client_subscription.entitlement_changed.v1"
    )
  };
}

function renewalTarget(
  captured:
    | Extract<ReturnType<typeof initialCapture>, { outcome: "applied" }>
    | Extract<ReturnType<typeof applyRenewalCapture>, { outcome: "applied" }>,
  renewalRequestId = runtimeId(22),
  intendedPeriodId = runtimeId(23)
): Extract<FinanceClientOrderCaptureDispatchTarget, { kind: "renewal" }> {
  return {
    kind: "renewal",
    renewalRequestId,
    intendedPeriodId,
    periodId: captured.receipt.period!.id,
    periodRenewedEventId: emittedEventId(captured, "client_subscription.period_renewed.v1"),
    entitlementChangedEventId: emittedEventId(
      captured,
      "client_subscription.entitlement_changed.v1"
    )
  };
}

function emittedEventId(
  captured:
    | Extract<ReturnType<typeof initialCapture>, { outcome: "applied" }>
    | Extract<ReturnType<typeof applyRenewalCapture>, { outcome: "applied" }>,
  eventType:
    | "client_subscription.activated.v1"
    | "client_subscription.period_renewed.v1"
    | "client_subscription.entitlement_changed.v1"
): string {
  const event = captured.events.find((candidate) => candidate.eventType === eventType);
  if (!event) throw new Error(`missing ${eventType} lifecycle event`);
  return event.eventId;
}

function withCallerTarget(
  input: AstroDiarySubscriptionActivationInput,
  target: FinanceClientOrderCaptureDispatchTarget
): AstroDiarySubscriptionActivationInput {
  return {
    ...input,
    appliedCapture: { ...input.appliedCapture, target }
  } as AstroDiarySubscriptionActivationInput;
}
