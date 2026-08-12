import type { ClientSubscriptionTransitionOutcome } from "../client-subscription-lifecycle";
import type { ClientSubscription } from "../client-subscription-types";
import type {
  ClientSubscriptionDomainEvent,
  ClientSubscriptionTransitionReceipt
} from "../client-subscription-events";

export type ClientSubscriptionSourceEventApplicationReceipt = Readonly<{
  subscriptionId: string;
  sourceEventId: string;
  sourceEventDigest: `sha256:${string}`;
  evidenceId: string;
  result:
    | Readonly<{
        outcome: "applied";
        subscriptionVersion: number;
        transitionId: string;
        slotEffect: "retain" | "release";
      }>
    | Readonly<{ outcome: "idempotent"; subscriptionVersion: number }>
    | Readonly<{ outcome: "rejected"; code: string }>;
}>;

type ClientSubscriptionSourceEventApplied = Readonly<{
  outcome: "applied";
  subscription: ClientSubscription;
  events: readonly ClientSubscriptionDomainEvent[];
  receipt: ClientSubscriptionTransitionReceipt;
  applicationReceipt: ClientSubscriptionSourceEventApplicationReceipt;
}>;

type ClientSubscriptionSourceEventIdempotent = Readonly<{
  outcome: "idempotent";
  subscription: ClientSubscription;
  events: readonly [];
  applicationReceipt: ClientSubscriptionSourceEventApplicationReceipt;
}>;

export type ClientSubscriptionSourceEventApplicationResult =
  | ClientSubscriptionSourceEventApplied
  | ClientSubscriptionSourceEventIdempotent
  | {
      readonly outcome: "rejected";
      readonly decision: Extract<
        ClientSubscriptionTransitionOutcome,
        { readonly outcome: "rejected" }
      >;
      readonly applicationReceipt: ClientSubscriptionSourceEventApplicationReceipt;
    };

export type ClientSubscriptionSourceEventApplicationExecution =
  | ClientSubscriptionSourceEventApplicationResult
  | {
      readonly outcome: "replayed";
      readonly result: ClientSubscriptionSourceEventApplicationResult;
    }
  | { readonly outcome: "source_event_conflict" }
  | { readonly outcome: "evidence_conflict" }
  | {
      readonly outcome: "version_conflict";
      readonly expectedVersion: number;
      readonly currentVersion: number;
    }
  | { readonly outcome: "not_found" };

export type ClientSubscriptionSourceEventApplicationUnitOfWork = Readonly<{
  /**
   * Looks up `(sourceEventId, digest, evidenceId)` before subscription CAS and atomically
   * persists the transition/outbox plus application receipt. Conflicting identity fails closed.
   */
  apply(
    input: Readonly<{
      subscriptionId: string;
      expectedVersion: number;
      sourceEventId: string;
      sourceEventDigest: `sha256:${string}`;
      evidenceId: string;
      decide: (current: ClientSubscription) => ClientSubscriptionTransitionOutcome;
    }>
  ): Promise<ClientSubscriptionSourceEventApplicationExecution>;
}>;

export function applyClientSubscriptionSourceEvent(
  unitOfWork: ClientSubscriptionSourceEventApplicationUnitOfWork,
  input: Readonly<{
    subscriptionId: string;
    expectedVersion: number;
    sourceEventId: string;
    sourceEventDigest: `sha256:${string}`;
    evidenceId: string;
  }>,
  decide: (current: ClientSubscription) => ClientSubscriptionTransitionOutcome
): Promise<ClientSubscriptionSourceEventApplicationExecution> {
  return unitOfWork.apply({ ...input, decide });
}
