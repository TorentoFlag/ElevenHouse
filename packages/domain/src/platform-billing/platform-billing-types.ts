export type PlatformPlanFeatureCode =
  | "engine"
  | "pdf"
  | "natal"
  | "synastry"
  | "forecast"
  | "solar"
  | "matrix"
  | "numerology"
  | "hd"
  | "horar"
  | "vedic"
  | "astrocal"
  | "child"
  | "page"
  | "products"
  | "calendar"
  | "crm"
  | "funnels"
  | "group"
  | "ai"
  | "aicontent"
  | "triggers"
  | "content"
  | "autopost"
  | "journal"
  | "video"
  | "recordings"
  | "inbox"
  | "analytics"
  | "refs"
  | "team"
  | "whitelabel"
  | "api"
  | "priority";

export type BillingCycle = "month" | "year";
export type PlatformSubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete";
export type BillingInvoiceStatus = "paid" | "open" | "void" | "uncollectible";
export type BillingProvider = "arc_pay";
export type BillingProviderStatus = "not_configured" | "ready";
export type BillingCurrency = "RUB";
export type BillingCurrentPlanSource = "subscription" | "default" | "unresolved";
export type BillingIntegrityIssue = {
  readonly code: "subscription_plan_not_found" | "default_plan_not_found";
  readonly severity: "warning" | "error";
  readonly planId: string | null;
  readonly message: string;
};

export type PlatformPlan = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly tagline: string;
  readonly monthlyPriceMinor: number;
  readonly yearlyPriceMinor: number;
  readonly currency: BillingCurrency;
  readonly platformFeeBps: number;
  readonly seatsLimit: number | null;
  readonly bookingsLimit: number | null;
  readonly aiRequestsLimit: number | null;
  readonly automationLimit: number | null;
  readonly isPopular: boolean;
  readonly isActive: boolean;
  readonly features: readonly PlatformPlanFeatureCode[];
};

export type PlatformSubscription = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly planId: string;
  readonly status: PlatformSubscriptionStatus;
  readonly billingCycle: BillingCycle;
  readonly currentPeriodEndsAt: string | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type BillingPaymentMethod = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly provider: BillingProvider;
  readonly brand: string;
  readonly last4: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type BillingInvoice = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly provider: BillingProvider;
  readonly status: BillingInvoiceStatus;
  readonly planId: string;
  readonly billingCycle: BillingCycle;
  readonly amountMinor: number;
  readonly currency: BillingCurrency;
  readonly issuedAt: string;
  readonly paidAt: string | null;
  readonly receiptUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type BillingOverview = {
  readonly provider: {
    readonly code: BillingProvider;
    readonly status: BillingProviderStatus;
    readonly managePaymentMethodUrl: string | null;
    readonly checkoutUrl: string | null;
  };
  readonly billingCycle: BillingCycle;
  readonly currentPlan: PlatformPlan | null;
  readonly currentPlanSource: BillingCurrentPlanSource;
  readonly integrityIssues: readonly BillingIntegrityIssue[];
  readonly currentSubscription: {
    readonly id: string;
    readonly planId: string;
    readonly status: PlatformSubscriptionStatus;
    readonly billingCycle: BillingCycle;
    readonly currentPeriodEndsAt: string | null;
    readonly cancelAtPeriodEnd: boolean;
  } | null;
  readonly plans: readonly PlatformPlan[];
  readonly paymentMethod: {
    readonly id: string;
    readonly provider: BillingProvider;
    readonly brand: string;
    readonly last4: string;
    readonly expiresAt: string;
  } | null;
  readonly invoices: readonly {
    readonly id: string;
    readonly provider: BillingProvider;
    readonly status: BillingInvoiceStatus;
    readonly planId: string;
    readonly billingCycle: BillingCycle;
    readonly amountMinor: number;
    readonly currency: BillingCurrency;
    readonly issuedAt: string;
    readonly paidAt: string | null;
    readonly receiptUrl: string | null;
  }[];
};
