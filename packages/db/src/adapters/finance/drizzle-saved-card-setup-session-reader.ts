import { and, desc, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  financeRestrictedProviderCredentialHeads,
  financeRestrictedProviderCredentials
} from "../../schema/finance/provider-credentials.schema";
import { financeSavedCardConsentHeads } from "../../schema/finance/saved-card-consents.schema";
import { financeSavedCardSetupSessions } from "../../schema/finance/saved-card-setup-sessions.schema";

export type SavedCardSetupPreparationSession = Readonly<{
  setupSessionId: string;
  state: "setup_requested" | "preparation_pending";
  ownerUserId: string;
  providerAccount: { seriesId: string; providerAccountId: string; identityVersion: number };
  providerCustomerId: string;
}>;

export type SavedCardSetupOwnerSession = Readonly<{
  setupSessionId: string;
  subscriptionId: string;
  setupSessionVersion: number;
  state:
    | "setup_requested"
    | "preparation_pending"
    | "tokenization_required"
    | "execution_pending"
    | "requires_customer_action"
    | "credential_active"
    | "setup_failed"
    | "expired"
    | "provider_unknown";
  providerSetupId: string | null;
  providerCustomerId: string;
  economicPaymentIntentId: string | null;
  providerAccount: { seriesId: string; providerAccountId: string; identityVersion: number };
}>;

/** Safe projection suitable for an owner-facing settings page. */
export type SavedCardDisplayPaymentMethod = Readonly<{
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}>;

export type SavedCardSetupSessionReader = Readonly<{
  findForPreparation(input: Readonly<{ setupSessionId: string }>): Promise<SavedCardSetupPreparationSession | null>;
  findForOwner(input: Readonly<{ setupSessionId: string; ownerUserId: string }>): Promise<SavedCardSetupOwnerSession | null>;
  findForSubscriptionOwner(input: Readonly<{
    subscriptionId: string;
    ownerUserId: string;
  }>): Promise<SavedCardSetupOwnerSession | null>;
  findActivePaymentMethodForSubscriptionOwner(input: Readonly<{
    subscriptionId: string;
    ownerUserId: string;
  }>): Promise<SavedCardDisplayPaymentMethod | null>;
}>;

export function createDrizzleSavedCardSetupSessionReader(database: ElevenHouseDatabase): SavedCardSetupSessionReader {
  return Object.freeze({
    async findForPreparation({ setupSessionId }) {
      const [row] = await database.select().from(financeSavedCardSetupSessions)
        .where(eq(financeSavedCardSetupSessions.id, setupSessionId)).limit(1);
      if (!row || (row.state !== "setup_requested" && row.state !== "preparation_pending")) return null;
      return Object.freeze({
        setupSessionId: row.id,
        state: row.state,
        ownerUserId: row.ownerUserId,
        providerAccount: {
          seriesId: row.seriesId,
          providerAccountId: row.providerAccountId,
          identityVersion: row.providerIdentityVersion
        },
        providerCustomerId: row.providerCustomerId
      });
    },
    async findForOwner({ setupSessionId, ownerUserId }) {
      const [row] = await database.select().from(financeSavedCardSetupSessions)
        .where(eq(financeSavedCardSetupSessions.id, setupSessionId)).limit(1);
      return mapOwnerSession(row, ownerUserId);
    },
    async findForSubscriptionOwner({ subscriptionId, ownerUserId }) {
      const [row] = await database.select().from(financeSavedCardSetupSessions)
        .where(and(
          eq(financeSavedCardSetupSessions.subscriptionId, subscriptionId),
          eq(financeSavedCardSetupSessions.ownerUserId, ownerUserId)
        ))
        .orderBy(desc(financeSavedCardSetupSessions.createdAt))
        .limit(1);
      return mapOwnerSession(row, ownerUserId);
    },
    async findActivePaymentMethodForSubscriptionOwner({ subscriptionId, ownerUserId }) {
      const [row] = await database
        .select({
          brand: financeRestrictedProviderCredentials.displayBrand,
          last4: financeRestrictedProviderCredentials.displayLast4,
          expiryMonth: financeRestrictedProviderCredentials.expiryMonth,
          expiryYear: financeRestrictedProviderCredentials.expiryYear
        })
        .from(financeSavedCardSetupSessions)
        .innerJoin(
          financeRestrictedProviderCredentials,
          and(
            eq(financeRestrictedProviderCredentials.credentialId, financeSavedCardSetupSessions.savedCardCredentialId),
            eq(financeRestrictedProviderCredentials.credentialVersion, financeSavedCardSetupSessions.savedCardCredentialVersion),
            eq(financeRestrictedProviderCredentials.seriesId, financeSavedCardSetupSessions.seriesId),
            eq(financeRestrictedProviderCredentials.providerAccountId, financeSavedCardSetupSessions.providerAccountId),
            eq(financeRestrictedProviderCredentials.providerIdentityVersion, financeSavedCardSetupSessions.providerIdentityVersion),
            eq(financeRestrictedProviderCredentials.providerCustomerId, financeSavedCardSetupSessions.providerCustomerId)
          )
        )
        .innerJoin(
          financeRestrictedProviderCredentialHeads,
          and(
            eq(financeRestrictedProviderCredentialHeads.seriesId, financeRestrictedProviderCredentials.seriesId),
            eq(financeRestrictedProviderCredentialHeads.providerAccountId, financeRestrictedProviderCredentials.providerAccountId),
            eq(financeRestrictedProviderCredentialHeads.providerIdentityVersion, financeRestrictedProviderCredentials.providerIdentityVersion),
            eq(financeRestrictedProviderCredentialHeads.providerCustomerId, financeRestrictedProviderCredentials.providerCustomerId),
            eq(financeRestrictedProviderCredentialHeads.currentCredentialId, financeRestrictedProviderCredentials.credentialId),
            eq(financeRestrictedProviderCredentialHeads.currentCredentialVersion, financeRestrictedProviderCredentials.credentialVersion),
            eq(financeRestrictedProviderCredentialHeads.currentLifecycle, "active")
          )
        )
        .innerJoin(
          financeSavedCardConsentHeads,
          and(
            eq(financeSavedCardConsentHeads.consentId, financeSavedCardSetupSessions.consentId),
            eq(financeSavedCardConsentHeads.consentVersion, financeSavedCardSetupSessions.consentVersion),
            eq(financeSavedCardConsentHeads.currentLifecycle, "granted")
          )
        )
        .where(and(
          eq(financeSavedCardSetupSessions.subscriptionId, subscriptionId),
          eq(financeSavedCardSetupSessions.ownerUserId, ownerUserId),
          eq(financeSavedCardSetupSessions.state, "credential_active")
        ))
        .orderBy(desc(financeSavedCardSetupSessions.terminalAt))
        .limit(1);
      return row ? Object.freeze(row) : null;
    }
  });
}

function mapOwnerSession(
  row: typeof financeSavedCardSetupSessions.$inferSelect | undefined,
  ownerUserId: string
): SavedCardSetupOwnerSession | null {
  if (!row || row.ownerUserId !== ownerUserId) return null;
  return Object.freeze({
    setupSessionId: row.id,
    subscriptionId: row.subscriptionId,
    setupSessionVersion: row.version,
    state: row.state as SavedCardSetupOwnerSession["state"],
    providerSetupId: row.providerSetupId,
    providerCustomerId: row.providerCustomerId,
    economicPaymentIntentId: row.economicPaymentIntentId,
    providerAccount: {
      seriesId: row.seriesId,
      providerAccountId: row.providerAccountId,
      identityVersion: row.providerIdentityVersion
    }
  });
}
