import type { ClientSubscriptionTransitionReceipt } from "../client-subscriptions/client-subscription-events";
import { Temporal } from "@js-temporal/polyfill";

export type ClientEntitlement = {
  readonly id: string;
  readonly capability: "astro_diary";
  readonly subscriptionId: string;
  readonly contractId: string;
  readonly relationshipId: string;
  readonly journalEpochId: string;
  readonly periodId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly state: "active" | "ended" | "revoked";
  readonly sourceTransitionId: string;
  readonly sourceSubscriptionVersion: number;
  readonly version: number;
};

export type ProjectClientEntitlementOutcome =
  | { readonly outcome: "applied" | "idempotent"; readonly entitlement: ClientEntitlement }
  | { readonly outcome: "no_paid_period" }
  | { readonly outcome: "stale_transition"; readonly currentSubscriptionVersion: number }
  | { readonly outcome: "subscription_mismatch" }
  | { readonly outcome: "period_mismatch" };

type ProjectClientEntitlementFailure =
  | { readonly outcome: "no_paid_period" }
  | { readonly outcome: "stale_transition"; readonly currentSubscriptionVersion: number }
  | { readonly outcome: "subscription_mismatch" }
  | { readonly outcome: "period_mismatch" };

export type ProjectClientEntitlementBatchOutcome =
  | {
      readonly outcome: "applied" | "idempotent";
      readonly entitlements: readonly ClientEntitlement[];
    }
  | ProjectClientEntitlementFailure;

export function projectClientEntitlement(
  current: ClientEntitlement | null,
  receipt: ClientSubscriptionTransitionReceipt,
  input: { readonly entitlementId: string }
): ProjectClientEntitlementOutcome {
  if (receipt.source !== "client_subscription_transition") {
    return { outcome: "subscription_mismatch" };
  }
  if (current) {
    if (
      current.subscriptionId !== receipt.subscriptionId ||
      current.contractId !== receipt.contractId ||
      current.relationshipId !== receipt.relationshipId ||
      current.journalEpochId !== receipt.journalEpochId
    ) {
      return { outcome: "subscription_mismatch" };
    }
    if (
      receipt.entitlementScope === "period" &&
      receipt.period &&
      current.periodId !== receipt.period.id
    ) {
      return { outcome: "period_mismatch" };
    }
    if (current.sourceTransitionId === receipt.transitionId) {
      return { outcome: "idempotent", entitlement: current };
    }
    if (receipt.subscriptionVersion <= current.sourceSubscriptionVersion) {
      return {
        outcome: "stale_transition",
        currentSubscriptionVersion: current.sourceSubscriptionVersion
      };
    }
  }
  if (!receipt.period) return { outcome: "no_paid_period" };

  const next: ClientEntitlement = {
    id: current?.id ?? input.entitlementId,
    capability: "astro_diary",
    subscriptionId: receipt.subscriptionId,
    contractId: receipt.contractId,
    relationshipId: receipt.relationshipId,
    journalEpochId: receipt.journalEpochId,
    periodId: receipt.period.id,
    startsAt: receipt.period.startsAt,
    endsAt: receipt.period.endsAt,
    state: receipt.entitlementState,
    sourceTransitionId: receipt.transitionId,
    sourceSubscriptionVersion: receipt.subscriptionVersion,
    version: (current?.version ?? 0) + 1
  };
  return { outcome: "applied", entitlement: next };
}

export function projectClientEntitlementBatch(
  current: readonly ClientEntitlement[],
  receipt: ClientSubscriptionTransitionReceipt,
  input: { readonly entitlementId: string }
): ProjectClientEntitlementBatchOutcome {
  if (receipt.entitlementScope === "subscription_all") {
    if (receipt.entitlementState !== "revoked" || current.length === 0) {
      return { outcome: current.length === 0 ? "no_paid_period" : "subscription_mismatch" };
    }
    if (
      current.some(
        (entitlement) =>
          entitlement.subscriptionId !== receipt.subscriptionId ||
          entitlement.contractId !== receipt.contractId ||
          entitlement.relationshipId !== receipt.relationshipId ||
          entitlement.journalEpochId !== receipt.journalEpochId
      )
    ) {
      return { outcome: "subscription_mismatch" };
    }
    const staleActiveVersions = current
      .filter(
        (entitlement) =>
          entitlement.state === "active" &&
          entitlement.sourceTransitionId !== receipt.transitionId &&
          Temporal.Instant.compare(
            Temporal.Instant.from(entitlement.endsAt),
            Temporal.Instant.from(receipt.occurredAt)
          ) > 0 &&
          entitlement.sourceSubscriptionVersion >= receipt.subscriptionVersion
      )
      .map((entitlement) => entitlement.sourceSubscriptionVersion);
    if (staleActiveVersions.length > 0) {
      return {
        outcome: "stale_transition",
        currentSubscriptionVersion: Math.max(...staleActiveVersions)
      };
    }
    const projected = current.map((entitlement) => {
      const alreadyApplied = entitlement.sourceTransitionId === receipt.transitionId;
      const eligible =
        entitlement.state === "active" &&
        Temporal.Instant.compare(
          Temporal.Instant.from(entitlement.endsAt),
          Temporal.Instant.from(receipt.occurredAt)
        ) > 0;
      if (!eligible || alreadyApplied) return entitlement;
      return {
        ...entitlement,
        state: "revoked" as const,
        sourceTransitionId: receipt.transitionId,
        sourceSubscriptionVersion: receipt.subscriptionVersion,
        version: entitlement.version + 1
      };
    });
    const changed = projected.some((entitlement, index) => entitlement !== current[index]);
    return {
      outcome: changed ? "applied" : "idempotent",
      entitlements: projected
    };
  }
  const currentPeriod =
    current.find((entitlement) => entitlement.periodId === receipt.period?.id) ?? null;
  const projected = projectClientEntitlement(currentPeriod, receipt, input);
  if (isProjectedEntitlement(projected)) {
    return { outcome: projected.outcome, entitlements: [projected.entitlement] };
  }
  return projected;
}

function isProjectedEntitlement(outcome: ProjectClientEntitlementOutcome): outcome is {
  readonly outcome: "applied" | "idempotent";
  readonly entitlement: ClientEntitlement;
} {
  return outcome.outcome === "applied" || outcome.outcome === "idempotent";
}

export function canStartAstroDiaryCycle(entitlement: ClientEntitlement, at: string): boolean {
  if (entitlement.capability !== "astro_diary" || entitlement.state !== "active") return false;
  const instant = Temporal.Instant.from(at);
  return (
    Temporal.Instant.compare(instant, Temporal.Instant.from(entitlement.startsAt)) >= 0 &&
    Temporal.Instant.compare(instant, Temporal.Instant.from(entitlement.endsAt)) < 0
  );
}
