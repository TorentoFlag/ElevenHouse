import { and, desc, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
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

export type SavedCardSetupSessionReader = Readonly<{
  findForPreparation(input: Readonly<{ setupSessionId: string }>): Promise<SavedCardSetupPreparationSession | null>;
  findForOwner(input: Readonly<{ setupSessionId: string; ownerUserId: string }>): Promise<SavedCardSetupOwnerSession | null>;
  findForSubscriptionOwner(input: Readonly<{
    subscriptionId: string;
    ownerUserId: string;
  }>): Promise<SavedCardSetupOwnerSession | null>;
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
