import { sha256CanonicalJson, type CanonicalJson } from "../../calculations/canonical-json";
import type {
  ClientSubscriptionDomainEvent,
  ClientSubscriptionTransitionReceipt
} from "../client-subscription-events";
import type { ClientSubscriptionTransitionOutcome } from "../client-subscription-lifecycle";
import type { ClientSubscription } from "../client-subscription-types";

export type ClientSubscriptionCommandDecision = ClientSubscriptionTransitionOutcome;

export type ClientSubscriptionCommandPersistenceReceipt = Readonly<{
  subscriptionId: string;
  expectedVersion: number;
  idempotencyKey: string;
  requestHash: `sha256:${string}`;
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

export type ClientSubscriptionCommandApplied = {
  readonly outcome: "applied";
  readonly subscription: ClientSubscription;
  readonly events: readonly ClientSubscriptionDomainEvent[];
  readonly receipt: ClientSubscriptionTransitionReceipt;
  readonly commandReceipt: ClientSubscriptionCommandPersistenceReceipt;
};

export type ClientSubscriptionCommandRejected = {
  readonly outcome: "rejected";
  readonly decision: Extract<ClientSubscriptionCommandDecision, { readonly outcome: "rejected" }>;
  readonly commandReceipt: ClientSubscriptionCommandPersistenceReceipt;
};

export type ClientSubscriptionCommandIdempotent = {
  readonly outcome: "idempotent";
  readonly subscription: ClientSubscription;
  readonly events: readonly [];
  readonly commandReceipt: ClientSubscriptionCommandPersistenceReceipt;
};

export type ClientSubscriptionCommandPersistedResult =
  | ClientSubscriptionCommandApplied
  | ClientSubscriptionCommandIdempotent
  | ClientSubscriptionCommandRejected;

export type ClientSubscriptionCommandExecution =
  | ClientSubscriptionCommandApplied
  | ClientSubscriptionCommandIdempotent
  | ClientSubscriptionCommandRejected
  | { readonly outcome: "replayed"; readonly result: ClientSubscriptionCommandPersistedResult }
  | {
      readonly outcome: "version_conflict";
      readonly expectedVersion: number;
      readonly currentVersion: number;
    }
  | { readonly outcome: "idempotency_conflict" }
  | { readonly outcome: "not_found" };

export type ClientSubscriptionCommandUnitOfWork = {
  /**
   * Locks the subscription and command-receipt scope, checks idempotency before CAS,
   * then atomically persists the head, lifecycle rows, entitlement projection,
   * IDs-only outbox events, and a receipt for an applied or deterministic rejected decision.
   * `not_found` and `version_conflict` are transient and must never create a receipt.
   */
  readonly execute: (input: {
    readonly subscriptionId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly requestHash: `sha256:${string}`;
    readonly decide: (current: ClientSubscription) => ClientSubscriptionCommandDecision;
  }) => Promise<ClientSubscriptionCommandExecution>;
};

export function executeClientSubscriptionCommand(
  unitOfWork: ClientSubscriptionCommandUnitOfWork,
  input: {
    readonly subscriptionId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly request: CanonicalJson;
  },
  decide: (current: ClientSubscription) => ClientSubscriptionCommandDecision
): Promise<ClientSubscriptionCommandExecution> {
  return unitOfWork.execute({
    subscriptionId: input.subscriptionId,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    requestHash: sha256CanonicalJson({
      subscriptionId: input.subscriptionId,
      expectedVersion: input.expectedVersion,
      request: input.request
    }),
    decide
  });
}
