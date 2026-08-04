import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { ClientBirthPlaceSearchResponse } from "@elevenhouse/contracts";
import type {
  AstrologerClientList,
  AstrologerClientListItem,
  ClientAstrologerRelationship,
  ClientBirthData,
  ClientJoinIntent,
  ClientStore,
  ClientStoreGetAstrologerClientInput,
  ClientStoreListAstrologerClientsInput
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import type { ClientBirthPlaceSearchProvider } from "./birth-place-search.provider";
import { ClientsService } from "./clients.service";

const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const clientUserId = "11111111-1111-4111-8111-111111111111";
const unrelatedClientUserId = "44444444-4444-4444-8444-444444444444";
const now = "2026-07-06T10:00:00.000Z";

describe("ClientsService", () => {
  it("lists only clients related to the current astrologer", async () => {
    const store = createStore();
    const service = createService(store);

    await expect(service.listClients({}, createAuthenticatedRequest())).resolves.toMatchObject({
      total: 1,
      clients: [
        {
          clientUserId,
          displayName: "Марина Краснова",
          relationshipStatus: "active",
          birthData: {
            birthDate: "1990-03-14"
          }
        }
      ]
    });
    expect(store.listAstrologerClients).toHaveBeenCalledWith({
      astrologerUserId,
      query: "",
      limit: 20,
      offset: 0
    });
  });

  it("supports search and pagination query normalization", async () => {
    const store = createStore();
    const service = createService(store);

    await service.listClients(
      { query: "  марина  ", limit: "10", offset: "5" },
      createAuthenticatedRequest()
    );

    expect(store.listAstrologerClients).toHaveBeenCalledWith({
      astrologerUserId,
      query: "марина",
      limit: 10,
      offset: 5
    });
  });

  it("gets one client only inside the current astrologer relationship", async () => {
    const store = createStore();
    const service = createService(store);

    await expect(
      service.getClient(clientUserId, createAuthenticatedRequest())
    ).resolves.toMatchObject({
      client: {
        clientUserId,
        displayName: "Марина Краснова"
      }
    });
    await expect(
      service.getClient(unrelatedClientUserId, createAuthenticatedRequest())
    ).rejects.toThrow(NotFoundException);
  });

  it("updates birth data only for a client related to the current astrologer", async () => {
    const store = createStore();
    const service = createService(store);

    await expect(
      service.updateBirthData(clientUserId, birthDataInput(), createAuthenticatedRequest())
    ).resolves.toMatchObject({
      client: {
        clientUserId,
        birthData: {
          birthDate: "1990-07-15",
          birthTime: "10:30",
          birthTimePrecision: "exact",
          birthTimezone: "Europe/Rome",
          birthLatitude: 41.9028,
          birthLongitude: 12.4964,
          source: "manual",
          isPrimary: true
        }
      }
    });

    expect(store.getAstrologerClient).toHaveBeenCalledWith({ astrologerUserId, clientUserId });
    expect(store.upsertClientBirthData).toHaveBeenCalledWith({
      clientUserId,
      data: {
        label: "Основные данные",
        birthDate: "1990-07-15",
        birthTime: "10:30",
        birthTimePrecision: "exact",
        birthPlaceText: "Рим, Италия",
        birthCountryCode: "IT",
        birthCity: "Рим",
        birthRegion: "Лацио",
        birthTimezone: "Europe/Rome",
        birthTimeDstOccurrence: null,
        birthLatitude: 41.9028,
        birthLongitude: 12.4964,
        source: "manual",
        isPrimary: true
      },
      now
    });
  });

  it("does not upsert birth data for unrelated clients", async () => {
    const store = createStore();
    const service = createService(store);

    await expect(
      service.updateBirthData(unrelatedClientUserId, birthDataInput(), createAuthenticatedRequest())
    ).rejects.toThrow(NotFoundException);

    expect(store.upsertClientBirthData).not.toHaveBeenCalled();
  });

  it("rejects invalid input and missing sessions", async () => {
    const service = createService(createStore());

    await expect(
      service.listClients({ limit: "999" }, createAuthenticatedRequest())
    ).rejects.toThrow(BadRequestException);
    await expect(service.getClient("not-a-uuid", createAuthenticatedRequest())).rejects.toThrow(
      BadRequestException
    );
    await expect(
      service.updateBirthData(clientUserId, { birthTime: "10:30" }, createAuthenticatedRequest())
    ).rejects.toThrow(BadRequestException);
    await expect(service.listClients({}, {})).rejects.toThrow(UnauthorizedException);
  });

  it("searches birth places only for authenticated astrologers", async () => {
    const provider = createBirthPlaceSearchProvider();
    const service = createService(createStore(), provider);

    await expect(
      service.searchBirthPlaces(
        { query: "  Rome   Italy  ", limit: "3" },
        createAuthenticatedRequest()
      )
    ).resolves.toEqual({
      candidates: [
        {
          id: "geoapify:41485",
          label: "Rome, Lazio, Italy",
          placeName: "Rome, Italy",
          countryCode: "IT",
          city: "Rome",
          region: "Lazio",
          timezone: "Europe/Rome",
          latitude: 41.8933,
          longitude: 12.4829,
          provider: "geoapify",
          providerPlaceId: "41485"
        }
      ]
    });

    expect(provider.search).toHaveBeenCalledWith({
      ownerUserId: astrologerUserId,
      query: "Rome Italy",
      limit: 3
    });
    await expect(service.searchBirthPlaces({ query: "Rome" }, {})).rejects.toThrow(
      UnauthorizedException
    );
  });

  it("resolves an opaque Geoapify place reference only for an authenticated astrologer", async () => {
    const provider = createBirthPlaceSearchProvider();
    const service = createService(createStore(), provider);

    await expect(
      service.resolveBirthPlaceReference("41485", createAuthenticatedRequest())
    ).resolves.toMatchObject({
      provider: "geoapify",
      providerPlaceId: "41485",
      timezone: "Europe/Rome",
      latitude: 41.8933,
      longitude: 12.4829
    });

    expect(provider.resolveReference).toHaveBeenCalledWith({
      ownerUserId: astrologerUserId,
      provider: "geoapify",
      providerPlaceId: "41485"
    });
    await expect(service.resolveBirthPlaceReference("41485", {})).rejects.toThrow(
      UnauthorizedException
    );
    await expect(
      service.resolveBirthPlaceReference(
        "https://provider.invalid/place?id=41485",
        createAuthenticatedRequest()
      )
    ).rejects.toThrow(BadRequestException);
  });
});

function createService(
  store: ClientStore,
  birthPlaceSearchProvider: ClientBirthPlaceSearchProvider = createBirthPlaceSearchProvider()
): ClientsService {
  return new ClientsService(store, { now: () => new Date(now) }, birthPlaceSearchProvider);
}

function createBirthPlaceSearchProvider(): ClientBirthPlaceSearchProvider {
  return {
    search: vi.fn(
      async (): Promise<ClientBirthPlaceSearchResponse> => ({
        candidates: [
          {
            id: "geoapify:41485",
            label: "Rome, Lazio, Italy",
            placeName: "Rome, Italy",
            countryCode: "IT",
            city: "Rome",
            region: "Lazio",
            timezone: "Europe/Rome",
            latitude: 41.8933,
            longitude: 12.4829,
            provider: "geoapify" as const,
            providerPlaceId: "41485"
          }
        ]
      })
    ),
    resolveReference: vi.fn(async () => ({
      id: "geoapify:41485",
      label: "Rome, Lazio, Italy",
      placeName: "Rome, Italy",
      countryCode: "IT",
      city: "Rome",
      region: "Lazio",
      timezone: "Europe/Rome",
      latitude: 41.8933,
      longitude: 12.4829,
      provider: "geoapify" as const,
      providerPlaceId: "41485"
    }))
  };
}

function createStore(): ClientStore {
  const client: AstrologerClientListItem = {
    clientUserId,
    displayName: "Марина Краснова",
    relationshipStatus: "active",
    firstLinkedAt: now,
    lastLinkedAt: now,
    birthData: {
      id: "55555555-5555-4555-8555-555555555555",
      clientUserId,
      label: "Основные данные",
      birthDate: "1990-03-14",
      birthTime: "08:25",
      birthTimePrecision: "exact",
      birthPlaceText: "Москва, Россия",
      birthCountryCode: "RU",
      birthCity: "Москва",
      birthRegion: "Москва",
      birthTimezone: "Europe/Moscow",
      birthTimeDstOccurrence: null,
      birthLatitude: 55.7558,
      birthLongitude: 37.6173,
      source: "client_profile",
      isPrimary: true,
      createdAt: now,
      updatedAt: now
    }
  };

  return {
    createJoinIntent: vi.fn(
      async (): Promise<ClientJoinIntent> => raise("Unexpected create join intent call")
    ),
    findJoinIntentByTokenHash: vi.fn(async () => null),
    markJoinIntentClaimed: vi.fn(async () => null),
    ensureRelationship: vi.fn(
      async (): Promise<ClientAstrologerRelationship> =>
        raise("Unexpected ensure relationship call")
    ),
    upsertClientProfile: vi.fn(async (): Promise<void> => {}),
    upsertClientBirthData: vi.fn(async (input): Promise<ClientBirthData> => {
      return {
        id: "66666666-6666-4666-8666-666666666666",
        clientUserId: input.clientUserId,
        ...input.data,
        createdAt: now,
        updatedAt: input.now
      };
    }),
    listClientBirthDataProfiles: vi.fn(async () => []),
    createClientBirthDataProfile: vi.fn(
      async (): Promise<ClientBirthData> => raise("Unexpected create birth profile call")
    ),
    updateClientBirthDataProfile: vi.fn(
      async (): Promise<ClientBirthData | null> => raise("Unexpected update birth profile call")
    ),
    listAstrologerClients: vi.fn(
      async (input: ClientStoreListAstrologerClientsInput): Promise<AstrologerClientList> => {
        const clients =
          input.astrologerUserId === astrologerUserId && input.query !== "unrelated"
            ? [client]
            : [];
        return { clients, total: clients.length };
      }
    ),
    getAstrologerClient: vi.fn(
      async (
        input: ClientStoreGetAstrologerClientInput
      ): Promise<AstrologerClientListItem | null> =>
        input.astrologerUserId === astrologerUserId && input.clientUserId === clientUserId
          ? client
          : null
    )
  };
}

function birthDataInput(): Record<string, unknown> {
  return {
    label: "Основные данные",
    birthDate: "1990-07-15",
    birthTime: "10:30",
    birthTimePrecision: "exact",
    birthPlaceText: "Рим, Италия",
    birthCountryCode: "IT",
    birthCity: "Рим",
    birthRegion: "Лацио",
    birthTimezone: "Europe/Rome",
    birthTimeDstOccurrence: null,
    birthLatitude: 41.9028,
    birthLongitude: 12.4964
  };
}

function createAuthenticatedRequest(userId: string = astrologerUserId): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: {
        id: userId,
        status: "active",
        roles: ["astrologer"]
      },
      session: {
        id: "session_1",
        userId,
        tokenHash: "hash",
        expiresAt: "2026-07-07T00:00:00.000Z"
      }
    }
  } as unknown as AstrologerSessionRequest;
}

function raise(message: string): never {
  throw new Error(message);
}
