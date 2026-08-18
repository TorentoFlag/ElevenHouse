import { describe, expect, it } from "vitest";

import {
  applyInitialCapture,
  applyRenewalCapture,
  createPendingClientSubscription,
  requestRenewalCharge
} from "../client-subscriptions";
import { activeSubscription, runtimeId } from "../client-subscriptions/client-subscription-test-fixtures";
import {
  planAstroDiarySubscriptionActivation,
  type AstroDiarySubscriptionActivationInput
} from "./astro-diary-subscription-activation";

const digest = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}` as `sha256:${string}`;

describe("AstroDiary subscription activation plan", () => {
  it("plans one active journal, immutable activation evidence, and an IDs-only event for a first applied capture", () => {
    const captured = initialCapture();
    if (captured.outcome !== "applied") throw new Error("initial capture must apply");

    const plan = planAstroDiarySubscriptionActivation(activationInput(captured));

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
        sourceEventDigest: digest("a"),
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
  });

  it("continues the existing epoch on renewal and maps ended or revoked authority to read-only", () => {
    const captured = initialCapture();
    if (captured.outcome !== "applied") throw new Error("initial capture must apply");
    const requested = requestRenewalCharge(captured.subscription, {
      renewalRequestId: runtimeId(22),
      sourcePeriodId: runtimeId(5),
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
    expect(
      planAstroDiarySubscriptionActivation(
        activationInput(renewal, {
          sourceEventId: runtimeId(20),
          evidenceId: runtimeId(21),
          sourceEventDigest: digest("b")
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

  it("fails closed when the locked contract, epoch, or applied source receipt does not match", () => {
    const captured = initialCapture();
    if (captured.outcome !== "applied") throw new Error("initial capture must apply");

    expect(
      planAstroDiarySubscriptionActivation({
        ...activationInput(captured),
        immutableContract: { ...captured.subscription.contract, id: runtimeId(30) }
      })
    ).toEqual({ outcome: "rejected", code: "contract_mismatch" });
    expect(
      planAstroDiarySubscriptionActivation({
        ...activationInput(captured),
        identities: { ...activationInput(captured).identities, journalEpochId: runtimeId(31) }
      })
    ).toEqual({ outcome: "rejected", code: "journal_epoch_mismatch" });
    expect(
      planAstroDiarySubscriptionActivation({
        ...activationInput(captured),
        appliedSourceEventReceipt: {
          ...activationInput(captured).appliedSourceEventReceipt,
          result: { ...activationInput(captured).appliedSourceEventReceipt.result, transitionId: runtimeId(32) }
        }
      })
    ).toEqual({ outcome: "rejected", code: "source_event_receipt_mismatch" });
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
    periodId: runtimeId(5),
    eventIds: [runtimeId(6), runtimeId(7)]
  });
}

function activationInput(
  captured: Extract<ReturnType<typeof initialCapture>, { outcome: "applied" }> | Extract<ReturnType<typeof applyRenewalCapture>, { outcome: "applied" }>,
  source: Readonly<{
    sourceEventId: string;
    evidenceId: string;
    sourceEventDigest: `sha256:${string}`;
  }> = { sourceEventId: runtimeId(1), evidenceId: runtimeId(2), sourceEventDigest: digest("a") }
): AstroDiarySubscriptionActivationInput {
  return {
    lockedSubscription: captured.subscription,
    immutableContract: captured.subscription.contract,
    transitionReceipt: captured.receipt,
    appliedSourceEventReceipt: {
      subscriptionId: captured.subscription.id,
      sourceEventId: source.sourceEventId,
      sourceEventDigest: source.sourceEventDigest,
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
    }
  };
}
