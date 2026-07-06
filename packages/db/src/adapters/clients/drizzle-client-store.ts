import { and, count, desc, eq, ilike, type SQL } from "drizzle-orm";
import {
  ClientAstrologerRelationshipRoleError,
  type AstrologerClientList,
  type AstrologerClientListItem,
  type ClientAstrologerRelationship,
  type ClientBirthData,
  type ClientJoinIntent,
  type ClientStore,
  type ClientStoreCreateJoinIntentInput,
  type ClientStoreEnsureRelationshipInput,
  type ClientStoreUpsertBirthDataInput,
  type ClientStoreUpsertProfileInput
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  clientAstrologerRelationships,
  clientBirthData,
  clientJoinIntents,
  clientProfiles,
  userRoleAssignments
} from "../../schema";
import { insertReturningOne } from "../../shared";

type ClientProfileRow = typeof clientProfiles.$inferSelect;
type ClientBirthDataRow = typeof clientBirthData.$inferSelect;
type ClientRelationshipRow = typeof clientAstrologerRelationships.$inferSelect;
type ClientJoinIntentRow = typeof clientJoinIntents.$inferSelect;
type ClientTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
export type ClientDrizzleDatabase = ElevenHouseDatabase | ClientTransaction;

export function createDrizzleClientStore(database: ClientDrizzleDatabase): ClientStore {
  return {
    createJoinIntent: (input) => createJoinIntent(database, input),
    findJoinIntentByTokenHash: async ({ tokenHash }) => {
      const [row] = await database
        .select()
        .from(clientJoinIntents)
        .where(eq(clientJoinIntents.tokenHash, tokenHash))
        .limit(1);

      return row ? toClientJoinIntent(row) : null;
    },
    markJoinIntentClaimed: async ({ intentId, clientUserId, now }) => {
      const [row] = await database
        .update(clientJoinIntents)
        .set({
          status: "claimed",
          claimedByClientUserId: clientUserId,
          claimedAt: new Date(now),
          updatedAt: new Date(now)
        })
        .where(eq(clientJoinIntents.id, intentId))
        .returning();

      return row ? toClientJoinIntent(row) : null;
    },
    ensureRelationship: (input) => ensureRelationship(database, input),
    upsertClientProfile: (input) => upsertClientProfile(database, input),
    upsertClientBirthData: (input) => upsertClientBirthData(database, input),
    listAstrologerClients: (input) => listAstrologerClients(database, input)
  };
}

async function createJoinIntent(
  database: ClientDrizzleDatabase,
  input: ClientStoreCreateJoinIntentInput
): Promise<ClientJoinIntent> {
  const row = await insertReturningOne(
    () =>
      database
        .insert(clientJoinIntents)
        .values({
          id: input.id,
          astrologerUserId: input.astrologerUserId,
          tokenHash: input.tokenHash,
          publicHandleSnapshot: input.publicHandleSnapshot,
          status: "pending",
          expiresAt: new Date(input.expiresAt),
          claimedByClientUserId: null,
          claimedAt: null,
          createdAt: new Date(input.now),
          updatedAt: new Date(input.now)
        })
        .returning(),
    "client_join_intents"
  );

  return toClientJoinIntent(row);
}

async function upsertClientProfile(
  database: ClientDrizzleDatabase,
  input: ClientStoreUpsertProfileInput
): Promise<void> {
  await database
    .insert(clientProfiles)
    .values({
      userId: input.userId,
      displayNameSnapshot: input.displayNameSnapshot,
      preferredLocale: input.preferredLocale,
      timezone: input.timezone,
      createdAt: new Date(input.now),
      updatedAt: new Date(input.now)
    })
    .onConflictDoUpdate({
      target: clientProfiles.userId,
      set: {
        displayNameSnapshot: input.displayNameSnapshot,
        preferredLocale: input.preferredLocale,
        timezone: input.timezone,
        updatedAt: new Date(input.now)
      }
    })
    .returning();
}

async function upsertClientBirthData(
  database: ClientDrizzleDatabase,
  input: ClientStoreUpsertBirthDataInput
): Promise<ClientBirthData> {
  const row = await insertReturningOne(
    () =>
      database
        .insert(clientBirthData)
        .values({
          clientUserId: input.clientUserId,
          ...input.data,
          createdAt: new Date(input.now),
          updatedAt: new Date(input.now)
        })
        .onConflictDoUpdate({
          target: clientBirthData.clientUserId,
          set: {
            ...input.data,
            updatedAt: new Date(input.now)
          }
        })
        .returning(),
    "client_birth_data"
  );

  return toClientBirthData(row);
}

async function ensureRelationship(
  database: ClientDrizzleDatabase,
  input: ClientStoreEnsureRelationshipInput
): Promise<ClientAstrologerRelationship> {
  const [hasClientRole, hasAstrologerRole] = await Promise.all([
    hasRole(database, input.clientUserId, "client"),
    hasRole(database, input.astrologerUserId, "astrologer")
  ]);
  if (!hasClientRole) {
    throw new ClientAstrologerRelationshipRoleError("Client account role is required");
  }
  if (!hasAstrologerRole) {
    throw new ClientAstrologerRelationshipRoleError("Astrologer account role is required");
  }

  const row = await insertReturningOne(
    () =>
      database
        .insert(clientAstrologerRelationships)
        .values({
          clientUserId: input.clientUserId,
          astrologerUserId: input.astrologerUserId,
          source: input.source,
          status: "active",
          firstLinkedAt: new Date(input.now),
          lastLinkedAt: new Date(input.now),
          archivedAt: null,
          blockedAt: null,
          createdAt: new Date(input.now),
          updatedAt: new Date(input.now)
        })
        .onConflictDoUpdate({
          target: [
            clientAstrologerRelationships.clientUserId,
            clientAstrologerRelationships.astrologerUserId
          ],
          set: {
            status: "active",
            lastLinkedAt: new Date(input.now),
            archivedAt: null,
            updatedAt: new Date(input.now)
          }
        })
        .returning(),
    "client_astrologer_relationships"
  );

  return toClientAstrologerRelationship(row);
}

async function listAstrologerClients(
  database: ClientDrizzleDatabase,
  input: {
    readonly astrologerUserId: string;
    readonly query: string;
    readonly limit: number;
    readonly offset: number;
  }
): Promise<AstrologerClientList> {
  const filters: SQL[] = [
    eq(clientAstrologerRelationships.astrologerUserId, input.astrologerUserId),
    eq(clientAstrologerRelationships.status, "active")
  ];
  if (input.query) {
    filters.push(ilike(clientProfiles.displayNameSnapshot, `%${input.query}%`));
  }
  const where = and(...filters);
  const [totalRow] = await database
    .select({ value: count() })
    .from(clientAstrologerRelationships)
    .leftJoin(clientProfiles, eq(clientProfiles.userId, clientAstrologerRelationships.clientUserId))
    .where(where);
  const rows = await database
    .select({
      relationship: clientAstrologerRelationships,
      profile: clientProfiles,
      birthData: clientBirthData
    })
    .from(clientAstrologerRelationships)
    .leftJoin(clientProfiles, eq(clientProfiles.userId, clientAstrologerRelationships.clientUserId))
    .leftJoin(clientBirthData, eq(clientBirthData.clientUserId, clientAstrologerRelationships.clientUserId))
    .where(where)
    .orderBy(desc(clientAstrologerRelationships.lastLinkedAt), desc(clientAstrologerRelationships.id))
    .limit(input.limit)
    .offset(input.offset);

  return {
    clients: rows.map((row) =>
      toAstrologerClientListItem(row.relationship, row.profile, row.birthData)
    ),
    total: Number(totalRow?.value ?? 0)
  };
}

async function hasRole(
  database: ClientDrizzleDatabase,
  userId: string,
  role: "client" | "astrologer"
): Promise<boolean> {
  const [row] = await database
    .select({ id: userRoleAssignments.id })
    .from(userRoleAssignments)
    .where(and(eq(userRoleAssignments.userId, userId), eq(userRoleAssignments.role, role)))
    .limit(1);

  return Boolean(row);
}

function toAstrologerClientListItem(
  relationship: ClientRelationshipRow,
  profile: ClientProfileRow | null,
  birthData: ClientBirthDataRow | null
): AstrologerClientListItem {
  return {
    clientUserId: relationship.clientUserId,
    displayName: profile?.displayNameSnapshot ?? null,
    relationshipStatus: relationship.status as AstrologerClientListItem["relationshipStatus"],
    firstLinkedAt: toIsoString(relationship.firstLinkedAt),
    lastLinkedAt: toIsoString(relationship.lastLinkedAt),
    birthData: birthData ? toClientBirthData(birthData) : null
  };
}

function toClientBirthData(row: ClientBirthDataRow): ClientBirthData {
  return {
    id: row.id,
    clientUserId: row.clientUserId,
    label: row.label,
    birthDate: row.birthDate,
    birthTime: row.birthTime,
    birthTimePrecision: row.birthTimePrecision as ClientBirthData["birthTimePrecision"],
    birthPlaceText: row.birthPlaceText,
    birthCountryCode: row.birthCountryCode,
    birthCity: row.birthCity,
    birthRegion: row.birthRegion,
    birthTimezone: row.birthTimezone,
    birthLatitude: row.birthLatitude === null ? null : Number(row.birthLatitude),
    birthLongitude: row.birthLongitude === null ? null : Number(row.birthLongitude),
    source: row.source as ClientBirthData["source"],
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toClientAstrologerRelationship(row: ClientRelationshipRow): ClientAstrologerRelationship {
  return {
    id: row.id,
    clientUserId: row.clientUserId,
    astrologerUserId: row.astrologerUserId,
    source: row.source as ClientAstrologerRelationship["source"],
    status: row.status as ClientAstrologerRelationship["status"],
    firstLinkedAt: toIsoString(row.firstLinkedAt),
    lastLinkedAt: toIsoString(row.lastLinkedAt),
    archivedAt: row.archivedAt ? toIsoString(row.archivedAt) : null,
    blockedAt: row.blockedAt ? toIsoString(row.blockedAt) : null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toClientJoinIntent(row: ClientJoinIntentRow): ClientJoinIntent {
  return {
    id: row.id,
    astrologerUserId: row.astrologerUserId,
    tokenHash: row.tokenHash,
    publicHandleSnapshot: row.publicHandleSnapshot,
    status: row.status as ClientJoinIntent["status"],
    expiresAt: toIsoString(row.expiresAt),
    claimedByClientUserId: row.claimedByClientUserId,
    claimedAt: row.claimedAt ? toIsoString(row.claimedAt) : null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
