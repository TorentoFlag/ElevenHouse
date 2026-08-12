import { sha256CanonicalJson, type CanonicalJson } from "../../calculations/canonical-json";
import type {
  ClientSubscription,
  ClientSubscriptionContract,
  ClientSubscriptionOrderSnapshot,
  ClientSubscriptionProductSnapshot,
  ClientSubscriptionRelationshipSnapshot
} from "../client-subscription-types";

export type ClientSubscriptionCreationAuthority = Readonly<{
  order: ClientSubscriptionOrderSnapshot;
  product: ClientSubscriptionProductSnapshot;
  relationship: ClientSubscriptionRelationshipSnapshot;
}>;

export type ClientSubscriptionCreationDecision =
  | {
      readonly outcome: "created";
      readonly contract: ClientSubscriptionContract;
      readonly subscription: ClientSubscription;
    }
  | { readonly outcome: "rejected"; readonly code: string };

export type ClientSubscriptionCreationReceipt = Readonly<{
  orderId: string;
  idempotencyKey: string;
  requestHash: `sha256:${string}`;
  slot: Readonly<{
    relationshipId: string;
    productId: string;
    expectedVersion: number;
    resultVersion: number;
    effect: "assign" | "retain";
  }>;
  result:
    | Readonly<{
        outcome: "created";
        subscriptionId: string;
        contractId: string;
        contractDigest: `sha256:${string}`;
      }>
    | Readonly<{ outcome: "rejected"; code: string }>;
}>;

export type ClientSubscriptionCreationResult =
  | (Extract<ClientSubscriptionCreationDecision, { outcome: "created" }> & {
      readonly persistenceReceipt: ClientSubscriptionCreationReceipt;
    })
  | (Extract<ClientSubscriptionCreationDecision, { outcome: "rejected" }> & {
      readonly persistenceReceipt: ClientSubscriptionCreationReceipt;
    });

export type ClientSubscriptionCreationExecution =
  | ClientSubscriptionCreationResult
  | { readonly outcome: "replayed"; readonly result: ClientSubscriptionCreationResult }
  | {
      readonly outcome: "version_conflict";
      readonly expectedVersion: number;
      readonly currentVersion: number;
    }
  | { readonly outcome: "idempotency_conflict" }
  | { readonly outcome: "not_found" };

export type ClientSubscriptionCreationUnitOfWork = Readonly<{
  /**
   * Locks the natural current-subscription slot `(relationshipId, productId)`, then
   * rehydrates the exact order/product/relationship authority under the same transaction.
   * Creation and deterministic rejection receipts are unique by `(orderId, idempotencyKey)`.
   */
  execute(
    input: Readonly<{
      subscriptionId: string;
      orderId: string;
      productId: string;
      relationshipId: string;
      expectedSlotVersion: number;
      idempotencyKey: string;
      requestHash: `sha256:${string}`;
      decide: (
        authority: ClientSubscriptionCreationAuthority
      ) => ClientSubscriptionCreationDecision;
    }>
  ): Promise<ClientSubscriptionCreationExecution>;
}>;

export function executeClientSubscriptionCreation(
  unitOfWork: ClientSubscriptionCreationUnitOfWork,
  input: Readonly<{
    subscriptionId: string;
    orderId: string;
    productId: string;
    relationshipId: string;
    expectedSlotVersion: number;
    idempotencyKey: string;
    request: CanonicalJson;
  }>,
  decide: (authority: ClientSubscriptionCreationAuthority) => ClientSubscriptionCreationDecision
): Promise<ClientSubscriptionCreationExecution> {
  return unitOfWork.execute({
    subscriptionId: input.subscriptionId,
    orderId: input.orderId,
    productId: input.productId,
    relationshipId: input.relationshipId,
    expectedSlotVersion: input.expectedSlotVersion,
    idempotencyKey: input.idempotencyKey,
    requestHash: sha256CanonicalJson({
      subscriptionId: input.subscriptionId,
      orderId: input.orderId,
      productId: input.productId,
      relationshipId: input.relationshipId,
      expectedSlotVersion: input.expectedSlotVersion,
      request: input.request
    }),
    decide
  });
}
