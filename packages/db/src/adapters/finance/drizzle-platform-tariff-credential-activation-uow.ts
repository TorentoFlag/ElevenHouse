import {
  canonicalizePlatformTariffTerms,
  preparePlatformTariffInitialInvoice,
  verifyPlatformTariffVersion,
  type PlatformTariffVersion
} from "@elevenhouse/domain";
import {
  createFinancePlatformTariffInvoiceChargePreparationRequestedPayload,
  FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_REQUESTED_EVENT,
  type PlatformTariffCredentialActivationUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  platformTariffInvoices,
  platformTariffSubscriptions,
  platformTariffVersionCapabilities,
  platformTariffVersions
} from "../../schema/platform-billing/tariff-authority.schema";
import {
  financeRestrictedProviderCredentials,
  financeRestrictedProviderCredentialHeads
} from "../../schema/finance/provider-credentials.schema";
import {
  financeSavedCardConsents,
  financeSavedCardConsentHeads
} from "../../schema/finance/saved-card-consents.schema";
import { financePlatformTariffInvoiceChargePreparationRequests } from "../../schema/finance/platform-tariff-invoice-charge-preparation.schema";
import { outboxEvents } from "../../schema/outbox/outbox-events.schema";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type PlatformTariffCredentialActivationPersistenceReason =
  | "invalid_command"
  | "subscription_not_incomplete_setup"
  | "subscription_version_conflict"
  | "saved_card_credential_not_active"
  | "saved_card_consent_not_active"
  | "tariff_snapshot_not_found"
  | "invoice_activation_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class PlatformTariffCredentialActivationPersistenceError extends Error {
  readonly code = "platform_tariff_credential_activation_persistence_error";

  constructor(readonly reason: PlatformTariffCredentialActivationPersistenceReason) {
    super("Verified saved-card activation could not create the initial tariff invoice");
    this.name = "PlatformTariffCredentialActivationPersistenceError";
  }
}

/**
 * This UOW is intentionally finance-owned rather than a method on the generic tariff store:
 * it proves that the current credential and consent belong to the exact selected subscription
 * while all three records are locked.
 */
export function createDrizzlePlatformTariffCredentialActivationUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: Readonly<{ database: NodePgDatabase<TSchema> }>): PlatformTariffCredentialActivationUnitOfWork {
  return Object.freeze({
    createInitialInvoiceAfterVerifiedCredentialActivation: async (command) => {
      const normalized = normalize(command);
      try {
        return await input.database.transaction((transaction) => activateInTransaction(transaction, normalized));
      } catch (error) {
        if (error instanceof PlatformTariffCredentialActivationPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("invoice_activation_conflict");
        throw error;
      }
    }
  } satisfies PlatformTariffCredentialActivationUnitOfWork);
}

type Command = Readonly<{
  subscriptionId: string;
  expectedSubscriptionVersion: number;
  savedCardCredentialId: string;
  savedCardCredentialVersion: string;
  now: string;
}>;

async function activateInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: Command
) {
  const [subscription] = await transaction
    .select({
      id: platformTariffSubscriptions.id,
      ownerUserId: platformTariffSubscriptions.ownerUserId,
      tariffSeriesId: platformTariffSubscriptions.tariffSeriesId,
      tariffVersion: platformTariffSubscriptions.tariffVersion,
      tariffVersionDigest: platformTariffSubscriptions.tariffVersionDigest,
      commissionBpsSnapshot: platformTariffSubscriptions.commissionBpsSnapshot,
      billingCycle: platformTariffSubscriptions.billingCycle,
      state: platformTariffSubscriptions.state,
      version: platformTariffSubscriptions.version
    })
    .from(platformTariffSubscriptions)
    .where(eq(platformTariffSubscriptions.id, command.subscriptionId))
    .limit(1)
    .for("update");
  if (!subscription) fail("subscription_not_incomplete_setup");
  await lockAndValidateCredential(transaction, command, subscription);

  if (subscription.state === "awaiting_initial_payment") {
    if (subscription.version !== command.expectedSubscriptionVersion + 1) fail("subscription_version_conflict");
    const [invoice] = await transaction
      .select({
        id: platformTariffInvoices.id,
        state: platformTariffInvoices.state,
        version: platformTariffInvoices.version
      })
      .from(platformTariffInvoices)
      .where(and(
        eq(platformTariffInvoices.subscriptionId, subscription.id),
        inArray(platformTariffInvoices.state, ["open", "payment_pending", "requires_customer_action", "provider_unknown"])
      ))
      .limit(1)
      .for("update");
    if (!invoice) fail("invoice_activation_conflict");
    await assertChargePreparationRequest(
      transaction,
      invoice.id,
      invoice.version,
      subscription.id,
      subscription.version
    );
    return Object.freeze({
      kind: "platform_tariff_initial_invoice_activation_receipt" as const,
      subscriptionId: subscription.id,
      subscriptionVersion: subscription.version,
      invoiceId: invoice.id,
      invoiceState: invoice.state as "open" | "payment_pending" | "requires_customer_action" | "provider_unknown"
    });
  }
  if (subscription.state !== "incomplete_setup") fail("subscription_not_incomplete_setup");
  if (subscription.version !== command.expectedSubscriptionVersion) fail("subscription_version_conflict");

  const tariff = await lockAndReadTariff(transaction, subscription.tariffSeriesId, subscription.tariffVersion);
  if (!tariff) fail("tariff_snapshot_not_found");
  const authority = preparePlatformTariffInitialInvoice({
    subscription: {
      ownerUserId: subscription.ownerUserId,
      tariffSeriesId: subscription.tariffSeriesId,
      tariffVersion: subscription.tariffVersion,
      tariffVersionDigest: subscription.tariffVersionDigest as `sha256:${string}`,
      commissionBpsSnapshot: subscription.commissionBpsSnapshot,
      version: subscription.version,
      billingCycle: subscription.billingCycle as "month" | "year",
      state: "incomplete_setup",
      startsAt: null,
      endsAt: null
    },
    tariff,
    now: command.now
  });
  if (!authority.invoice || authority.subscription.state !== "awaiting_initial_payment") {
    fail("persistence_write_incomplete");
  }
  const [invoice] = await transaction
    .insert(platformTariffInvoices)
    .values({
      id: `platform-tariff-invoice:${randomUUID()}`,
      subscriptionId: subscription.id,
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
    .returning({ id: platformTariffInvoices.id, version: platformTariffInvoices.version });
  if (!invoice) fail("persistence_write_incomplete");
  const [updated] = await transaction
    .update(platformTariffSubscriptions)
    .set({
      state: "awaiting_initial_payment",
      version: subscription.version + 1,
      updatedAt: sql`clock_timestamp()`
    })
    .where(and(
      eq(platformTariffSubscriptions.id, subscription.id),
      eq(platformTariffSubscriptions.state, "incomplete_setup"),
      eq(platformTariffSubscriptions.version, command.expectedSubscriptionVersion)
    ))
    .returning({ id: platformTariffSubscriptions.id, version: platformTariffSubscriptions.version });
  if (!updated) fail("subscription_version_conflict");
  const preparationRequestId = randomUUID();
  const [preparationRequest] = await transaction
    .insert(financePlatformTariffInvoiceChargePreparationRequests)
    .values({
      id: preparationRequestId,
      invoiceId: invoice.id,
      subscriptionId: updated.id,
      expectedInvoiceVersion: invoice.version,
      expectedSubscriptionVersion: updated.version,
      state: "pending",
      version: "1"
    })
    .returning({ id: financePlatformTariffInvoiceChargePreparationRequests.id });
  if (!preparationRequest || preparationRequest.id !== preparationRequestId) fail("persistence_write_incomplete");
  const [outbox] = await transaction
    .insert(outboxEvents)
    .values({
      eventType: FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_REQUESTED_EVENT,
      aggregateId: preparationRequest.id,
      payload: createFinancePlatformTariffInvoiceChargePreparationRequestedPayload({
        preparationRequestId: preparationRequest.id
      })
    })
    .returning({ id: outboxEvents.id });
  if (!outbox) fail("persistence_write_incomplete");
  return Object.freeze({
    kind: "platform_tariff_initial_invoice_activation_receipt" as const,
    subscriptionId: updated.id,
    subscriptionVersion: updated.version,
    invoiceId: invoice.id,
    invoiceState: "open" as const
  });
}

async function assertChargePreparationRequest<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  invoiceId: string,
  expectedInvoiceVersion: number,
  subscriptionId: string,
  expectedSubscriptionVersion: number
): Promise<void> {
  const [request] = await transaction
    .select({
      id: financePlatformTariffInvoiceChargePreparationRequests.id,
      invoiceId: financePlatformTariffInvoiceChargePreparationRequests.invoiceId,
      subscriptionId: financePlatformTariffInvoiceChargePreparationRequests.subscriptionId,
      expectedInvoiceVersion:
        financePlatformTariffInvoiceChargePreparationRequests.expectedInvoiceVersion,
      expectedSubscriptionVersion: financePlatformTariffInvoiceChargePreparationRequests.expectedSubscriptionVersion,
      state: financePlatformTariffInvoiceChargePreparationRequests.state
    })
    .from(financePlatformTariffInvoiceChargePreparationRequests)
    .where(eq(financePlatformTariffInvoiceChargePreparationRequests.invoiceId, invoiceId))
    .limit(1)
    .for("share");
  if (
    !request ||
    request.invoiceId !== invoiceId ||
    request.expectedInvoiceVersion !== expectedInvoiceVersion ||
    request.subscriptionId !== subscriptionId ||
    request.expectedSubscriptionVersion !== expectedSubscriptionVersion ||
    (request.state !== "pending" && request.state !== "prepared")
  ) {
    fail("persistence_write_incomplete");
  }
  const [outbox] = await transaction
    .select({ payload: outboxEvents.payload })
    .from(outboxEvents)
    .where(and(
      eq(outboxEvents.eventType, FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_REQUESTED_EVENT),
      eq(outboxEvents.aggregateId, request.id)
    ))
    .limit(1)
    .for("share");
  if (!outbox || !samePreparationPayload(outbox.payload, request.id)) fail("persistence_write_incomplete");
}

function samePreparationPayload(value: unknown, preparationRequestId: string): boolean {
  try {
    return createFinancePlatformTariffInvoiceChargePreparationRequestedPayload(value)
      .preparationRequestId === preparationRequestId;
  } catch {
    return false;
  }
}

async function lockAndValidateCredential<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: Command,
  subscription: Readonly<{
    id: string;
    ownerUserId: string;
    tariffSeriesId: string;
    tariffVersion: number;
    tariffVersionDigest: string;
  }>
) {
  const [credential] = await transaction
    .select({
      credentialId: financeRestrictedProviderCredentials.credentialId,
      credentialVersion: financeRestrictedProviderCredentials.credentialVersion,
      seriesId: financeRestrictedProviderCredentials.seriesId,
      providerAccountId: financeRestrictedProviderCredentials.providerAccountId,
      providerIdentityVersion: financeRestrictedProviderCredentials.providerIdentityVersion,
      providerCustomerId: financeRestrictedProviderCredentials.providerCustomerId,
      consentId: financeRestrictedProviderCredentials.consentId,
      consentVersion: financeRestrictedProviderCredentials.consentVersion
    })
    .from(financeRestrictedProviderCredentials)
    .where(and(
      eq(financeRestrictedProviderCredentials.credentialId, command.savedCardCredentialId),
      eq(financeRestrictedProviderCredentials.credentialVersion, command.savedCardCredentialVersion)
    ))
    .limit(1)
    .for("update");
  if (!credential) fail("saved_card_credential_not_active");
  const [consent] = await transaction
    .select({
      subscriptionId: financeSavedCardConsents.subscriptionId,
      ownerUserId: financeSavedCardConsents.ownerUserId,
      tariffSeriesId: financeSavedCardConsents.tariffSeriesId,
      tariffVersion: financeSavedCardConsents.tariffVersion,
      tariffVersionDigest: financeSavedCardConsents.tariffVersionDigest,
      seriesId: financeSavedCardConsents.seriesId,
      providerAccountId: financeSavedCardConsents.providerAccountId,
      providerIdentityVersion: financeSavedCardConsents.providerIdentityVersion,
      providerCustomerId: financeSavedCardConsents.providerCustomerId
    })
    .from(financeSavedCardConsents)
    .where(and(
      eq(financeSavedCardConsents.consentId, credential.consentId),
      eq(financeSavedCardConsents.consentVersion, credential.consentVersion)
    ))
    .limit(1)
    .for("update");
  const [consentHead] = await transaction
    .select({ currentLifecycle: financeSavedCardConsentHeads.currentLifecycle })
    .from(financeSavedCardConsentHeads)
    .where(and(
      eq(financeSavedCardConsentHeads.consentId, credential.consentId),
      eq(financeSavedCardConsentHeads.consentVersion, credential.consentVersion)
    ))
    .limit(1)
    .for("update");
  const [credentialHead] = await transaction
    .select({
      currentCredentialId: financeRestrictedProviderCredentialHeads.currentCredentialId,
      currentCredentialVersion: financeRestrictedProviderCredentialHeads.currentCredentialVersion,
      currentLifecycle: financeRestrictedProviderCredentialHeads.currentLifecycle
    })
    .from(financeRestrictedProviderCredentialHeads)
    .where(and(
      eq(financeRestrictedProviderCredentialHeads.seriesId, credential.seriesId),
      eq(financeRestrictedProviderCredentialHeads.providerAccountId, credential.providerAccountId),
      eq(financeRestrictedProviderCredentialHeads.providerIdentityVersion, credential.providerIdentityVersion),
      eq(financeRestrictedProviderCredentialHeads.providerCustomerId, credential.providerCustomerId)
    ))
    .limit(1)
    .for("update");
  if (
    !consent ||
    !consentHead ||
    consentHead.currentLifecycle !== "granted" ||
    consent.subscriptionId !== subscription.id ||
    consent.ownerUserId !== subscription.ownerUserId ||
    consent.tariffSeriesId !== subscription.tariffSeriesId ||
    consent.tariffVersion !== subscription.tariffVersion ||
    consent.tariffVersionDigest !== subscription.tariffVersionDigest ||
    consent.seriesId !== credential.seriesId ||
    consent.providerAccountId !== credential.providerAccountId ||
    consent.providerIdentityVersion !== credential.providerIdentityVersion ||
    consent.providerCustomerId !== credential.providerCustomerId
  ) fail("saved_card_consent_not_active");
  if (
    !credentialHead ||
    credentialHead.currentLifecycle !== "active" ||
    credentialHead.currentCredentialId !== credential.credentialId ||
    credentialHead.currentCredentialVersion !== credential.credentialVersion
  ) fail("saved_card_credential_not_active");
  return credential;
}

async function lockAndReadTariff<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  tariffSeriesId: string,
  version: number
): Promise<PlatformTariffVersion | null> {
  const [row] = await transaction
    .select({
      tariffSeriesId: platformTariffVersions.tariffSeriesId,
      version: platformTariffVersions.version,
      draftRevision: platformTariffVersions.draftRevision,
      lifecycle: platformTariffVersions.lifecycle,
      name: platformTariffVersions.name,
      tagline: platformTariffVersions.tagline,
      monthlyPriceMinor: platformTariffVersions.monthlyPriceMinor,
      yearlyPriceMinor: platformTariffVersions.yearlyPriceMinor,
      monthlyRecurringFrequencyDays: platformTariffVersions.monthlyRecurringFrequencyDays,
      yearlyRecurringFrequencyDays: platformTariffVersions.yearlyRecurringFrequencyDays,
      currency: platformTariffVersions.currency,
      clientSaleCommissionBps: platformTariffVersions.clientSaleCommissionBps,
      seatsLimit: platformTariffVersions.seatsLimit,
      bookingsLimit: platformTariffVersions.bookingsLimit,
      aiRequestsLimit: platformTariffVersions.aiRequestsLimit,
      automationLimit: platformTariffVersions.automationLimit,
      isPopular: platformTariffVersions.isPopular,
      displayOrder: platformTariffVersions.displayOrder,
      canonicalPreimage: platformTariffVersions.canonicalPreimage,
      canonicalDigest: platformTariffVersions.canonicalDigest
    })
    .from(platformTariffVersions)
    .where(and(
      eq(platformTariffVersions.tariffSeriesId, tariffSeriesId),
      eq(platformTariffVersions.version, version)
    ))
    .limit(1)
    .for("update");
  if (!row) return null;
  const capabilities = await transaction
    .select()
    .from(platformTariffVersionCapabilities)
    .where(and(
      eq(platformTariffVersionCapabilities.tariffSeriesId, tariffSeriesId),
      eq(platformTariffVersionCapabilities.tariffVersion, version)
    ))
    .orderBy(asc(platformTariffVersionCapabilities.capability));
  try {
    const tariff = verifyPlatformTariffVersion({
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
      features: capabilities.map((entry) => entry.capability) as PlatformTariffVersion["features"],
      canonicalDigest: row.canonicalDigest as `sha256:${string}`
    });
    return row.currency === "RUB" && row.canonicalPreimage === canonicalizePlatformTariffTerms(tariff)
      ? tariff
      : null;
  } catch {
    return null;
  }
}

function normalize(input: {
  readonly subscriptionId: string;
  readonly expectedSubscriptionVersion: number;
  readonly savedCardCredentialId: string;
  readonly savedCardCredentialVersion: string;
  readonly now: string;
}): Command {
  if (
    !identifier(input.subscriptionId) ||
    !Number.isSafeInteger(input.expectedSubscriptionVersion) || input.expectedSubscriptionVersion < 1 ||
    !identifier(input.savedCardCredentialId) ||
    !revision(input.savedCardCredentialVersion) ||
    Number.isNaN(Date.parse(input.now))
  ) fail("invalid_command");
  return Object.freeze({ ...input });
}

function identifier(value: string): boolean {
  return value.trim() === value && value.length > 0 && value.length <= 160;
}

function revision(value: string): boolean {
  return /^[1-9][0-9]*$/u.test(value) && value.length <= 38;
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: PlatformTariffCredentialActivationPersistenceReason): never {
  throw new PlatformTariffCredentialActivationPersistenceError(reason);
}
