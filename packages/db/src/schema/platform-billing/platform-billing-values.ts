export const platformPlanFeatureValues = [
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

export const platformBillingProviderValues = ["arc_pay"] as const;
export const platformSubscriptionStatusValues = [
  "active",
  "past_due",
  "canceled",
  "incomplete"
] as const;
export const billingInvoiceStatusValues = ["paid", "open", "void", "uncollectible"] as const;
export const billingCycleValues = ["month", "year"] as const;
export const billingCurrencyValues = ["RUB"] as const;

export function formatPlatformBillingSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
