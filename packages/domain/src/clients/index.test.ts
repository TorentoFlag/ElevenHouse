import { describe, expect, it } from "vitest";
import {
  BirthDataValidationError,
  ClientAstrologerRelationshipRoleError,
  ClientJoinIntentError,
  claimClientJoinIntent,
  createClientJoinIntent,
  createClientBirthDataProfile,
  getAstrologerClient,
  listClientBirthDataProfiles,
  listAstrologerClients,
  normalizeClientBirthDataInput,
  upsertClientBirthData,
  type AstrologerClientList,
  type ClientAstrologerRelationship,
  type ClientBirthData,
  type ClientJoinIntent,
  type ClientStore,
  type ClientStoreCreateBirthDataProfileInput,
  type ClientStoreCreateJoinIntentInput,
  type ClientStoreEnsureRelationshipInput,
  type ClientStoreUpdateBirthDataProfileInput,
  type ClientStoreUpsertBirthDataInput,
  type ClientStoreUpsertProfileInput
} from "./index";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const secondAstrologerUserId = "33333333-3333-4333-8333-333333333333";
const now = "2026-07-06T10:00:00.000Z";

describe("clients domain", () => {
  it("creates and claims a direct-link relationship idempotently", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [clientUserId],
      astrologerRoleUsers: [astrologerUserId]
    });
    const intent = await createClientJoinIntent({
      store,
      tokenGenerator: () => "plain-token",
      tokenHasher: (token) => `hash:${token}`,
      idGenerator: () => "44444444-4444-4444-8444-444444444444",
      astrologerUserId,
      publicHandleSnapshot: "alisa-vega",
      now: new Date(now),
      expiresAt: new Date("2026-07-06T11:00:00.000Z")
    });

    await claimClientJoinIntent({
      store,
      token: intent.token,
      tokenHasher: (token) => `hash:${token}`,
      clientUserId,
      now: new Date("2026-07-06T10:05:00.000Z")
    });
    await claimClientJoinIntent({
      store,
      token: intent.token,
      tokenHasher: (token) => `hash:${token}`,
      clientUserId,
      now: new Date("2026-07-06T10:06:00.000Z")
    });

    expect(store.relationships).toHaveLength(1);
    expect(store.relationships[0]).toMatchObject({
      clientUserId,
      astrologerUserId,
      source: "direct_link",
      status: "active",
      firstLinkedAt: "2026-07-06T10:05:00.000Z",
      lastLinkedAt: "2026-07-06T10:06:00.000Z"
    });
  });

  it("allows one client to join multiple astrologers", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [clientUserId],
      astrologerRoleUsers: [astrologerUserId, secondAstrologerUserId]
    });

    await store.ensureRelationship({
      clientUserId,
      astrologerUserId,
      source: "direct_link",
      now
    });
    await store.ensureRelationship({
      clientUserId,
      astrologerUserId: secondAstrologerUserId,
      source: "direct_link",
      now
    });

    expect(store.relationships.map((row) => row.astrologerUserId)).toEqual([
      astrologerUserId,
      secondAstrologerUserId
    ]);
  });

  it("rejects relationship creation when account roles are missing", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [],
      astrologerRoleUsers: [astrologerUserId]
    });

    await expect(
      store.ensureRelationship({
        clientUserId,
        astrologerUserId,
        source: "direct_link",
        now
      })
    ).rejects.toBeInstanceOf(ClientAstrologerRelationshipRoleError);
  });

  it("normalizes full birth data and enforces unknown time rules", () => {
    expect(
      normalizeClientBirthDataInput({
        label: "  Основные данные  ",
        birthDate: "1990-03-14",
        birthTime: "08:25",
        birthTimePrecision: "exact",
        birthPlaceText: " Москва, Россия ",
        birthCountryCode: " ru ",
        birthCity: " Москва ",
        birthRegion: " Московская область ",
        birthTimezone: " Europe/Moscow ",
        birthLatitude: 55.7558,
        birthLongitude: 37.6173,
        source: "client_profile",
        isPrimary: true
      })
    ).toMatchObject({
      label: "Основные данные",
      birthDate: "1990-03-14",
      birthTime: "08:25",
      birthTimePrecision: "exact",
      birthPlaceText: "Москва, Россия",
      birthCountryCode: "RU",
      birthCity: "Москва",
      birthRegion: "Московская область",
      birthTimezone: "Europe/Moscow",
      birthLatitude: 55.7558,
      birthLongitude: 37.6173,
      source: "client_profile",
      isPrimary: true
    });

    expect(() =>
      normalizeClientBirthDataInput({
        birthTime: "08:25",
        birthTimePrecision: "unknown",
        source: "client_profile"
      })
    ).toThrow(BirthDataValidationError);
  });

  it("creates multiple birth profiles for one client and keeps one primary", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [clientUserId],
      astrologerRoleUsers: [astrologerUserId]
    });

    await createClientBirthDataProfile({
      store,
      clientUserId,
      now: new Date(now),
      data: {
        label: "Я",
        birthDate: "1990-03-14",
        birthTime: "08:25",
        birthTimePrecision: "exact",
        birthPlaceText: "Москва",
        source: "client_profile",
        isPrimary: true
      }
    });
    await createClientBirthDataProfile({
      store,
      clientUserId,
      now: new Date("2026-07-06T10:05:00.000Z"),
      data: {
        label: "Партнёр",
        birthDate: "1988-07-22",
        birthTime: "19:40",
        birthTimePrecision: "exact",
        birthPlaceText: "Калининград",
        source: "client_profile"
      }
    });

    await expect(listClientBirthDataProfiles({ store, clientUserId })).resolves.toMatchObject([
      { label: "Я", isPrimary: true },
      { label: "Партнёр", isPrimary: false }
    ]);
  });

  it("updates the primary birth profile through the legacy upsert use case", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [clientUserId],
      astrologerRoleUsers: [astrologerUserId]
    });

    await createClientBirthDataProfile({
      store,
      clientUserId,
      now: new Date(now),
      data: {
        label: "Я",
        birthDate: "1990-03-14",
        source: "client_profile",
        isPrimary: true
      }
    });
    await createClientBirthDataProfile({
      store,
      clientUserId,
      now: new Date("2026-07-06T10:05:00.000Z"),
      data: {
        label: "Партнёр",
        birthDate: "1988-07-22",
        source: "client_profile"
      }
    });

    await upsertClientBirthData({
      store,
      clientUserId,
      now: new Date("2026-07-06T10:10:00.000Z"),
      data: {
        label: "Основной профиль",
        birthDate: "1991-04-15",
        source: "client_profile"
      }
    });

    await expect(listClientBirthDataProfiles({ store, clientUserId })).resolves.toMatchObject([
      { label: "Основной профиль", birthDate: "1991-04-15", isPrimary: true },
      { label: "Партнёр", birthDate: "1988-07-22", isPrimary: false }
    ]);
  });

  it("rejects expired or missing join intents", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [clientUserId],
      astrologerRoleUsers: [astrologerUserId]
    });
    await createClientJoinIntent({
      store,
      tokenGenerator: () => "expired-token",
      tokenHasher: (token) => `hash:${token}`,
      idGenerator: () => "44444444-4444-4444-8444-444444444444",
      astrologerUserId,
      publicHandleSnapshot: "alisa-vega",
      now: new Date(now),
      expiresAt: new Date("2026-07-06T10:30:00.000Z")
    });

    await expect(
      claimClientJoinIntent({
        store,
        token: "expired-token",
        tokenHasher: (token) => `hash:${token}`,
        clientUserId,
        now: new Date("2026-07-06T10:31:00.000Z")
      })
    ).rejects.toBeInstanceOf(ClientJoinIntentError);
    await expect(
      claimClientJoinIntent({
        store,
        token: "missing-token",
        tokenHasher: (token) => `hash:${token}`,
        clientUserId,
        now: new Date("2026-07-06T10:05:00.000Z")
      })
    ).rejects.toBeInstanceOf(ClientJoinIntentError);
  });

  it("does not create a relationship when the atomic intent claim loses a race", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [clientUserId],
      astrologerRoleUsers: [astrologerUserId]
    });
    const intent = await createClientJoinIntent({
      store,
      tokenGenerator: () => "raced-token",
      tokenHasher: (token) => `hash:${token}`,
      idGenerator: () => "44444444-4444-4444-8444-444444444444",
      astrologerUserId,
      publicHandleSnapshot: "alisa-vega",
      now: new Date(now),
      expiresAt: new Date("2026-07-06T11:00:00.000Z")
    });
    const losingStore: ClientStore = {
      ...store,
      markJoinIntentClaimed: async () => null
    };

    await expect(
      claimClientJoinIntent({
        store: losingStore,
        token: intent.token,
        tokenHasher: (token) => `hash:${token}`,
        clientUserId,
        now: new Date("2026-07-06T10:05:00.000Z")
      })
    ).rejects.toBeInstanceOf(ClientJoinIntentError);
    expect(store.relationships).toEqual([]);
  });

  it("lists only clients related to the requested astrologer", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [clientUserId],
      astrologerRoleUsers: [astrologerUserId, secondAstrologerUserId]
    });
    await store.upsertClientProfile({
      userId: clientUserId,
      displayNameSnapshot: "Марина Краснова",
      preferredLocale: "ru",
      timezone: "Europe/Moscow",
      now
    });
    await upsertClientBirthData({
      store,
      clientUserId,
      now: new Date(now),
      data: {
        birthDate: "1990-03-14",
        birthTime: "08:25",
        birthTimePrecision: "exact",
        birthPlaceText: "Москва, Россия",
        source: "client_profile"
      }
    });
    await store.ensureRelationship({
      clientUserId,
      astrologerUserId,
      source: "direct_link",
      now
    });

    await expect(
      listAstrologerClients({ store, astrologerUserId, query: "", limit: 20, offset: 0 })
    ).resolves.toMatchObject({
      total: 1,
      clients: [
        {
          clientUserId,
          displayName: "Марина Краснова",
          relationshipStatus: "active",
          birthData: {
            birthDate: "1990-03-14",
            birthTime: "08:25",
            birthPlaceText: "Москва, Россия"
          }
        }
      ]
    });

    await expect(
      listAstrologerClients({
        store,
        astrologerUserId: secondAstrologerUserId,
        query: "",
        limit: 20,
        offset: 0
      })
    ).resolves.toMatchObject({ total: 0, clients: [] });
  });

  it("gets one active client relationship for the requested astrologer", async () => {
    const store = createMemoryClientStore({
      clientRoleUsers: [clientUserId],
      astrologerRoleUsers: [astrologerUserId, secondAstrologerUserId]
    });
    await store.upsertClientProfile({
      userId: clientUserId,
      displayNameSnapshot: "Марина Краснова",
      preferredLocale: "ru",
      timezone: "Europe/Moscow",
      now
    });
    await store.ensureRelationship({
      clientUserId,
      astrologerUserId,
      source: "direct_link",
      now
    });

    await expect(
      getAstrologerClient({ store, astrologerUserId, clientUserId })
    ).resolves.toMatchObject({
      clientUserId,
      displayName: "Марина Краснова",
      relationshipStatus: "active"
    });
    await expect(
      getAstrologerClient({
        store,
        astrologerUserId: secondAstrologerUserId,
        clientUserId
      })
    ).resolves.toBeNull();
  });
});

type MemoryClientProfile = {
  readonly userId: string;
  readonly displayNameSnapshot: string | null;
  readonly preferredLocale: string | null;
  readonly timezone: string | null;
  readonly updatedAt: string;
};

function createMemoryClientStore(input: {
  readonly clientRoleUsers: readonly string[];
  readonly astrologerRoleUsers: readonly string[];
}) {
  const clientRoleUsers = new Set(input.clientRoleUsers);
  const astrologerRoleUsers = new Set(input.astrologerRoleUsers);
  const profiles: MemoryClientProfile[] = [];
  const birthData: ClientBirthData[] = [];
  const relationships: ClientAstrologerRelationship[] = [];
  const joinIntents: ClientJoinIntent[] = [];

  const store: ClientStore & {
    readonly relationships: ClientAstrologerRelationship[];
    readonly joinIntents: ClientJoinIntent[];
  } = {
    relationships,
    joinIntents,
    createJoinIntent: async (createInput: ClientStoreCreateJoinIntentInput) => {
      const intent: ClientJoinIntent = {
        id: createInput.id,
        astrologerUserId: createInput.astrologerUserId,
        tokenHash: createInput.tokenHash,
        publicHandleSnapshot: createInput.publicHandleSnapshot,
        status: "pending",
        expiresAt: createInput.expiresAt,
        claimedByClientUserId: null,
        claimedAt: null,
        createdAt: createInput.now,
        updatedAt: createInput.now
      };
      joinIntents.push(intent);
      return intent;
    },
    findJoinIntentByTokenHash: async ({ tokenHash }) =>
      joinIntents.find((intent) => intent.tokenHash === tokenHash) ?? null,
    markJoinIntentClaimed: async ({ intentId, clientUserId, now: claimedAt }) => {
      const index = joinIntents.findIndex((intent) => intent.id === intentId);
      if (index === -1) {
        return null;
      }
      const intent = joinIntents[index];
      if (!intent) {
        return null;
      }
      if (
        new Date(intent.expiresAt).getTime() <= new Date(claimedAt).getTime() ||
        (intent.status !== "pending" && intent.claimedByClientUserId !== clientUserId)
      ) {
        return null;
      }
      joinIntents[index] = {
        ...intent,
        status: "claimed",
        claimedByClientUserId: clientUserId,
        claimedAt,
        updatedAt: claimedAt
      };
      return joinIntents[index];
    },
    ensureRelationship: async (relationshipInput: ClientStoreEnsureRelationshipInput) => {
      if (!clientRoleUsers.has(relationshipInput.clientUserId)) {
        throw new ClientAstrologerRelationshipRoleError("Client account role is required");
      }
      if (!astrologerRoleUsers.has(relationshipInput.astrologerUserId)) {
        throw new ClientAstrologerRelationshipRoleError("Astrologer account role is required");
      }

      const existing = relationships.find(
        (relationship) =>
          relationship.clientUserId === relationshipInput.clientUserId &&
          relationship.astrologerUserId === relationshipInput.astrologerUserId
      );
      if (existing) {
        Object.assign(existing, {
          status: "active",
          lastLinkedAt: relationshipInput.now,
          archivedAt: null,
          updatedAt: relationshipInput.now
        });
        return existing;
      }

      const relationship: ClientAstrologerRelationship = {
        id: `${relationshipInput.clientUserId}:${relationshipInput.astrologerUserId}`,
        clientUserId: relationshipInput.clientUserId,
        astrologerUserId: relationshipInput.astrologerUserId,
        source: relationshipInput.source,
        status: "active",
        firstLinkedAt: relationshipInput.now,
        lastLinkedAt: relationshipInput.now,
        archivedAt: null,
        blockedAt: null,
        createdAt: relationshipInput.now,
        updatedAt: relationshipInput.now
      };
      relationships.push(relationship);
      return relationship;
    },
    upsertClientProfile: async (profileInput: ClientStoreUpsertProfileInput) => {
      const profile = profiles.find((item) => item.userId === profileInput.userId);
      if (profile) {
        Object.assign(profile, {
          displayNameSnapshot: profileInput.displayNameSnapshot,
          preferredLocale: profileInput.preferredLocale,
          timezone: profileInput.timezone,
          updatedAt: profileInput.now
        });
        return;
      }
      profiles.push({
        userId: profileInput.userId,
        displayNameSnapshot: profileInput.displayNameSnapshot,
        preferredLocale: profileInput.preferredLocale,
        timezone: profileInput.timezone,
        updatedAt: profileInput.now
      });
    },
    upsertClientBirthData: async (birthInput: ClientStoreUpsertBirthDataInput) => {
      const existingIndex = birthData.findIndex(
        (item) => item.clientUserId === birthInput.clientUserId && item.isPrimary
      );
      const row: ClientBirthData = {
        id: birthData[existingIndex]?.id ?? `${birthInput.clientUserId}:birth-data`,
        clientUserId: birthInput.clientUserId,
        ...birthInput.data,
        isPrimary: true,
        createdAt: birthData[existingIndex]?.createdAt ?? birthInput.now,
        updatedAt: birthInput.now
      };
      if (existingIndex === -1) {
        birthData.push(row);
      } else {
        birthData[existingIndex] = row;
      }
      return row;
    },
    listClientBirthDataProfiles: async (requestedClientUserId: string) =>
      birthData.filter((item) => item.clientUserId === requestedClientUserId),
    createClientBirthDataProfile: async (birthInput: ClientStoreCreateBirthDataProfileInput) => {
      if (birthInput.data.isPrimary) {
        for (const item of birthData) {
          if (item.clientUserId === birthInput.clientUserId && item.isPrimary) {
            Object.assign(item, { isPrimary: false, updatedAt: birthInput.now });
          }
        }
      }
      const row: ClientBirthData = {
        id: `${birthInput.clientUserId}:birth-data:${birthData.length + 1}`,
        clientUserId: birthInput.clientUserId,
        ...birthInput.data,
        createdAt: birthInput.now,
        updatedAt: birthInput.now
      };
      birthData.push(row);
      return row;
    },
    updateClientBirthDataProfile: async (birthInput: ClientStoreUpdateBirthDataProfileInput) => {
      const existingIndex = birthData.findIndex(
        (item) =>
          item.clientUserId === birthInput.clientUserId && item.id === birthInput.birthDataId
      );
      if (existingIndex === -1) {
        return null;
      }
      if (birthInput.data.isPrimary) {
        for (const item of birthData) {
          if (item.clientUserId === birthInput.clientUserId && item.id !== birthInput.birthDataId) {
            Object.assign(item, { isPrimary: false, updatedAt: birthInput.now });
          }
        }
      }
      const existing = birthData[existingIndex];
      if (!existing) {
        return null;
      }
      const row: ClientBirthData = {
        id: existing.id,
        clientUserId: existing.clientUserId,
        ...birthInput.data,
        createdAt: existing.createdAt,
        updatedAt: birthInput.now
      };
      birthData[existingIndex] = row;
      return row;
    },
    listAstrologerClients: async ({
      astrologerUserId: requestedAstrologerId,
      query,
      limit,
      offset
    }) => {
      const normalizedQuery = query.trim().toLowerCase();
      const related = relationships
        .filter(
          (relationship) =>
            relationship.astrologerUserId === requestedAstrologerId &&
            relationship.status === "active"
        )
        .map((relationship) => {
          const profile = profiles.find((item) => item.userId === relationship.clientUserId);
          const clientBirthData =
            birthData.find((item) => item.clientUserId === relationship.clientUserId) ?? null;
          return {
            clientUserId: relationship.clientUserId,
            displayName: profile?.displayNameSnapshot ?? null,
            relationshipStatus: relationship.status,
            firstLinkedAt: relationship.firstLinkedAt,
            lastLinkedAt: relationship.lastLinkedAt,
            birthData: clientBirthData
          };
        })
        .filter(
          (client) =>
            !normalizedQuery || client.displayName?.toLowerCase().includes(normalizedQuery)
        );
      const clients = related.slice(offset, offset + limit);
      return { clients, total: related.length } satisfies AstrologerClientList;
    },
    getAstrologerClient: async ({
      astrologerUserId: requestedAstrologerId,
      clientUserId: requestedClientId
    }) => {
      const relationship = relationships.find(
        (item) =>
          item.astrologerUserId === requestedAstrologerId &&
          item.clientUserId === requestedClientId &&
          item.status === "active"
      );
      if (!relationship) {
        return null;
      }
      const profile = profiles.find((item) => item.userId === relationship.clientUserId);
      const clientBirthData =
        birthData.find((item) => item.clientUserId === relationship.clientUserId) ?? null;

      return {
        clientUserId: relationship.clientUserId,
        displayName: profile?.displayNameSnapshot ?? null,
        relationshipStatus: relationship.status,
        firstLinkedAt: relationship.firstLinkedAt,
        lastLinkedAt: relationship.lastLinkedAt,
        birthData: clientBirthData
      };
    }
  };

  return store;
}
