/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  createFinanceSavedCardSetupPreparationRequestedPayload,
  FINANCE_SAVED_CARD_SETUP_PREPARATION_REQUESTED_EVENT,
  normalizeFiscalBuyerContact,
  type InitiateSavedCardSetupCommand,
  type SavedCardSetupInitiationReceipt,
  type SavedCardSetupInitiationUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { platformTariffSubscriptions } from "../../schema/platform-billing/tariff-authority.schema";
import { outboxEvents } from "../../schema/outbox/outbox-events.schema";
import {
  financeProviderAccountSeries,
  financeProviderAccounts
} from "../../schema/finance/provider-accounts.schema";
import { financeSavedCardDisclosureVersions } from "../../schema/finance/saved-card-disclosures.schema";
import {
  financeSavedCardConsentHeads,
  financeSavedCardConsentLifecycleEvents,
  financeSavedCardConsents
} from "../../schema/finance/saved-card-consents.schema";
import { financeSavedCardSetupSessions } from "../../schema/finance/saved-card-setup-sessions.schema";
import { authIdentities } from "../../schema/identity/auth-identities.schema";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export type SavedCardSetupInitiationPersistenceReason =
  | "invalid_command"
  | "subscription_not_incomplete_setup"
  | "subscription_version_conflict"
  | "provider_account_not_configured"
  | "saved_card_disclosure_not_published"
  | "buyer_contact_not_verified"
  | "setup_already_active"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class SavedCardSetupInitiationPersistenceError extends Error {
  readonly code = "saved_card_setup_initiation_persistence_error" as const;

  constructor(readonly reason: SavedCardSetupInitiationPersistenceReason) {
    super("Saved-card setup could not be initiated from the selected tariff subscription");
    this.name = "SavedCardSetupInitiationPersistenceError";
  }
}

/**
 * The setup session and consent are committed before any ArcPay call. A worker may safely retry
 * the later provider operation from this durable state, but cannot create an invoice here.
 */
export function createDrizzleSavedCardSetupInitiationUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: Readonly<{ database: NodePgDatabase<TSchema> }>): SavedCardSetupInitiationUnitOfWork {
  return Object.freeze({
    initiateSavedCardSetup: async (inputCommand) => {
      const command = normalize(inputCommand);
      try {
        return await input.database.transaction((transaction) => initiateInTransaction(transaction, command));
      } catch (error) {
        if (error instanceof SavedCardSetupInitiationPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("setup_already_active");
        throw error;
      }
    }
  } satisfies SavedCardSetupInitiationUnitOfWork);
}

type Command = InitiateSavedCardSetupCommand;

async function initiateInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: Command
): Promise<SavedCardSetupInitiationReceipt> {
  const [subscription] = await transaction
    .select({
      id: platformTariffSubscriptions.id,
      ownerUserId: platformTariffSubscriptions.ownerUserId,
      tariffSeriesId: platformTariffSubscriptions.tariffSeriesId,
      tariffVersion: platformTariffSubscriptions.tariffVersion,
      tariffVersionDigest: platformTariffSubscriptions.tariffVersionDigest,
      state: platformTariffSubscriptions.state,
      version: platformTariffSubscriptions.version
    })
    .from(platformTariffSubscriptions)
    .where(eq(platformTariffSubscriptions.id, command.subscriptionId))
    .limit(1)
    .for("update");
  if (!subscription || subscription.ownerUserId !== command.ownerUserId || subscription.state !== "incomplete_setup") {
    fail("subscription_not_incomplete_setup");
  }
  if (subscription.version !== command.expectedSubscriptionVersion) fail("subscription_version_conflict");
  await assertVerifiedBuyerContact(transaction, subscription.ownerUserId, command.buyerContact);

  const [provider] = await transaction
    .select({
      seriesId: financeProviderAccountSeries.seriesId,
      activeIdentityVersion: financeProviderAccountSeries.activeIdentityVersion,
      providerAccountId: financeProviderAccounts.providerAccountId,
      identityVersion: financeProviderAccounts.identityVersion
    })
    .from(financeProviderAccountSeries)
    .innerJoin(
      financeProviderAccounts,
      and(
        eq(financeProviderAccounts.seriesId, financeProviderAccountSeries.seriesId),
        eq(financeProviderAccounts.identityVersion, financeProviderAccountSeries.activeIdentityVersion),
        eq(financeProviderAccounts.provider, financeProviderAccountSeries.provider)
      )
    )
    .where(eq(financeProviderAccountSeries.provider, "arc_pay"))
    .limit(1)
    .for("update");
  if (!provider || provider.identityVersion !== provider.activeIdentityVersion) fail("provider_account_not_configured");

  const [disclosure] = await transaction
    .select({
      disclosureSeriesId: financeSavedCardDisclosureVersions.disclosureSeriesId,
      version: financeSavedCardDisclosureVersions.version,
      locale: financeSavedCardDisclosureVersions.locale,
      canonicalDigest: financeSavedCardDisclosureVersions.canonicalDigest,
      lifecycle: financeSavedCardDisclosureVersions.lifecycle,
      publishedAt: financeSavedCardDisclosureVersions.publishedAt,
      retiredAt: financeSavedCardDisclosureVersions.retiredAt
    })
    .from(financeSavedCardDisclosureVersions)
    .where(and(
      eq(financeSavedCardDisclosureVersions.disclosureSeriesId, command.disclosureSeriesId),
      eq(financeSavedCardDisclosureVersions.version, command.disclosureVersion),
      eq(financeSavedCardDisclosureVersions.locale, command.noticeLocale),
      eq(financeSavedCardDisclosureVersions.canonicalDigest, command.disclosureDigest)
    ))
    .limit(1)
    .for("update");
  if (!disclosure || disclosure.lifecycle !== "published" || disclosure.publishedAt === null || disclosure.retiredAt !== null) {
    fail("saved_card_disclosure_not_published");
  }

  const providerCustomerId = `astrologer:${command.ownerUserId}`;
  await transaction.insert(financeSavedCardConsents).values({
    consentId: command.consentId,
    consentVersion: "1",
    subscriptionId: subscription.id,
    ownerUserId: subscription.ownerUserId,
    tariffSeriesId: subscription.tariffSeriesId,
    tariffVersion: subscription.tariffVersion,
    tariffVersionDigest: subscription.tariffVersionDigest,
    seriesId: provider.seriesId,
    providerAccountId: provider.providerAccountId,
    providerIdentityVersion: provider.identityVersion,
    providerCustomerId,
    buyerContactKind: command.buyerContact.kind,
    buyerContactValue: command.buyerContact.value,
    consentScope: "platform_tariff_saved_card_and_recurring_charge",
    noticeLocale: command.noticeLocale,
    disclosureSeriesId: disclosure.disclosureSeriesId,
    disclosureVersion: disclosure.version,
    disclosureDigest: disclosure.canonicalDigest,
    acceptedAt: new Date(command.now)
  });
  await transaction.insert(financeSavedCardConsentLifecycleEvents).values({
    consentId: command.consentId,
    consentVersion: "1",
    eventSequence: "1",
    lifecycle: "granted",
    occurredAt: new Date(command.now)
  });
  await transaction.insert(financeSavedCardConsentHeads).values({
    consentId: command.consentId,
    consentVersion: "1",
    currentLifecycle: "granted",
    lifecycleEventSequence: "1",
    headVersion: "1",
    updatedAt: new Date(command.now)
  });
  const [session] = await transaction
    .insert(financeSavedCardSetupSessions)
    .values({
      id: command.setupSessionId,
      subscriptionId: subscription.id,
      ownerUserId: subscription.ownerUserId,
      expectedSubscriptionVersion: subscription.version,
      consentId: command.consentId,
      consentVersion: "1",
      seriesId: provider.seriesId,
      providerAccountId: provider.providerAccountId,
      providerIdentityVersion: provider.identityVersion,
      providerCustomerId,
      state: "setup_requested",
      version: 1,
      createdAt: new Date(command.now),
      updatedAt: new Date(command.now)
    })
    .returning({ id: financeSavedCardSetupSessions.id, version: financeSavedCardSetupSessions.version });
  if (!session || session.id !== command.setupSessionId || session.version !== 1) fail("persistence_write_incomplete");
  const [outbox] = await transaction
    .insert(outboxEvents)
    .values({
      eventType: FINANCE_SAVED_CARD_SETUP_PREPARATION_REQUESTED_EVENT,
      aggregateId: session.id,
      payload: createFinanceSavedCardSetupPreparationRequestedPayload({ setupSessionId: session.id })
    })
    .returning({ id: outboxEvents.id });
  if (!outbox) fail("persistence_write_incomplete");
  return Object.freeze({
    kind: "saved_card_setup_initiation_receipt" as const,
    setupSessionId: session.id,
    setupSessionVersion: session.version,
    consentId: command.consentId,
    consentVersion: "1",
    state: "setup_requested" as const
  });
}

function normalize(input: InitiateSavedCardSetupCommand): Command {
  if (
    !uuid(input.setupSessionId) || !identifier(input.consentId) || !uuid(input.subscriptionId) || !uuid(input.ownerUserId) ||
    !positiveInteger(input.expectedSubscriptionVersion) || !identifier(input.disclosureSeriesId) ||
    !positiveInteger(input.disclosureVersion) || !digest(input.disclosureDigest) ||
    (input.noticeLocale !== "ru" && input.noticeLocale !== "en") ||
    Number.isNaN(Date.parse(input.now))
  ) fail("invalid_command");
  try {
    return Object.freeze({ ...input, buyerContact: normalizeFiscalBuyerContact(input.buyerContact) });
  } catch {
    fail("invalid_command");
  }
}

async function assertVerifiedBuyerContact<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  ownerUserId: string,
  buyerContact: Command["buyerContact"]
): Promise<void> {
  const [identity] = await transaction
    .select({
      userId: authIdentities.userId,
      email: authIdentities.email,
      emailVerifiedAt: authIdentities.emailVerifiedAt,
      phoneNumber: authIdentities.phoneNumber,
      phoneVerifiedAt: authIdentities.phoneVerifiedAt
    })
    .from(authIdentities)
    .where(
      buyerContact.kind === "email"
        ? and(
          eq(authIdentities.userId, ownerUserId),
          isNotNull(authIdentities.emailVerifiedAt),
          sql`lower(${authIdentities.email}) = lower(${buyerContact.value})`
        )
        : and(
          eq(authIdentities.userId, ownerUserId),
          isNotNull(authIdentities.phoneVerifiedAt),
          eq(authIdentities.phoneNumber, buyerContact.value)
        )
    )
    .limit(1)
    .for("share");
  if (!identity || !matchesVerifiedSavedCardConsentBuyerContact(identity, ownerUserId, buyerContact)) {
    fail("buyer_contact_not_verified");
  }
}

/**
 * Defense in depth for the SQL predicate above: a contact is finance authority only when its
 * exact normalized value belongs to the authenticated subscription owner and that identity is
 * verified. The function has no logging path because receipt contacts are private evidence.
 */
export function matchesVerifiedSavedCardConsentBuyerContact(
  identity: Readonly<{
    userId: string;
    email: string | null;
    emailVerifiedAt: Date | null;
    phoneNumber: string | null;
    phoneVerifiedAt: Date | null;
  }>,
  ownerUserId: string,
  buyerContact: Command["buyerContact"]
): boolean {
  if (identity.userId !== ownerUserId) return false;
  if (buyerContact.kind === "email") {
    return identity.emailVerifiedAt !== null && identity.email !== null &&
      identity.email.toLocaleLowerCase("en-US") === buyerContact.value.toLocaleLowerCase("en-US");
  }
  return identity.phoneVerifiedAt !== null && identity.phoneNumber === buyerContact.value;
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function identifier(value: string): boolean {
  return value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function digest(value: string): value is `sha256:${string}` {
  return /^sha256:[a-f0-9]{64}$/u.test(value);
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: SavedCardSetupInitiationPersistenceReason): never {
  throw new SavedCardSetupInitiationPersistenceError(reason);
}
