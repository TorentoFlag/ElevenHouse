import type { AstroDiaryEvent, ClientSubscriptionContract } from "@elevenhouse/contracts";

import type { ClientSubscriptionTransitionReceipt } from "../client-subscriptions/client-subscription-events";
import type {
  ClientSubscription,
  ClientSubscriptionPeriod
} from "../client-subscriptions/client-subscription-types";
import type { ClientSubscriptionSourceEventApplicationReceipt } from "../client-subscriptions/ports/client-subscription-source-event-application-unit-of-work";
import { digestFinanceCanonicalValueV1 } from "../finance-core/finance-canonical-digest";
import {
  createFinanceClientSubscriptionCaptureAppliedEvent,
  rehydrateFinanceClientOrderCaptureDispatchReceipt,
  type ClientSubscriptionCaptureAppliedEvent,
  type FinanceClientOrderCaptureDispatchReceipt
} from "../finance-core/client-order-capture-purpose-dispatch";
import { astroDiaryEvent } from "./astro-diary-events";

type AppliedSourceEventReceipt = ClientSubscriptionSourceEventApplicationReceipt &
  Readonly<{
    result: Extract<
      ClientSubscriptionSourceEventApplicationReceipt["result"],
      { outcome: "applied" }
    >;
  }>;
export type AstroDiarySubscriptionActivationInput = Readonly<{
  /** The source-event UOW has already locked and transitioned this exact subscription. */
  lockedSubscription: ClientSubscription;
  /** Canonical capture source event and sealed dispatch authority that authorized the transition. */
  appliedCapture: Readonly<{
    sourceEvent: ClientSubscriptionCaptureAppliedEvent;
    dispatchReceipt: FinanceClientOrderCaptureDispatchReceipt;
  }>;
  /** Immutable contract independently supplied by the locked source-event boundary. */
  immutableContract: ClientSubscriptionContract;
  transitionReceipt: ClientSubscriptionTransitionReceipt;
  appliedSourceEventReceipt: AppliedSourceEventReceipt;
  /** Database transaction clock; never a browser or worker clock. */
  transactionClock: Readonly<{ now: string }>;
  /** Server-allocated IDs retained across the transaction and its source-event replay. */
  identities: Readonly<{
    journalId: string;
    journalEpochId: string;
    activationReceiptId: string;
    eventId: string;
  }>;
}>;

export type AstroDiarySubscriptionActivationPlan =
  | Readonly<{
      outcome: "activate";
      journal: Readonly<{
        id: string;
        relationshipId: string;
        journalEpochId: string;
        astrologerUserId: string;
        clientUserId: string;
        state: "active";
        version: 1;
        createdAt: string;
      }>;
      activationReceipt: Readonly<{
        id: string;
        journalId: string;
        journalEpochId: string;
        subscriptionId: string;
        contractId: string;
        sourceEventId: string;
        sourceEventDigest: `sha256:${string}`;
        evidenceId: string;
        transitionId: string;
        activatedAt: string;
      }>;
      event: AstroDiaryEvent;
    }>
  | Readonly<{
      outcome: "continue_existing";
      journalEpochId: string;
      subscriptionState: "active";
    }>
  | Readonly<{
      outcome: "read_only";
      journalEpochId: string;
      subscriptionState: "ended" | "revoked";
    }>
  | Readonly<{
      outcome: "rejected";
      code:
        | "contract_mismatch"
        | "journal_epoch_mismatch"
        | "source_event_receipt_mismatch"
        | "transition_receipt_mismatch"
        | "subscription_state_mismatch";
    }>;

/**
 * Derives the only AstroDiary write plan that may be persisted beside a canonical source event.
 * It does not write storage or run asynchronously; Task 2 composes the returned plan inside the
 * source-event transaction after the subscription transition and entitlement projection exist.
 */
export function planAstroDiarySubscriptionActivation(
  input: AstroDiarySubscriptionActivationInput
): AstroDiarySubscriptionActivationPlan {
  const subscription = input.lockedSubscription;
  const receipt = input.transitionReceipt;
  const applicationReceipt = input.appliedSourceEventReceipt;
  const dispatchReceipt = rehydrateAppliedCapture(input.appliedCapture);

  if (!sameLockedContract(subscription.contract, input.immutableContract)) {
    return { outcome: "rejected", code: "contract_mismatch" };
  }
  if (
    input.identities.journalEpochId !== subscription.journalEpochId ||
    receipt.journalEpochId !== subscription.journalEpochId
  ) {
    return { outcome: "rejected", code: "journal_epoch_mismatch" };
  }
  if (
    applicationReceipt.subscriptionId !== subscription.id ||
    applicationReceipt.sourceEventId !== input.appliedCapture.sourceEvent.eventId ||
    applicationReceipt.evidenceId !== input.appliedCapture.sourceEvent.data.financeEvidenceId ||
    applicationReceipt.sourceEventDigest !==
      digestFinanceCanonicalValueV1(input.appliedCapture.sourceEvent) ||
    applicationReceipt.result.subscriptionVersion !== subscription.version ||
    applicationReceipt.result.transitionId !== receipt.transitionId ||
    applicationReceipt.result.slotEffect !== receipt.slotEffect
  ) {
    return { outcome: "rejected", code: "source_event_receipt_mismatch" };
  }
  if (
    !dispatchReceipt ||
    input.appliedCapture.sourceEvent.eventType !== "client_subscription.capture_applied.v1" ||
    dispatchReceipt.sourceEventId !== input.appliedCapture.sourceEvent.eventId ||
    dispatchReceipt.sourceEventDigest !== applicationReceipt.sourceEventDigest ||
    dispatchReceipt.authority.captureApplicationReceiptId !== applicationReceipt.evidenceId ||
    dispatchReceipt.authority.subscriptionId !== subscription.id ||
    dispatchReceipt.authority.contractId !== subscription.contract.id ||
    dispatchReceipt.authority.orderId !== subscription.contract.orderId ||
    dispatchReceipt.authority.contractCanonicalDigest !== subscription.contract.canonicalDigest ||
    dispatchReceipt.authority.subscriptionExpectedVersion !== subscription.version - 1 ||
    dispatchReceipt.authority.capturedAt !== receipt.occurredAt ||
    input.appliedCapture.sourceEvent.data.subscriptionId !== subscription.id ||
    input.appliedCapture.sourceEvent.data.contractId !== subscription.contract.id ||
    input.appliedCapture.sourceEvent.data.periodId !== receipt.period?.id ||
    dispatchReceipt.target.periodId !== receipt.period?.id ||
    !subscription.appliedFinanceEvidenceIds.includes(applicationReceipt.evidenceId) ||
    !periodMatchesLockedSubscription(subscription, receipt)
  ) {
    return { outcome: "rejected", code: "transition_receipt_mismatch" };
  }
  if (
    receipt.subscriptionId !== subscription.id ||
    receipt.contractId !== subscription.contract.id ||
    receipt.relationshipId !== subscription.contract.relationshipId ||
    receipt.subscriptionVersion !== subscription.version ||
    receipt.state !== subscription.state ||
    receipt.entitlementState !== entitlementStateFor(subscription.state)
  ) {
    return { outcome: "rejected", code: "transition_receipt_mismatch" };
  }

  if (subscription.state === "ended" || subscription.state === "revoked") {
    return {
      outcome: "read_only",
      journalEpochId: subscription.journalEpochId,
      subscriptionState: subscription.state
    };
  }
  if (subscription.state !== "active") {
    return { outcome: "rejected", code: "subscription_state_mismatch" };
  }

  const journal = {
    id: input.identities.journalId,
    relationshipId: subscription.contract.relationshipId,
    journalEpochId: subscription.journalEpochId,
    astrologerUserId: subscription.contract.astrologerUserId,
    clientUserId: subscription.contract.clientUserId,
    state: "active" as const,
    version: 1 as const,
    createdAt: input.transactionClock.now
  };
  return {
    outcome: "activate",
    journal,
    activationReceipt: {
      id: input.identities.activationReceiptId,
      journalId: journal.id,
      journalEpochId: journal.journalEpochId,
      subscriptionId: subscription.id,
      contractId: subscription.contract.id,
      sourceEventId: applicationReceipt.sourceEventId,
      sourceEventDigest: applicationReceipt.sourceEventDigest,
      evidenceId: applicationReceipt.evidenceId,
      transitionId: receipt.transitionId,
      activatedAt: input.transactionClock.now
    },
    event: astroDiaryEvent({
      eventId: input.identities.eventId,
      eventType: "astro_diary.journal_activated.v1",
      occurredAt: input.transactionClock.now,
      data: { journalId: journal.id, journalEpochId: journal.journalEpochId }
    })
  };
}

function rehydrateAppliedCapture(
  input: AstroDiarySubscriptionActivationInput["appliedCapture"]
): FinanceClientOrderCaptureDispatchReceipt | null {
  try {
    const receipt = rehydrateFinanceClientOrderCaptureDispatchReceipt(input.dispatchReceipt);
    const canonicalSourceEvent = createFinanceClientSubscriptionCaptureAppliedEvent(receipt);
    if (
      digestFinanceCanonicalValueV1(input.sourceEvent) !== receipt.sourceEventDigest ||
      digestFinanceCanonicalValueV1(input.sourceEvent) !==
        digestFinanceCanonicalValueV1(canonicalSourceEvent)
    ) {
      return null;
    }
    return receipt;
  } catch {
    return null;
  }
}

function periodMatchesLockedSubscription(
  subscription: ClientSubscription,
  receipt: ClientSubscriptionTransitionReceipt
): boolean {
  return (
    !!receipt.period &&
    subscription.paidPeriods.some((period) => samePeriod(period, receipt.period!))
  );
}

function samePeriod(left: ClientSubscriptionPeriod, right: ClientSubscriptionPeriod): boolean {
  return (
    left.id === right.id &&
    left.sequence === right.sequence &&
    left.startsAt === right.startsAt &&
    left.endsAt === right.endsAt &&
    left.anchor.capturedAt === right.anchor.capturedAt &&
    left.anchor.serviceTimezone === right.anchor.serviceTimezone &&
    left.anchor.originSequence === right.anchor.originSequence &&
    left.anchor.localDateTime === right.anchor.localDateTime &&
    left.resolvedStartLocal === right.resolvedStartLocal &&
    left.resolvedStartOffset === right.resolvedStartOffset &&
    left.resolvedEndLocal === right.resolvedEndLocal &&
    left.resolvedEndOffset === right.resolvedEndOffset
  );
}

function sameLockedContract(
  subscriptionContract: ClientSubscriptionContract,
  immutableContract: ClientSubscriptionContract
): boolean {
  return (
    subscriptionContract.id === immutableContract.id &&
    subscriptionContract.canonicalDigest === immutableContract.canonicalDigest &&
    subscriptionContract.relationshipId === immutableContract.relationshipId &&
    subscriptionContract.astrologerUserId === immutableContract.astrologerUserId &&
    subscriptionContract.clientUserId === immutableContract.clientUserId
  );
}

function entitlementStateFor(
  state: ClientSubscription["state"]
): ClientSubscriptionTransitionReceipt["entitlementState"] {
  return state === "revoked" ? "revoked" : state === "ended" ? "ended" : "active";
}
