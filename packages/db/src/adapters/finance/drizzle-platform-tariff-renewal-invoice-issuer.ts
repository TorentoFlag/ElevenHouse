import {
  canonicalizePlatformTariffTerms,
  preparePlatformTariffRenewalInvoice,
  verifyPlatformTariffVersion,
  type PlatformTariffRenewalInvoiceIssuer,
  type PlatformTariffSubscriptionRecord
} from "@elevenhouse/domain";
import {
  createFinancePlatformTariffInvoiceChargePreparationRequestedPayload,
  FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_REQUESTED_EVENT
} from "@elevenhouse/domain/finance-core";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  platformTariffInvoices,
  platformTariffSubscriptions,
  platformTariffVersionCapabilities,
  platformTariffVersions
} from "../../schema/platform-billing/tariff-authority.schema";
import { financePlatformTariffInvoiceChargePreparationRequests } from "../../schema/finance/platform-tariff-invoice-charge-preparation.schema";
import { outboxEvents } from "../../schema/outbox/outbox-events.schema";

type Transaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export class PlatformTariffRenewalInvoiceIssuerError extends Error {
  readonly code = "platform_tariff_renewal_invoice_issuer_error" as const;
  constructor(readonly reason: "invalid_input" | "retryable_concurrency_conflict" | "persistence_write_incomplete") {
    super("Platform tariff renewal invoice could not be issued safely");
  }
}

/**
 * Claims only already-expired active paid subscriptions. One transaction seals the next exact
 * period, marks the subscription past_due, and emits the ordinary saved-card preparation outbox
 * request. Re-running is safe because only `active` rows can be claimed.
 */
export function createDrizzlePlatformTariffRenewalInvoiceIssuer<TSchema extends Record<string, unknown>>(
  input: Readonly<{ database: NodePgDatabase<TSchema> }>
): PlatformTariffRenewalInvoiceIssuer {
  return Object.freeze({
    async issueDueRenewalInvoices(command) {
      const now = validInstant(command.now);
      if (!Number.isSafeInteger(command.limit) || command.limit < 1 || command.limit > 500) fail("invalid_input");
      try {
        const candidates = await input.database
          .select({ id: platformTariffSubscriptions.id })
          .from(platformTariffSubscriptions)
          .where(and(
            eq(platformTariffSubscriptions.state, "active"),
            lte(platformTariffSubscriptions.endsAt, new Date(now))
          ))
          .orderBy(asc(platformTariffSubscriptions.endsAt), asc(platformTariffSubscriptions.id))
          .limit(command.limit);
        let issued = 0;
        let skipped = 0;
        for (const candidate of candidates) {
          const result = await input.database.transaction((transaction) => issueOne(transaction, candidate.id, now));
          if (result === "issued") issued += 1;
          else skipped += 1;
        }
        return Object.freeze({ issued, skipped });
      } catch (error) {
        if (error instanceof PlatformTariffRenewalInvoiceIssuerError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505" || code === "23503" || code === "23514") fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies PlatformTariffRenewalInvoiceIssuer);
}

async function issueOne<TSchema extends Record<string, unknown>>(
  transaction: Transaction<TSchema>, subscriptionId: string, now: string
): Promise<"issued" | "skipped"> {
  const [subscriptionRow] = await transaction.select().from(platformTariffSubscriptions)
    .where(eq(platformTariffSubscriptions.id, subscriptionId)).limit(1).for("update");
  if (!subscriptionRow || subscriptionRow.state !== "active" || !subscriptionRow.endsAt) return "skipped";
  if (Date.parse(iso(subscriptionRow.endsAt)) > Date.parse(now)) return "skipped";
  const [openInvoice] = await transaction.select({ id: platformTariffInvoices.id }).from(platformTariffInvoices)
    .where(and(
      eq(platformTariffInvoices.subscriptionId, subscriptionRow.id),
      inArray(platformTariffInvoices.state, ["open", "payment_pending", "requires_customer_action", "provider_unknown"])
    )).limit(1).for("update");
  if (openInvoice) return "skipped";
  const [tariffRow] = await transaction.select().from(platformTariffVersions).where(and(
    eq(platformTariffVersions.tariffSeriesId, subscriptionRow.tariffSeriesId),
    eq(platformTariffVersions.version, subscriptionRow.tariffVersion),
    eq(platformTariffVersions.canonicalDigest, subscriptionRow.tariffVersionDigest)
  )).limit(1).for("share");
  if (!tariffRow) fail("persistence_write_incomplete");
  const tariff = await tariffVersion(transaction, tariffRow);
  const subscription = mapSubscription(subscriptionRow);
  let authority;
  try {
    authority = preparePlatformTariffRenewalInvoice({ subscription, tariff, now });
  } catch {
    fail("persistence_write_incomplete");
  }
  if (!authority.invoice || authority.subscription.state !== "past_due") fail("persistence_write_incomplete");
  const invoiceId = `platform-tariff-invoice:${randomUUID()}`;
  const [invoice] = await transaction.insert(platformTariffInvoices).values({
    id: invoiceId, subscriptionId: subscription.subscriptionId, ownerUserId: subscription.ownerUserId,
    tariffSeriesId: subscription.tariffSeriesId, tariffVersion: subscription.tariffVersion,
    tariffVersionDigest: subscription.tariffVersionDigest, amountMinor: authority.invoice.amountMinor,
    currency: "RUB", state: "open", billingPeriodStartAt: new Date(authority.invoice.billingPeriodStartAt),
    billingPeriodEndAt: new Date(authority.invoice.billingPeriodEndAt)
  }).returning({ id: platformTariffInvoices.id, version: platformTariffInvoices.version });
  if (!invoice) fail("persistence_write_incomplete");
  const [subscriptionUpdate] = await transaction.update(platformTariffSubscriptions).set({
    state: "past_due", version: subscription.version + 1, updatedAt: sql`clock_timestamp()`
  }).where(and(
    eq(platformTariffSubscriptions.id, subscription.subscriptionId),
    eq(platformTariffSubscriptions.state, "active"),
    eq(platformTariffSubscriptions.version, subscription.version)
  )).returning({ id: platformTariffSubscriptions.id, version: platformTariffSubscriptions.version });
  if (!subscriptionUpdate) fail("retryable_concurrency_conflict");
  const preparationRequestId = randomUUID();
  const [request] = await transaction.insert(financePlatformTariffInvoiceChargePreparationRequests).values({
    id: preparationRequestId, invoiceId: invoice.id, subscriptionId: subscription.subscriptionId,
    attemptNumber: 1, expectedInvoiceVersion: invoice.version,
    expectedSubscriptionVersion: subscriptionUpdate.version, state: "pending", version: "1"
  }).returning({ id: financePlatformTariffInvoiceChargePreparationRequests.id });
  if (!request || request.id !== preparationRequestId) fail("persistence_write_incomplete");
  const [outbox] = await transaction.insert(outboxEvents).values({
    eventType: FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_REQUESTED_EVENT,
    aggregateId: request.id,
    payload: createFinancePlatformTariffInvoiceChargePreparationRequestedPayload({ preparationRequestId: request.id })
  }).returning({ id: outboxEvents.id });
  if (!outbox) fail("persistence_write_incomplete");
  return "issued";
}

async function tariffVersion<TSchema extends Record<string, unknown>>(
  database: Pick<Transaction<TSchema>, "select">, row: typeof platformTariffVersions.$inferSelect
) {
  if ((row.lifecycle !== "published" && row.lifecycle !== "retired") || row.currency !== "RUB") {
    fail("persistence_write_incomplete");
  }
  const capabilities = await database.select().from(platformTariffVersionCapabilities).where(and(
    eq(platformTariffVersionCapabilities.tariffSeriesId, row.tariffSeriesId),
    eq(platformTariffVersionCapabilities.tariffVersion, row.version)
  )).orderBy(asc(platformTariffVersionCapabilities.capability));
  try {
    const tariff = verifyPlatformTariffVersion({
      tariffSeriesId: row.tariffSeriesId, version: row.version, draftRevision: row.draftRevision,
      lifecycle: row.lifecycle, name: row.name, tagline: row.tagline,
      monthlyPriceMinor: row.monthlyPriceMinor, yearlyPriceMinor: row.yearlyPriceMinor,
      monthlyRecurringFrequencyDays: row.monthlyRecurringFrequencyDays,
      yearlyRecurringFrequencyDays: row.yearlyRecurringFrequencyDays,
      clientSaleCommissionBps: row.clientSaleCommissionBps, seatsLimit: row.seatsLimit,
      bookingsLimit: row.bookingsLimit, aiRequestsLimit: row.aiRequestsLimit,
      automationLimit: row.automationLimit, isPopular: row.isPopular, displayOrder: row.displayOrder,
      features: capabilities.map((item) => item.capability) as never,
      canonicalDigest: row.canonicalDigest as `sha256:${string}`
    });
    if (row.canonicalPreimage !== canonicalizePlatformTariffTerms(tariff)) fail("persistence_write_incomplete");
    return tariff;
  } catch { fail("persistence_write_incomplete"); }
}

function mapSubscription(row: typeof platformTariffSubscriptions.$inferSelect): PlatformTariffSubscriptionRecord {
  if (row.state !== "active" || (row.billingCycle !== "month" && row.billingCycle !== "year") || !row.startsAt || !row.endsAt) fail("persistence_write_incomplete");
  return Object.freeze({
    subscriptionId: row.id, ownerUserId: row.ownerUserId, tariffSeriesId: row.tariffSeriesId,
    tariffVersion: row.tariffVersion, tariffVersionDigest: row.tariffVersionDigest as `sha256:${string}`,
    commissionBpsSnapshot: row.commissionBpsSnapshot, billingCycle: row.billingCycle,
    version: row.version, state: "active", startsAt: iso(row.startsAt), endsAt: iso(row.endsAt)
  });
}
function iso(value: Date | string): string { const date = value instanceof Date ? value : new Date(value); if (!Number.isFinite(date.getTime())) fail("persistence_write_incomplete"); return date.toISOString(); }
function validInstant(value: string): string { const date = new Date(value); if (!Number.isFinite(date.getTime())) fail("invalid_input"); return date.toISOString(); }
function postgresCode(error: unknown): string | null { return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null; }
function fail(reason: PlatformTariffRenewalInvoiceIssuerError["reason"]): never { throw new PlatformTariffRenewalInvoiceIssuerError(reason); }
