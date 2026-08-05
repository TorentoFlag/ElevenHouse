/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  createProviderDispatchEnvelope,
  digestFinanceCanonicalValueV1,
  type PlatformTariffInvoiceChargePreparationReceipt,
  type PlatformTariffInvoiceChargePreparationUnitOfWork,
  type PreparePlatformTariffInvoiceChargeCommand
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  platformTariffInvoices,
  platformTariffSubscriptions,
  platformTariffVersions
} from "../../schema/platform-billing/tariff-authority.schema";
import {
  financeRestrictedProviderCredentialHeads,
  financeRestrictedProviderCredentials
} from "../../schema/finance/provider-credentials.schema";
import {
  financeSavedCardConsentHeads,
  financeSavedCardConsents
} from "../../schema/finance/saved-card-consents.schema";
import { financePlatformTariffInvoiceChargePreparationRequests } from "../../schema/finance/platform-tariff-invoice-charge-preparation.schema";
import { createEconomicPaymentIntentInTransaction } from "./drizzle-economic-payment-intent-creation-uow";
import { openEconomicPaymentSessionInTransaction } from "./drizzle-economic-payment-session-open-uow";
import { persistProviderOperationBeforeIoInTransaction } from "./drizzle-provider-operation-intent-creation-uow";
import { registerSealedArtifactInTransaction } from "./finance-artifact-registry";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type PlatformTariffInvoiceChargePreparationPersistenceReason =
  | "invalid_command"
  | "preparation_request_not_pending"
  | "preparation_request_conflict"
  | "invoice_not_chargeable"
  | "subscription_not_chargeable"
  | "tariff_snapshot_not_chargeable"
  | "saved_card_credential_not_active"
  | "saved_card_consent_not_active"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class PlatformTariffInvoiceChargePreparationPersistenceError extends Error {
  readonly code = "platform_tariff_invoice_charge_preparation_persistence_error" as const;
  constructor(readonly reason: PlatformTariffInvoiceChargePreparationPersistenceReason) {
    super("Platform tariff invoice charge could not be prepared before provider I/O");
  }
}

export function createDrizzlePlatformTariffInvoiceChargePreparationUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: Readonly<{ database: NodePgDatabase<TSchema> }>): PlatformTariffInvoiceChargePreparationUnitOfWork {
  return Object.freeze({
    async preparePlatformTariffInvoiceCharge(command) {
      const normalized = normalize(command);
      try {
        return await input.database.transaction((transaction) => prepare(transaction, normalized));
      } catch (error) {
        if (error instanceof PlatformTariffInvoiceChargePreparationPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("preparation_request_conflict");
        if (code === "23503" || code === "23514") fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies PlatformTariffInvoiceChargePreparationUnitOfWork);
}

async function prepare<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: PreparePlatformTariffInvoiceChargeCommand
): Promise<PlatformTariffInvoiceChargePreparationReceipt> {
  const [request] = await transaction
    .select()
    .from(financePlatformTariffInvoiceChargePreparationRequests)
    .where(eq(financePlatformTariffInvoiceChargePreparationRequests.id, command.preparationRequestId))
    .limit(1)
    .for("update");
  if (!request) fail("preparation_request_not_pending");
  if (request.state === "prepared") return replay(request, command);
  if (
    request.state !== "pending" ||
    request.version !== String(command.expectedPreparationRequestVersion) ||
    request.version !== "1" ||
    request.economicPaymentIntentId !== null ||
    request.economicPaymentSessionId !== null ||
    request.providerOperationIntentId !== null
  ) fail("preparation_request_not_pending");

  const [invoice] = await transaction
    .select()
    .from(platformTariffInvoices)
    .where(eq(platformTariffInvoices.id, request.invoiceId))
    .limit(1)
    .for("update");
  if (
    !invoice || invoice.id !== request.invoiceId || invoice.subscriptionId !== request.subscriptionId ||
    invoice.state !== "open" || invoice.version !== request.expectedInvoiceVersion ||
    invoice.currency !== "RUB" || invoice.amountMinor <= 0
  ) fail("invoice_not_chargeable");
  const [subscription] = await transaction
    .select()
    .from(platformTariffSubscriptions)
    .where(eq(platformTariffSubscriptions.id, request.subscriptionId))
    .limit(1)
    .for("update");
  if (
    !subscription || subscription.state !== "awaiting_initial_payment" ||
    subscription.version !== request.expectedSubscriptionVersion ||
    subscription.id !== invoice.subscriptionId || subscription.ownerUserId !== invoice.ownerUserId ||
    subscription.tariffSeriesId !== invoice.tariffSeriesId || subscription.tariffVersion !== invoice.tariffVersion ||
    subscription.tariffVersionDigest !== invoice.tariffVersionDigest || subscription.startsAt !== null || subscription.endsAt !== null
  ) fail("subscription_not_chargeable");
  const [tariff] = await transaction
    .select()
    .from(platformTariffVersions)
    .where(and(
      eq(platformTariffVersions.tariffSeriesId, invoice.tariffSeriesId),
      eq(platformTariffVersions.version, invoice.tariffVersion),
      eq(platformTariffVersions.canonicalDigest, invoice.tariffVersionDigest)
    ))
    .limit(1)
    .for("share");
  if (!tariff || tariff.lifecycle !== "published") fail("tariff_snapshot_not_chargeable");

  const envelope = createProviderDispatchEnvelope(command.dispatchEnvelope);
  if (envelope.kind !== "saved_card_charge") fail("invalid_command");
  await assertCredentialAndConsent(transaction, command, invoice, subscription, envelope);
  assertEnvelopeMatchesTariff(envelope, command, invoice, subscription, tariff);

  const intent = await createEconomicPaymentIntentInTransaction(transaction, {
    economicPaymentIntentId: command.economicPaymentIntentId,
    sourceId: invoice.id,
    purpose: "platform_invoice",
    providerAccount: command.providerAccount,
    amountMinor: String(invoice.amountMinor),
    currency: "RUB",
    expectedSourceUniquenessVersion: 0
  });
  const session = await openEconomicPaymentSessionInTransaction(transaction, {
    economicPaymentIntentId: intent.economicPaymentHead.economicPaymentIntentId,
    economicPaymentSessionId: command.economicPaymentSessionId,
    expectedEconomicPaymentVersion: 1,
    providerAccount: command.providerAccount
  });
  const artifact = await registerSealedArtifactInTransaction(transaction as never, {
    artifact: command.dispatchArtifact,
    artifactClass: "provider_request",
    binding: { kind: "provider", providerAccount: command.providerAccount },
    contentType: command.dispatchPrivateObject.contentType,
    privateObject: command.dispatchPrivateObject,
    retentionPolicyId: command.retentionPolicyId,
    retentionPolicyVersion: command.retentionPolicyVersion
  });
  if ("bankCashPoolId" in artifact) fail("persistence_write_incomplete");
  const nextInvoiceVersion = invoice.version + 1;
  const authorization = Object.freeze({
    kind: "platform_invoice_charge_authorization" as const,
    authorityId: `platform-invoice-charge:${request.id}`,
    authorityVersion: "1",
    authorityDigest: digestFinanceCanonicalValueV1({
      preparationRequestId: request.id,
      invoiceId: invoice.id,
      invoiceVersion: nextInvoiceVersion,
      subscriptionId: subscription.id,
      subscriptionVersion: subscription.version,
      recurringConsentId: command.recurringConsentId,
      recurringConsentVersion: command.recurringConsentVersion,
      savedCardCredentialId: command.savedCardCredential.credentialId,
      savedCardCredentialVersion: command.savedCardCredential.credentialVersion,
      economicPaymentIntentId: command.economicPaymentIntentId
    }),
    sourceId: invoice.id,
    invoiceId: invoice.id,
    invoiceVersion: nextInvoiceVersion,
    subscriptionId: subscription.id,
    subscriptionVersion: subscription.version,
    recurringConsentId: command.recurringConsentId,
    recurringConsentVersion: command.recurringConsentVersion,
    savedCardCredentialId: command.savedCardCredential.credentialId,
    savedCardCredentialVersion: command.savedCardCredential.credentialVersion
  }) as never;
  await persistProviderOperationBeforeIoInTransaction(transaction, {
    providerOperationIntentId: command.providerOperationIntentId,
    economicPaymentIntentId: command.economicPaymentIntentId,
    expectedEconomicPaymentVersion: session.economicPaymentHead.version,
    expectedProviderOperationSourceVersion: 0,
    economicPaymentSessionId: command.economicPaymentSessionId,
    providerAccount: command.providerAccount,
    operationKind: "saved_card_charge",
    dispatchEnvelope: envelope,
    dispatchAuthorization: authorization,
    dispatchArtifact: artifact,
    replacementAuthority: null,
    idempotencyKey: command.idempotencyKey,
    idempotencyRetentionDeadline: command.idempotencyRetentionDeadline,
    operationEnvelope: command.operationEnvelope
  });
  const [pendingInvoice] = await transaction
    .update(platformTariffInvoices)
    .set({ state: "payment_pending", version: nextInvoiceVersion })
    .where(and(
      eq(platformTariffInvoices.id, invoice.id),
      eq(platformTariffInvoices.state, "open"),
      eq(platformTariffInvoices.version, invoice.version)
    ))
    .returning({ id: platformTariffInvoices.id, version: platformTariffInvoices.version });
  if (!pendingInvoice || pendingInvoice.version !== nextInvoiceVersion) fail("invoice_not_chargeable");
  const [prepared] = await transaction
    .update(financePlatformTariffInvoiceChargePreparationRequests)
    .set({
      state: "prepared",
      version: "2",
      economicPaymentIntentId: command.economicPaymentIntentId,
      economicPaymentSessionId: command.economicPaymentSessionId,
      providerOperationIntentId: command.providerOperationIntentId,
      updatedAt: sql`clock_timestamp()`
    })
    .where(and(
      eq(financePlatformTariffInvoiceChargePreparationRequests.id, request.id),
      eq(financePlatformTariffInvoiceChargePreparationRequests.state, "pending"),
      eq(financePlatformTariffInvoiceChargePreparationRequests.version, "1")
    ))
    .returning({ id: financePlatformTariffInvoiceChargePreparationRequests.id });
  if (!prepared || prepared.id !== request.id) fail("preparation_request_conflict");
  return receipt(request.id, 2, invoice.id, nextInvoiceVersion, command);
}

async function assertCredentialAndConsent<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>, command: PreparePlatformTariffInvoiceChargeCommand,
  invoice: typeof platformTariffInvoices.$inferSelect, subscription: typeof platformTariffSubscriptions.$inferSelect,
  envelope: Extract<ReturnType<typeof createProviderDispatchEnvelope>, { kind: "saved_card_charge" }>
): Promise<void> {
  const [row] = await transaction.select({ credential: financeRestrictedProviderCredentials, credentialHead: financeRestrictedProviderCredentialHeads, consent: financeSavedCardConsents, consentHead: financeSavedCardConsentHeads })
    .from(financeRestrictedProviderCredentials)
    .innerJoin(financeRestrictedProviderCredentialHeads, and(
      eq(financeRestrictedProviderCredentialHeads.seriesId, financeRestrictedProviderCredentials.seriesId),
      eq(financeRestrictedProviderCredentialHeads.providerAccountId, financeRestrictedProviderCredentials.providerAccountId),
      eq(financeRestrictedProviderCredentialHeads.providerIdentityVersion, financeRestrictedProviderCredentials.providerIdentityVersion),
      eq(financeRestrictedProviderCredentialHeads.providerCustomerId, financeRestrictedProviderCredentials.providerCustomerId)
    ))
    .innerJoin(financeSavedCardConsents, and(eq(financeSavedCardConsents.consentId, financeRestrictedProviderCredentials.consentId), eq(financeSavedCardConsents.consentVersion, financeRestrictedProviderCredentials.consentVersion)))
    .innerJoin(financeSavedCardConsentHeads, and(eq(financeSavedCardConsentHeads.consentId, financeSavedCardConsents.consentId), eq(financeSavedCardConsentHeads.consentVersion, financeSavedCardConsents.consentVersion)))
    .where(and(eq(financeRestrictedProviderCredentials.credentialId, command.savedCardCredential.credentialId), eq(financeRestrictedProviderCredentials.credentialVersion, String(command.savedCardCredential.credentialVersion))))
    .limit(1).for("share");
  if (!row) fail("saved_card_credential_not_active");
  const { credential, credentialHead, consent, consentHead } = row;
  if (credentialHead.currentLifecycle !== "active" || credentialHead.currentCredentialId !== credential.credentialId || credentialHead.currentCredentialVersion !== credential.credentialVersion) fail("saved_card_credential_not_active");
  if (consentHead.currentLifecycle !== "granted" || consent.consentId !== command.recurringConsentId || consent.consentVersion !== String(command.recurringConsentVersion) ||
    consent.subscriptionId !== subscription.id || consent.ownerUserId !== invoice.ownerUserId || consent.tariffSeriesId !== invoice.tariffSeriesId || consent.tariffVersion !== invoice.tariffVersion || consent.tariffVersionDigest !== invoice.tariffVersionDigest ||
    credential.seriesId !== command.providerAccount.seriesId || credential.providerAccountId !== command.providerAccount.providerAccountId || credential.providerIdentityVersion !== command.providerAccount.identityVersion ||
    consent.seriesId !== credential.seriesId || consent.providerAccountId !== credential.providerAccountId || consent.providerIdentityVersion !== credential.providerIdentityVersion || consent.providerCustomerId !== credential.providerCustomerId ||
    envelope.fiscalSnapshot.buyerContact.kind !== consent.buyerContactKind || envelope.fiscalSnapshot.buyerContact.value !== consent.buyerContactValue
  ) fail("saved_card_consent_not_active");
}

function assertEnvelopeMatchesTariff(envelope: Extract<ReturnType<typeof createProviderDispatchEnvelope>, { kind: "saved_card_charge" }>, command: PreparePlatformTariffInvoiceChargeCommand, invoice: typeof platformTariffInvoices.$inferSelect, subscription: typeof platformTariffSubscriptions.$inferSelect, tariff: typeof platformTariffVersions.$inferSelect): void {
  const frequency = subscription.billingCycle === "month" ? tariff.monthlyRecurringFrequencyDays : tariff.yearlyRecurringFrequencyDays;
  const price = subscription.billingCycle === "month" ? tariff.monthlyPriceMinor : tariff.yearlyPriceMinor;
  if (envelope.externalId !== invoice.id || envelope.amount.amountMinor !== invoice.amountMinor || envelope.amount.currency !== "RUB" ||
    envelope.savedCardCredential.credentialId !== command.savedCardCredential.credentialId || envelope.savedCardCredential.credentialVersion !== command.savedCardCredential.credentialVersion ||
    frequency === null || !Number.isSafeInteger(frequency) || envelope.recurringFrequencyDays !== frequency || price !== invoice.amountMinor) fail("invalid_command");
}

function replay(row: typeof financePlatformTariffInvoiceChargePreparationRequests.$inferSelect, command: PreparePlatformTariffInvoiceChargeCommand): PlatformTariffInvoiceChargePreparationReceipt {
  if (row.version !== "2" || row.economicPaymentIntentId !== command.economicPaymentIntentId || row.economicPaymentSessionId !== command.economicPaymentSessionId || row.providerOperationIntentId !== command.providerOperationIntentId) fail("preparation_request_conflict");
  return receipt(row.id, 2, row.invoiceId, row.expectedInvoiceVersion + 1, command);
}

function receipt(preparationRequestId: string, preparationRequestVersion: number, invoiceId: string, invoiceVersion: number, command: PreparePlatformTariffInvoiceChargeCommand): PlatformTariffInvoiceChargePreparationReceipt {
  return Object.freeze({ kind: "platform_tariff_invoice_charge_preparation_receipt" as const, preparationRequestId, preparationRequestVersion, invoiceId, invoiceVersion, economicPaymentIntentId: command.economicPaymentIntentId, economicPaymentSessionId: command.economicPaymentSessionId, providerOperationIntentId: command.providerOperationIntentId });
}

function normalize(command: PreparePlatformTariffInvoiceChargeCommand): PreparePlatformTariffInvoiceChargeCommand {
  if (!uuid(command.preparationRequestId) || !uuid(command.economicPaymentIntentId) || !uuid(command.economicPaymentSessionId) || !uuid(command.providerOperationIntentId) || !Number.isSafeInteger(command.expectedPreparationRequestVersion) || command.expectedPreparationRequestVersion < 1 || !identifier(command.recurringConsentId) || !Number.isSafeInteger(command.recurringConsentVersion) || command.recurringConsentVersion < 1 || !identifier(command.idempotencyKey) || Number.isNaN(Date.parse(command.idempotencyRetentionDeadline))) fail("invalid_command");
  return command;
}
function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value); }
function postgresCode(error: unknown): string | null { return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null; }
function fail(reason: PlatformTariffInvoiceChargePreparationPersistenceReason): never { throw new PlatformTariffInvoiceChargePreparationPersistenceError(reason); }
