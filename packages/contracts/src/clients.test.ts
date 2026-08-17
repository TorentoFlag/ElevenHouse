import { describe, expect, it } from "vitest";
import {
  astrologerClientResponseSchema,
  astrologerClientListResponseSchema,
  clientBirthPlaceReferenceParamsSchema,
  clientBirthPlaceReferenceResponseSchema,
  clientBirthPlaceSearchQuerySchema,
  clientBirthPlaceSearchResponseSchema,
  clientBirthDataUpsertRequestSchema,
  clientCabinetOverviewResponseSchema,
  clientRelatedBirthProfileListResponseSchema,
  clientRelatedBirthProfileResponseSchema,
  clientRelatedBirthProfileUpsertRequestSchema,
  createClientJoinIntentRequestSchema,
  createClientJoinIntentResponseSchema
} from "./clients";

describe("client contracts", () => {
  it("normalizes join intent handle and accepts opaque token responses", () => {
    expect(createClientJoinIntentRequestSchema.parse({ publicHandle: " Alisa-Vega " })).toEqual({
      publicHandle: "alisa-vega"
    });
    expect(
      createClientJoinIntentResponseSchema.parse({
        token: "join_1234567890abcdef",
        astrologer: {
          userId: "22222222-2222-4222-8222-222222222222",
          publicHandle: "alisa-vega",
          publicName: "Алиса Вега"
        },
        expiresAt: "2026-07-06T11:00:00.000Z"
      })
    ).toMatchObject({ token: "join_1234567890abcdef" });
  });

  it("accepts a single-profile birth-data write with compare-and-swap revision", () => {
    expect(
      clientBirthDataUpsertRequestSchema.parse({
        label: "Основные данные",
        birthDate: "1990-03-14",
        birthTime: "08:25",
        birthTimePrecision: "exact",
        birthPlaceText: "Москва, Россия",
        birthCountryCode: "RU",
        birthCity: "Москва",
        birthRegion: "Москва",
        birthTimezone: "Europe/Moscow",
        birthTimeDstOccurrence: "first",
        birthLatitude: 55.7558,
        birthLongitude: 37.6173,
        expectedRevision: 4
      })
    ).toMatchObject({
      birthTimePrecision: "exact",
      birthTimeDstOccurrence: "first",
      expectedRevision: 4
    });
  });

  it("rejects non-IANA birth timezone values", () => {
    expect(() =>
      clientBirthDataUpsertRequestSchema.parse({
        birthTimezone: "Moscow"
      })
    ).toThrow();
  });

  it("normalizes birth-place search query and accepts provider-resolved candidates", () => {
    expect(
      clientBirthPlaceSearchQuerySchema.parse({ query: "  Rome   Italy  ", limit: "3" })
    ).toEqual({
      query: "Rome Italy",
      limit: 3
    });

    expect(
      clientBirthPlaceSearchResponseSchema.parse({
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
      })
    ).toMatchObject({
      candidates: [
        {
          timezone: "Europe/Rome",
          latitude: 41.8933,
          longitude: 12.4829
        }
      ]
    });
  });

  it("accepts only an opaque Geoapify place reference and one strict resolved candidate", () => {
    const providerPlaceId = "5132009123fa5a244059c72f70125fb04840f00102f9014496730800000000";

    expect(clientBirthPlaceReferenceParamsSchema.parse({ providerPlaceId })).toEqual({
      providerPlaceId
    });
    expect(
      clientBirthPlaceReferenceResponseSchema.parse({
        id: `geoapify:${providerPlaceId}`,
        label: "Rome, Lazio, Italy",
        placeName: "Rome, Italy",
        countryCode: "IT",
        city: "Rome",
        region: "Lazio",
        timezone: "Europe/Rome",
        latitude: 41.8933,
        longitude: 12.4829,
        provider: "geoapify",
        providerPlaceId
      })
    ).toMatchObject({ provider: "geoapify", providerPlaceId, timezone: "Europe/Rome" });
  });

  it("rejects caller URLs, coordinates and extra fields as birth-place references", () => {
    expect(() =>
      clientBirthPlaceReferenceParamsSchema.parse({
        providerPlaceId: "https://api.geoapify.com/v2/place-details?id=secret"
      })
    ).toThrow();
    expect(() =>
      clientBirthPlaceReferenceParamsSchema.parse({
        providerPlaceId: "51485",
        latitude: 41.8933,
        longitude: 12.4829
      })
    ).toThrow();
  });

  it("rejects a candidate whose public id is not bound to its provider reference", () => {
    expect(() =>
      clientBirthPlaceReferenceResponseSchema.parse({
        id: "geoapify:different-place",
        label: "Rome, Lazio, Italy",
        placeName: "Rome, Italy",
        countryCode: "IT",
        city: "Rome",
        region: "Lazio",
        timezone: "Europe/Rome",
        latitude: 41.8933,
        longitude: 12.4829,
        provider: "geoapify",
        providerPlaceId: "51485"
      })
    ).toThrow();
  });

  it("rejects invalid client list items", () => {
    expect(() =>
      astrologerClientListResponseSchema.parse({
        clients: [{ clientUserId: "not-uuid", displayName: "", relationship: {} }],
        total: 1
      })
    ).toThrow();
  });

  it("accepts one astrologer client response for detail screens", () => {
    expect(
      astrologerClientResponseSchema.parse({
        client: {
          clientUserId: "11111111-1111-4111-8111-111111111111",
          displayName: "Марина Краснова",
          relationshipStatus: "active",
          firstLinkedAt: "2026-07-06T10:00:00.000Z",
          lastLinkedAt: "2026-07-06T10:05:00.000Z",
          birthData: null
        }
      })
    ).toMatchObject({
      client: {
        clientUserId: "11111111-1111-4111-8111-111111111111",
        relationshipStatus: "active"
      }
    });
  });

  it("rejects birth-place search queries shorter than three characters", () => {
    expect(() => clientBirthPlaceSearchQuerySchema.parse({ query: "  Ри  " })).toThrow();
  });

  it("exposes one birth profile with its revision and latest server-side actor", () => {
    expect(
      astrologerClientResponseSchema.parse({
        client: {
          clientUserId: "11111111-1111-4111-8111-111111111111",
          displayName: "Марина Краснова",
          relationshipStatus: "active",
          firstLinkedAt: "2026-07-06T10:00:00.000Z",
          lastLinkedAt: "2026-07-06T10:05:00.000Z",
          birthData: birthProfile({
            revision: 4,
            lastEditedByRole: "astrologer",
            source: "manual"
          })
        }
      })
    ).toMatchObject({
      client: { birthData: { revision: 4, lastEditedByRole: "astrologer", source: "manual" } }
    });
  });

  it("accepts related birth profiles with separate person name and relationship label", () => {
    expect(
      clientRelatedBirthProfileUpsertRequestSchema.parse({
        displayName: " Иванов Иван Иванович ",
        relationshipLabel: " муж ",
        birthDate: "1988-07-22",
        birthTime: "",
        birthTimePrecision: "unknown",
        birthPlaceText: "Калининград, Россия",
        birthCountryCode: "RU",
        birthCity: "Калининград",
        birthRegion: "Калининградская область",
        birthTimezone: "Europe/Kaliningrad",
        birthTimeDstOccurrence: null,
        birthLatitude: 54.7104,
        birthLongitude: 20.4522,
        expectedRevision: null
      })
    ).toMatchObject({
      displayName: "Иванов Иван Иванович",
      relationshipLabel: "муж",
      birthTime: null,
      expectedRevision: null
    });

    expect(
      clientRelatedBirthProfileResponseSchema.parse(
        relatedBirthProfile({
          displayName: "Иванов Иван Иванович",
          relationshipLabel: "муж",
          source: "manual",
          lastEditedByRole: "astrologer"
        })
      )
    ).toMatchObject({
      clientUserId: "11111111-1111-4111-8111-111111111111",
      displayName: "Иванов Иван Иванович",
      relationshipLabel: "муж",
      lastEditedByRole: "astrologer"
    });
  });

  it("rejects ambiguous related profiles without owner and label fields", () => {
    expect(() =>
      clientRelatedBirthProfileListResponseSchema.parse({
        profiles: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            label: "Партнёр",
            birthDate: "1988-07-22"
          }
        ]
      })
    ).toThrow();
  });

  it("accepts a client cabinet overview scoped to explicit relationships", () => {
    expect(
      clientCabinetOverviewResponseSchema.parse({
        astrologers: [
          {
            astrologerUserId: "22222222-2222-4222-8222-222222222222",
            publicHandle: "alisa-vega",
            publicName: "Алиса Вега",
            relationshipStatus: "active",
            firstLinkedAt: "2026-07-06T10:00:00.000Z",
            lastLinkedAt: "2026-07-06T10:00:00.000Z"
          }
        ],
        birthData: birthProfile(),
        relatedBirthProfiles: [
          relatedBirthProfile({
            displayName: "Иванов Иван Иванович",
            relationshipLabel: "муж"
          })
        ],
        summary: emptySummary()
      })
    ).toMatchObject({
      relatedBirthProfiles: [{ displayName: "Иванов Иван Иванович", relationshipLabel: "муж" }],
      summary: {
        directLinkOnly: true,
        upcomingBookingCount: 0
      }
    });
  });
});

function birthProfile(
  overrides: Partial<{
    id: string;
    label: string | null;
    revision: number;
    source: "client_profile" | "import" | "manual";
    lastEditedByRole: "client" | "astrologer";
  }> = {}
) {
  return {
    id: overrides.id ?? "55555555-5555-4555-8555-555555555555",
    clientUserId: "11111111-1111-4111-8111-111111111111",
    label: overrides.label ?? "Я",
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
    source: overrides.source ?? "client_profile",
    revision: overrides.revision ?? 1,
    lastEditedByUserId: "11111111-1111-4111-8111-111111111111",
    lastEditedByRole: overrides.lastEditedByRole ?? "client",
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z"
  };
}

function relatedBirthProfile(
  overrides: Partial<{
    id: string;
    clientUserId: string;
    displayName: string;
    relationshipLabel: string;
    revision: number;
    source: "client_profile" | "import" | "manual";
    lastEditedByRole: "client" | "astrologer";
  }> = {}
) {
  return {
    id: overrides.id ?? "66666666-6666-4666-8666-666666666666",
    clientUserId: overrides.clientUserId ?? "11111111-1111-4111-8111-111111111111",
    displayName: overrides.displayName ?? "Партнёр",
    relationshipLabel: overrides.relationshipLabel ?? "партнер",
    birthDate: "1988-07-22",
    birthTime: null,
    birthTimePrecision: "unknown",
    birthPlaceText: "Калининград, Россия",
    birthCountryCode: "RU",
    birthCity: "Калининград",
    birthRegion: "Калининградская область",
    birthTimezone: "Europe/Kaliningrad",
    birthTimeDstOccurrence: null,
    birthLatitude: 54.7104,
    birthLongitude: 20.4522,
    source: overrides.source ?? "client_profile",
    revision: overrides.revision ?? 1,
    lastEditedByUserId: "11111111-1111-4111-8111-111111111111",
    lastEditedByRole: overrides.lastEditedByRole ?? "client",
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z"
  };
}

function emptySummary() {
  return {
    directLinkOnly: true as const,
    upcomingBookingCount: 0,
    availableMaterialCount: 0,
    unreadNotificationCount: 0,
    activeSubscriptionCount: 0
  };
}
