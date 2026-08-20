import { createHmac, timingSafeEqual } from "node:crypto";

import { and, desc, eq, ilike, inArray, isNull, lt, or, type SQL } from "drizzle-orm";
import {
  createClientCrmActivityItem,
  type ClientBirthData,
  type ClientCrmActivityItem,
  type ClientCrmDetail,
  type ClientCrmListItem,
  type ClientCrmListQuery,
  type ClientCrmPrivateProfileStore,
  type ClientCrmReadStore,
  type ClientLifecycleMode,
  type ClientLifecycleStatus,
  type ClientRelationshipSource,
  type ClientRelatedBirthProfile
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  clientAstrologerRelationships,
  clientBirthData,
  clientBirthDataHistory,
  clientCrmPrivateProfiles,
  clientCrmPrivateTags,
  clientLifecycleHistory,
  clientLifecycleStates,
  clientProfiles,
  clientRelatedBirthProfileHistory,
  clientRelatedBirthProfiles
} from "../../schema";

type ClientCrmDatabase = ElevenHouseDatabase;
type ClientCrmRow = {
  readonly relationship: typeof clientAstrologerRelationships.$inferSelect;
  readonly profile: typeof clientProfiles.$inferSelect | null;
  readonly lifecycle: typeof clientLifecycleStates.$inferSelect | null;
  readonly birthData: typeof clientBirthData.$inferSelect | null;
};

type ClientCrmPrivateProfileRows = ReadonlyMap<
  string,
  {
    readonly profile: typeof clientCrmPrivateProfiles.$inferSelect | null;
    readonly tags: readonly string[];
  }
>;

type ClientCrmCursor = {
  readonly astrologerUserId: string;
  readonly lastLinkedAt: string;
  readonly relationshipId: string;
  readonly query: string;
  readonly lifecycle: string | null;
  readonly source: string | null;
  readonly sort: "last_linked_at_desc";
};

const activityPageLimit = 50;
const cursorTokenVersion = "crm1";

type ClientCrmReadStoreOptions = {
  readonly cursorSecret: string;
};

export function createDrizzleClientCrmReadStore(
  database: ClientCrmDatabase,
  options: ClientCrmReadStoreOptions
): ClientCrmReadStore & ClientCrmPrivateProfileStore {
  assertCursorSecret(options.cursorSecret);
  return {
    listAstrologerClientCrmPage: (input) =>
      listAstrologerClientCrmPage(database, options.cursorSecret, input),
    getAstrologerClientCrmDetail: (input) => getAstrologerClientCrmDetail(database, input),
    updateAstrologerClientCrmPrivateProfile: (input) =>
      updateAstrologerClientCrmPrivateProfile(database, input)
  };
}

async function listAstrologerClientCrmPage(
  database: ClientCrmDatabase,
  cursorSecret: string,
  input: Parameters<ClientCrmReadStore["listAstrologerClientCrmPage"]>[0]
): Promise<Awaited<ReturnType<ClientCrmReadStore["listAstrologerClientCrmPage"]>>> {
  const cursor =
    input.query.cursor === null ? null : parseCursor(input.query.cursor, cursorSecret, input);
  if (input.query.cursor !== null && cursor === null) return { kind: "invalid_command" };

  const relationshipConditions: SQL[] = [
    eq(clientAstrologerRelationships.astrologerUserId, input.astrologerUserId),
    eq(clientAstrologerRelationships.status, "active")
  ];
  if (input.query.query !== "") {
    relationshipConditions.push(
      ilike(clientProfiles.displayNameSnapshot, `%${input.query.query}%`)
    );
  }
  if (input.query.source !== undefined) {
    relationshipConditions.push(eq(clientAstrologerRelationships.source, input.query.source));
  }
  if (cursor) {
    const keysetCondition = or(
      lt(clientAstrologerRelationships.lastLinkedAt, new Date(cursor.lastLinkedAt)),
      and(
        eq(clientAstrologerRelationships.lastLinkedAt, new Date(cursor.lastLinkedAt)),
        lt(clientAstrologerRelationships.id, cursor.relationshipId)
      )
    );
    if (!keysetCondition) return { kind: "invalid_command" };
    relationshipConditions.push(keysetCondition);
  }

  if (await hasMissingLifecycleState(database, relationshipConditions)) return { kind: "conflict" };

  const conditions = [...relationshipConditions];
  if (input.query.lifecycle !== undefined) {
    conditions.push(eq(clientLifecycleStates.status, input.query.lifecycle));
  }

  const rows = await database
    .select({
      relationship: clientAstrologerRelationships,
      profile: clientProfiles,
      lifecycle: clientLifecycleStates,
      birthData: clientBirthData
    })
    .from(clientAstrologerRelationships)
    .leftJoin(clientProfiles, eq(clientProfiles.userId, clientAstrologerRelationships.clientUserId))
    .leftJoin(
      clientLifecycleStates,
      eq(clientLifecycleStates.relationshipId, clientAstrologerRelationships.id)
    )
    .leftJoin(
      clientBirthData,
      eq(clientBirthData.clientUserId, clientAstrologerRelationships.clientUserId)
    )
    .where(and(...conditions))
    .orderBy(
      desc(clientAstrologerRelationships.lastLinkedAt),
      desc(clientAstrologerRelationships.id)
    )
    .limit(input.query.limit + 1);

  if (rows.some(({ lifecycle }) => lifecycle === null)) return { kind: "conflict" };

  const pageRows = rows.slice(0, input.query.limit) as readonly ClientCrmRow[];
  const privateProfiles = await listClientCrmPrivateProfiles(
    database,
    pageRows.map((row) => row.relationship.id)
  );
  const items = pageRows.map((row) => toClientCrmListItem(row, privateProfiles));
  const last = pageRows.at(-1);
  return {
    kind: "found",
    page: {
      items,
      nextCursor:
        rows.length > input.query.limit && last
          ? encodeCursor(last.relationship, input.astrologerUserId, input.query, cursorSecret)
          : null
    }
  };
}

async function hasMissingLifecycleState(
  database: ClientCrmDatabase,
  relationshipConditions: readonly SQL[]
): Promise<boolean> {
  const [row] = await database
    .select({ id: clientAstrologerRelationships.id })
    .from(clientAstrologerRelationships)
    .leftJoin(clientProfiles, eq(clientProfiles.userId, clientAstrologerRelationships.clientUserId))
    .leftJoin(
      clientLifecycleStates,
      eq(clientLifecycleStates.relationshipId, clientAstrologerRelationships.id)
    )
    .where(and(...relationshipConditions, isNull(clientLifecycleStates.relationshipId)))
    .limit(1);

  return row !== undefined;
}

async function getAstrologerClientCrmDetail(
  database: ClientCrmDatabase,
  input: Parameters<ClientCrmReadStore["getAstrologerClientCrmDetail"]>[0]
): Promise<Awaited<ReturnType<ClientCrmReadStore["getAstrologerClientCrmDetail"]>>> {
  const [relationship] = await database
    .select()
    .from(clientAstrologerRelationships)
    .where(
      and(
        eq(clientAstrologerRelationships.astrologerUserId, input.astrologerUserId),
        eq(clientAstrologerRelationships.clientUserId, input.clientUserId)
      )
    )
    .limit(1);
  if (!relationship) return { kind: "not_related" };
  if (relationship.status !== "active") return { kind: "blocked_or_archived" };

  const [row] = await database
    .select({
      relationship: clientAstrologerRelationships,
      profile: clientProfiles,
      lifecycle: clientLifecycleStates,
      birthData: clientBirthData
    })
    .from(clientAstrologerRelationships)
    .leftJoin(clientProfiles, eq(clientProfiles.userId, clientAstrologerRelationships.clientUserId))
    .leftJoin(
      clientLifecycleStates,
      eq(clientLifecycleStates.relationshipId, clientAstrologerRelationships.id)
    )
    .leftJoin(
      clientBirthData,
      eq(clientBirthData.clientUserId, clientAstrologerRelationships.clientUserId)
    )
    .where(eq(clientAstrologerRelationships.id, relationship.id))
    .limit(1);
  if (!row || row.lifecycle === null) return { kind: "conflict" };

  const [relatedBirthProfiles, activity, privateProfiles] = await Promise.all([
    database
      .select()
      .from(clientRelatedBirthProfiles)
      .where(eq(clientRelatedBirthProfiles.clientUserId, input.clientUserId))
      .orderBy(desc(clientRelatedBirthProfiles.updatedAt), desc(clientRelatedBirthProfiles.id))
      .limit(activityPageLimit),
    listClientCrmActivity(database, row.relationship, row.lifecycle.mode as ClientLifecycleMode),
    listClientCrmPrivateProfiles(database, [row.relationship.id])
  ]);

  const detail: ClientCrmDetail = {
    ...toClientCrmListItem(row, privateProfiles),
    birthData: row.birthData ? toClientBirthData(row.birthData) : null,
    relatedBirthProfiles: relatedBirthProfiles.map(toClientRelatedBirthProfile),
    activity
  };
  return { kind: "found", detail };
}

async function updateAstrologerClientCrmPrivateProfile(
  database: ClientCrmDatabase,
  input: Parameters<ClientCrmPrivateProfileStore["updateAstrologerClientCrmPrivateProfile"]>[0]
): Promise<
  Awaited<ReturnType<ClientCrmPrivateProfileStore["updateAstrologerClientCrmPrivateProfile"]>>
> {
  return database.transaction(async (transaction) => {
    const [relationship] = await transaction
      .select()
      .from(clientAstrologerRelationships)
      .where(
        and(
          eq(clientAstrologerRelationships.astrologerUserId, input.astrologerUserId),
          eq(clientAstrologerRelationships.clientUserId, input.clientUserId)
        )
      )
      .limit(1)
      .for("update");
    if (!relationship) return { kind: "not_related" };
    if (relationship.status !== "active") return { kind: "blocked_or_archived" };

    const now = new Date(input.now);
    await transaction
      .insert(clientCrmPrivateProfiles)
      .values({
        relationshipId: relationship.id,
        astrologerUserId: relationship.astrologerUserId,
        clientUserId: relationship.clientUserId,
        note: input.profile.note,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: clientCrmPrivateProfiles.relationshipId,
        set: {
          note: input.profile.note,
          updatedAt: now
        }
      });

    await transaction
      .delete(clientCrmPrivateTags)
      .where(eq(clientCrmPrivateTags.relationshipId, relationship.id));
    if (input.profile.tags.length > 0) {
      await transaction.insert(clientCrmPrivateTags).values(
        input.profile.tags.map((tag) => ({
          relationshipId: relationship.id,
          tag,
          createdAt: now,
          updatedAt: now
        }))
      );
    }

    return {
      kind: "updated",
      profile: {
        note: input.profile.note,
        tags: input.profile.tags,
        updatedAt: toIsoString(now)
      }
    };
  });
}

async function listClientCrmPrivateProfiles(
  database: ClientCrmDatabase,
  relationshipIds: readonly string[]
): Promise<ClientCrmPrivateProfileRows> {
  if (relationshipIds.length === 0) return new Map();
  const [profiles, tags] = await Promise.all([
    database
      .select()
      .from(clientCrmPrivateProfiles)
      .where(inArray(clientCrmPrivateProfiles.relationshipId, [...relationshipIds])),
    database
      .select()
      .from(clientCrmPrivateTags)
      .where(inArray(clientCrmPrivateTags.relationshipId, [...relationshipIds]))
      .orderBy(
        clientCrmPrivateTags.relationshipId,
        clientCrmPrivateTags.createdAt,
        clientCrmPrivateTags.tag
      )
  ]);
  const profileByRelationshipId = new Map(
    profiles.map((profile) => [profile.relationshipId, profile])
  );
  const tagsByRelationshipId = new Map<string, string[]>();
  for (const tag of tags) {
    const existing = tagsByRelationshipId.get(tag.relationshipId) ?? [];
    existing.push(tag.tag);
    tagsByRelationshipId.set(tag.relationshipId, existing);
  }
  return new Map(
    relationshipIds.map((relationshipId) => [
      relationshipId,
      {
        profile: profileByRelationshipId.get(relationshipId) ?? null,
        tags: tagsByRelationshipId.get(relationshipId) ?? []
      }
    ])
  );
}

async function listClientCrmActivity(
  database: ClientCrmDatabase,
  relationship: typeof clientAstrologerRelationships.$inferSelect,
  lifecycleMode: ClientLifecycleMode
) {
  const [lifecycleHistory, birthDataHistory, relatedBirthProfileHistory] = await Promise.all([
    database
      .select()
      .from(clientLifecycleHistory)
      .where(eq(clientLifecycleHistory.relationshipId, relationship.id)),
    database
      .select()
      .from(clientBirthDataHistory)
      .where(eq(clientBirthDataHistory.clientUserId, relationship.clientUserId)),
    database
      .select()
      .from(clientRelatedBirthProfileHistory)
      .where(eq(clientRelatedBirthProfileHistory.clientUserId, relationship.clientUserId))
  ]);

  const items: ClientCrmActivityItem[] = [
    createClientCrmActivityItem({
      id: `clients:relationship:${relationship.id}`,
      kind: "relationship_created",
      occurredAt: toIsoString(relationship.firstLinkedAt),
      source: {
        module: "clients",
        source: relationship.source as ClientRelationshipSource
      }
    }),
    ...lifecycleHistory.map((history) =>
      createClientCrmActivityItem({
        id: `clients:lifecycle:${history.id}`,
        kind: "lifecycle_changed",
        occurredAt: toIsoString(history.occurredAt),
        source: {
          module: "clients",
          previousStatus: history.beforeStatus as ClientLifecycleStatus | null,
          status: history.afterStatus as ClientLifecycleStatus,
          mode: lifecycleMode
        }
      })
    ),
    ...birthDataHistory.map((history) =>
      createClientCrmActivityItem({
        id: `clients:birth-data:${history.id}`,
        kind: "birth_data_updated",
        occurredAt: toIsoString(history.recordedAt),
        source: { module: "clients", revision: history.revision }
      })
    ),
    ...relatedBirthProfileHistory.map((history) =>
      createClientCrmActivityItem({
        id: `clients:related-birth-profile:${history.id}`,
        kind: "related_birth_profile_updated",
        occurredAt: toIsoString(history.recordedAt),
        source: {
          module: "clients",
          relatedProfileId: history.relatedProfileId,
          revision: history.revision
        }
      })
    )
  ];
  items.sort(compareActivityItems);
  return { items: items.slice(0, activityPageLimit), nextCursor: null };
}

function toClientCrmListItem(
  row: ClientCrmRow,
  privateProfiles: ClientCrmPrivateProfileRows
): ClientCrmListItem {
  if (!row.lifecycle) throw new Error("CLIENT_CRM_LIFECYCLE_STATE_MISSING");
  const privateProfile = privateProfiles.get(row.relationship.id);
  return {
    clientUserId: row.relationship.clientUserId,
    displayName: row.profile?.displayNameSnapshot ?? null,
    relationship: {
      id: row.relationship.id,
      status: row.relationship.status as ClientCrmListItem["relationship"]["status"],
      source: row.relationship.source as ClientCrmListItem["relationship"]["source"],
      firstLinkedAt: toIsoString(row.relationship.firstLinkedAt),
      lastLinkedAt: toIsoString(row.relationship.lastLinkedAt)
    },
    lifecycle: {
      status: row.lifecycle.status as ClientCrmListItem["lifecycle"]["status"],
      mode: row.lifecycle.mode as ClientCrmListItem["lifecycle"]["mode"],
      revision: row.lifecycle.revision,
      lastActivityAt: toIsoString(row.lifecycle.lastActivityAt)
    },
    privateCrm: {
      note: privateProfile?.profile?.note ?? null,
      tags: privateProfile?.tags ?? [],
      updatedAt: toIsoString(privateProfile?.profile?.updatedAt ?? row.relationship.updatedAt)
    },
    readiness: {
      birthData: row.birthData ? "ready" : "missing",
      relatedProfiles: "ready"
    }
  };
}

function toClientBirthData(row: typeof clientBirthData.$inferSelect): ClientBirthData {
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
    birthLatitude: row.birthLatitude,
    birthLongitude: row.birthLongitude,
    source: row.source as ClientBirthData["source"],
    revision: row.revision,
    lastEditedByUserId: row.lastEditedByUserId,
    lastEditedByRole: row.lastEditedByRole as ClientBirthData["lastEditedByRole"],
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toClientRelatedBirthProfile(
  row: typeof clientRelatedBirthProfiles.$inferSelect
): ClientRelatedBirthProfile {
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
    birthLatitude: row.birthLatitude,
    birthLongitude: row.birthLongitude,
    source: row.source as ClientRelatedBirthProfile["source"],
    revision: row.revision,
    lastEditedByUserId: row.lastEditedByUserId,
    lastEditedByRole: row.lastEditedByRole as ClientRelatedBirthProfile["lastEditedByRole"],
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function compareActivityItems(left: ClientCrmActivityItem, right: ClientCrmActivityItem): number {
  const leftTime = Date.parse(left.occurredAt);
  const rightTime = Date.parse(right.occurredAt);
  if (leftTime !== rightTime) return leftTime < rightTime ? 1 : -1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

function encodeCursor(
  relationship: typeof clientAstrologerRelationships.$inferSelect,
  astrologerUserId: string,
  query: ClientCrmListQuery,
  cursorSecret: string
): string {
  const cursor: ClientCrmCursor = {
    astrologerUserId,
    lastLinkedAt: toIsoString(relationship.lastLinkedAt),
    relationshipId: relationship.id,
    query: query.query,
    lifecycle: query.lifecycle ?? null,
    source: query.source ?? null,
    sort: query.sort
  };
  const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url");
  return `${cursorTokenVersion}.${payload}.${signCursorPayload(payload, cursorSecret)}`;
}

function parseCursor(
  value: string,
  cursorSecret: string,
  input: Parameters<ClientCrmReadStore["listAstrologerClientCrmPage"]>[0]
): ClientCrmCursor | null {
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return null;
    const [version, payload, signature] = parts;
    if (version !== cursorTokenVersion || !payload || !signature) return null;
    if (!isCursorSignatureValid(payload, signature, cursorSecret)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (!isClientCrmCursor(parsed)) return null;
    if (
      parsed.astrologerUserId !== input.astrologerUserId ||
      parsed.query !== input.query.query ||
      parsed.lifecycle !== (input.query.lifecycle ?? null) ||
      parsed.source !== (input.query.source ?? null) ||
      parsed.sort !== input.query.sort
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function assertCursorSecret(value: string): void {
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("CLIENT_CRM_CURSOR_SECRET_TOO_SHORT");
  }
}

function signCursorPayload(payload: string, cursorSecret: string): string {
  return createHmac("sha256", cursorSecret).update(payload).digest("base64url");
}

function isCursorSignatureValid(payload: string, signature: string, cursorSecret: string): boolean {
  const expected = Buffer.from(signCursorPayload(payload, cursorSecret), "base64url");
  const received = Buffer.from(signature, "base64url");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function isClientCrmCursor(value: unknown): value is ClientCrmCursor {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const cursor = value as Record<string, unknown>;
  const expectedKeys = [
    "astrologerUserId",
    "lastLinkedAt",
    "relationshipId",
    "query",
    "lifecycle",
    "source",
    "sort"
  ];
  if (
    Object.keys(cursor).length !== expectedKeys.length ||
    !expectedKeys.every((key) => Object.hasOwn(cursor, key))
  ) {
    return false;
  }
  return (
    typeof cursor.astrologerUserId === "string" &&
    isUuid(cursor.astrologerUserId) &&
    typeof cursor.lastLinkedAt === "string" &&
    Number.isFinite(Date.parse(cursor.lastLinkedAt)) &&
    typeof cursor.relationshipId === "string" &&
    isUuid(cursor.relationshipId) &&
    typeof cursor.query === "string" &&
    (cursor.lifecycle === null || typeof cursor.lifecycle === "string") &&
    (cursor.source === null || typeof cursor.source === "string") &&
    cursor.sort === "last_linked_at_desc"
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
