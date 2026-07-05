import { z } from "@elevenhouse/validation";

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const platformPlanFeatureCodeValues = [
  "engine",
  "pdf",
  "natal",
  "synastry",
  "forecast",
  "solar",
  "matrix",
  "numerology",
  "hd",
  "horar",
  "vedic",
  "astrocal",
  "child",
  "page",
  "products",
  "calendar",
  "crm",
  "funnels",
  "group",
  "ai",
  "aicontent",
  "triggers",
  "content",
  "autopost",
  "journal",
  "video",
  "recordings",
  "inbox",
  "analytics",
  "refs",
  "team",
  "whitelabel",
  "api",
  "priority"
] as const;

export const platformPlanFeatureCodeSchema = z.enum(platformPlanFeatureCodeValues);
export type PlatformPlanFeatureCode = z.infer<typeof platformPlanFeatureCodeSchema>;

export const platformBillingProviderValues = ["arc_pay"] as const;
export const platformBillingProviderSchema = z.enum(platformBillingProviderValues);
export type PlatformBillingProvider = z.infer<typeof platformBillingProviderSchema>;

export const platformBillingProviderStatusSchema = z.enum(["not_configured", "ready"]);
export type PlatformBillingProviderStatus = z.infer<typeof platformBillingProviderStatusSchema>;

export const billingCycleSchema = z.enum(["month", "year"]);
export type BillingCycle = z.infer<typeof billingCycleSchema>;

export const platformSubscriptionStatusSchema = z.enum([
  "active",
  "past_due",
  "canceled",
  "incomplete"
]);
export type PlatformSubscriptionStatus = z.infer<typeof platformSubscriptionStatusSchema>;

export const billingInvoiceStatusSchema = z.enum(["paid", "open", "void", "uncollectible"]);
export type BillingInvoiceStatus = z.infer<typeof billingInvoiceStatusSchema>;

export const billingCurrencySchema = z.enum(["RUB"]);
export type BillingCurrency = z.infer<typeof billingCurrencySchema>;

export const platformPlanResponseSchema = z
  .object({
    id: z.string().min(1).max(80),
    code: z.string().min(1).max(80),
    name: z.string().min(1).max(120),
    tagline: z.string().min(1).max(240),
    monthlyPriceMinor: z.number().int().min(0),
    yearlyPriceMinor: z.number().int().min(0),
    currency: billingCurrencySchema,
    platformFeeBps: z.number().int().min(0).max(10_000),
    seatsLimit: z.number().int().positive().nullable(),
    bookingsLimit: z.number().int().positive().nullable(),
    aiRequestsLimit: z.number().int().positive().nullable(),
    automationLimit: z.number().int().positive().nullable(),
    isPopular: z.boolean(),
    isActive: z.boolean(),
    features: z.array(platformPlanFeatureCodeSchema).min(1).max(80)
  })
  .strict();
export type PlatformPlanResponse = z.infer<typeof platformPlanResponseSchema>;

export const currentPlatformSubscriptionResponseSchema = z
  .object({
    id: z.string().uuid(),
    planId: z.string().min(1).max(80),
    status: platformSubscriptionStatusSchema,
    billingCycle: billingCycleSchema,
    currentPeriodEndsAt: isoDateTimeSchema.nullable(),
    cancelAtPeriodEnd: z.boolean()
  })
  .strict();
export type CurrentPlatformSubscriptionResponse = z.infer<
  typeof currentPlatformSubscriptionResponseSchema
>;

export const billingPaymentMethodResponseSchema = z
  .object({
    id: z.string().uuid(),
    provider: platformBillingProviderSchema,
    brand: z.string().min(1).max(40),
    last4: z.string().regex(/^\d{4}$/),
    expiresAt: z.string().regex(/^\d{2}\/\d{2}$/)
  })
  .strict();
export type BillingPaymentMethodResponse = z.infer<typeof billingPaymentMethodResponseSchema>;

export const billingInvoiceResponseSchema = z
  .object({
    id: z.string().uuid(),
    provider: platformBillingProviderSchema,
    status: billingInvoiceStatusSchema,
    planId: z.string().min(1).max(80),
    billingCycle: billingCycleSchema,
    amountMinor: z.number().int().min(0),
    currency: billingCurrencySchema,
    issuedAt: isoDateTimeSchema,
    paidAt: isoDateTimeSchema.nullable(),
    receiptUrl: z.string().url().nullable()
  })
  .strict();
export type BillingInvoiceResponse = z.infer<typeof billingInvoiceResponseSchema>;

export const billingProviderStateResponseSchema = z
  .object({
    code: platformBillingProviderSchema,
    status: platformBillingProviderStatusSchema,
    managePaymentMethodUrl: z.string().url().nullable(),
    checkoutUrl: z.string().url().nullable()
  })
  .strict();
export type BillingProviderStateResponse = z.infer<typeof billingProviderStateResponseSchema>;

export const billingOverviewResponseSchema = z
  .object({
    provider: billingProviderStateResponseSchema,
    billingCycle: billingCycleSchema,
    currentSubscription: currentPlatformSubscriptionResponseSchema.nullable(),
    plans: z.array(platformPlanResponseSchema).min(1).max(12),
    paymentMethod: billingPaymentMethodResponseSchema.nullable(),
    invoices: z.array(billingInvoiceResponseSchema).max(100)
  })
  .strict();
export type BillingOverviewResponse = z.infer<typeof billingOverviewResponseSchema>;
