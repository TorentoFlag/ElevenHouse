import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type {
  AstrologerClientList,
  AstrologerClientListItem,
  ClientAstrologerRelationship,
  ClientBirthData,
  ClientJoinIntent,
  ClientStore,
  ClientStoreCreateJoinIntentInput,
  ClientStoreEnsureRelationshipInput,
  ClientStoreGetAstrologerClientInput,
  ClientStoreListAstrologerClientsInput,
  ClientStoreUpsertBirthDataInput,
  ClientStoreUpsertProfileInput
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { ClientsService } from "./clients.service";

const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const secondAstrologerUserId = "33333333-3333-4333-8333-333333333333";
const clientUserId = "11111111-1111-4111-8111-111111111111";
const unrelatedClientUserId = "44444444-4444-4444-8444-444444444444";
const now = "2026-07-06T10:00:00.000Z";

describe("ClientsService", () => {
  it("lists only clients related to the current astrologer", async () => {
    const store = createStore();
    const service = new ClientsService(store);

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
    const service = new ClientsService(store);

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
    const service = new ClientsService(store);

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

  it("rejects invalid input and missing sessions", async () => {
    const service = new ClientsService(createStore());

    await expect(
      service.listClients({ limit: "999" }, createAuthenticatedRequest())
    ).rejects.toThrow(BadRequestException);
    await expect(service.getClient("not-a-uuid", createAuthenticatedRequest())).rejects.toThrow(
      BadRequestException
    );
    await expect(service.listClients({}, {})).rejects.toThrow(UnauthorizedException);
  });
});

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
      birthLatitude: 55.7558,
      birthLongitude: 37.6173,
      source: "client_profile",
      createdAt: now,
      updatedAt: now
    }
  };

  return {
    createJoinIntent: vi.fn(
      async (_input: ClientStoreCreateJoinIntentInput): Promise<ClientJoinIntent> =>
        raise("Unexpected create join intent call")
    ),
    findJoinIntentByTokenHash: vi.fn(async () => null),
    markJoinIntentClaimed: vi.fn(async () => null),
    ensureRelationship: vi.fn(
      async (_input: ClientStoreEnsureRelationshipInput): Promise<ClientAstrologerRelationship> =>
        raise("Unexpected ensure relationship call")
    ),
    upsertClientProfile: vi.fn(async (_input: ClientStoreUpsertProfileInput): Promise<void> => {}),
    upsertClientBirthData: vi.fn(
      async (_input: ClientStoreUpsertBirthDataInput): Promise<ClientBirthData> =>
        raise("Unexpected upsert birth data call")
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
