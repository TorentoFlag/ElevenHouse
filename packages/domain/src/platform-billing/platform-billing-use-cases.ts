import type { BillingOverview } from "./platform-billing-types";
import type {
  BillingCurrentPlanSource,
  BillingIntegrityIssue,
  PlatformPlan
} from "./platform-billing-types";
import type { PlatformBillingStore } from "./platform-billing-store";

export async function getPlatformBillingOverview(input: {
  readonly store: PlatformBillingStore;
  readonly ownerUserId: string;
  readonly providerConfigured: boolean;
}): Promise<BillingOverview> {
  const [plans, subscription, paymentMethod, invoices] = await Promise.all([
    input.store.listActivePlans(),
    input.store.findCurrentSubscription({ ownerUserId: input.ownerUserId }),
    input.store.findDefaultPaymentMethod({ ownerUserId: input.ownerUserId }),
    input.store.listRecentInvoices({ ownerUserId: input.ownerUserId, limit: 20 })
  ]);
  const currentPlanState = resolveCurrentPlan({
    plans,
    subscriptionPlanId: subscription?.planId ?? null
  });

  return {
    provider: {
      code: "arc_pay",
      status: input.providerConfigured ? "ready" : "not_configured",
      managePaymentMethodUrl: null,
      checkoutUrl: null
    },
    billingCycle: subscription?.billingCycle ?? "month",
    currentPlan: currentPlanState.currentPlan,
    currentPlanSource: currentPlanState.currentPlanSource,
    integrityIssues: currentPlanState.integrityIssues,
    currentSubscription: subscription
      ? {
          id: subscription.id,
          planId: subscription.planId,
          status: subscription.status,
          billingCycle: subscription.billingCycle,
          currentPeriodEndsAt: subscription.currentPeriodEndsAt,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
        }
      : null,
    plans: plans.map((plan) => ({
      ...plan,
      features: [...plan.features]
    })),
    paymentMethod: paymentMethod
      ? {
          id: paymentMethod.id,
          provider: paymentMethod.provider,
          brand: paymentMethod.brand,
          last4: paymentMethod.last4,
          expiresAt: paymentMethod.expiresAt
        }
      : null,
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      provider: invoice.provider,
      status: invoice.status,
      planId: invoice.planId,
      billingCycle: invoice.billingCycle,
      amountMinor: invoice.amountMinor,
      currency: invoice.currency,
      issuedAt: invoice.issuedAt,
      paidAt: invoice.paidAt,
      receiptUrl: invoice.receiptUrl
    }))
  };
}

function resolveCurrentPlan(input: {
  readonly plans: readonly PlatformPlan[];
  readonly subscriptionPlanId: string | null;
}): {
  readonly currentPlan: PlatformPlan | null;
  readonly currentPlanSource: BillingCurrentPlanSource;
  readonly integrityIssues: readonly BillingIntegrityIssue[];
} {
  if (input.subscriptionPlanId) {
    const subscriptionPlan = input.plans.find((plan) => plan.id === input.subscriptionPlanId);
    if (subscriptionPlan) {
      return {
        currentPlan: subscriptionPlan,
        currentPlanSource: "subscription",
        integrityIssues: []
      };
    }

    return {
      currentPlan: null,
      currentPlanSource: "unresolved",
      integrityIssues: [
        {
          code: "subscription_plan_not_found",
          severity: "error",
          planId: input.subscriptionPlanId,
          message: "Current subscription references an inactive or missing plan"
        }
      ]
    };
  }

  const defaultPlan = input.plans.find((plan) => plan.code === "start") ?? null;
  if (defaultPlan) {
    return {
      currentPlan: defaultPlan,
      currentPlanSource: "default",
      integrityIssues: []
    };
  }

  return {
    currentPlan: null,
    currentPlanSource: "unresolved",
    integrityIssues: [
      {
        code: "default_plan_not_found",
        severity: "error",
        planId: null,
        message: "Default Start plan is missing from the active billing catalog"
      }
    ]
  };
}
