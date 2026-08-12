import type { ClientSubscription } from "../client-subscription-types";

export type ClientSubscriptionReader = {
  readonly findById: (subscriptionId: string) => Promise<ClientSubscription | null>;
  readonly findCurrentByRelationshipAndProduct: (input: {
    readonly relationshipId: string;
    readonly productId: string;
  }) => Promise<ClientSubscription | null>;
};
