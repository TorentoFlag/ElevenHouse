import type {
  PlatformTariffInvoiceChargePreparationCandidate,
  PlatformTariffInvoiceChargePreparationReaderPort
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  platformTariffInvoices,
  platformTariffSubscriptions
} from "../../schema/platform-billing/tariff-authority.schema";
import { financeProviderAccounts } from "../../schema/finance/provider-accounts.schema";
import {
  financeRestrictedProviderCredentialHeads,
  financeRestrictedProviderCredentials
} from "../../schema/finance/provider-credentials.schema";
import {
  financeSavedCardConsentHeads,
  financeSavedCardConsents
} from "../../schema/finance/saved-card-consents.schema";
import { financePlatformTariffInvoiceChargePreparationRequests } from "../../schema/finance/platform-tariff-invoice-charge-preparation.schema";

export class PlatformTariffInvoiceChargePreparationReaderError extends Error {
  readonly code = "PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_READER_ERROR" as const;

  constructor(readonly reason: "invalid_input" | "preparation_integrity_conflict" | "persistence_failure") {
    super("Platform tariff invoice charge preparation cannot be read safely");
  }
}

type ChargePreparationReadRow = Readonly<{
  request: typeof financePlatformTariffInvoiceChargePreparationRequests.$inferSelect;
  invoice: typeof platformTariffInvoices.$inferSelect;
  subscription: typeof platformTariffSubscriptions.$inferSelect;
  credential: typeof financeRestrictedProviderCredentials.$inferSelect;
  credentialHead: typeof financeRestrictedProviderCredentialHeads.$inferSelect;
  consent: typeof financeSavedCardConsents.$inferSelect;
  consentHead: typeof financeSavedCardConsentHeads.$inferSelect;
  providerAccount: typeof financeProviderAccounts.$inferSelect;
}>;

/**
 * Returns a narrow, token-free snapshot for the worker.  This is deliberately not a locking
 * authority: the preparation UoW checks the same facts while holding its transaction locks.
 */
export function createDrizzlePlatformTariffInvoiceChargePreparationReader(
  database: ElevenHouseDatabase
): PlatformTariffInvoiceChargePreparationReaderPort {
  return Object.freeze({
    async findForPreparation(input) {
      const preparationRequestId = uuid(input.preparationRequestId);
      try {
        const [row] = await database
          .select({
            request: financePlatformTariffInvoiceChargePreparationRequests,
            invoice: platformTariffInvoices,
            subscription: platformTariffSubscriptions,
            credential: financeRestrictedProviderCredentials,
            credentialHead: financeRestrictedProviderCredentialHeads,
            consent: financeSavedCardConsents,
            consentHead: financeSavedCardConsentHeads,
            providerAccount: financeProviderAccounts
          })
          .from(financePlatformTariffInvoiceChargePreparationRequests)
          .innerJoin(
            platformTariffInvoices,
            eq(platformTariffInvoices.id, financePlatformTariffInvoiceChargePreparationRequests.invoiceId)
          )
          .innerJoin(
            platformTariffSubscriptions,
            eq(platformTariffSubscriptions.id, financePlatformTariffInvoiceChargePreparationRequests.subscriptionId)
          )
          .innerJoin(
            financeSavedCardConsents,
            and(
              eq(financeSavedCardConsents.subscriptionId, platformTariffSubscriptions.id),
              eq(financeSavedCardConsents.ownerUserId, platformTariffInvoices.ownerUserId),
              eq(financeSavedCardConsents.tariffSeriesId, platformTariffInvoices.tariffSeriesId),
              eq(financeSavedCardConsents.tariffVersion, platformTariffInvoices.tariffVersion),
              eq(financeSavedCardConsents.tariffVersionDigest, platformTariffInvoices.tariffVersionDigest)
            )
          )
          .innerJoin(
            financeSavedCardConsentHeads,
            and(
              eq(financeSavedCardConsentHeads.consentId, financeSavedCardConsents.consentId),
              eq(financeSavedCardConsentHeads.consentVersion, financeSavedCardConsents.consentVersion)
            )
          )
          .innerJoin(
            financeRestrictedProviderCredentials,
            and(
              eq(financeRestrictedProviderCredentials.consentId, financeSavedCardConsents.consentId),
              eq(financeRestrictedProviderCredentials.consentVersion, financeSavedCardConsents.consentVersion)
            )
          )
          .innerJoin(
            financeRestrictedProviderCredentialHeads,
            and(
              eq(financeRestrictedProviderCredentialHeads.seriesId, financeRestrictedProviderCredentials.seriesId),
              eq(financeRestrictedProviderCredentialHeads.providerAccountId, financeRestrictedProviderCredentials.providerAccountId),
              eq(financeRestrictedProviderCredentialHeads.providerIdentityVersion, financeRestrictedProviderCredentials.providerIdentityVersion),
              eq(financeRestrictedProviderCredentialHeads.providerCustomerId, financeRestrictedProviderCredentials.providerCustomerId)
            )
          )
          .innerJoin(
            financeProviderAccounts,
            and(
              eq(financeProviderAccounts.seriesId, financeRestrictedProviderCredentials.seriesId),
              eq(financeProviderAccounts.providerAccountId, financeRestrictedProviderCredentials.providerAccountId),
              eq(financeProviderAccounts.identityVersion, financeRestrictedProviderCredentials.providerIdentityVersion)
            )
          )
          .where(eq(financePlatformTariffInvoiceChargePreparationRequests.id, preparationRequestId))
          .limit(1);
        if (!row) return null;
        return mapPlatformTariffInvoiceChargePreparationCandidate(row);
      } catch (error) {
        if (error instanceof PlatformTariffInvoiceChargePreparationReaderError) throw error;
        throw new PlatformTariffInvoiceChargePreparationReaderError("persistence_failure");
      }
    }
  } satisfies PlatformTariffInvoiceChargePreparationReaderPort);
}

export function mapPlatformTariffInvoiceChargePreparationCandidate(
  row: ChargePreparationReadRow
): PlatformTariffInvoiceChargePreparationCandidate | null {
  try {
    const { request, invoice, subscription, credential, credentialHead, consent, consentHead, providerAccount } = row;
    if (
      request.state !== "pending" || request.version !== "1" ||
      request.economicPaymentIntentId !== null || request.economicPaymentSessionId !== null || request.providerOperationIntentId !== null ||
      request.invoiceId !== invoice.id || request.subscriptionId !== subscription.id ||
      request.expectedInvoiceVersion !== invoice.version || request.expectedSubscriptionVersion !== subscription.version ||
      invoice.state !== "open" || invoice.amountMinor <= 0 || invoice.currency !== "RUB" ||
      !chargeableSubscriptionForInvoice(subscription, invoice) ||
      invoice.subscriptionId !== subscription.id || invoice.ownerUserId !== subscription.ownerUserId ||
      invoice.tariffSeriesId !== subscription.tariffSeriesId || invoice.tariffVersion !== subscription.tariffVersion || invoice.tariffVersionDigest !== subscription.tariffVersionDigest ||
      credentialHead.currentLifecycle !== "active" || credentialHead.currentCredentialId !== credential.credentialId || credentialHead.currentCredentialVersion !== credential.credentialVersion ||
      consentHead.currentLifecycle !== "granted" ||
      consent.subscriptionId !== subscription.id || consent.ownerUserId !== invoice.ownerUserId || consent.tariffSeriesId !== invoice.tariffSeriesId || consent.tariffVersion !== invoice.tariffVersion || consent.tariffVersionDigest !== invoice.tariffVersionDigest ||
      credential.consentId !== consent.consentId || credential.consentVersion !== consent.consentVersion ||
      credential.seriesId !== consent.seriesId || credential.providerAccountId !== consent.providerAccountId || credential.providerIdentityVersion !== consent.providerIdentityVersion || credential.providerCustomerId !== consent.providerCustomerId ||
      providerAccount.provider !== "arc_pay" ||
      providerAccount.seriesId !== credential.seriesId || providerAccount.providerAccountId !== credential.providerAccountId || providerAccount.identityVersion !== credential.providerIdentityVersion ||
      (providerAccount.environment !== "sandbox" && providerAccount.environment !== "live") ||
      !integerAtLeastOne(request.attemptNumber) || !integerAtLeastOne(request.expectedInvoiceVersion) || !integerAtLeastOne(request.expectedSubscriptionVersion) ||
      !integerAtLeastOne(invoice.version) || !integerAtLeastOne(subscription.version) ||
      !integerAtLeastOne(credential.credentialVersion) || !integerAtLeastOne(consent.consentVersion) ||
      !digest(invoice.tariffVersionDigest) || !validBuyerContact(consent.buyerContactKind, consent.buyerContactValue)
    ) {
      return null;
    }
    const start = iso(invoice.billingPeriodStartAt);
    const end = iso(invoice.billingPeriodEndAt);
    if (Date.parse(end) <= Date.parse(start)) return null;
    return Object.freeze({
      preparationRequestId: request.id,
      attemptNumber: request.attemptNumber,
      preparationRequestVersion: Number(request.version),
      invoice: Object.freeze({
        invoiceId: invoice.id, subscriptionId: invoice.subscriptionId, ownerUserId: invoice.ownerUserId,
        tariffSeriesId: invoice.tariffSeriesId, tariffVersion: invoice.tariffVersion,
        tariffVersionDigest: invoice.tariffVersionDigest as `sha256:${string}`,
        amountMinor: invoice.amountMinor, currency: "RUB", state: "open", version: invoice.version,
        billingPeriodStartAt: start, billingPeriodEndAt: end
      }),
      subscription: Object.freeze({
        subscriptionId: subscription.id, ownerUserId: subscription.ownerUserId,
        tariffSeriesId: subscription.tariffSeriesId, tariffVersion: subscription.tariffVersion,
        tariffVersionDigest: subscription.tariffVersionDigest as `sha256:${string}`,
        commissionBpsSnapshot: subscription.commissionBpsSnapshot, billingCycle: cycle(subscription.billingCycle),
        state: subscription.state as "awaiting_initial_payment" | "past_due", version: subscription.version,
        startsAt: subscription.startsAt ? iso(subscription.startsAt) : null,
        endsAt: subscription.endsAt ? iso(subscription.endsAt) : null
      }),
      savedCardCredential: Object.freeze({
        kind: "restricted_saved_card_credential_ref", schemaVersion: 1,
        credentialId: credential.credentialId, credentialVersion: Number(credential.credentialVersion)
      }),
      recurringConsentId: consent.consentId,
      recurringConsentVersion: Number(consent.consentVersion),
      buyerContact: Object.freeze({ kind: consent.buyerContactKind, value: consent.buyerContactValue } as const),
      environment: providerAccount.environment
    });
  } catch {
    return null;
  }
}

function uuid(value: unknown): string {
  if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return value;
  throw new PlatformTariffInvoiceChargePreparationReaderError("invalid_input");
}
function integerAtLeastOne(value: string | number): boolean { return Number.isSafeInteger(Number(value)) && Number(value) >= 1; }
function digest(value: string): boolean { return /^sha256:[a-f0-9]{64}$/.test(value); }
function cycle(value: string): "month" | "year" { if (value === "month" || value === "year") return value; throw new Error("invalid cycle"); }
function iso(value: Date | string): string { const date = value instanceof Date ? value : new Date(value); if (Number.isNaN(date.getTime())) throw new Error("invalid date"); return date.toISOString(); }
function validBuyerContact(kind: string, value: string): kind is "email" | "phone" {
  return (kind === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) || (kind === "phone" && /^\+[1-9][0-9]{1,14}$/.test(value));
}

function chargeableSubscriptionForInvoice(
  subscription: typeof platformTariffSubscriptions.$inferSelect,
  invoice: typeof platformTariffInvoices.$inferSelect
): boolean {
  if (subscription.state === "awaiting_initial_payment") {
    return subscription.startsAt === null && subscription.endsAt === null;
  }
  if (subscription.state !== "past_due" || subscription.startsAt === null || subscription.endsAt === null) {
    return false;
  }
  return iso(invoice.billingPeriodStartAt) === iso(subscription.endsAt);
}
