import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresRuntime } from "../../runtime";
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
  clientRelatedBirthProfiles,
  userProfiles,
  userRoleAssignments,
  users
} from "../../schema";
import {
  createClientSubscriptionIntegrationDatabase,
  type ClientSubscriptionIntegrationDatabase
} from "../client-subscriptions/client-subscription-integration-fixture";
import { createDrizzleClientCrmReadStore } from "./drizzle-client-crm-read-store";

const cursorSecret = "client-crm-integration-cursor-secret";

describe.sequential("Drizzle client CRM read store", () => {
  let integration: ClientSubscriptionIntegrationDatabase;
  let runtime: PostgresRuntime;

  beforeAll(async () => {
    integration = await createClientSubscriptionIntegrationDatabase();
    runtime = integration.runtime;
  }, 60_000);

  afterAll(async () => {
    await integration?.close();
  }, 30_000);

  it("reads only active relationships and orders Clients-owned activity", async () => {
    const fixture = await seedCrmFixture(runtime);
    const store = createDrizzleClientCrmReadStore(runtime.database, { cursorSecret });

    const detail = await store.getAstrologerClientCrmDetail({
      astrologerUserId: fixture.astrologerUserId,
      clientUserId: fixture.clientUserId
    });
    expect(detail).toMatchObject({
      kind: "found",
      detail: {
        clientUserId: fixture.clientUserId,
        relationship: { id: fixture.relationshipId, status: "active" },
        lifecycle: { status: "in_service", mode: "automatic", revision: 2 },
        privateCrm: {
          note: "Prepare compatibility follow-up",
          tags: ["Natal", "VIP"]
        },
        readiness: { birthData: "ready", relatedProfiles: "ready" },
        relatedBirthProfiles: [{ id: fixture.relatedBirthProfileId }],
        activity: {
          items: [
            { id: `clients:related-birth-profile:${fixture.relatedBirthProfileHistoryId}` },
            { id: `clients:lifecycle:${fixture.lifecycleHistoryId}` },
            { id: `clients:birth-data:${fixture.birthDataHistoryId}` },
            { id: `clients:relationship:${fixture.relationshipId}` }
          ]
        }
      }
    });
    if (detail.kind !== "found") throw new Error("Expected CRM detail");
    expect(JSON.stringify(detail.detail.activity.items)).not.toMatch(
      /messageBody|provider|snapshot|birthDate|birthTime/i
    );

    await expect(
      store.getAstrologerClientCrmDetail({
        astrologerUserId: fixture.astrologerUserId,
        clientUserId: fixture.newestClientUserId
      })
    ).resolves.toMatchObject({
      kind: "found",
      detail: {
        birthData: null,
        relatedBirthProfiles: [],
        readiness: { birthData: "missing", relatedProfiles: "ready" }
      }
    });

    await expect(
      store.getAstrologerClientCrmDetail({
        astrologerUserId: fixture.unrelatedAstrologerUserId,
        clientUserId: fixture.clientUserId
      })
    ).resolves.toEqual({ kind: "not_related" });

    await expect(
      store.getAstrologerClientCrmDetail({
        astrologerUserId: fixture.astrologerUserId,
        clientUserId: fixture.archivedClientUserId
      })
    ).resolves.toEqual({ kind: "blocked_or_archived" });

    await expect(
      store.getAstrologerClientCrmDetail({
        astrologerUserId: fixture.astrologerUserId,
        clientUserId: fixture.blockedClientUserId
      })
    ).resolves.toEqual({ kind: "blocked_or_archived" });
  });

  it("traverses active CRM relationships by last-linked keyset cursor", async () => {
    const fixture = await seedCrmFixture(runtime);
    const store = createDrizzleClientCrmReadStore(runtime.database, { cursorSecret });

    const full = await store.listAstrologerClientCrmPage({
      astrologerUserId: fixture.astrologerUserId,
      query: emptyQuery({ limit: 20 })
    });
    if (full.kind !== "found") throw new Error("Expected CRM list page");
    expect(full.page.items.map((item) => item.relationship.id)).not.toEqual(
      expect.arrayContaining([fixture.archivedRelationshipId, fixture.blockedRelationshipId])
    );
    expect(
      full.page.items.find((item) => item.relationship.id === fixture.relationshipId)
    ).toMatchObject({
      privateCrm: { tags: ["Natal", "VIP"] }
    });

    const first = await store.listAstrologerClientCrmPage({
      astrologerUserId: fixture.astrologerUserId,
      query: emptyQuery({ limit: 1 })
    });
    expect(first).toMatchObject({
      kind: "found",
      page: { items: [{ relationship: { id: fixture.newestRelationshipId } }] }
    });
    if (first.kind !== "found") throw new Error("Expected CRM list page");
    expect(first.page.nextCursor).toEqual(expect.any(String));
    if (first.page.nextCursor === null) throw new Error("Expected CRM next cursor");

    await expect(
      store.listAstrologerClientCrmPage({
        astrologerUserId: fixture.astrologerUserId,
        query: emptyQuery({ cursor: "not-a-valid-cursor-token" })
      })
    ).resolves.toEqual({ kind: "invalid_command" });

    await expect(
      store.listAstrologerClientCrmPage({
        astrologerUserId: fixture.astrologerUserId,
        query: emptyQuery({ cursor: tamperCursorPosition(first.page.nextCursor), limit: 1 })
      })
    ).resolves.toEqual({ kind: "invalid_command" });

    await expect(
      store.listAstrologerClientCrmPage({
        astrologerUserId: fixture.astrologerUserId,
        query: emptyQuery({ cursor: first.page.nextCursor, query: "CRM" })
      })
    ).resolves.toEqual({ kind: "invalid_command" });

    const second = await store.listAstrologerClientCrmPage({
      astrologerUserId: fixture.astrologerUserId,
      query: emptyQuery({ limit: 1, cursor: first.page.nextCursor })
    });
    expect(second).toMatchObject({
      kind: "found",
      page: { items: [{ relationship: { id: fixture.sameTimestampRelationshipId } }] }
    });
    if (second.kind !== "found") throw new Error("Expected CRM list page");
    expect(second.page.nextCursor).toEqual(expect.any(String));

    const third = await store.listAstrologerClientCrmPage({
      astrologerUserId: fixture.astrologerUserId,
      query: emptyQuery({ limit: 1, cursor: second.page.nextCursor })
    });
    expect(third).toMatchObject({
      kind: "found",
      page: { items: [{ relationship: { id: fixture.relationshipId } }], nextCursor: null }
    });
  });

  it("fails closed when lifecycle state is missing under a lifecycle filter", async () => {
    const fixture = await seedMissingLifecycleFixture(runtime);
    const store = createDrizzleClientCrmReadStore(runtime.database, { cursorSecret });

    await expect(
      store.listAstrologerClientCrmPage({
        astrologerUserId: fixture.astrologerUserId,
        query: emptyQuery({ lifecycle: "new" })
      })
    ).resolves.toEqual({ kind: "conflict" });
  });

  it("updates astrologer-private CRM profile only through an active owner relationship", async () => {
    const fixture = await seedCrmFixture(runtime);
    const store = createDrizzleClientCrmReadStore(runtime.database, { cursorSecret });

    await expect(
      store.updateAstrologerClientCrmPrivateProfile({
        astrologerUserId: fixture.astrologerUserId,
        clientUserId: fixture.clientUserId,
        profile: {
          note: "Needs birth time confirmation",
          tags: ["Follow-up", "Natal"]
        },
        now: "2026-08-20T13:00:00.000Z"
      })
    ).resolves.toEqual({
      kind: "updated",
      profile: {
        note: "Needs birth time confirmation",
        tags: ["Follow-up", "Natal"],
        updatedAt: "2026-08-20T13:00:00.000Z"
      }
    });

    await expect(
      store.updateAstrologerClientCrmPrivateProfile({
        astrologerUserId: fixture.unrelatedAstrologerUserId,
        clientUserId: fixture.clientUserId,
        profile: { note: null, tags: [] },
        now: "2026-08-20T13:00:00.000Z"
      })
    ).resolves.toEqual({ kind: "not_related" });

    await expect(
      store.updateAstrologerClientCrmPrivateProfile({
        astrologerUserId: fixture.astrologerUserId,
        clientUserId: fixture.archivedClientUserId,
        profile: { note: null, tags: [] },
        now: "2026-08-20T13:00:00.000Z"
      })
    ).resolves.toEqual({ kind: "blocked_or_archived" });
  });

  it("creates a manual CRM client with account, relationship and lifecycle projection", async () => {
    const fixture = await seedCrmFixture(runtime);
    const store = createDrizzleClientCrmReadStore(runtime.database, { cursorSecret });

    const result = await store.createManualClientCrmClient({
      astrologerUserId: fixture.astrologerUserId,
      client: {
        displayName: "Мария Орлова",
        preferredLocale: "ru",
        timezone: "Europe/Moscow"
      },
      now: "2026-08-20T13:30:00.000Z"
    });

    expect(result).toMatchObject({
      kind: "found",
      detail: {
        displayName: "Мария Орлова",
        relationship: {
          source: "manual",
          status: "active",
          firstLinkedAt: "2026-08-20T13:30:00.000Z",
          lastLinkedAt: "2026-08-20T13:30:00.000Z"
        },
        lifecycle: {
          status: "new",
          mode: "automatic",
          revision: 1,
          lastActivityAt: "2026-08-20T13:30:00.000Z"
        },
        readiness: { birthData: "missing", relatedProfiles: "ready" },
        birthData: null,
        relatedBirthProfiles: [],
        privateCrm: {
          note: null,
          tags: [],
          updatedAt: "2026-08-20T13:30:00.000Z"
        },
        activity: {
          items: [
            {
              kind: "relationship_created",
              occurredAt: "2026-08-20T13:30:00.000Z",
              metadata: { source: "manual" }
            },
            {
              kind: "lifecycle_changed",
              occurredAt: "2026-08-20T13:30:00.000Z",
              metadata: {
                previousStatus: null,
                status: "new",
                mode: "automatic"
              }
            }
          ]
        }
      }
    });
    if (result.kind !== "found") throw new Error("Expected manual CRM client");

    await expect(
      runtime.database
        .select({ role: userRoleAssignments.role })
        .from(userRoleAssignments)
        .where(eq(userRoleAssignments.userId, result.detail.clientUserId))
    ).resolves.toEqual([{ role: "client" }]);
    await expect(
      runtime.database
        .select({
          displayName: userProfiles.displayName,
          snapshot: clientProfiles.displayNameSnapshot,
          locale: clientProfiles.preferredLocale,
          timezone: clientProfiles.timezone
        })
        .from(userProfiles)
        .innerJoin(clientProfiles, eq(clientProfiles.userId, userProfiles.userId))
        .where(eq(userProfiles.userId, result.detail.clientUserId))
    ).resolves.toEqual([
      {
        displayName: "Мария Орлова",
        snapshot: "Мария Орлова",
        locale: "ru",
        timezone: "Europe/Moscow"
      }
    ]);
  });

  it("enforces case-insensitive private tag uniqueness in storage", async () => {
    const fixture = await seedCrmFixture(runtime);

    await expect(
      runtime.database.insert(clientCrmPrivateTags).values({
        relationshipId: fixture.relationshipId,
        tag: "natal"
      })
    ).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint: "client_crm_private_tags_relationship_lower_tag_unique"
      }
    });
  });
});

function emptyQuery(
  overrides: Partial<{
    cursor: string | null;
    lifecycle: "new" | "active" | "waiting_for_client" | "in_service" | "inactive";
    limit: number;
    query: string;
    source: "direct_link" | "booking" | "order" | "lead_magnet" | "manual";
  }> = {}
) {
  return {
    query: "",
    cursor: null,
    limit: 20,
    lifecycle: undefined,
    source: undefined,
    sort: "last_linked_at_desc" as const,
    ...overrides
  };
}

function tamperCursorPosition(cursor: string): string {
  const [version, payload, signature] = cursor.split(".");
  if (!version || !payload || !signature) throw new Error("Expected sealed CRM cursor");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    lastLinkedAt: string;
  };
  decoded.lastLinkedAt = "2026-08-20T09:00:00.000Z";
  const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");
  return `${version}.${tamperedPayload}.${signature}`;
}

async function seedCrmFixture(runtime: PostgresRuntime) {
  const now = new Date("2026-08-20T10:00:00.000Z");
  const activityAt = new Date("2026-08-20T11:00:00.000Z");
  const relatedActivityAt = new Date("2026-08-20T11:01:00.000Z");
  const astrologerUserId = randomUUID();
  const unrelatedAstrologerUserId = randomUUID();
  const clientUserId = randomUUID();
  const archivedClientUserId = randomUUID();
  const blockedClientUserId = randomUUID();
  const newestClientUserId = randomUUID();
  const sameTimestampClientUserId = randomUUID();
  const relationshipIdPrefix = randomUUID().slice(0, -1);
  const relationshipId = `${relationshipIdPrefix}1`;
  const sameTimestampRelationshipId = `${relationshipIdPrefix}2`;
  const newestRelationshipId = `${relationshipIdPrefix}3`;
  const lifecycleHistoryId = randomUUID();
  const birthDataId = randomUUID();
  const birthDataHistoryId = randomUUID();
  const relatedBirthProfileId = randomUUID();
  const relatedBirthProfileHistoryId = randomUUID();
  const archivedRelationshipId = randomUUID();
  const blockedRelationshipId = randomUUID();

  await runtime.database.transaction(async (transaction) => {
    await transaction
      .insert(users)
      .values([
        { id: astrologerUserId },
        { id: unrelatedAstrologerUserId },
        { id: clientUserId },
        { id: archivedClientUserId },
        { id: blockedClientUserId },
        { id: newestClientUserId },
        { id: sameTimestampClientUserId }
      ]);
    await transaction.insert(clientProfiles).values([
      {
        userId: clientUserId,
        displayNameSnapshot: "CRM Active Client",
        preferredLocale: "ru",
        timezone: "Europe/Moscow",
        createdAt: now,
        updatedAt: now
      },
      {
        userId: newestClientUserId,
        displayNameSnapshot: "CRM Newest Client",
        preferredLocale: "ru",
        timezone: "Europe/Moscow",
        createdAt: now,
        updatedAt: now
      },
      {
        userId: sameTimestampClientUserId,
        displayNameSnapshot: "CRM Same Timestamp Client",
        preferredLocale: "ru",
        timezone: "Europe/Moscow",
        createdAt: now,
        updatedAt: now
      }
    ]);
    await transaction.insert(clientAstrologerRelationships).values([
      relationship({
        id: relationshipId,
        clientUserId,
        astrologerUserId,
        status: "active",
        lastLinkedAt: now
      }),
      relationship({
        id: newestRelationshipId,
        clientUserId: newestClientUserId,
        astrologerUserId,
        status: "active",
        lastLinkedAt: new Date("2026-08-20T12:00:00.000Z")
      }),
      relationship({
        id: sameTimestampRelationshipId,
        clientUserId: sameTimestampClientUserId,
        astrologerUserId,
        status: "active",
        lastLinkedAt: now
      }),
      relationship({
        id: archivedRelationshipId,
        clientUserId: archivedClientUserId,
        astrologerUserId,
        status: "archived",
        lastLinkedAt: now
      }),
      relationship({
        id: blockedRelationshipId,
        clientUserId: blockedClientUserId,
        astrologerUserId,
        status: "blocked",
        lastLinkedAt: now
      })
    ]);
    await transaction.insert(clientLifecycleStates).values({
      relationshipId,
      status: "in_service",
      mode: "automatic",
      latestAutomaticCandidateStatus: "in_service",
      revision: 2,
      lastActivityAt: activityAt,
      createdAt: now,
      updatedAt: activityAt
    });
    await transaction.insert(clientCrmPrivateProfiles).values({
      relationshipId,
      astrologerUserId,
      clientUserId,
      note: "Prepare compatibility follow-up",
      createdAt: now,
      updatedAt: activityAt
    });
    await transaction.insert(clientCrmPrivateTags).values([
      {
        relationshipId,
        tag: "Natal",
        createdAt: now,
        updatedAt: activityAt
      },
      {
        relationshipId,
        tag: "VIP",
        createdAt: now,
        updatedAt: activityAt
      }
    ]);
    await transaction.insert(clientLifecycleStates).values({
      relationshipId: newestRelationshipId,
      status: "new",
      mode: "automatic",
      latestAutomaticCandidateStatus: null,
      revision: 1,
      lastActivityAt: new Date("2026-08-20T12:00:00.000Z"),
      createdAt: now,
      updatedAt: new Date("2026-08-20T12:00:00.000Z")
    });
    await transaction.insert(clientLifecycleStates).values({
      relationshipId: sameTimestampRelationshipId,
      status: "new",
      mode: "automatic",
      latestAutomaticCandidateStatus: null,
      revision: 1,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(clientLifecycleHistory).values({
      id: lifecycleHistoryId,
      relationshipId,
      sourceEventId: `integration:${lifecycleHistoryId}`,
      causeKind: "relationship_created",
      beforeStatus: "new",
      afterStatus: "in_service",
      disposition: "applied",
      actorUserId: astrologerUserId,
      occurredAt: activityAt,
      createdAt: activityAt
    });
    await transaction.insert(clientBirthData).values({
      id: birthDataId,
      clientUserId,
      label: null,
      birthDate: "1990-01-01",
      birthTime: null,
      birthTimePrecision: "unknown",
      birthPlaceText: null,
      birthCountryCode: null,
      birthCity: null,
      birthRegion: null,
      birthTimezone: null,
      birthTimeDstOccurrence: null,
      birthLatitude: null,
      birthLongitude: null,
      source: "manual",
      revision: 1,
      lastEditedByUserId: astrologerUserId,
      lastEditedByRole: "astrologer",
      createdAt: activityAt,
      updatedAt: activityAt
    });
    await transaction.insert(clientBirthDataHistory).values({
      id: birthDataHistoryId,
      birthDataId,
      clientUserId,
      revision: 1,
      actorUserId: astrologerUserId,
      actorRole: "astrologer",
      source: "manual",
      snapshot: {},
      recordedAt: activityAt
    });
    await transaction.insert(clientRelatedBirthProfiles).values({
      id: relatedBirthProfileId,
      clientUserId,
      displayName: "CRM Partner",
      relationshipLabel: "Partner",
      birthDate: null,
      birthTime: null,
      birthTimePrecision: "unknown",
      birthPlaceText: null,
      birthCountryCode: null,
      birthCity: null,
      birthRegion: null,
      birthTimezone: null,
      birthTimeDstOccurrence: null,
      birthLatitude: null,
      birthLongitude: null,
      source: "manual",
      revision: 1,
      lastEditedByUserId: astrologerUserId,
      lastEditedByRole: "astrologer",
      createdAt: relatedActivityAt,
      updatedAt: relatedActivityAt
    });
    await transaction.insert(clientRelatedBirthProfileHistory).values({
      id: relatedBirthProfileHistoryId,
      relatedProfileId: relatedBirthProfileId,
      clientUserId,
      revision: 1,
      actorUserId: astrologerUserId,
      actorRole: "astrologer",
      source: "manual",
      snapshot: {},
      recordedAt: relatedActivityAt
    });
  });

  return {
    astrologerUserId,
    unrelatedAstrologerUserId,
    clientUserId,
    newestClientUserId,
    archivedClientUserId,
    blockedClientUserId,
    relationshipId,
    archivedRelationshipId,
    blockedRelationshipId,
    sameTimestampRelationshipId,
    newestRelationshipId,
    lifecycleHistoryId,
    birthDataHistoryId,
    relatedBirthProfileId,
    relatedBirthProfileHistoryId
  };
}

async function seedMissingLifecycleFixture(runtime: PostgresRuntime) {
  const now = new Date("2026-08-20T10:00:00.000Z");
  const astrologerUserId = randomUUID();
  const clientUserId = randomUUID();

  await runtime.database.transaction(async (transaction) => {
    await transaction.insert(users).values([{ id: astrologerUserId }, { id: clientUserId }]);
    await transaction.insert(clientProfiles).values({
      userId: clientUserId,
      displayNameSnapshot: "CRM Missing Lifecycle Client",
      preferredLocale: "ru",
      timezone: "Europe/Moscow",
      createdAt: now,
      updatedAt: now
    });
    await transaction.insert(clientAstrologerRelationships).values(
      relationship({
        id: randomUUID(),
        clientUserId,
        astrologerUserId,
        status: "active",
        lastLinkedAt: now
      })
    );
  });

  return { astrologerUserId, clientUserId };
}

function relationship(input: {
  readonly id: string;
  readonly clientUserId: string;
  readonly astrologerUserId: string;
  readonly status: "active" | "archived" | "blocked";
  readonly lastLinkedAt: Date;
}) {
  return {
    ...input,
    source: "manual" as const,
    firstLinkedAt: input.lastLinkedAt,
    archivedAt: input.status === "archived" ? input.lastLinkedAt : null,
    blockedAt: input.status === "blocked" ? input.lastLinkedAt : null,
    createdAt: input.lastLinkedAt,
    updatedAt: input.lastLinkedAt
  };
}
