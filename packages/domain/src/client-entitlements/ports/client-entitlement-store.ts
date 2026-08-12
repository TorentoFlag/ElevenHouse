import type { ClientSubscriptionTransitionReceipt } from "../../client-subscriptions/client-subscription-events";
import type {
  ClientEntitlement,
  ProjectClientEntitlementBatchOutcome
} from "../client-entitlement-policy";

export type ClientEntitlementProjectionStore = {
  /**
   * Atomically locks every grant in the receipt scope and persists one application
   * receipt with all affected rows. Finance revocation uses `subscription_all`.
   */
  readonly applySubscriptionTransition: (input: {
    readonly receipt: ClientSubscriptionTransitionReceipt;
    readonly entitlementId: string;
    readonly expectedGrantVersions: Readonly<Record<string, number>>;
  }) => Promise<
    | ProjectClientEntitlementBatchOutcome
    | { readonly outcome: "version_conflict"; readonly currentVersion: number }
  >;
  readonly findBySubscriptionAndPeriod: (input: {
    readonly subscriptionId: string;
    readonly periodId: string;
  }) => Promise<ClientEntitlement | null>;
  /** Resolves the bounded grant for start_cycle; continuation is owned by AstroDiaryAccessPolicy. */
  readonly findGrantingAt: (input: {
    readonly subscriptionId: string;
    readonly at: string;
  }) => Promise<ClientEntitlement | null>;
  readonly listBySubscription: (subscriptionId: string) => Promise<readonly ClientEntitlement[]>;
};
