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

  it("rejects a multi-profile response shape", () => {
    expect(() =>
      clientCabinetOverviewResponseSchema.parse({
        astrologers: [],
        birthProfiles: [birthProfile()],
        summary: emptySummary()
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
        summary: emptySummary()
      })
    ).toMatchObject({
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

function emptySummary() {
  return {
    directLinkOnly: true as const,
    upcomingBookingCount: 0,
    availableMaterialCount: 0,
    unreadNotificationCount: 0,
    activeSubscriptionCount: 0
  };
}
