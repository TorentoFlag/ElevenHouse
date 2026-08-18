import type { AstroDiaryEvent, ClientSubscriptionContract } from "@elevenhouse/contracts";

import type { ClientSubscriptionTransitionReceipt } from "../client-subscriptions/client-subscription-events";
import type { ClientSubscription } from "../client-subscriptions/client-subscription-types";
import type { ClientSubscriptionSourceEventApplicationReceipt } from "../client-subscriptions/ports/client-subscription-source-event-application-unit-of-work";
import { astroDiaryEvent } from "./astro-diary-events";

type AppliedSourceEventReceipt = ClientSubscriptionSourceEventApplicationReceipt &
  Readonly<{
    result: Extract<ClientSubscriptionSourceEventApplicationReceipt["result"], { outcome: "applied" }>;
  }>;

export type AstroDiarySubscriptionActivationInput = Readonly<{
  /** The source-event UOW has already locked and transitioned this exact subscription. */
  lockedSubscription: ClientSubscription;
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
      subscriptionState: "active" | "cancel_at_period_end";
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
    applicationReceipt.result.subscriptionVersion !== subscription.version ||
    applicationReceipt.result.transitionId !== receipt.transitionId ||
    applicationReceipt.result.slotEffect !== receipt.slotEffect
  ) {
    return { outcome: "rejected", code: "source_event_receipt_mismatch" };
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
  if (subscription.state !== "active" && subscription.state !== "cancel_at_period_end") {
    return { outcome: "rejected", code: "subscription_state_mismatch" };
  }
  if (receipt.period?.sequence !== 1) {
    return {
      outcome: "continue_existing",
      journalEpochId: subscription.journalEpochId,
      subscriptionState: subscription.state
    };
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
