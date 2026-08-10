import {
  canonicalizePlatformTariffTerms,
  applyVerifiedTariffInvoiceCapture,
  createPlatformTariffDraft,
  preparePlatformTariffSubscriptionPurchase,
  PlatformTariffAuthorityError,
  publishPlatformTariffDraft,
  revisePlatformTariffDraft,
  verifyPlatformTariffVersion,
  type PlatformTariffAuthorityStore,
  type PlatformTariffBillingCycle,
  type PlatformTariffDraftInput,
  type PlatformTariffEntitlementStore,
  type PlatformTariffInvoiceRecord,
  type PlatformTariffSubscriptionPurchaseRecord,
  type PlatformTariffSubscriptionRecord,
  type PlatformTariffSubscriptionSnapshot,
  type PlatformTariffSubscriptionState,
  type PlatformTariffVersion
} from "@elevenhouse/domain";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  platformTariffInvoices,
  platformTariffSeries,
  platformTariffSubscriptions,
  platformTariffVersionCapabilities,
  platformTariffVersions
} from "../../schema/platform-billing/tariff-authority.schema";

type TariffTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type PlatformTariffAuthorityPersistenceReason =
  | "invalid_tariff"
  | "draft_revision_conflict"
  | "tariff_identity_conflict"
  | "tariff_not_purchasable"
  | "active_subscription_exists"
  | "invoice_capture_transition_invalid"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class PlatformTariffAuthorityPersistenceError extends Error {
  readonly code = "platform_tariff_authority_persistence_error";

  constructor(readonly reason: PlatformTariffAuthorityPersistenceReason) {
    super("Platform tariff authority could not persist an exact tariff version");
    this.name = "PlatformTariffAuthorityPersistenceError";
  }
}

export function createDrizzlePlatformTariffAuthorityStore<TSchema extends Record<string, unknown>>(
  input: Readonly<{ database: NodePgDatabase<TSchema> }>
): PlatformTariffAuthorityStore & PlatformTariffEntitlementStore {
  return Object.freeze({
    listTariffVersions: async () => {
      try {
        const rows = await input.database
          .select()
          .from(platformTariffVersions)
          .orderBy(asc(platformTariffVersions.tariffSeriesId), desc(platformTariffVersions.version));
        return Promise.all(rows.map((row) => readVersion(input.database, row)));
      } catch (error) {
        if (error instanceof PlatformTariffAuthorityPersistenceError) throw error;
        fail("persistence_write_incomplete");
      }
    },
    createDraft: async (draft) => execute(input.database, () =>
      input.database.transaction((transaction) => createDraftInTransaction(transaction, draft))
    ),
    updateDraft: async (command) => execute(input.database, () =>
      input.database.transaction((transaction) => updateDraftInTransaction(transaction, command))
    ),
    publishDraft: async (command) => execute(input.database, () =>
      input.database.transaction((transaction) => publishDraftInTransaction(transaction, command))
    ),
    findTariffVersion: async (command) => {
      try {
        const [row] = await input.database
          .select()
          .from(platformTariffVersions)
          .where(and(
            eq(platformTariffVersions.tariffSeriesId, command.tariffSeriesId),
            eq(platformTariffVersions.version, command.version),
            eq(platformTariffVersions.canonicalDigest, command.canonicalDigest)
          ))
          .limit(1);
        return row ? readVersion(input.database, row) : null;
      } catch (error) {
        if (error instanceof PlatformTariffAuthorityPersistenceError) throw error;
        fail("persistence_write_incomplete");
      }
    },
    findPublishedTariffVersion: async (command) => {
      try {
        const [row] = await input.database
          .select()
          .from(platformTariffVersions)
          .where(and(
            eq(platformTariffVersions.tariffSeriesId, command.tariffSeriesId),
            eq(platformTariffVersions.version, command.version),
            eq(platformTariffVersions.lifecycle, "published")
          ))
          .limit(1);
        return row ? readVersion(input.database, row) : null;
      } catch (error) {
        if (error instanceof PlatformTariffAuthorityPersistenceError) throw error;
        fail("persistence_write_incomplete");
      }
    },
    beginSubscriptionPurchase: async (command) => execute(input.database, () =>
      input.database.transaction((transaction) => beginSubscriptionPurchaseInTransaction(transaction, command))
    ),
    markInvoicePaymentPending: async (command) => execute(input.database, () =>
      input.database.transaction((transaction) => markInvoicePaymentPendingInTransaction(transaction, command))
    ),
    applyVerifiedInvoiceCapture: async (command) => execute(input.database, () =>
      input.database.transaction((transaction) => applyVerifiedInvoiceCaptureInTransaction(transaction, command))
    ),
    findActiveOrPendingSubscription: async (ownerUserId) => {
      try {
        const [row] = await input.database
          .select()
          .from(platformTariffSubscriptions)
          .where(and(
            eq(platformTariffSubscriptions.ownerUserId, ownerUserId),
            inArray(platformTariffSubscriptions.state, [
              "incomplete_setup",
              "awaiting_initial_payment",
              "active",
              "past_due"
            ])
          ))
          .orderBy(desc(platformTariffSubscriptions.createdAt))
          .limit(1);
        return row ? mapSubscription(row) : null;
      } catch (error) {
        if (error instanceof PlatformTariffAuthorityPersistenceError) throw error;
        fail("persistence_write_incomplete");
      }
    },
    listRecentCapturedInvoices: async ({ ownerUserId, limit }) => {
      try {
        if (!Number.isInteger(limit) || limit < 1 || limit > 12) fail("persistence_write_incomplete");
        const rows = await input.database
          .select()
          .from(platformTariffInvoices)
          .where(and(
            eq(platformTariffInvoices.ownerUserId, ownerUserId),
            eq(platformTariffInvoices.state, "captured")
          ))
          .orderBy(desc(platformTariffInvoices.capturedAt), desc(platformTariffInvoices.createdAt))
          .limit(limit);
        return rows.map(mapInvoice);
      } catch (error) {
        if (error instanceof PlatformTariffAuthorityPersistenceError) throw error;
        fail("persistence_write_incomplete");
      }
    },
    findCurrentSubscription: async (ownerUserId) => {
      try {
        const [row] = await input.database
          .select()
          .from(platformTariffSubscriptions)
          .where(and(
            eq(platformTariffSubscriptions.ownerUserId, ownerUserId),
            eq(platformTariffSubscriptions.state, "active")
          ))
          .orderBy(desc(platformTariffSubscriptions.endsAt), desc(platformTariffSubscriptions.createdAt))
          .limit(1);
        return row ? mapSubscription(row) : null;
      } catch (error) {
        if (error instanceof PlatformTariffAuthorityPersistenceError) throw error;
        fail("persistence_write_incomplete");
      }
    },
    findLatestHistoricalCapabilityGrant: async (command) => {
      try {
        const at = new Date(command.at);
        if (!Number.isFinite(at.getTime())) fail("persistence_write_incomplete");
        const [row] = await input.database
          .select({
            subscription: platformTariffSubscriptions,
            tariff: platformTariffVersions
          })
          .from(platformTariffSubscriptions)
          .innerJoin(
            platformTariffVersions,
            and(
              eq(
                platformTariffVersions.tariffSeriesId,
                platformTariffSubscriptions.tariffSeriesId
              ),
              eq(platformTariffVersions.version, platformTariffSubscriptions.tariffVersion),
              eq(
                platformTariffVersions.canonicalDigest,
                platformTariffSubscriptions.tariffVersionDigest
              )
            )
          )
          .innerJoin(
            platformTariffVersionCapabilities,
            and(
              eq(
                platformTariffVersionCapabilities.tariffSeriesId,
                platformTariffSubscriptions.tariffSeriesId
              ),
              eq(
                platformTariffVersionCapabilities.tariffVersion,
                platformTariffSubscriptions.tariffVersion
              ),
              eq(platformTariffVersionCapabilities.capability, command.capability)
            )
          )
          .where(
            and(
              eq(platformTariffSubscriptions.ownerUserId, command.ownerUserId),
              inArray(platformTariffSubscriptions.state, [
                "active",
                "past_due",
                "cancelled",
                "expired"
              ]),
              isNotNull(platformTariffSubscriptions.startsAt),
              lte(platformTariffSubscriptions.startsAt, at),
              inArray(platformTariffVersions.lifecycle, ["published", "retired"])
            )
          )
          .orderBy(
            desc(platformTariffSubscriptions.startsAt),
            desc(platformTariffSubscriptions.createdAt)
          )
          .limit(1);
        if (!row) return null;
        return Object.freeze({
          subscription: mapSubscription(row.subscription),
          tariff: await readVersion(input.database, row.tariff)
        });
      } catch (error) {
        if (error instanceof PlatformTariffAuthorityPersistenceError) throw error;
        fail("persistence_write_incomplete");
      }
    }
  } satisfies PlatformTariffAuthorityStore & PlatformTariffEntitlementStore);
}

async function createDraftInTransaction<TSchema extends Record<string, unknown>>(
  transaction: TariffTransaction<TSchema>,
  input: PlatformTariffDraftInput
): Promise<PlatformTariffVersion> {
  const draft = normalizeDraft(input);
  await lockTariff(transaction, draft.tariffSeriesId);
  const [series] = await transaction
    .select()
    .from(platformTariffSeries)
    .where(eq(platformTariffSeries.id, draft.tariffSeriesId))
    .limit(1)
    .for("update");
  if (series && (series.code !== draft.tariffSeriesId || series.retiredAt !== null)) {
    fail("tariff_identity_conflict");
  }
  if (!series) {
    await transaction.insert(platformTariffSeries).values({ id: draft.tariffSeriesId, code: draft.tariffSeriesId });
  }
  const [existing] = await transaction
    .select()
    .from(platformTariffVersions)
    .where(and(
      eq(platformTariffVersions.tariffSeriesId, draft.tariffSeriesId),
      eq(platformTariffVersions.version, draft.version)
    ))
    .limit(1)
    .for("update");
  if (existing) {
    const persisted = await readVersion(transaction, existing);
    if (sameVersion(persisted, draft)) return persisted;
    fail("tariff_identity_conflict");
  }
  const [inserted] = await transaction.insert(platformTariffVersions).values(versionValues(draft)).returning();
  if (!inserted) fail("persistence_write_incomplete");
  await replaceCapabilities(transaction, draft);
  return readVersion(transaction, inserted);
}

async function updateDraftInTransaction<TSchema extends Record<string, unknown>>(
  transaction: TariffTransaction<TSchema>,
  command: Readonly<{ tariffSeriesId: string; version: number; expectedDraftRevision: number; next: PlatformTariffDraftInput }>
): Promise<PlatformTariffVersion> {
  if (command.next.tariffSeriesId !== command.tariffSeriesId || command.next.version !== command.version) fail("draft_revision_conflict");
  await lockTariff(transaction, command.tariffSeriesId);
  const current = await lockAndReadVersion(transaction, command.tariffSeriesId, command.version);
  if (!current) fail("draft_revision_conflict");
  if (current.draftRevision !== command.expectedDraftRevision) {
    const retryTarget = revisedDraftFromTerms(command.next, command.expectedDraftRevision + 1);
    if (current.draftRevision === retryTarget.draftRevision && sameVersion(current, retryTarget)) {
      return current;
    }
    fail("draft_revision_conflict");
  }
  let revised: PlatformTariffVersion;
  try {
    revised = revisePlatformTariffDraft({
      current,
      expectedDraftRevision: command.expectedDraftRevision,
      next: command.next
    });
  } catch (error) {
    if (error instanceof PlatformTariffAuthorityError) fail("draft_revision_conflict");
    throw error;
  }
  const updated = await transaction
    .update(platformTariffVersions)
    .set(versionValues(revised))
    .where(and(
      eq(platformTariffVersions.tariffSeriesId, command.tariffSeriesId),
      eq(platformTariffVersions.version, command.version),
      eq(platformTariffVersions.draftRevision, command.expectedDraftRevision),
      eq(platformTariffVersions.lifecycle, "draft")
    ))
    .returning();
  if (updated.length !== 1 || !updated[0]) fail("draft_revision_conflict");
  await replaceCapabilities(transaction, revised);
  return readVersion(transaction, updated[0]);
}

async function publishDraftInTransaction<TSchema extends Record<string, unknown>>(
  transaction: TariffTransaction<TSchema>,
  command: Readonly<{ tariffSeriesId: string; version: number; expectedDraftRevision: number }>
): Promise<PlatformTariffVersion> {
  await lockTariff(transaction, command.tariffSeriesId);
  const current = await lockAndReadVersion(transaction, command.tariffSeriesId, command.version);
  if (!current || current.draftRevision !== command.expectedDraftRevision) fail("draft_revision_conflict");
  if (current.lifecycle === "published") return current;
  try {
    publishPlatformTariffDraft(current);
  } catch (error) {
    if (error instanceof PlatformTariffAuthorityError) fail("invalid_tariff");
    throw error;
  }
  const updated = await transaction
    .update(platformTariffVersions)
    .set({ lifecycle: "published", publishedAt: sql`clock_timestamp()` })
    .where(and(
      eq(platformTariffVersions.tariffSeriesId, command.tariffSeriesId),
      eq(platformTariffVersions.version, command.version),
      eq(platformTariffVersions.draftRevision, command.expectedDraftRevision),
      eq(platformTariffVersions.lifecycle, "draft")
    ))
    .returning();
  if (updated.length !== 1 || !updated[0]) fail("draft_revision_conflict");
  return readVersion(transaction, updated[0]);
}

async function beginSubscriptionPurchaseInTransaction<TSchema extends Record<string, unknown>>(
  transaction: TariffTransaction<TSchema>,
  command: Readonly<{
    ownerUserId: string;
    tariffSeriesId: string;
    version: number;
    billingCycle: PlatformTariffBillingCycle;
    now: string;
  }>
): Promise<PlatformTariffSubscriptionPurchaseRecord> {
  await lockTariff(transaction, command.tariffSeriesId);
  await lockSubscriptionOwner(transaction, command.ownerUserId);
  const tariff = await lockAndReadVersion(transaction, command.tariffSeriesId, command.version);
  if (!tariff || tariff.lifecycle !== "published") fail("tariff_not_purchasable");
  const [current] = await transaction
    .select()
    .from(platformTariffSubscriptions)
    .where(and(
      eq(platformTariffSubscriptions.ownerUserId, command.ownerUserId),
      inArray(platformTariffSubscriptions.state, ["incomplete_setup", "awaiting_initial_payment", "active", "past_due"])
    ))
    .limit(1)
    .for("update");
  if (current) fail("active_subscription_exists");

  let authority;
  try {
    authority = preparePlatformTariffSubscriptionPurchase({
      ownerUserId: command.ownerUserId,
      tariff,
      billingCycle: command.billingCycle,
      now: command.now
    });
  } catch (error) {
    if (error instanceof PlatformTariffAuthorityError) {
      fail(error.reason === "tariff_not_purchasable" ? "tariff_not_purchasable" : "invalid_tariff");
    }
    throw error;
  }

  const [subscriptionRow] = await transaction
    .insert(platformTariffSubscriptions)
    .values({
      id: randomUUID(),
      ownerUserId: authority.subscription.ownerUserId,
      tariffSeriesId: authority.subscription.tariffSeriesId,
      tariffVersion: authority.subscription.tariffVersion,
      tariffVersionDigest: authority.subscription.tariffVersionDigest,
      commissionBpsSnapshot: authority.subscription.commissionBpsSnapshot,
      billingCycle: authority.subscription.billingCycle,
      state: authority.subscription.state,
      startsAt: authority.subscription.startsAt ? new Date(authority.subscription.startsAt) : null,
      endsAt: authority.subscription.endsAt ? new Date(authority.subscription.endsAt) : null
    })
    .returning();
  if (!subscriptionRow) fail("persistence_write_incomplete");
  const subscription = mapSubscription(subscriptionRow);

  if (!authority.invoice) return Object.freeze({ subscription, invoice: null });
  const [invoiceRow] = await transaction
    .insert(platformTariffInvoices)
    .values({
      id: `platform-tariff-invoice:${randomUUID()}`,
      subscriptionId: subscription.subscriptionId,
      ownerUserId: subscription.ownerUserId,
      tariffSeriesId: subscription.tariffSeriesId,
      tariffVersion: subscription.tariffVersion,
      tariffVersionDigest: subscription.tariffVersionDigest,
      amountMinor: authority.invoice.amountMinor,
      currency: authority.invoice.currency,
      state: authority.invoice.state,
      billingPeriodStartAt: new Date(authority.invoice.billingPeriodStartAt),
      billingPeriodEndAt: new Date(authority.invoice.billingPeriodEndAt)
    })
    .returning();
  if (!invoiceRow) fail("persistence_write_incomplete");
  return Object.freeze({ subscription, invoice: mapInvoice(invoiceRow) });
}

async function markInvoicePaymentPendingInTransaction<TSchema extends Record<string, unknown>>(
  transaction: TariffTransaction<TSchema>,
  command: Readonly<{ invoiceId: string }>
): Promise<PlatformTariffInvoiceRecord> {
  const invoice = await lockAndReadInvoice(transaction, command.invoiceId);
  if (!invoice) fail("invoice_capture_transition_invalid");
  if (invoice.state === "payment_pending") return mapInvoice(invoice);
  if (invoice.state !== "open") fail("invoice_capture_transition_invalid");
  const [updated] = await transaction
    .update(platformTariffInvoices)
    .set({ state: "payment_pending", version: invoice.version + 1 })
    .where(and(
      eq(platformTariffInvoices.id, invoice.id),
      eq(platformTariffInvoices.state, "open"),
      eq(platformTariffInvoices.version, invoice.version)
    ))
    .returning();
  if (!updated) fail("invoice_capture_transition_invalid");
  return mapInvoice(updated);
}

async function applyVerifiedInvoiceCaptureInTransaction<TSchema extends Record<string, unknown>>(
  transaction: TariffTransaction<TSchema>,
  command: Readonly<{ invoiceId: string; capturedAt: string }>
): Promise<PlatformTariffSubscriptionPurchaseRecord> {
  const invoiceRow = await lockAndReadInvoice(transaction, command.invoiceId);
  if (!invoiceRow) fail("invoice_capture_transition_invalid");
  const subscriptionRow = await lockAndReadSubscription(transaction, invoiceRow.subscriptionId);
  if (!subscriptionRow) fail("invoice_capture_transition_invalid");
  let captured;
  try {
    captured = applyVerifiedTariffInvoiceCapture({
      subscription: mapSubscription(subscriptionRow),
      invoice: mapInvoice(invoiceRow),
      capturedAt: command.capturedAt
    });
  } catch (error) {
    if (error instanceof PlatformTariffAuthorityError) {
      fail(
        error.reason === "invoice_capture_transition_invalid"
          ? "invoice_capture_transition_invalid"
          : "persistence_write_incomplete"
      );
    }
    throw error;
  }
  const [capturedInvoice] = await transaction
    .update(platformTariffInvoices)
    .set({
      state: "captured",
      capturedAt: new Date(captured.invoice.capturedAt),
      version: invoiceRow.version + 1
    })
    .where(and(
      eq(platformTariffInvoices.id, invoiceRow.id),
      eq(platformTariffInvoices.state, "payment_pending"),
      eq(platformTariffInvoices.version, invoiceRow.version)
    ))
    .returning();
  if (!capturedInvoice) fail("invoice_capture_transition_invalid");
  const startsAt = captured.subscription.startsAt;
  const endsAt = captured.subscription.endsAt;
  if (!startsAt || !endsAt) fail("persistence_write_incomplete");
  const [activatedSubscription] = await transaction
    .update(platformTariffSubscriptions)
    .set({
      state: "active",
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      version: subscriptionRow.version + 1,
      updatedAt: sql`clock_timestamp()`
    })
    .where(and(
      eq(platformTariffSubscriptions.id, subscriptionRow.id),
      inArray(platformTariffSubscriptions.state, ["awaiting_initial_payment", "past_due"]),
      eq(platformTariffSubscriptions.version, subscriptionRow.version)
    ))
    .returning();
  if (!activatedSubscription) fail("invoice_capture_transition_invalid");
  return Object.freeze({
    subscription: mapSubscription(activatedSubscription),
    invoice: mapInvoice(capturedInvoice)
  });
}

async function lockTariff<TSchema extends Record<string, unknown>>(
  transaction: TariffTransaction<TSchema>,
  tariffSeriesId: string
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`platform-tariff-series:${tariffSeriesId}`}, 0))`
  );
}

async function lockSubscriptionOwner<TSchema extends Record<string, unknown>>(
  transaction: TariffTransaction<TSchema>,
  ownerUserId: string
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`platform-tariff-subscription-owner:${ownerUserId}`}, 0))`
  );
}

async function lockAndReadVersion<TSchema extends Record<string, unknown>>(
  transaction: TariffTransaction<TSchema>,
  tariffSeriesId: string,
  version: number
): Promise<PlatformTariffVersion | null> {
  const [row] = await transaction
    .select()
    .from(platformTariffVersions)
    .where(and(
      eq(platformTariffVersions.tariffSeriesId, tariffSeriesId),
      eq(platformTariffVersions.version, version)
    ))
    .limit(1)
    .for("update");
  return row ? readVersion(transaction, row) : null;
}

async function lockAndReadInvoice<TSchema extends Record<string, unknown>>(
  transaction: TariffTransaction<TSchema>,
  invoiceId: string
): Promise<typeof platformTariffInvoices.$inferSelect | null> {
  const [row] = await transaction
    .select()
    .from(platformTariffInvoices)
    .where(eq(platformTariffInvoices.id, invoiceId))
    .limit(1)
    .for("update");
  return row ?? null;
}

async function lockAndReadSubscription<TSchema extends Record<string, unknown>>(
  transaction: TariffTransaction<TSchema>,
  subscriptionId: string
): Promise<typeof platformTariffSubscriptions.$inferSelect | null> {
  const [row] = await transaction
    .select()
    .from(platformTariffSubscriptions)
    .where(eq(platformTariffSubscriptions.id, subscriptionId))
    .limit(1)
    .for("update");
  return row ?? null;
}

async function readVersion<TDatabase extends { select: NodePgDatabase<Record<string, unknown>>["select"] }>(
  database: TDatabase,
  row: typeof platformTariffVersions.$inferSelect
): Promise<PlatformTariffVersion> {
  const featureRows = await database
    .select()
    .from(platformTariffVersionCapabilities)
    .where(and(
      eq(platformTariffVersionCapabilities.tariffSeriesId, row.tariffSeriesId),
      eq(platformTariffVersionCapabilities.tariffVersion, row.version)
    ))
    .orderBy(asc(platformTariffVersionCapabilities.capability));
  let version: PlatformTariffVersion;
  try {
    version = verifyPlatformTariffVersion({
      tariffSeriesId: row.tariffSeriesId,
      version: row.version,
      draftRevision: row.draftRevision,
      lifecycle: row.lifecycle as PlatformTariffVersion["lifecycle"],
      name: row.name,
      tagline: row.tagline,
      monthlyPriceMinor: row.monthlyPriceMinor,
      yearlyPriceMinor: row.yearlyPriceMinor,
      monthlyRecurringFrequencyDays: row.monthlyRecurringFrequencyDays,
      yearlyRecurringFrequencyDays: row.yearlyRecurringFrequencyDays,
      clientSaleCommissionBps: row.clientSaleCommissionBps,
      seatsLimit: row.seatsLimit,
      bookingsLimit: row.bookingsLimit,
      aiRequestsLimit: row.aiRequestsLimit,
      automationLimit: row.automationLimit,
      isPopular: row.isPopular,
      displayOrder: row.displayOrder,
      features: featureRows.map((feature) => feature.capability) as PlatformTariffVersion["features"],
      canonicalDigest: row.canonicalDigest as PlatformTariffVersion["canonicalDigest"]
    });
  } catch {
    fail("persistence_write_incomplete");
  }
  if (row.currency !== "RUB" || row.canonicalPreimage !== canonicalizePlatformTariffTerms(version!)) {
    fail("persistence_write_incomplete");
  }
  return version!;
}

async function replaceCapabilities<TSchema extends Record<string, unknown>>(
  transaction: TariffTransaction<TSchema>,
  version: PlatformTariffVersion
): Promise<void> {
  await transaction.delete(platformTariffVersionCapabilities).where(and(
    eq(platformTariffVersionCapabilities.tariffSeriesId, version.tariffSeriesId),
    eq(platformTariffVersionCapabilities.tariffVersion, version.version)
  ));
  if (version.features.length > 0) {
    await transaction.insert(platformTariffVersionCapabilities).values(
      version.features.map((capability) => ({
        tariffSeriesId: version.tariffSeriesId,
        tariffVersion: version.version,
        capability
      }))
    );
  }
}

function versionValues(version: PlatformTariffVersion) {
  return {
    tariffSeriesId: version.tariffSeriesId,
    version: version.version,
    draftRevision: version.draftRevision,
    lifecycle: version.lifecycle,
    name: version.name,
    tagline: version.tagline,
    monthlyPriceMinor: version.monthlyPriceMinor,
    yearlyPriceMinor: version.yearlyPriceMinor,
    monthlyRecurringFrequencyDays: version.monthlyRecurringFrequencyDays,
    yearlyRecurringFrequencyDays: version.yearlyRecurringFrequencyDays,
    currency: "RUB" as const,
    clientSaleCommissionBps: version.clientSaleCommissionBps,
    seatsLimit: version.seatsLimit,
    bookingsLimit: version.bookingsLimit,
    aiRequestsLimit: version.aiRequestsLimit,
    automationLimit: version.automationLimit,
    isPopular: version.isPopular,
    displayOrder: version.displayOrder,
    canonicalPreimage: canonicalizePlatformTariffTerms(version),
    canonicalDigest: version.canonicalDigest
  };
}

function sameVersion(left: PlatformTariffVersion, right: PlatformTariffVersion): boolean {
  return left.lifecycle === right.lifecycle && left.draftRevision === right.draftRevision &&
    left.canonicalDigest === right.canonicalDigest && canonicalizePlatformTariffTerms(left) === canonicalizePlatformTariffTerms(right);
}

function normalizeDraft(input: PlatformTariffDraftInput): PlatformTariffVersion {
  try {
    return createPlatformTariffDraft(input);
  } catch (error) {
    if (error instanceof PlatformTariffAuthorityError) fail("invalid_tariff");
    throw error;
  }
}

function revisedDraftFromTerms(
  input: PlatformTariffDraftInput,
  draftRevision: number
): PlatformTariffVersion {
  try {
    return verifyPlatformTariffVersion({
      ...createPlatformTariffDraft(input),
      draftRevision
    });
  } catch (error) {
    if (error instanceof PlatformTariffAuthorityError) fail("invalid_tariff");
    throw error;
  }
}

function mapSubscription(
  row: typeof platformTariffSubscriptions.$inferSelect
): PlatformTariffSubscriptionRecord {
  const state = parseSubscriptionState(row.state);
  const pending = state === "incomplete_setup" || state === "awaiting_initial_payment";
  const started = state === "active" || state === "past_due" || state === "expired";
  const cancelledShapeValid =
    state !== "cancelled" ||
    ((row.startsAt === null && row.endsAt === null) ||
      (row.startsAt !== null && row.endsAt !== null));
  if (
    (pending && (row.startsAt !== null || row.endsAt !== null)) ||
    (started && (row.startsAt === null || row.endsAt === null)) ||
    !cancelledShapeValid ||
    (row.billingCycle !== "month" && row.billingCycle !== "year") ||
    !/^sha256:[a-f0-9]{64}$/.test(row.tariffVersionDigest)
  ) fail("persistence_write_incomplete");
  return Object.freeze({
    subscriptionId: row.id,
    ownerUserId: row.ownerUserId,
    tariffSeriesId: row.tariffSeriesId,
    tariffVersion: row.tariffVersion,
    tariffVersionDigest: row.tariffVersionDigest as PlatformTariffSubscriptionSnapshot["tariffVersionDigest"],
    commissionBpsSnapshot: row.commissionBpsSnapshot,
    version: row.version,
    billingCycle: row.billingCycle,
    state,
    startsAt: row.startsAt ? iso(row.startsAt) : null,
    endsAt: row.endsAt ? iso(row.endsAt) : null
  });
}

function parseSubscriptionState(value: string): PlatformTariffSubscriptionState {
  if (
    value === "incomplete_setup" ||
    value === "awaiting_initial_payment" ||
    value === "active" ||
    value === "past_due" ||
    value === "cancelled" ||
    value === "expired"
  ) {
    return value;
  }
  fail("persistence_write_incomplete");
}

function mapInvoice(row: typeof platformTariffInvoices.$inferSelect): PlatformTariffInvoiceRecord {
  if (
    (row.state !== "open" && row.state !== "payment_pending" && row.state !== "requires_customer_action" && row.state !== "captured" && row.state !== "declined" && row.state !== "failed" && row.state !== "provider_unknown" && row.state !== "void" && row.state !== "uncollectible") ||
    row.currency !== "RUB" || row.amountMinor < 0 || !Number.isSafeInteger(row.version) || row.version < 1 ||
    !/^sha256:[a-f0-9]{64}$/.test(row.tariffVersionDigest)
  ) fail("persistence_write_incomplete");
  const billingPeriodStartAt = iso(row.billingPeriodStartAt);
  const billingPeriodEndAt = iso(row.billingPeriodEndAt);
  if (Date.parse(billingPeriodEndAt) <= Date.parse(billingPeriodStartAt)) {
    fail("persistence_write_incomplete");
  }
  return Object.freeze({
    invoiceId: row.id,
    subscriptionId: row.subscriptionId,
    ownerUserId: row.ownerUserId,
    tariffSeriesId: row.tariffSeriesId,
    tariffVersion: row.tariffVersion,
    tariffVersionDigest: row.tariffVersionDigest as PlatformTariffInvoiceRecord["tariffVersionDigest"],
    amountMinor: row.amountMinor,
    currency: "RUB",
    state: row.state as PlatformTariffInvoiceRecord["state"],
    version: row.version,
    billingPeriodStartAt,
    billingPeriodEndAt,
    capturedAt: row.capturedAt ? iso(row.capturedAt) : null
  });
}

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) fail("persistence_write_incomplete");
  return date.toISOString();
}

async function execute<TSchema extends Record<string, unknown>, TResult>(
  _database: NodePgDatabase<TSchema>,
  operation: () => Promise<TResult>
): Promise<TResult> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PlatformTariffAuthorityPersistenceError) throw error;
    const code = postgresCode(error);
    if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
    if (code === "23505") fail("tariff_identity_conflict");
    throw error;
  }
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: PlatformTariffAuthorityPersistenceReason): never {
  throw new PlatformTariffAuthorityPersistenceError(reason);
}
