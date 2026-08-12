import { Temporal } from "@js-temporal/polyfill";
import {
  clientSubscriptionEvent,
  clientSubscriptionTransitionReceipt,
  type ClientSubscriptionDomainEvent,
  type ClientSubscriptionTransitionReceipt
} from "./client-subscription-events";
import type {
  ClientSubscription,
  ClientSubscriptionAnchor,
  ClientSubscriptionContract,
  ClientSubscriptionPeriod
} from "./client-subscription-types";

type AppliedTransition = {
  readonly outcome: "applied";
  readonly subscription: ClientSubscription;
  readonly events: readonly ClientSubscriptionDomainEvent[];
  readonly receipt: ClientSubscriptionTransitionReceipt;
};
type IdempotentTransition = {
  readonly outcome: "idempotent";
  readonly subscription: ClientSubscription;
  readonly events: readonly [];
};
type RejectedTransition = {
  readonly outcome: "rejected";
  readonly code:
    | "initial_capture_already_applied"
    | "initial_payment_ended"
    | "initial_capture_required"
    | "future_period_exists"
    | "subscription_revoked"
    | "no_paid_period"
    | "cancellation_already_effective"
    | "cancellation_not_scheduled"
    | "paid_access_not_ended"
    | "renewal_disabled"
    | "renewal_request_exists"
    | "renewal_request_mismatch"
    | "renewal_period_mismatch"
    | "paid_access_ended";
};
export type ClientSubscriptionTransitionOutcome =
  | AppliedTransition
  | IdempotentTransition
  | RejectedTransition;

export function createPendingClientSubscription(input: {
  readonly subscriptionId: string;
  readonly journalEpochId: string;
  readonly contract: ClientSubscriptionContract;
}): ClientSubscription {
  return {
    id: input.subscriptionId,
    contract: input.contract,
    journalEpochId: input.journalEpochId,
    state: "pending_initial_payment",
    version: 1,
    cancellationEffectiveAt: null,
    renewalStoppedAt: null,
    renewalRequest: null,
    paidPeriods: [],
    endedPeriodIds: [],
    appliedFinanceEvidenceIds: []
  };
}

export function requestRenewalCharge(
  subscription: ClientSubscription,
  input: {
    readonly renewalRequestId: string;
    readonly sourcePeriodId: string;
    readonly intendedPeriodId: string;
    readonly requestedAt: string;
    readonly eventId: string;
  }
): ClientSubscriptionTransitionOutcome {
  const requestedAt = Temporal.Instant.from(input.requestedAt).toString();
  if (subscription.renewalStoppedAt) {
    return { outcome: "rejected", code: "renewal_disabled" };
  }
  if (subscription.renewalRequest) {
    const existing = subscription.renewalRequest;
    if (
      existing.id === input.renewalRequestId &&
      existing.sourcePeriodId === input.sourcePeriodId &&
      existing.intendedPeriodId === input.intendedPeriodId &&
      existing.requestedAt === requestedAt
    ) {
      return idempotent(subscription);
    }
    return {
      outcome: "rejected",
      code:
        existing.id === input.renewalRequestId
          ? "renewal_request_mismatch"
          : "renewal_request_exists"
    };
  }
  if (subscription.state === "revoked") {
    return { outcome: "rejected", code: "subscription_revoked" };
  }
  if (subscription.state === "cancel_at_period_end" || subscription.state === "ended") {
    return { outcome: "rejected", code: "renewal_disabled" };
  }
  if (subscription.state === "pending_initial_payment") {
    return { outcome: "rejected", code: "initial_capture_required" };
  }
  const sourcePeriod = subscription.paidPeriods.at(-1);
  if (!sourcePeriod) return { outcome: "rejected", code: "no_paid_period" };
  if (sourcePeriod.id !== input.sourcePeriodId) {
    return { outcome: "rejected", code: "renewal_period_mismatch" };
  }
  if (
    subscription.paidPeriods.some((period) => period.id === input.intendedPeriodId) ||
    Temporal.Instant.compare(
      Temporal.Instant.from(sourcePeriod.startsAt),
      Temporal.Instant.from(requestedAt)
    ) > 0
  ) {
    return { outcome: "rejected", code: "future_period_exists" };
  }
  if (
    Temporal.Instant.compare(
      Temporal.Instant.from(requestedAt),
      Temporal.Instant.from(sourcePeriod.endsAt)
    ) >= 0
  ) {
    return { outcome: "rejected", code: "paid_access_ended" };
  }
  const next: ClientSubscription = {
    ...subscription,
    version: subscription.version + 1,
    renewalRequest: {
      id: input.renewalRequestId,
      sourcePeriodId: input.sourcePeriodId,
      intendedPeriodId: input.intendedPeriodId,
      requestedAt
    }
  };
  return applied(next, sourcePeriod, requestedAt, [
    clientSubscriptionEvent({
      eventId: input.eventId,
      eventType: "client_subscription.renewal_charge_requested.v1",
      occurredAt: requestedAt,
      subscription: next,
      sourcePeriodId: input.sourcePeriodId,
      intendedPeriodId: input.intendedPeriodId,
      renewalRequestId: input.renewalRequestId
    })
  ], undefined, "none");
}

export function applyInitialCapture(
  subscription: ClientSubscription,
  input: {
    readonly sourceEventId: string;
    readonly evidenceId: string;
    readonly capturedAt: string;
    readonly periodId: string;
    readonly eventIds: readonly [string, string];
  }
): ClientSubscriptionTransitionOutcome {
  if (subscription.appliedFinanceEvidenceIds.includes(input.evidenceId)) {
    return idempotent(subscription);
  }
  if (subscription.state === "ended" && subscription.paidPeriods.length === 0) {
    return { outcome: "rejected", code: "initial_payment_ended" };
  }
  if (subscription.state !== "pending_initial_payment" || subscription.paidPeriods.length > 0) {
    return { outcome: "rejected", code: "initial_capture_already_applied" };
  }
  const period = createPeriodFromCapture(subscription.contract, {
    periodId: input.periodId,
    sequence: 1,
    capturedAt: input.capturedAt
  });
  const next: ClientSubscription = {
    ...subscription,
    state: "active",
    version: subscription.version + 1,
    paidPeriods: [period],
    appliedFinanceEvidenceIds: [...subscription.appliedFinanceEvidenceIds, input.evidenceId]
  };
  return applied(
    next,
    period,
    input.capturedAt,
    [
      clientSubscriptionEvent({
        eventId: input.eventIds[0],
        eventType: "client_subscription.activated.v1",
        occurredAt: input.capturedAt,
        subscription: next,
        periodId: period.id
      }),
      clientSubscriptionEvent({
        eventId: input.eventIds[1],
        eventType: "client_subscription.entitlement_changed.v1",
        occurredAt: input.capturedAt,
        subscription: next,
        periodId: period.id,
        entitlementScope: "period"
      })
    ],
    undefined,
    undefined,
    input.sourceEventId
  );
}

export function endPendingInitialPayment(
  subscription: ClientSubscription,
  input: {
    readonly sourceEventId: string;
    readonly evidenceId: string;
    readonly reason: "checkout_expired" | "payment_failed";
    readonly observedAt: string;
    readonly eventId: string;
  }
): ClientSubscriptionTransitionOutcome {
  if (subscription.appliedFinanceEvidenceIds.includes(input.evidenceId)) {
    return idempotent(subscription);
  }
  if (subscription.state !== "pending_initial_payment" || subscription.paidPeriods.length > 0) {
    return { outcome: "rejected", code: "initial_capture_already_applied" };
  }
  const next: ClientSubscription = {
    ...subscription,
    state: "ended",
    version: subscription.version + 1,
    appliedFinanceEvidenceIds: [...subscription.appliedFinanceEvidenceIds, input.evidenceId]
  };
  return applied(
    next,
    null,
    input.observedAt,
    [
      clientSubscriptionEvent({
        eventId: input.eventId,
        eventType: "client_subscription.initial_payment_ended.v1",
        occurredAt: input.observedAt,
        subscription: next,
        financeEvidenceId: input.evidenceId,
        reason: input.reason
      })
    ],
    "ended",
    "none",
    input.sourceEventId,
    "release"
  );
}

export function applyRenewalCapture(
  subscription: ClientSubscription,
  input: {
    readonly sourceEventId: string;
    readonly evidenceId: string;
    readonly renewalRequestId: string;
    readonly intendedPeriodId: string;
    readonly capturedAt: string;
    readonly periodId: string;
    readonly eventIds: readonly [string, string];
  }
): ClientSubscriptionTransitionOutcome {
  if (subscription.appliedFinanceEvidenceIds.includes(input.evidenceId)) {
    return idempotent(subscription);
  }
  if (subscription.state === "revoked")
    return { outcome: "rejected", code: "subscription_revoked" };
  if (subscription.state === "pending_initial_payment" || subscription.paidPeriods.length === 0) {
    return { outcome: "rejected", code: "initial_capture_required" };
  }
  if (!subscription.renewalRequest || subscription.renewalRequest.id !== input.renewalRequestId) {
    return { outcome: "rejected", code: "renewal_request_mismatch" };
  }
  if (
    subscription.renewalRequest.intendedPeriodId !== input.intendedPeriodId ||
    input.periodId !== input.intendedPeriodId
  ) {
    return { outcome: "rejected", code: "renewal_period_mismatch" };
  }

  const captured = Temporal.Instant.from(input.capturedAt);
  const last = subscription.paidPeriods.at(-1)!;
  const lastStart = Temporal.Instant.from(last.startsAt);
  if (Temporal.Instant.compare(lastStart, captured) > 0) {
    return { outcome: "rejected", code: "future_period_exists" };
  }

  const nextSequence = last.sequence + 1;
  const beforeEnd = Temporal.Instant.compare(captured, Temporal.Instant.from(last.endsAt)) < 0;
  const period = beforeEnd
    ? createContiguousPeriod(subscription.contract, last, input.periodId, nextSequence)
    : createPeriodFromCapture(subscription.contract, {
        periodId: input.periodId,
        sequence: nextSequence,
        capturedAt: input.capturedAt
      });
  const renewalStopped = subscription.renewalStoppedAt !== null;
  const cancellationEffectiveAt = renewalStopped ? period.endsAt : null;
  const next: ClientSubscription = {
    ...subscription,
    state: renewalStopped ? "cancel_at_period_end" : "active",
    version: subscription.version + 1,
    cancellationEffectiveAt,
    renewalRequest: null,
    paidPeriods: [...subscription.paidPeriods, period],
    appliedFinanceEvidenceIds: [...subscription.appliedFinanceEvidenceIds, input.evidenceId]
  };
  return applied(
    next,
    period,
    input.capturedAt,
    [
      clientSubscriptionEvent({
        eventId: input.eventIds[0],
        eventType: "client_subscription.period_renewed.v1",
        occurredAt: input.capturedAt,
        subscription: next,
        periodId: period.id
      }),
      clientSubscriptionEvent({
        eventId: input.eventIds[1],
        eventType: "client_subscription.entitlement_changed.v1",
        occurredAt: input.capturedAt,
        subscription: next,
        periodId: period.id,
        entitlementScope: "period"
      })
    ],
    undefined,
    undefined,
    input.sourceEventId
  );
}

export function scheduleCancellation(
  subscription: ClientSubscription,
  input: { readonly now: string; readonly eventId: string }
): ClientSubscriptionTransitionOutcome {
  if (subscription.state === "revoked")
    return { outcome: "rejected", code: "subscription_revoked" };
  const last = subscription.paidPeriods.at(-1);
  if (!last) return { outcome: "rejected", code: "no_paid_period" };
  if (subscription.state === "cancel_at_period_end") return idempotent(subscription);
  if (
    Temporal.Instant.compare(
      Temporal.Instant.from(input.now),
      Temporal.Instant.from(last.endsAt)
    ) >= 0
  ) {
    return { outcome: "rejected", code: "cancellation_already_effective" };
  }
  const next: ClientSubscription = {
    ...subscription,
    state: "cancel_at_period_end",
    version: subscription.version + 1,
    cancellationEffectiveAt: last.endsAt,
    renewalStoppedAt: Temporal.Instant.from(input.now).toString()
  };
  return applied(next, last, input.now, [
    clientSubscriptionEvent({
      eventId: input.eventId,
      eventType: "client_subscription.cancellation_scheduled.v1",
      occurredAt: input.now,
      subscription: next,
      periodId: last.id
    })
  ], undefined, "none");
}

export function revokeCancellation(
  subscription: ClientSubscription,
  input: { readonly now: string; readonly eventId: string }
): ClientSubscriptionTransitionOutcome {
  if (subscription.state !== "cancel_at_period_end" || !subscription.cancellationEffectiveAt) {
    return { outcome: "rejected", code: "cancellation_not_scheduled" };
  }
  if (
    Temporal.Instant.compare(
      Temporal.Instant.from(input.now),
      Temporal.Instant.from(subscription.cancellationEffectiveAt)
    ) >= 0
  ) {
    return { outcome: "rejected", code: "cancellation_already_effective" };
  }
  const last = subscription.paidPeriods.at(-1)!;
  const next: ClientSubscription = {
    ...subscription,
    state: "active",
    version: subscription.version + 1,
    cancellationEffectiveAt: null,
    renewalStoppedAt: null
  };
  return applied(next, last, input.now, [
    clientSubscriptionEvent({
      eventId: input.eventId,
      eventType: "client_subscription.cancellation_revoked.v1",
      occurredAt: input.now,
      subscription: next,
      periodId: last.id
    })
  ], undefined, "none");
}

export function applyRenewalFailure(
  subscription: ClientSubscription,
  input: {
    readonly renewalRequestId: string;
    readonly intendedPeriodId: string;
    readonly attemptId: string;
    readonly observedAt: string;
    readonly eventId: string;
  }
): ClientSubscriptionTransitionOutcome {
  if (subscription.appliedFinanceEvidenceIds.includes(input.attemptId))
    return idempotent(subscription);
  if (subscription.state === "revoked")
    return { outcome: "rejected", code: "subscription_revoked" };
  const last = subscription.paidPeriods.at(-1);
  if (!last) return { outcome: "rejected", code: "no_paid_period" };
  if (!subscription.renewalRequest || subscription.renewalRequest.id !== input.renewalRequestId) {
    return { outcome: "rejected", code: "renewal_request_mismatch" };
  }
  if (subscription.renewalRequest.intendedPeriodId !== input.intendedPeriodId) {
    return { outcome: "rejected", code: "renewal_period_mismatch" };
  }
  const next: ClientSubscription = {
    ...subscription,
    version: subscription.version + 1,
    appliedFinanceEvidenceIds: [...subscription.appliedFinanceEvidenceIds, input.attemptId]
  };
  return applied(next, last, input.observedAt, [
    clientSubscriptionEvent({
      eventId: input.eventId,
      eventType: "client_subscription.renewal_failed.v1",
      occurredAt: input.observedAt,
      subscription: next,
      renewalRequestId: input.renewalRequestId,
      intendedPeriodId: input.intendedPeriodId,
      renewalAttemptId: input.attemptId
    })
  ], undefined, "none");
}

export function endSubscriptionAtPaidBoundary(
  subscription: ClientSubscription,
  input: { readonly now: string; readonly eventIds: readonly [string, string] }
): ClientSubscriptionTransitionOutcome {
  if (subscription.state === "revoked")
    return { outcome: "rejected", code: "subscription_revoked" };
  const endedPeriod = subscription.paidPeriods.find(
    (period) =>
      !subscription.endedPeriodIds.includes(period.id) &&
      Temporal.Instant.compare(
        Temporal.Instant.from(input.now),
        Temporal.Instant.from(period.endsAt)
      ) >= 0
  );
  if (!endedPeriod) {
    if (subscription.state === "ended") return idempotent(subscription);
    if (subscription.paidPeriods.length === 0)
      return { outcome: "rejected", code: "no_paid_period" };
    return { outcome: "rejected", code: "paid_access_not_ended" };
  }
  const last = subscription.paidPeriods.at(-1)!;
  const lastPeriodEnded = endedPeriod.id === last.id;
  const next: ClientSubscription = {
    ...subscription,
    state: lastPeriodEnded ? "ended" : subscription.state,
    version: subscription.version + 1,
    cancellationEffectiveAt: lastPeriodEnded ? null : subscription.cancellationEffectiveAt,
    endedPeriodIds: [...subscription.endedPeriodIds, endedPeriod.id]
  };
  return applied(
    next,
    endedPeriod,
    input.now,
    [
      clientSubscriptionEvent({
        eventId: input.eventIds[0],
        eventType: "client_subscription.period_ended.v1",
        occurredAt: input.now,
        subscription: next,
        periodId: endedPeriod.id
      }),
      clientSubscriptionEvent({
        eventId: input.eventIds[1],
        eventType: "client_subscription.entitlement_changed.v1",
        occurredAt: input.now,
        subscription: next,
        periodId: endedPeriod.id,
        entitlementScope: "period"
      })
    ],
    "ended",
    undefined,
    undefined,
    lastPeriodEnded && next.renewalRequest === null ? "release" : "retain"
  );
}

export function applyPermanentRevocation(
  subscription: ClientSubscription,
  input: {
    readonly evidenceId: string;
    readonly reason: "full_refund_succeeded" | "chargeback_observed";
    readonly observedAt: string;
    readonly eventIds: readonly [string, string];
  }
): ClientSubscriptionTransitionOutcome {
  if (subscription.appliedFinanceEvidenceIds.includes(input.evidenceId))
    return idempotent(subscription);
  const last = subscription.paidPeriods.at(-1);
  if (!last) return { outcome: "rejected", code: "no_paid_period" };
  const next: ClientSubscription = {
    ...subscription,
    state: "revoked",
    version: subscription.version + 1,
    cancellationEffectiveAt: null,
    renewalRequest: null,
    appliedFinanceEvidenceIds: [...subscription.appliedFinanceEvidenceIds, input.evidenceId]
  };
  return applied(
    next,
    null,
    input.observedAt,
    [
      clientSubscriptionEvent({
        eventId: input.eventIds[0],
        eventType: "client_subscription.revoked.v1",
        occurredAt: input.observedAt,
        subscription: next,
        periodId: last.id,
        financeEvidenceId: input.evidenceId
      }),
      clientSubscriptionEvent({
        eventId: input.eventIds[1],
        eventType: "client_subscription.entitlement_changed.v1",
        occurredAt: input.observedAt,
        subscription: next,
        entitlementScope: "subscription_all"
      })
    ],
    "revoked",
    "subscription_all",
    undefined,
    "release"
  );
}

function createPeriodFromCapture(
  contract: ClientSubscriptionContract,
  input: { readonly periodId: string; readonly sequence: number; readonly capturedAt: string }
): ClientSubscriptionPeriod {
  const captured = Temporal.Instant.from(input.capturedAt);
  const start = captured.toZonedDateTimeISO(contract.astroDiaryConfig.serviceTimezone);
  const anchor: ClientSubscriptionAnchor = {
    capturedAt: captured.toString(),
    serviceTimezone: contract.astroDiaryConfig.serviceTimezone,
    originSequence: input.sequence,
    localDateTime: start.toPlainDateTime().toString()
  };
  return buildPeriod(contract, input.periodId, input.sequence, anchor, start, 1);
}

function createContiguousPeriod(
  contract: ClientSubscriptionContract,
  previous: ClientSubscriptionPeriod,
  periodId: string,
  sequence: number
): ClientSubscriptionPeriod {
  const start = Temporal.Instant.from(previous.endsAt).toZonedDateTimeISO(
    previous.anchor.serviceTimezone
  );
  const boundaryIndex = sequence - previous.anchor.originSequence + 1;
  return buildPeriod(contract, periodId, sequence, previous.anchor, start, boundaryIndex);
}

function buildPeriod(
  contract: ClientSubscriptionContract,
  periodId: string,
  sequence: number,
  anchor: ClientSubscriptionAnchor,
  start: Temporal.ZonedDateTime,
  endBoundaryIndex: number
): ClientSubscriptionPeriod {
  const endLocal = addCadenceFromOriginalAnchor(
    Temporal.PlainDateTime.from(anchor.localDateTime),
    contract.cadence,
    endBoundaryIndex
  );
  const end = resolveLocalLater(endLocal, anchor.serviceTimezone);
  return {
    id: periodId,
    sequence,
    startsAt: start.toInstant().toString(),
    endsAt: end.toInstant().toString(),
    anchor,
    resolvedStartLocal: start.toPlainDateTime().toString(),
    resolvedStartOffset: start.offset,
    resolvedEndLocal: end.toPlainDateTime().toString(),
    resolvedEndOffset: end.offset
  };
}

function addCadenceFromOriginalAnchor(
  anchor: Temporal.PlainDateTime,
  cadence: ClientSubscriptionContract["cadence"],
  boundaryIndex: number
): Temporal.PlainDateTime {
  if (cadence === "week") return anchor.add({ days: 7 * boundaryIndex }, { overflow: "constrain" });
  if (cadence === "month") return anchor.add({ months: boundaryIndex }, { overflow: "constrain" });
  return anchor.add({ years: boundaryIndex }, { overflow: "constrain" });
}

function resolveLocalLater(
  local: Temporal.PlainDateTime,
  serviceTimezone: string
): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from(
    {
      timeZone: serviceTimezone,
      year: local.year,
      month: local.month,
      day: local.day,
      hour: local.hour,
      minute: local.minute,
      second: local.second,
      millisecond: local.millisecond,
      microsecond: local.microsecond,
      nanosecond: local.nanosecond
    },
    { disambiguation: "later", overflow: "constrain" }
  );
}

function applied(
  subscription: ClientSubscription,
  period: ClientSubscriptionPeriod | null,
  occurredAt: string,
  events: readonly ClientSubscriptionDomainEvent[],
  entitlementState?: ClientSubscriptionTransitionReceipt["entitlementState"],
  entitlementScope?: ClientSubscriptionTransitionReceipt["entitlementScope"],
  transitionId?: string,
  slotEffect?: ClientSubscriptionTransitionReceipt["slotEffect"]
): AppliedTransition {
  return {
    outcome: "applied",
    subscription,
    events,
    receipt: clientSubscriptionTransitionReceipt({
      transitionId: transitionId ?? events[0]!.eventId,
      subscription,
      period,
      occurredAt,
      entitlementState,
      entitlementScope,
      slotEffect
    })
  };
}

function idempotent(subscription: ClientSubscription): IdempotentTransition {
  return { outcome: "idempotent", subscription, events: [] };
}
