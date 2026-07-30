import { describe, expect, it } from "vitest";
import {
  astrologerClientResponseSchema,
  astrologerClientListResponseSchema,
  clientBirthDataListResponseSchema,
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

  it("accepts the full birth-data request shape", () => {
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
        isPrimary: true
      })
    ).toMatchObject({
      birthTimePrecision: "exact",
      birthTimeDstOccurrence: "first",
      isPrimary: true
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
            id: "nominatim:41485",
            label: "Rome, Lazio, Italy",
            placeName: "Rome, Italy",
            countryCode: "IT",
            city: "Rome",
            region: "Lazio",
            timezone: "Europe/Rome",
            latitude: 41.8933,
            longitude: 12.4829,
            provider: "nominatim",
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

  it("accepts a client birth-profile list with one primary profile", () => {
    expect(
      clientBirthDataListResponseSchema.parse({
        profiles: [
          birthProfile({
            id: "55555555-5555-4555-8555-555555555555",
            label: "Я",
            isPrimary: true
          }),
          birthProfile({
            id: "66666666-6666-4666-8666-666666666666",
            label: "Партнёр",
            isPrimary: false
          })
        ]
      })
    ).toMatchObject({
      profiles: [
        { label: "Я", isPrimary: true },
        { label: "Партнёр", isPrimary: false }
      ]
    });
  });

  it("rejects a client birth-profile list with two primary profiles", () => {
    expect(() =>
      clientBirthDataListResponseSchema.parse({
        profiles: [
          birthProfile({ id: "55555555-5555-4555-8555-555555555555", isPrimary: true }),
          birthProfile({ id: "66666666-6666-4666-8666-666666666666", isPrimary: true })
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
        birthProfiles: [
          birthProfile({
            id: "55555555-5555-4555-8555-555555555555",
            label: "Я",
            isPrimary: true
          })
        ],
        summary: {
          directLinkOnly: true,
          upcomingBookingCount: 0,
          availableMaterialCount: 0,
          unreadNotificationCount: 0,
          activeSubscriptionCount: 0
        }
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
    isPrimary: boolean;
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
    source: "client_profile",
    isPrimary: overrides.isPrimary ?? true,
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z"
  };
}
