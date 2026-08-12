import {
  clientSubscriptionEventSchema,
  type ClientSubscriptionEvent
} from "@elevenhouse/contracts";
import type { ClientSubscription, ClientSubscriptionPeriod } from "./client-subscription-types";

export type ClientSubscriptionDomainEvent = ClientSubscriptionEvent;

export type ClientSubscriptionTransitionReceipt = {
  readonly source: "client_subscription_transition";
  readonly transitionId: string;
  readonly subscriptionId: string;
  readonly contractId: string;
  readonly relationshipId: string;
  readonly journalEpochId: string;
  readonly subscriptionVersion: number;
  readonly state: ClientSubscription["state"];
  readonly entitlementState: "active" | "ended" | "revoked";
  readonly entitlementScope: "none" | "period" | "subscription_all";
  readonly period: ClientSubscriptionPeriod | null;
  readonly slotEffect: "retain" | "release";
  readonly occurredAt: string;
};

type EventMeta = {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly subscription: ClientSubscription;
};

type ClientSubscriptionEventInput = EventMeta &
  (
    | {
        readonly eventType: "client_subscription.renewal_charge_requested.v1";
        readonly sourcePeriodId: string;
        readonly intendedPeriodId: string;
        readonly renewalRequestId: string;
      }
    | {
        readonly eventType: "client_subscription.initial_payment_ended.v1";
        readonly financeEvidenceId: string;
        readonly reason: "checkout_expired" | "payment_failed";
      }
    | {
        readonly eventType: "client_subscription.capture_applied.v1";
        readonly periodId: string;
        readonly financeEvidenceId: string;
      }
    | {
        readonly eventType:
          | "client_subscription.activated.v1"
          | "client_subscription.period_renewed.v1"
          | "client_subscription.cancellation_scheduled.v1"
          | "client_subscription.cancellation_revoked.v1"
          | "client_subscription.period_ended.v1";
        readonly periodId: string;
      }
    | {
        readonly eventType: "client_subscription.renewal_failed.v1";
        readonly renewalRequestId: string;
        readonly intendedPeriodId: string;
        readonly renewalAttemptId: string;
      }
    | {
        readonly eventType: "client_subscription.revoked.v1";
        readonly periodId: string;
        readonly financeEvidenceId: string;
      }
    | {
        readonly eventType: "client_subscription.entitlement_changed.v1";
        readonly entitlementScope: "period";
        readonly periodId: string;
      }
    | {
        readonly eventType: "client_subscription.entitlement_changed.v1";
        readonly entitlementScope: "subscription_all";
      }
  );

export function clientSubscriptionEvent(
  input: ClientSubscriptionEventInput
): ClientSubscriptionDomainEvent {
  const envelope = {
    eventId: input.eventId,
    eventType: input.eventType,
    schemaVersion: 1 as const,
    occurredAt: input.occurredAt
  };
  const commonData = {
    subscriptionId: input.subscription.id,
    contractId: input.subscription.contract.id
  };
  let event: ClientSubscriptionEvent;
  switch (input.eventType) {
    case "client_subscription.renewal_charge_requested.v1":
      event = {
        ...envelope,
        eventType: input.eventType,
        data: {
          ...commonData,
          sourcePeriodId: input.sourcePeriodId,
          intendedPeriodId: input.intendedPeriodId,
          renewalRequestId: input.renewalRequestId
        }
      };
      break;
    case "client_subscription.capture_applied.v1":
      event = {
        ...envelope,
        eventType: input.eventType,
        data: {
          ...commonData,
          periodId: input.periodId,
          financeEvidenceId: input.financeEvidenceId
        }
      };
      break;
    case "client_subscription.initial_payment_ended.v1":
      event = {
        ...envelope,
        eventType: input.eventType,
        data: {
          ...commonData,
          financeEvidenceId: input.financeEvidenceId,
          reason: input.reason
        }
      };
      break;
    case "client_subscription.renewal_failed.v1":
      event = {
        ...envelope,
        eventType: input.eventType,
        data: {
          ...commonData,
          renewalRequestId: input.renewalRequestId,
          intendedPeriodId: input.intendedPeriodId,
          renewalAttemptId: input.renewalAttemptId
        }
      };
      break;
    case "client_subscription.revoked.v1":
      event = {
        ...envelope,
        eventType: input.eventType,
        data: {
          ...commonData,
          periodId: input.periodId,
          financeEvidenceId: input.financeEvidenceId
        }
      };
      break;
    case "client_subscription.entitlement_changed.v1":
      event =
        input.entitlementScope === "period"
          ? {
              ...envelope,
              eventType: input.eventType,
              data: {
                ...commonData,
                scope: input.entitlementScope,
                relationshipId: input.subscription.contract.relationshipId,
                journalEpochId: input.subscription.journalEpochId,
                periodId: input.periodId
              }
            }
          : {
              ...envelope,
              eventType: input.eventType,
              data: {
                ...commonData,
                scope: input.entitlementScope,
                relationshipId: input.subscription.contract.relationshipId,
                journalEpochId: input.subscription.journalEpochId
              }
            };
      break;
    default:
      event = {
        ...envelope,
        eventType: input.eventType,
        data: { ...commonData, periodId: input.periodId }
      };
  }
  return clientSubscriptionEventSchema.parse(event);
}

export function clientSubscriptionTransitionReceipt(input: {
  readonly transitionId: string;
  readonly subscription: ClientSubscription;
  readonly period: ClientSubscriptionPeriod | null;
  readonly occurredAt: string;
  readonly entitlementState?: ClientSubscriptionTransitionReceipt["entitlementState"];
  readonly entitlementScope?: ClientSubscriptionTransitionReceipt["entitlementScope"];
  readonly slotEffect?: ClientSubscriptionTransitionReceipt["slotEffect"];
}): ClientSubscriptionTransitionReceipt {
  return {
    source: "client_subscription_transition",
    transitionId: input.transitionId,
    subscriptionId: input.subscription.id,
    contractId: input.subscription.contract.id,
    relationshipId: input.subscription.contract.relationshipId,
    journalEpochId: input.subscription.journalEpochId,
    subscriptionVersion: input.subscription.version,
    state: input.subscription.state,
    entitlementState:
      input.entitlementState ??
      (input.subscription.state === "revoked"
        ? "revoked"
        : input.subscription.state === "ended"
          ? "ended"
          : "active"),
    entitlementScope: input.entitlementScope ?? "period",
    period: input.period,
    slotEffect: input.slotEffect ?? "retain",
    occurredAt: input.occurredAt
  };
}
