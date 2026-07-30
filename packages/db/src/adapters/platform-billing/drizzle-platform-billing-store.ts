import { asc, desc, eq } from "drizzle-orm";
import type {
  BillingInvoice,
  BillingPaymentMethod,
  PlatformBillingStore,
  PlatformPlan,
  PlatformPlanFeatureCode,
  PlatformSubscription
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  billingInvoices,
  billingPaymentMethods,
  platformPlanFeatures,
  platformPlans,
  platformSubscriptions
} from "../../schema";

type PlatformPlanRow = typeof platformPlans.$inferSelect;
type PlatformPlanFeatureRow = typeof platformPlanFeatures.$inferSelect;
type PlatformSubscriptionRow = typeof platformSubscriptions.$inferSelect;
type BillingPaymentMethodRow = typeof billingPaymentMethods.$inferSelect;
type BillingInvoiceRow = typeof billingInvoices.$inferSelect;
type PlatformBillingDatabase = Pick<ElevenHouseDatabase, "select">;

export function createDrizzlePlatformBillingStore(
  database: PlatformBillingDatabase
): PlatformBillingStore {
  return {
    listActivePlans: async () => {
      const [planRows, featureRows] = await Promise.all([
        database
          .select()
          .from(platformPlans)
          .where(eq(platformPlans.isActive, true))
          .orderBy(asc(platformPlans.displayOrder), asc(platformPlans.id)),
        database.select().from(platformPlanFeatures).orderBy(asc(platformPlanFeatures.order))
      ]);
      const featuresByPlanId = groupFeaturesByPlanId(featureRows);

      return planRows.map((row) => toPlatformPlan(row, featuresByPlanId.get(row.id) ?? []));
    },
    findCurrentSubscription: async (input) => {
      const [row] = await database
        .select()
        .from(platformSubscriptions)
        .where(eq(platformSubscriptions.ownerUserId, input.ownerUserId))
        .orderBy(desc(platformSubscriptions.isCurrent), desc(platformSubscriptions.createdAt))
        .limit(1);

      return row && row.isCurrent ? toPlatformSubscription(row) : null;
    },
    findDefaultPaymentMethod: async (input) => {
      const [row] = await database
        .select()
        .from(billingPaymentMethods)
        .where(eq(billingPaymentMethods.ownerUserId, input.ownerUserId))
        .orderBy(desc(billingPaymentMethods.isDefault), desc(billingPaymentMethods.createdAt))
        .limit(1);

      return row && row.isDefault ? toBillingPaymentMethod(row) : null;
    },
    listRecentInvoices: async (input) => {
      const rows = await database
        .select()
        .from(billingInvoices)
        .where(eq(billingInvoices.ownerUserId, input.ownerUserId))
        .orderBy(desc(billingInvoices.issuedAt), desc(billingInvoices.createdAt))
        .limit(input.limit);

      return rows.map(toBillingInvoice);
    }
  };
}

function groupFeaturesByPlanId(
  rows: readonly PlatformPlanFeatureRow[]
): Map<string, PlatformPlanFeatureCode[]> {
  const result = new Map<string, PlatformPlanFeatureCode[]>();

  for (const row of rows) {
    const features = result.get(row.planId) ?? [];
    features.push(row.value as PlatformPlanFeatureCode);
    result.set(row.planId, features);
  }

  return result;
}

function toPlatformPlan(
  row: PlatformPlanRow,
  features: readonly PlatformPlanFeatureCode[]
): PlatformPlan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    tagline: row.tagline,
    monthlyPriceMinor: row.monthlyPriceMinor,
    yearlyPriceMinor: row.yearlyPriceMinor,
    currency: row.currency as PlatformPlan["currency"],
    platformFeeBps: row.platformFeeBps,
    seatsLimit: row.seatsLimit,
    bookingsLimit: row.bookingsLimit,
    aiRequestsLimit: row.aiRequestsLimit,
    automationLimit: row.automationLimit,
    isPopular: row.isPopular,
    isActive: row.isActive,
    features: [...features]
  };
}

function toPlatformSubscription(row: PlatformSubscriptionRow): PlatformSubscription {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    planId: row.planId,
    status: row.status as PlatformSubscription["status"],
    billingCycle: row.billingCycle as PlatformSubscription["billingCycle"],
    currentPeriodEndsAt: row.currentPeriodEndsAt ? toIsoString(row.currentPeriodEndsAt) : null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toBillingPaymentMethod(row: BillingPaymentMethodRow): BillingPaymentMethod {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    provider: row.provider as BillingPaymentMethod["provider"],
    brand: row.brand,
    last4: row.last4,
    expiresAt: row.expiresAt,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toBillingInvoice(row: BillingInvoiceRow): BillingInvoice {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    provider: row.provider as BillingInvoice["provider"],
    status: row.status as BillingInvoice["status"],
    planId: row.planId,
    billingCycle: row.billingCycle as BillingInvoice["billingCycle"],
    amountMinor: row.amountMinor,
    currency: row.currency as BillingInvoice["currency"],
    issuedAt: toIsoString(row.issuedAt),
    paidAt: row.paidAt ? toIsoString(row.paidAt) : null,
    receiptUrl: row.receiptUrl,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
