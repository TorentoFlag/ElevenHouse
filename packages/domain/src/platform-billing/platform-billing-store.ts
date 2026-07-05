import type {
  BillingInvoice,
  BillingPaymentMethod,
  PlatformPlan,
  PlatformSubscription
} from "./platform-billing-types";

export type PlatformBillingStore = {
  readonly listActivePlans: () => Promise<readonly PlatformPlan[]>;
  readonly findCurrentSubscription: (input: {
    readonly ownerUserId: string;
  }) => Promise<PlatformSubscription | null>;
  readonly findDefaultPaymentMethod: (input: {
    readonly ownerUserId: string;
  }) => Promise<BillingPaymentMethod | null>;
  readonly listRecentInvoices: (input: {
    readonly ownerUserId: string;
    readonly limit: number;
  }) => Promise<readonly BillingInvoice[]>;
};
