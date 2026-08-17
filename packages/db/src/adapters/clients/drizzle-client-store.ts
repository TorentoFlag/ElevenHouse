import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL
} from "drizzle-orm";
import {
  ClientAstrologerRelationshipBlockedError,
  ClientAstrologerRelationshipRoleError,
  CLIENT_BIRTH_PROFILE_UPDATED_EVENT,
  CLIENT_RELATED_BIRTH_PROFILE_UPDATED_EVENT,
  ClientProfileProjectionError,
  type AstrologerClientList,
  type AstrologerClientListItem,
  type ClientAstrologerRelationship,
  type ClientBirthData,
  type ClientJoinIntent,
  type ClientRelatedBirthProfile,
  type ClientRelatedBirthProfileStore,
  type ClientStore,
  type ClientStoreCreateJoinIntentInput,
  type ClientStoreEnsureRelationshipInput,
  type ClientStoreUpsertProfileInput
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  clientAstrologerRelationships,
  clientBirthData,
  clientBirthDataHistory,
  clientJoinIntents,
  clientProfiles,
  clientRelatedBirthProfileHistory,
  clientRelatedBirthProfiles,
  outboxEvents,
  userProfiles,
  userRoleAssignments
} from "../../schema";
import { insertReturningOne } from "../../shared";
import { createDrizzleClientLifecycleStore } from "./drizzle-client-lifecycle-store";

type ClientProfileRow = typeof clientProfiles.$inferSelect;
type ClientBirthDataRow = typeof clientBirthData.$inferSelect;
type ClientRelatedBirthProfileRow = typeof clientRelatedBirthProfiles.$inferSelect;
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
      const claimedAt = new Date(now);
      const [row] = await database
        .update(clientJoinIntents)
        .set({
          status: "claimed",
          claimedByClientUserId: clientUserId,
          claimedAt,
          updatedAt: claimedAt
        })
        .where(
          and(
            eq(clientJoinIntents.id, intentId),
            gt(clientJoinIntents.expiresAt, claimedAt),
            or(
              eq(clientJoinIntents.status, "pending"),
              and(
                eq(clientJoinIntents.status, "claimed"),
                eq(clientJoinIntents.claimedByClientUserId, clientUserId)
              )
            )
          )
        )
        .returning();

      return row ? toClientJoinIntent(row) : null;
    },
    ensureRelationship: (input) => ensureRelationship(database, input),
    upsertClientProfile: (input) => upsertClientProfile(database, input),
    writeClientBirthProfile: (input) => writeClientBirthProfile(database, input),
    writeClientRelatedBirthProfile: (input) => writeClientRelatedBirthProfile(database, input),
    listClientRelatedBirthProfiles: (input) => listClientRelatedBirthProfiles(database, input),
    getAstrologerRelatedBirthProfile: (input) => getAstrologerRelatedBirthProfile(database, input),
    listAstrologerClients: (input) => listAstrologerClients(database, input),
    getAstrologerClient: (input) => getAstrologerClient(database, input)
  };
}

async function writeClientBirthProfile(
  database: ClientDrizzleDatabase,
  input: Parameters<ClientStore["writeClientBirthProfile"]>[0]
): Promise<Awaited<ReturnType<ClientStore["writeClientBirthProfile"]>>> {
  return withClientTransaction(database, async (transaction) => {
    if (input.actor.role === "astrologer") {
      if (
        !(await hasLockedActiveRelationship(transaction, input.clientUserId, input.actor.userId))
      ) {
        return { kind: "not_related" };
      }
    }

    const now = new Date(input.now);
    const set = {
      ...input.data,
      lastEditedByUserId: input.actor.userId,
      lastEditedByRole: input.actor.role,
      revision: sql`${clientBirthData.revision} + 1`,
      updatedAt: now
    };
    const [updated] =
      input.expectedRevision === null
        ? []
        : await transaction
            .update(clientBirthData)
            .set(set)
            .where(
              and(
                eq(clientBirthData.clientUserId, input.clientUserId),
                eq(clientBirthData.revision, input.expectedRevision)
              )
            )
            .returning();

    if (updated) {
      const profile = toClientBirthData(updated);
      const historyId = await appendClientBirthDataHistory(transaction, profile);
      await enqueueBirthProfileUpdatedEvent(transaction, profile, historyId);
      return { kind: "written", profile };
    }
    if (input.expectedRevision !== null) {
      return { kind: "conflict" };
    }

    const [created] = await transaction
      .insert(clientBirthData)
      .values({
        clientUserId: input.clientUserId,
        ...input.data,
        revision: 1,
        lastEditedByUserId: input.actor.userId,
        lastEditedByRole: input.actor.role,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoNothing({ target: clientBirthData.clientUserId })
      .returning();
    if (!created) {
      return { kind: "conflict" };
    }

    const profile = toClientBirthData(created);
    const historyId = await appendClientBirthDataHistory(transaction, profile);
    await enqueueBirthProfileUpdatedEvent(transaction, profile, historyId);
    return { kind: "written", profile };
  });
}

async function writeClientRelatedBirthProfile(
  database: ClientDrizzleDatabase,
  input: Parameters<ClientRelatedBirthProfileStore["writeClientRelatedBirthProfile"]>[0]
): Promise<Awaited<ReturnType<ClientRelatedBirthProfileStore["writeClientRelatedBirthProfile"]>>> {
  return withClientTransaction(database, async (transaction) => {
    if (input.actor.role === "astrologer") {
      if (
        !(await hasLockedActiveRelationship(transaction, input.clientUserId, input.actor.userId))
      ) {
        return { kind: "not_related" };
      }
    }

    const now = new Date(input.now);
    const set = {
      displayName: input.data.displayName,
      relationshipLabel: input.data.relationshipLabel,
      birthDate: input.data.birthDate,
      birthTime: input.data.birthTime,
      birthTimePrecision: input.data.birthTimePrecision,
      birthPlaceText: input.data.birthPlaceText,
      birthCountryCode: input.data.birthCountryCode,
      birthCity: input.data.birthCity,
      birthRegion: input.data.birthRegion,
      birthTimezone: input.data.birthTimezone,
      birthTimeDstOccurrence: input.data.birthTimeDstOccurrence,
      birthLatitude: input.data.birthLatitude,
      birthLongitude: input.data.birthLongitude,
      source: input.data.source,
      lastEditedByUserId: input.actor.userId,
      lastEditedByRole: input.actor.role,
      revision: sql`${clientRelatedBirthProfiles.revision} + 1`,
      updatedAt: now
    };

    if (input.relatedProfileId !== null) {
      if (input.expectedRevision === null) {
        return { kind: "conflict" };
      }
      const [updated] = await transaction
        .update(clientRelatedBirthProfiles)
        .set(set)
        .where(
          and(
            eq(clientRelatedBirthProfiles.id, input.relatedProfileId),
            eq(clientRelatedBirthProfiles.clientUserId, input.clientUserId),
            eq(clientRelatedBirthProfiles.revision, input.expectedRevision)
          )
        )
        .returning();
      if (!updated) {
        const exists = await findRelatedBirthProfileRow(
          transaction,
          input.clientUserId,
          input.relatedProfileId
        );
        return exists ? { kind: "conflict" } : { kind: "not_found" };
      }
      const profile = toClientRelatedBirthProfile(updated);
      const historyId = await appendClientRelatedBirthProfileHistory(transaction, profile);
      await enqueueRelatedBirthProfileUpdatedEvent(transaction, profile, historyId);
      return { kind: "written", profile };
    }

    if (input.expectedRevision !== null) {
      return { kind: "conflict" };
    }
    const [created] = await transaction
      .insert(clientRelatedBirthProfiles)
      .values({
        clientUserId: input.clientUserId,
        displayName: input.data.displayName,
        relationshipLabel: input.data.relationshipLabel,
        birthDate: input.data.birthDate,
        birthTime: input.data.birthTime,
        birthTimePrecision: input.data.birthTimePrecision,
        birthPlaceText: input.data.birthPlaceText,
        birthCountryCode: input.data.birthCountryCode,
        birthCity: input.data.birthCity,
        birthRegion: input.data.birthRegion,
        birthTimezone: input.data.birthTimezone,
        birthTimeDstOccurrence: input.data.birthTimeDstOccurrence,
        birthLatitude: input.data.birthLatitude,
        birthLongitude: input.data.birthLongitude,
        source: input.data.source,
        revision: 1,
        lastEditedByUserId: input.actor.userId,
        lastEditedByRole: input.actor.role,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (!created) {
      throw new Error("CLIENT_RELATED_BIRTH_PROFILE_NOT_PERSISTED");
    }

    const profile = toClientRelatedBirthProfile(created);
    const historyId = await appendClientRelatedBirthProfileHistory(transaction, profile);
    await enqueueRelatedBirthProfileUpdatedEvent(transaction, profile, historyId);
    return { kind: "written", profile };
  });
}

async function hasLockedActiveRelationship(
  transaction: ClientDrizzleDatabase,
  clientUserId: string,
  astrologerUserId: string
): Promise<boolean> {
  const [relationship] = await transaction
    .select({ id: clientAstrologerRelationships.id })
    .from(clientAstrologerRelationships)
    .where(
      and(
        eq(clientAstrologerRelationships.clientUserId, clientUserId),
        eq(clientAstrologerRelationships.astrologerUserId, astrologerUserId),
        eq(clientAstrologerRelationships.status, "active")
      )
    )
    .limit(1)
    .for("update");
  return Boolean(relationship);
}

async function appendClientBirthDataHistory(
  database: ClientDrizzleDatabase,
  profile: ClientBirthData
): Promise<string> {
  const [history] = await database
    .insert(clientBirthDataHistory)
    .values({
      birthDataId: profile.id,
      clientUserId: profile.clientUserId,
      revision: profile.revision,
      actorUserId: profile.lastEditedByUserId,
      actorRole: profile.lastEditedByRole,
      source: profile.source,
      snapshot: profile,
      recordedAt: new Date(profile.updatedAt)
    })
    .returning({ id: clientBirthDataHistory.id });
  if (!history) throw new Error("CLIENT_BIRTH_DATA_HISTORY_NOT_PERSISTED");
  return history.id;
}

async function enqueueBirthProfileUpdatedEvent(
  database: ClientDrizzleDatabase,
  profile: ClientBirthData,
  birthDataHistoryId: string
): Promise<void> {
  const occurredAt = new Date(profile.updatedAt);
  await database
    .insert(outboxEvents)
    .values({
      eventType: CLIENT_BIRTH_PROFILE_UPDATED_EVENT,
      aggregateId: birthDataHistoryId,
      payload: {
        schemaVersion: "client-birth-profile-updated.v1",
        birthDataHistoryId,
        birthDataId: profile.id,
        clientUserId: profile.clientUserId,
        revision: profile.revision,
        actorUserId: profile.lastEditedByUserId,
        actorRole: profile.lastEditedByRole,
        occurredAt: profile.updatedAt
      },
      status: "pending",
      attempts: 0,
      availableAt: occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt
    })
    .onConflictDoNothing({ target: [outboxEvents.eventType, outboxEvents.aggregateId] });
}

async function appendClientRelatedBirthProfileHistory(
  database: ClientDrizzleDatabase,
  profile: ClientRelatedBirthProfile
): Promise<string> {
  const [history] = await database
    .insert(clientRelatedBirthProfileHistory)
    .values({
      relatedProfileId: profile.id,
      clientUserId: profile.clientUserId,
      revision: profile.revision,
      actorUserId: profile.lastEditedByUserId,
      actorRole: profile.lastEditedByRole,
      source: profile.source,
      snapshot: profile,
      recordedAt: new Date(profile.updatedAt)
    })
    .returning({ id: clientRelatedBirthProfileHistory.id });
  if (!history) throw new Error("CLIENT_RELATED_BIRTH_PROFILE_HISTORY_NOT_PERSISTED");
  return history.id;
}

async function enqueueRelatedBirthProfileUpdatedEvent(
  database: ClientDrizzleDatabase,
  profile: ClientRelatedBirthProfile,
  relatedProfileHistoryId: string
): Promise<void> {
  const occurredAt = new Date(profile.updatedAt);
  await database
    .insert(outboxEvents)
    .values({
      eventType: CLIENT_RELATED_BIRTH_PROFILE_UPDATED_EVENT,
      aggregateId: relatedProfileHistoryId,
      payload: {
        schemaVersion: "client-related-birth-profile-updated.v1",
        relatedProfileHistoryId,
        relatedProfileId: profile.id,
        clientUserId: profile.clientUserId,
        revision: profile.revision,
        actorUserId: profile.lastEditedByUserId,
        actorRole: profile.lastEditedByRole,
        occurredAt: profile.updatedAt
      },
      status: "pending",
      attempts: 0,
      availableAt: occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt
    })
    .onConflictDoNothing({ target: [outboxEvents.eventType, outboxEvents.aggregateId] });
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

function withClientTransaction<T>(
  database: ClientDrizzleDatabase,
  operation: (transaction: ClientDrizzleDatabase) => Promise<T>
): Promise<T> {
  if ("transaction" in database && typeof database.transaction === "function") {
    return database.transaction((transaction) => operation(transaction));
  }
  return operation(database);
}

async function ensureRelationship(
  database: ClientDrizzleDatabase,
  input: ClientStoreEnsureRelationshipInput
): Promise<ClientAstrologerRelationship> {
  return withClientTransaction(database, async (transaction) => {
    const [existingRelationship] = await transaction
      .select({ status: clientAstrologerRelationships.status })
      .from(clientAstrologerRelationships)
      .where(
        and(
          eq(clientAstrologerRelationships.clientUserId, input.clientUserId),
          eq(clientAstrologerRelationships.astrologerUserId, input.astrologerUserId)
        )
      )
      .limit(1)
      .for("update");
    if (existingRelationship?.status === "blocked") {
      throw new ClientAstrologerRelationshipBlockedError();
    }

    await lockAndValidateRelationshipRoles(transaction, input);

    const [canonicalProfile] = await transaction
      .select({ displayName: userProfiles.displayName })
      .from(userProfiles)
      .where(eq(userProfiles.userId, input.clientUserId))
      .limit(1)
      .for("share");
    if (!canonicalProfile) {
      throw new ClientProfileProjectionError();
    }

    const timestamp = new Date(input.now);
    await transaction
      .insert(clientProfiles)
      .values({
        userId: input.clientUserId,
        displayNameSnapshot: canonicalProfile.displayName,
        preferredLocale: null,
        timezone: null,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .onConflictDoUpdate({
        target: clientProfiles.userId,
        set: {
          displayNameSnapshot: canonicalProfile.displayName,
          updatedAt: timestamp
        },
        setWhere: isNull(clientProfiles.displayNameSnapshot)
      });

    const [row] = await transaction
      .insert(clientAstrologerRelationships)
      .values({
        clientUserId: input.clientUserId,
        astrologerUserId: input.astrologerUserId,
        source: input.source,
        status: "active",
        firstLinkedAt: timestamp,
        lastLinkedAt: timestamp,
        archivedAt: null,
        blockedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .onConflictDoUpdate({
        target: [
          clientAstrologerRelationships.clientUserId,
          clientAstrologerRelationships.astrologerUserId
        ],
        set: {
          status: "active",
          lastLinkedAt: timestamp,
          archivedAt: null,
          blockedAt: null,
          updatedAt: timestamp
        },
        setWhere: ne(clientAstrologerRelationships.status, "blocked")
      })
      .returning();
    if (!row) {
      throw new ClientAstrologerRelationshipBlockedError();
    }

    if (!existingRelationship) {
      await createDrizzleClientLifecycleStore(transaction).applyTransition({
        relationshipId: row.id,
        sourceEventId: `relationship:${row.id}:created`,
        cause: { kind: "relationship_created", occurredAt: input.now },
        actorUserId: null
      });
    }

    return toClientAstrologerRelationship(row);
  });
}

async function lockAndValidateRelationshipRoles(
  database: ClientDrizzleDatabase,
  input: Pick<ClientStoreEnsureRelationshipInput, "clientUserId" | "astrologerUserId">
): Promise<void> {
  const rows = await database
    .select({ userId: userRoleAssignments.userId, role: userRoleAssignments.role })
    .from(userRoleAssignments)
    .where(
      or(
        and(
          eq(userRoleAssignments.userId, input.clientUserId),
          eq(userRoleAssignments.role, "client")
        ),
        and(
          eq(userRoleAssignments.userId, input.astrologerUserId),
          eq(userRoleAssignments.role, "astrologer")
        )
      )
    )
    .orderBy(asc(userRoleAssignments.userId), asc(userRoleAssignments.role))
    .for("key share");
  const lockedRoles = new Set(rows.map(({ userId, role }) => `${userId}:${role}`));
  if (!lockedRoles.has(`${input.clientUserId}:client`)) {
    throw new ClientAstrologerRelationshipRoleError("Client account role is required");
  }
  if (!lockedRoles.has(`${input.astrologerUserId}:astrologer`)) {
    throw new ClientAstrologerRelationshipRoleError("Astrologer account role is required");
  }
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
    .leftJoin(
      clientBirthData,
      eq(clientBirthData.clientUserId, clientAstrologerRelationships.clientUserId)
    )
    .where(where)
    .orderBy(
      desc(clientAstrologerRelationships.lastLinkedAt),
      desc(clientAstrologerRelationships.id)
    )
    .limit(input.limit)
    .offset(input.offset);
  const relatedProfilesByClient = await loadRelatedBirthProfilesByClient(
    database,
    rows.map((row) => row.relationship.clientUserId)
  );

  return {
    clients: rows.map((row) =>
      toAstrologerClientListItem(
        row.relationship,
        row.profile,
        row.birthData,
        relatedProfilesByClient.get(row.relationship.clientUserId) ?? []
      )
    ),
    total: Number(totalRow?.value ?? 0)
  };
}

async function getAstrologerClient(
  database: ClientDrizzleDatabase,
  input: {
    readonly astrologerUserId: string;
    readonly clientUserId: string;
  }
): Promise<AstrologerClientListItem | null> {
  const [row] = await database
    .select({
      relationship: clientAstrologerRelationships,
      profile: clientProfiles,
      birthData: clientBirthData
    })
    .from(clientAstrologerRelationships)
    .leftJoin(clientProfiles, eq(clientProfiles.userId, clientAstrologerRelationships.clientUserId))
    .leftJoin(
      clientBirthData,
      eq(clientBirthData.clientUserId, clientAstrologerRelationships.clientUserId)
    )
    .where(
      and(
        eq(clientAstrologerRelationships.astrologerUserId, input.astrologerUserId),
        eq(clientAstrologerRelationships.clientUserId, input.clientUserId),
        eq(clientAstrologerRelationships.status, "active")
      )
    )
    .limit(1);

  if (!row) return null;
  const relatedProfiles = await listClientRelatedBirthProfiles(database, {
    clientUserId: row.relationship.clientUserId
  });
  return toAstrologerClientListItem(row.relationship, row.profile, row.birthData, relatedProfiles);
}

async function loadRelatedBirthProfilesByClient(
  database: ClientDrizzleDatabase,
  clientUserIds: readonly string[]
): Promise<Map<string, ClientRelatedBirthProfile[]>> {
  if (clientUserIds.length === 0) return new Map();
  const rows = await database
    .select()
    .from(clientRelatedBirthProfiles)
    .where(inArray(clientRelatedBirthProfiles.clientUserId, clientUserIds))
    .orderBy(
      asc(clientRelatedBirthProfiles.clientUserId),
      asc(clientRelatedBirthProfiles.createdAt),
      asc(clientRelatedBirthProfiles.id)
    );
  const grouped = new Map<string, ClientRelatedBirthProfile[]>();
  for (const row of rows) {
    const values = grouped.get(row.clientUserId) ?? [];
    values.push(toClientRelatedBirthProfile(row));
    grouped.set(row.clientUserId, values);
  }
  return grouped;
}

async function listClientRelatedBirthProfiles(
  database: ClientDrizzleDatabase,
  input: Parameters<ClientRelatedBirthProfileStore["listClientRelatedBirthProfiles"]>[0]
): Promise<readonly ClientRelatedBirthProfile[]> {
  const rows = await database
    .select()
    .from(clientRelatedBirthProfiles)
    .where(eq(clientRelatedBirthProfiles.clientUserId, input.clientUserId))
    .orderBy(asc(clientRelatedBirthProfiles.createdAt), asc(clientRelatedBirthProfiles.id));
  return rows.map(toClientRelatedBirthProfile);
}

async function getAstrologerRelatedBirthProfile(
  database: ClientDrizzleDatabase,
  input: Parameters<ClientRelatedBirthProfileStore["getAstrologerRelatedBirthProfile"]>[0]
): Promise<ClientRelatedBirthProfile | null> {
  const [row] = await database
    .select({ relatedProfile: clientRelatedBirthProfiles })
    .from(clientAstrologerRelationships)
    .innerJoin(
      clientRelatedBirthProfiles,
      and(
        eq(clientRelatedBirthProfiles.clientUserId, clientAstrologerRelationships.clientUserId),
        eq(clientRelatedBirthProfiles.id, input.relatedProfileId)
      )
    )
    .where(
      and(
        eq(clientAstrologerRelationships.astrologerUserId, input.astrologerUserId),
        eq(clientAstrologerRelationships.clientUserId, input.clientUserId),
        eq(clientAstrologerRelationships.status, "active")
      )
    )
    .limit(1);
  return row ? toClientRelatedBirthProfile(row.relatedProfile) : null;
}

async function findRelatedBirthProfileRow(
  database: ClientDrizzleDatabase,
  clientUserId: string,
  relatedProfileId: string
): Promise<ClientRelatedBirthProfileRow | null> {
  const [row] = await database
    .select()
    .from(clientRelatedBirthProfiles)
    .where(
      and(
        eq(clientRelatedBirthProfiles.id, relatedProfileId),
        eq(clientRelatedBirthProfiles.clientUserId, clientUserId)
      )
    )
    .limit(1);
  return row ?? null;
}

function toAstrologerClientListItem(
  relationship: ClientRelationshipRow,
  profile: ClientProfileRow | null,
  birthData: ClientBirthDataRow | null,
  relatedBirthProfiles: readonly ClientRelatedBirthProfile[] = []
): AstrologerClientListItem {
  return {
    clientUserId: relationship.clientUserId,
    displayName: profile?.displayNameSnapshot ?? null,
    relationshipStatus: relationship.status as AstrologerClientListItem["relationshipStatus"],
    firstLinkedAt: toIsoString(relationship.firstLinkedAt),
    lastLinkedAt: toIsoString(relationship.lastLinkedAt),
    birthData: birthData ? toClientBirthData(birthData) : null,
    relatedBirthProfiles
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
    birthTimeDstOccurrence: row.birthTimeDstOccurrence as ClientBirthData["birthTimeDstOccurrence"],
    birthLatitude: row.birthLatitude === null ? null : Number(row.birthLatitude),
    birthLongitude: row.birthLongitude === null ? null : Number(row.birthLongitude),
    source: row.source as ClientBirthData["source"],
    revision: row.revision,
    lastEditedByUserId: row.lastEditedByUserId,
    lastEditedByRole: row.lastEditedByRole as ClientBirthData["lastEditedByRole"],
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toClientRelatedBirthProfile(row: ClientRelatedBirthProfileRow): ClientRelatedBirthProfile {
  return {
    id: row.id,
    clientUserId: row.clientUserId,
    displayName: row.displayName,
    relationshipLabel: row.relationshipLabel,
    birthDate: row.birthDate,
    birthTime: row.birthTime,
    birthTimePrecision: row.birthTimePrecision as ClientRelatedBirthProfile["birthTimePrecision"],
    birthPlaceText: row.birthPlaceText,
    birthCountryCode: row.birthCountryCode,
    birthCity: row.birthCity,
    birthRegion: row.birthRegion,
    birthTimezone: row.birthTimezone,
    birthTimeDstOccurrence:
      row.birthTimeDstOccurrence as ClientRelatedBirthProfile["birthTimeDstOccurrence"],
    birthLatitude: row.birthLatitude === null ? null : Number(row.birthLatitude),
    birthLongitude: row.birthLongitude === null ? null : Number(row.birthLongitude),
    source: row.source as ClientRelatedBirthProfile["source"],
    revision: row.revision,
    lastEditedByUserId: row.lastEditedByUserId,
    lastEditedByRole: row.lastEditedByRole as ClientRelatedBirthProfile["lastEditedByRole"],
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
